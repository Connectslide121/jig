import { z } from "zod";
import type { PermissionDecision, PermissionRequest } from "../../shared/engine";
import type { ChatTool, ChatToolServer } from "./types";

/**
 * Jig's stand-ins for Claude Code's ExitPlanMode and AskUserQuestion in Codex chats (D-315): Codex has
 * neither (its own plan mode and questions need its experimental API), so a Codex chat's `jig` MCP
 * server gets two more tools. They raise the same cards as Claude's tools (the permission request
 * carries Claude's tool name), so the plan card, the question card and voice mode work unchanged.
 */
export const EXIT_PLAN_TOOL = "exit_plan";
export const ASK_USER_TOOL = "ask_user";

/** The card each stand-in shows as: Claude's tool name (`mcp__jig__exit_plan` → `ExitPlanMode`). */
export const STAND_IN_CARDS: Record<string, string> = {
  [EXIT_PLAN_TOOL]: "ExitPlanMode",
  [ASK_USER_TOOL]: "AskUserQuestion",
};

/** The card a Codex MCP call shows as: Claude's tool for the stand-ins, else `mcp__server__tool`. */
export function codexToolCardName(server: string, tool: string): string {
  return (server === "jig" && STAND_IN_CARDS[tool]) || `mcp__${server}__${tool}`;
}

/**
 * Put before your message in every turn while plan mode is on: Codex's sandbox is read-only then, and
 * this tells it to plan instead of working. The tag keeps it out of an opened chat's history.
 */
export const PLAN_MODE_PROMPT = `<jig_plan_mode>
Plan mode is on: the user wants a plan before any change. Look around as much as you need (read files, search, run commands that only read; your sandbox is read-only), and ask with the ask_user tool when something is unclear, but change nothing. When the plan is ready, call the exit_plan tool (Jig's MCP server) with the whole plan in Markdown: the user approves it there or asks for changes. Don't ask for approval in a message instead.
</jig_plan_mode>`;

/**
 * The message of the turn Jig starts after you approve a plan: that turn runs in the mode you picked
 * on the card (Codex takes a new sandbox only with a new turn). Hidden like `PLAN_MODE_PROMPT`.
 */
export const PLAN_APPROVED_PROMPT =
  "<jig_plan_approved>\nThe user approved your plan and the chat is out of plan mode now. Carry out the plan.\n</jig_plan_approved>";

/** Text Jig puts in your messages to Codex that you didn't type (left out of an opened chat's history). */
export const JIG_ADDED_TEXT = /<(jig_plan_mode|jig_plan_approved|jig-context)>[\s\S]*?<\/\1>\s*/g;

/** Developer instructions for every Codex chat: which tools stand in for Claude's. */
export const STAND_IN_INSTRUCTIONS =
  "In this chat, Jig's MCP tools stand in for Claude Code's: exit_plan is ExitPlanMode (present a plan for approval) and ask_user is AskUserQuestion (questions with 2-4 choices each, shown as a card; the user can also type their own answer). Where instructions name ExitPlanMode or AskUserQuestion, use these. When the user has to pick between options, ask with ask_user rather than in a message.";

export interface StandInContext {
  askPermission: (request: PermissionRequest, signal: AbortSignal) => Promise<PermissionDecision>;
  /** The tool card of the running call (Codex announces it before calling), for the card's id. */
  callId: (tool: string) => Promise<string | undefined>;
  /** Aborts when the turn ends or the chat closes: the card goes away. */
  signal: () => AbortSignal;
  /** The plan was approved (the mode was switched first): the next turn carries it out. */
  planApproved: () => void;
}

const question = z.object({
  question: z.string().describe("The complete question, ending with a question mark"),
  header: z.string().max(12).optional().describe("A very short label for it (at most 12 characters)"),
  multiSelect: z.boolean().optional().describe("True when several options may be picked"),
  options: z
    .array(
      z.object({
        label: z.string().describe("The choice, 1-5 words"),
        description: z.string().optional().describe("What picking it means"),
      }),
    )
    .min(2)
    .max(4)
    .describe("2-4 choices; the user can always type their own answer too"),
});

/** What the user answered (the question card's `answers`: question → answer), one line each. */
export function answersText(answers: Record<string, unknown> | undefined): string {
  const lines = Object.entries(answers ?? {})
    .filter(([, a]) => typeof a === "string" && a)
    .map(([q, a]) => `- ${q} → ${a}`);
  return lines.length ? `The user answered:\n${lines.join("\n")}` : "The user didn't answer.";
}

/** The stand-in tools for one Codex chat. */
export function standInTools(ctx: StandInContext): ChatTool[] {
  const ask = async (tool: string, input: Record<string, unknown>) => {
    const requestId = (await ctx.callId(tool)) ?? `${tool}-${Date.now()}`;
    return ctx.askPermission(
      { requestId, toolName: STAND_IN_CARDS[tool]!, input, canAlwaysAllow: false },
      ctx.signal(),
    );
  };
  return [
    {
      name: EXIT_PLAN_TOOL,
      description:
        "Present your plan to the user for approval (Claude Code's ExitPlanMode). Use it in plan mode when the plan is ready: the user approves it, after which you carry it out in the next turn, or asks for changes.",
      shape: { plan: z.string().describe("The whole plan, in Markdown") },
      // It asks on its own card; Codex mustn't ask about calling it first.
      readOnly: true,
      handler: async (args) => {
        const decision = await ask(EXIT_PLAN_TOOL, { plan: String(args.plan ?? "") });
        if (decision.behavior === "deny") return decision.message || "The user wants to keep planning.";
        ctx.planApproved();
        return "The user approved the plan. End this turn now, without starting on it and without another message: Jig switches the chat out of plan mode and starts the next turn, in which you carry out the plan.";
      },
    },
    {
      name: ASK_USER_TOOL,
      description:
        "Ask the user 1-4 questions with 2-4 choices each, shown as a card (Claude Code's AskUserQuestion). Use it when the user has to pick between options; they can also type their own answer. Returns the answers.",
      shape: { questions: z.array(question).min(1).max(4) },
      readOnly: true,
      handler: async (args) => {
        const decision = await ask(ASK_USER_TOOL, { questions: args.questions ?? [] });
        // Skipped, or answered by voice (the answer is in the message).
        if (decision.behavior === "deny") return decision.message || "The user skipped the question.";
        return answersText(decision.updatedInput?.answers as Record<string, unknown> | undefined);
      },
    },
  ];
}

/** A chat's tool servers with the stand-ins added to `jig` (a `jig` server of its own if it had none). */
export function withStandIns(
  servers: Record<string, ChatToolServer> | undefined,
  tools: ChatTool[],
): Record<string, ChatToolServer> {
  const jig = servers?.jig;
  return { ...servers, jig: { ...jig, tools: [...(jig?.tools ?? []), ...tools] } };
}

/**
 * A one-shot's answer as a next-message suggestion (D-315): its first line without quotes, or nothing
 * when it is empty, too long to be a message someone would type, or says there is nothing.
 */
export function suggestionFrom(answer: string): string | undefined {
  const line = answer
    .trim()
    .split(/\r?\n/)[0]!
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .trim();
  if (!line || line.length > 160 || /^(nothing|none|n\/a|-)\.?$/i.test(line)) return undefined;
  return line;
}
