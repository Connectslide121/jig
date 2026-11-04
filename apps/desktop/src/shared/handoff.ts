import { type ChatItem, type ChatProvider, type EffortLevel, ENGINE_CAPABILITIES } from "./engine";

/**
 * The handoff a chat's new provider reads when the chat continues with it (D-338): built from the
 * transcript by rules, without asking an AI, and capped in size. It goes with the first message to the
 * new provider, inside `<jig-handoff>`, and isn't shown in the transcript.
 */

const NAMES: Record<ChatProvider, string> = {
  claude: "Claude (Claude Code)",
  codex: "ChatGPT (OpenAI's Codex)",
};

/** The longest handoff, in characters; each part has its own share too. */
export const HANDOFF_MAX = 16_000;
const GOAL_MAX = 3_000;
const MESSAGE_MAX = 1_200;
const REPLY_MAX = 2_500;
const PLAN_MAX = 3_000;
const DIFF_MAX = 2_500;
const RECENT_MESSAGES = 4;
const RECENT_REPLIES = 3;
const FILES_MAX = 40;

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

export interface HandoffInput {
  items: ChatItem[];
  from: ChatProvider;
  to: ChatProvider;
  reason: "limit" | "manual";
  /** `git diff --stat` in the chat's folder, when it is a repository (main runs it). */
  diffStat?: string;
}

function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** The end of a long text, where the latest part is (replies end with their conclusion). */
function clipEnd(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? `…${t.slice(t.length - max + 1).trimStart()}` : t;
}

const quote = (text: string) =>
  text
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");

type Todo = { content?: unknown; status?: unknown };

/** Builds the handoff text; empty when the chat has nothing to hand over yet. */
export function buildHandoff(input: HandoffInput): string {
  const { items, from, to } = input;
  // Messages you typed (not ones Jig or an add-on sent), top-level replies, and tool calls.
  const mine = ownMessages(items);
  if (mine.length === 0) return "";
  const replies = items.filter(
    (i): i is Extract<ChatItem, { kind: "assistant" }> =>
      i.kind === "assistant" && !i.parentId && Boolean(i.text.trim()),
  );
  const tools = items.filter(
    (i): i is Extract<ChatItem, { kind: "tool" }> => i.kind === "tool" && !i.parentId,
  );

  const parts: string[] = [];
  parts.push(
    `This chat ran on ${NAMES[from]} until now. ${
      input.reason === "limit"
        ? `It stopped because ${from === "codex" ? "ChatGPT" : "Claude"}'s plan limit was reached`
        : "The user moved it to you"
    }, so you, ${NAMES[to]}, carry on with the same chat in the same folder. Jig wrote this summary from the chat's transcript (no AI involved). Check the files and git state yourself before you change anything, don't redo finished work, and carry on from where it stopped.`,
  );

  parts.push(`## The goal (the user's first message)\n\n${quote(clip(mine[0]!.text, GOAL_MAX))}`);

  const recent = mine.slice(1).slice(-RECENT_MESSAGES);
  if (recent.length)
    parts.push(
      `## The user's latest messages\n\n${recent.map((m) => quote(clip(m.text, MESSAGE_MAX))).join("\n\n")}`,
    );

  const last = replies.slice(-RECENT_REPLIES);
  if (last.length)
    parts.push(
      `## ${from === "codex" ? "ChatGPT" : "Claude"}'s last messages\n\n${last
        .map((r) => quote(clipEnd(r.text, REPLY_MAX)))
        .join("\n\n")}`,
    );

  // The latest plan: a plan shown for approval (ExitPlanMode), as a tool call or a permission card.
  let plan: string | undefined;
  for (let i = items.length - 1; i >= 0 && !plan; i--) {
    const item = items[i]!;
    if (item.kind === "tool" && item.name === "ExitPlanMode" && typeof item.input.plan === "string")
      plan = item.input.plan;
    else if (
      item.kind === "permission" &&
      item.request.toolName === "ExitPlanMode" &&
      typeof item.request.input.plan === "string"
    )
      plan = item.request.input.plan;
  }
  if (plan?.trim()) parts.push(`## The plan\n\n${clip(plan, PLAN_MAX)}`);

  // The latest to-do list, its open items.
  const todoTool = [...tools].reverse().find((t) => t.name === "TodoWrite" && Array.isArray(t.input.todos));
  const open = ((todoTool?.input.todos ?? []) as Todo[]).filter(
    (t) => typeof t?.content === "string" && t.status !== "completed",
  );
  if (open.length)
    parts.push(
      `## Open to-dos\n\n${open
        .map(
          (t) => `- [${t.status === "in_progress" ? "in progress" : "open"}] ${clip(String(t.content), 300)}`,
        )
        .join("\n")}`,
    );

  const files = editedFiles(items);
  if (files.length || input.diffStat?.trim()) {
    const listed = files.slice(-FILES_MAX).map((f) => `- ${f}`);
    if (files.length > FILES_MAX) listed.unshift(`- … and ${files.length - FILES_MAX} more`);
    parts.push(
      [
        "## Files changed in this chat",
        listed.length ? listed.join("\n") : "",
        input.diffStat?.trim()
          ? `\`git diff --stat\` now:\n\n\`\`\`\n${clip(input.diffStat, DIFF_MAX)}\n\`\`\``
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
  }

  // Where it stopped: the last message's turn and its last step.
  const lastMine = mine[mine.length - 1]!;
  const after = items.slice(items.indexOf(lastMine) + 1);
  const step = [...after]
    .reverse()
    .find((i): i is Extract<ChatItem, { kind: "tool" }> => i.kind === "tool" && !i.parentId);
  const stopped = [
    `It was working on: ${clip(lastMine.text, 400).replace(/\s+/g, " ")}`,
    step
      ? `Its last step: ${step.name} ${clip(stepSummary(step.input), 300)} (${step.status === "done" ? "finished" : "not finished"})`
      : "",
  ].filter(Boolean);
  parts.push(`## Where it stopped\n\n${stopped.join("\n")}`);

  let text = parts.join("\n\n");
  if (text.length > HANDOFF_MAX) text = `${text.slice(0, HANDOFF_MAX - 30).trimEnd()}\n\n(…the rest was cut)`;
  return `<jig-handoff>\n${text}\n</jig-handoff>`;
}

/** The files a chat's own steps edited (not its subagents'), each once, in order. */
export function editedFiles(items: ChatItem[]): string[] {
  return [
    ...new Set(
      items
        .filter(
          (t): t is Extract<ChatItem, { kind: "tool" }> =>
            t.kind === "tool" && !t.parentId && EDIT_TOOLS.has(t.name) && t.status !== "error",
        )
        .map((t) => t.input.file_path ?? t.input.notebook_path)
        .filter((p): p is string => typeof p === "string" && Boolean(p)),
    ),
  ];
}

/** Messages you typed in a chat (not ones Jig or an add-on sent): what a handoff is built around. */
export const ownMessages = (items: ChatItem[]): Extract<ChatItem, { kind: "user" }>[] =>
  items.filter(
    (i): i is Extract<ChatItem, { kind: "user" }> => i.kind === "user" && !i.from && Boolean(i.text.trim()),
  );

/** A tool call's input in a few words (its command, path or pattern). */
function stepSummary(input: Record<string, unknown>): string {
  for (const key of ["command", "file_path", "path", "pattern", "url", "description"])
    if (typeof input[key] === "string" && input[key]) return String(input[key]).replace(/\s+/g, " ");
  return "";
}

/**
 * The model tiers of the two providers, top to bottom (D-339): Claude's opus/sonnet/haiku and
 * ChatGPT's families Sol/Terra/Luna (D-310) stand for the same place in each line-up.
 */
const TIERS: Record<ChatProvider, readonly string[]> = {
  claude: ["opus", "sonnet", "haiku"],
  codex: ["sol", "terra", "luna"],
};

/** A model's tier (0 = top), from a family alias or a full id (`claude-opus-5-5`, `gpt-6.1-sol`). */
export function modelTier(model: string | undefined): number | undefined {
  const m = model?.toLowerCase() ?? "";
  for (const line of Object.values(TIERS)) {
    const tier = line.findIndex((family) => new RegExp(`(^|[^a-z])${family}([^a-z]|$)`).test(m));
    if (tier >= 0) return tier;
  }
  return undefined;
}

/**
 * The model and effort a chat gets on the provider it moves to (D-339): the same tier of the other
 * provider's line-up, and the same effort when that provider has it ("ultra" is Claude's "max").
 * A model Jig can't place (the provider's default, a custom id) takes the new provider's defaults.
 */
export function mapModelAndEffort(input: {
  to: ChatProvider;
  model: string | undefined;
  effort: EffortLevel | undefined;
  defaults: { model: string; effort?: EffortLevel };
}): { model: string; effort?: EffortLevel } {
  const tier = modelTier(input.model);
  const levels = ENGINE_CAPABILITIES[input.to].effortLevels;
  const effort =
    input.effort === undefined
      ? input.defaults.effort
      : levels.includes(input.effort)
        ? input.effort
        : input.effort === "ultra"
          ? "max"
          : input.defaults.effort;
  if (tier === undefined) return { model: input.defaults.model, effort: input.defaults.effort };
  return { model: TIERS[input.to][tier]!, effort };
}

/** What the chat can't do any more on the provider it moves to, in words (D-339). */
export function featuresLost(from: ChatProvider, to: ChatProvider): string[] {
  const had = ENGINE_CAPABILITIES[from];
  const has = ENGINE_CAPABILITIES[to];
  const lost: string[] = [];
  if (had.planMode && !has.planMode) lost.push("Plan mode");
  if (had.questions && !has.questions) lost.push("questions with choices");
  if (had.subagents && !has.subagents) lost.push("subagents");
  if (had.rewind && !has.rewind) lost.push("rewinding to an earlier message");
  if (had.fork && !has.fork) lost.push("forking the chat");
  if (had.promptSuggestions && !has.promptSuggestions) lost.push("next-message suggestions");
  return lost;
}
