import { z } from "zod";
import type { PermissionDecision, PermissionRequest } from "../../shared/engine";
import type { ChatTool, ChatToolServer } from "./types";

/**
 * Jig's stand-ins for Claude Code's own tools in Codex chats (D-315): Codex has no plan-approval tool
 * (its plan mode is experimental), so a Codex chat's `jig` MCP server gets one. It raises the same
 * card as Claude's tool (the permission request carries Claude's tool name), so the plan card and
 * voice mode work unchanged.
 */
export const EXIT_PLAN_TOOL = "exit_plan";

/** The card each stand-in shows as: Claude's tool name (`mcp__jig__exit_plan` → `ExitPlanMode`). */
export const STAND_IN_CARDS: Record<string, string> = {
  [EXIT_PLAN_TOOL]: "ExitPlanMode",
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
Plan mode is on: the user wants a plan before any change. Look around as much as you need (read files, search, run commands that only read; your sandbox is read-only), but change nothing. When the plan is ready, call the exit_plan tool (Jig's MCP server) with the whole plan in Markdown: the user approves it there or asks for changes. Don't ask for approval in a message instead.
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
  "In this chat, Jig's MCP tool exit_plan stands in for Claude Code's ExitPlanMode (present a plan for approval). Where instructions name ExitPlanMode, use it.";

export interface StandInContext {
  askPermission: (request: PermissionRequest, signal: AbortSignal) => Promise<PermissionDecision>;
  /** The tool card of the running call (Codex announces it before calling), for the card's id. */
  callId: (tool: string) => Promise<string | undefined>;
  /** Aborts when the turn ends or the chat closes: the card goes away. */
  signal: () => AbortSignal;
  /** The plan was approved (the mode was switched first): the next turn carries it out. */
  planApproved: () => void;
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
