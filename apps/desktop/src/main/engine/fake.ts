import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import {
  type BackgroundTask,
  type ChatProvider,
  type EffortLevel,
  ENGINE_CAPABILITIES,
  type EngineCapabilities,
  type EngineEvent,
  type McpServerInfo,
  type PermissionDecision,
  type PermissionMode,
  type SavedClaudeMessage,
  type SavedClaudeSession,
  type SavedToolUse,
  type SlashCommandInfo,
} from "../../shared/engine";
import type { RawUsage } from "../../shared/usage";
import { isReadOnlyChatTool, toolHandlersOf } from "./chatTools";
import { savedThread, threadMessages } from "./codexHistory";
import { ASK_USER_TOOL, EXIT_PLAN_TOOL, PLAN_MODE_PROMPT, standInTools, withStandIns } from "./codexTools";
import { runFakeBuilder } from "./fakeBuilder";
import { FakeCloud } from "./fakeCloud";
import { FakeMcpClient } from "./fakeMcp";
import { contextFrom, patchText } from "./normalize";
import type { ToolCallRequest, ToolCallResult } from "./toolCall";
import {
  type Completer,
  type CompleterOptions,
  type Engine,
  type EngineSession,
  type OneShotOptions,
  outputImages,
  outputText,
  type StartOptions,
} from "./types";

/** "report the task as done" / "report task t2 as failed": a task's chat reports again (D-353). */
const REPORT_AGAIN = /^report (?:the task|task (t\d+)) as (done|partial|failed|blocked)\b/;

/**
 * Turns that said "hold until released" (e2e): they stay running, after "Working…", until a test lets
 * them go with the `fake.release` host call, so a view can be looked at mid-turn (a running task).
 */
const held = new Set<{ text: string; release: () => void }>();

/** Lets held turns finish: those whose message contains `match`, or all. Returns how many. */
export function releaseHeld(match?: string): number {
  const which = [...held].filter((h) => !match || h.text.toLowerCase().includes(match.toLowerCase()));
  for (const h of which) h.release();
  return which.length;
}

/** Waits until `releaseHeld` lets this turn go, or the turn is stopped. */
function holdUntilReleased(text: string, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new Error("aborted"));
    const entry = {
      text,
      release: () => {
        held.delete(entry);
        resolve();
      },
    };
    held.add(entry);
    signal.addEventListener("abort", () => {
      held.delete(entry);
      reject(new Error("aborted"));
    });
  });
}

const FAKE_COMMANDS: SlashCommandInfo[] = [
  {
    name: "compact",
    description: "Clear history but keep a summary in context",
    argumentHint: "<instructions>",
    builtin: true,
  },
  {
    name: "usage",
    description: "Show session cost and plan usage",
    argumentHint: "",
    aliases: ["cost"],
    builtin: true,
  },
  {
    name: "init",
    description: "Initialize a CLAUDE.md file with codebase documentation",
    argumentHint: "",
    builtin: true,
  },
  {
    name: "review",
    description: "Review a pull request",
    argumentHint: "<pr>",
    builtin: true,
  },
  {
    name: "explain-code",
    description: "Explain code with diagrams and analogies (skill)",
    argumentHint: "<file>",
  },
];

const FAKE_MODELS = [
  {
    value: "default",
    displayName: "Default (recommended)",
    description: "Fake default model",
    efforts: ["low", "medium", "high", "xhigh", "max"] as EffortLevel[],
  },
  {
    value: "opus",
    displayName: "Opus",
    description: "Most capable",
    efforts: ["low", "medium", "high", "xhigh", "max"] as EffortLevel[],
  },
  {
    value: "sonnet",
    displayName: "Sonnet",
    description: "Coding and execution",
  },
  { value: "haiku", displayName: "Haiku", description: "Fastest" },
  // No opusplan, as in Claude Code's own list: Jig adds it (menus.ts ALIASES).
];

/** The fake saved conversation with a transcript (e2e opens it). */
export const FAKE_SAVED_ID = "saved-1";

/**
 * The fake Codex engine's one saved thread (D-315), as `thread/read` returns it: your message (with
 * Jig's plan-mode text, which an opened chat leaves out), a command, a file change and a reply.
 */
function fakeCodexThread(cwd: string, at: number) {
  return {
    id: "codex-thread-1",
    name: null,
    preview: "Tidy the README",
    cwd,
    gitInfo: { sha: null, branch: "main", originUrl: null },
    createdAt: Math.floor((at - 7_200_000) / 1000),
    updatedAt: Math.floor((at - 1_800_000) / 1000),
    turns: [
      {
        id: "turn-1",
        items: [
          {
            type: "userMessage",
            id: "u1",
            content: [
              { type: "text", text: `${PLAN_MODE_PROMPT}\n` },
              { type: "text", text: "Tidy the README" },
            ],
          },
          {
            type: "commandExecution",
            id: "c1",
            command: "cat README.md",
            aggregatedOutput: "# Shop",
            exitCode: 0,
          },
          {
            type: "fileChange",
            id: "f1",
            status: "completed",
            changes: [
              {
                path: join(cwd, "README.md"),
                kind: { type: "update" },
                diff: "@@ -1 +1 @@\n-# Shop\n+# Shop app",
              },
            ],
          },
          { type: "agentMessage", id: "a1", text: "I tidied the README's title." },
        ],
      },
    ],
  };
}

/**
 * Scripted engine for tests and `JIG_ENGINE=fake` (D-015): no Claude Code process, no credentials,
 * no quota. What it does depends on words in your message; the full list is in
 * docs/guides/testing.md → The fake engine (keep it in step with the branches in `runTurn`).
 */
export class FakeEngine implements Engine {
  readonly kind = "fake" as const;
  /** What the provider it stands in for can do (`JIG_ENGINE=fake` runs Codex chats on it too). */
  readonly capabilities: EngineCapabilities;
  constructor(
    private readonly delayMs = Number(process.env.JIG_FAKE_DELAY ?? 15),
    readonly provider: ChatProvider = "claude",
  ) {
    this.capabilities = ENGINE_CAPABILITIES[provider];
  }

  start(options: StartOptions, onEvent: (event: EngineEvent) => void): EngineSession {
    // A fork continues the conversation under a new id, like Claude Code's forkSession.
    const engineSessionId = options.resume && !options.forkSession ? options.resume : `fake-${randomUUID()}`;
    /** The card of the stand-in call in progress (Codex chats, D-315). */
    let standInCall: string | undefined;
    // A Codex chat's `jig` server has the stand-ins for Claude's plan and question tools, as in Codex.
    const toolServers =
      this.provider === "codex"
        ? withStandIns(
            options.toolServers,
            standInTools({
              askPermission: options.askPermission,
              callId: async () => standInCall,
              signal: () => turn?.signal ?? new AbortController().signal,
              planApproved: () => {},
            }),
          )
        : options.toolServers;
    // Jig's tools as plain functions; scripts call them directly like Claude Code's in-process server.
    const toolHandlers = toolServers ? toolHandlersOf(toolServers) : undefined;
    // "call <tool> over mcp": the same tools through the chat's local MCP server, as Codex calls them.
    const mcpClient = toolServers ? new FakeMcpClient(toolServers) : undefined;
    /**
     * A Codex chat's stand-in tool, called over the chat's MCP server like Codex does: the card shows
     * as Claude's tool and the stand-in asks on it. Returns what the tool answered.
     */
    /**
     * The task queue's report tool (D-330): a Codex chat calls it over the chat's local MCP server, as
     * Codex does; a Claude chat directly, as Claude Code's in-process server. Returns what it answered.
     */
    const reportTask = async (input: Record<string, unknown>): Promise<string> => {
      if (mcpClient && this.provider === "codex") {
        const out = await mcpClient.call("jig", "addon_tasks_report", input).catch((e: Error) => ({
          text: e.message,
          isError: true,
        }));
        return out.isError ? `Error: ${out.text}` : out.text;
      }
      return outputText(
        await toolHandlers!.addon_tasks_report!(input).catch((e: Error) => `Error: ${e.message}`),
      );
    };
    const callStandIn = async (tool: string, toolId: string, input: Record<string, unknown>) => {
      standInCall = toolId;
      try {
        return (await mcpClient!.call("jig", tool, input)).text;
      } finally {
        standInCall = undefined;
      }
    };
    let model = options.model || "fake-model";
    let permissionMode: PermissionMode = options.permissionMode;
    let initialised = false;
    let turn: AbortController | undefined;
    const queue: Array<{ text: string; uuid: string }> = [];
    // File checkpoints: the messages in order, and each file's content before a message changed it.
    const messageOrder: string[] = [];
    const checkpoints: Array<{
      uuid: string;
      path: string;
      before: string | null;
    }> = [];
    let closed = false;
    // Scripted context window: grows each turn ("read the big file" adds a lot), /compact shrinks it.
    const CONTEXT_MAX = 200_000;
    let contextTokens = 18_000;
    let turnsDone = 0;
    let suggestTimer: NodeJS.Timeout | undefined;
    let effort: EffortLevel | undefined = options.effort;
    const backgroundTasks = new Map<string, BackgroundTask>();
    /** Requests for a task's report this chat still answers without one ("skip two reports"). */
    let reportsToSkip = 0;
    const mcp: McpServerInfo[] = [
      { name: "github", status: "connected", scope: "user", tools: 12 },
      { name: "jira", status: "needs-auth", scope: "project" },
    ];
    /** Messages sent while a turn runs ("steer"): Claude sees them before it finishes. */
    const steers: string[] = [];
    const sleep = (ms: number, signal: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        // Stopped before this step (while the turn was still starting): no abort event comes any more.
        if (signal.aborted) return reject(new Error("aborted"));
        const t = setTimeout(resolve, ms);
        signal.addEventListener("abort", () => {
          clearTimeout(t);
          reject(new Error("aborted"));
        });
      });

    const stream = async (
      id: string,
      text: string,
      signal: AbortSignal,
      block: "text" | "thinking" = "text",
    ) => {
      onEvent({ type: "block_start", id, block });
      const words = text.split(/(?<=\s)/);
      for (const word of words) {
        await sleep(this.delayMs, signal);
        onEvent({ type: "block_delta", id, text: word });
      }
      onEvent({ type: "block_end", id, block, text });
    };

    const runTurn = async (sent: string, uuid: string) => {
      // The script answers what the user typed: add-ons' context (D-151) is left out of the matching
      // (it follows the "[1 image]" tags when the message has files).
      const text = sent
        .replace(/<jig-context>[\s\S]*?<\/jig-context>\s*/, "")
        .replace(/<jig-handoff>[\s\S]*?<\/jig-handoff>\s*/, "");
      // A chat that continued from the other provider brings Jig's handoff (D-338): its goal line.
      const handoffGoal = /<jig-handoff>[\s\S]*?## The goal[^\n]*\n\n> ([^\n]*)/.exec(sent)?.[1];
      messageOrder.push(uuid);
      const controller = new AbortController();
      turn = controller;
      const signal = controller.signal;
      const started = Date.now();
      const msg = `msg-${randomUUID()}`;
      const lower = text.toLowerCase();
      try {
        if (!initialised) {
          initialised = true;
          if (lower.includes("login")) {
            onEvent({
              type: "error",
              code: "not_signed_in",
              message: "Not logged in · Please run /login",
            });
            onEvent({
              type: "result",
              ok: false,
              durationMs: 1,
              error: "Not logged in",
            });
            initialised = false;
            return;
          }
          onEvent({
            type: "init",
            engineSessionId,
            model,
            permissionMode,
            authSource: "subscription",
            slashCommands: ["/compact", "/clear"],
          });
        }
        if (lower.startsWith("/compact")) {
          onEvent({ type: "status", status: "compacting" });
          await sleep(this.delayMs * 10, signal);
          const preTokens = contextTokens;
          contextTokens = 21_000;
          onEvent({ type: "status", status: null });
          onEvent({
            type: "compacted",
            trigger: "manual",
            preTokens,
            postTokens: contextTokens,
          });
          onEvent({
            type: "result",
            ok: true,
            durationMs: Date.now() - started,
            numTurns: 0,
          });
          return;
        }
        if (lower.includes("hit the limit")) {
          // The plan's limit, as each provider reports it (D-338): resets in 2 h 13 min.
          await stream(`${msg}:text:0`, "Starting on it.", signal);
          const resetsAt = new Date(
            Math.ceil((Date.now() + (2 * 60 + 13) * 60_000) / 60_000) * 60_000,
          ).toISOString();
          onEvent({
            type: "error",
            code: "rate_limit",
            message:
              this.provider === "codex"
                ? "ChatGPT's limit is reached: You've hit your usage limit. Try again later."
                : "You've hit your limit · resets later today",
            window: this.provider === "codex" ? "primary" : "five_hour",
            resetsAt,
          });
          onEvent({
            type: "result",
            ok: false,
            durationMs: Date.now() - started,
            error: "Usage limit reached",
          });
          return;
        }
        contextTokens = Math.min(CONTEXT_MAX, contextTokens + (lower.includes("big file") ? 130_000 : 9_000));
        // A test chat's message mentions PASS/FAIL, which must not end the turn with an error.
        const isTestChat = lower.startsWith("test this in claude's browser");
        await stream(`${msg}:thinking:0`, "Thinking about the request.", signal, "thinking");
        if (lower.includes("hold until released")) {
          // Stays running until the test calls `fake.release`, then goes on with the rest of the script
          // (a task's chat still reports).
          await stream(`${msg}:text:hold`, "Working…", signal);
          await holdUntilReleased(text, signal);
        }
        if (handoffGoal)
          await stream(`${msg}:text:handoff`, `Picked up from the handoff: “${handoffGoal}”.`, signal);
        if (toolHandlers?.jig_meeting_read && text.startsWith("Question about meeting ")) {
          const match = /\(([a-f\d-]{36})\), captured through ([^\n]+)\.\n/.exec(text);
          if (!match) throw new Error("Missing meeting snapshot");
          const id = match[1]!;
          const through = match[2]!;
          const readId = `tool-${randomUUID()}`;
          onEvent({
            type: "tool_use",
            id: readId,
            name: "mcp__jig__jig_meeting_read",
            input: { id, through },
          });
          const output = outputText(await toolHandlers.jig_meeting_read({ id, through }));
          onEvent({ type: "tool_result", toolUseId: readId, output, isError: false });
          if (/Write (concise )?meeting notes/.test(text) && toolHandlers.jig_meeting_save_notes) {
            const projects = JSON.parse(
              /optional projectId from (\[.*?\])\./.exec(text)?.[1] ?? "[]",
            ) as Array<{ id: string }>;
            const input = {
              id,
              notes:
                "## Summary\nThe team discussed the Shop API and Portal.\n\n## Decisions\nReview the API before release.\n\n## Actions\nUser: review the Shop API. Sam: update documentation.",
              actions: [
                {
                  title: "Review the Shop API",
                  prompt: "Review the Shop API before release and report findings.",
                  owner: "User",
                  mine: true,
                  projectId: projects[0]?.id,
                  evidence: "Alex: review the API before release",
                },
                {
                  title: "Update documentation",
                  prompt: "Update the Portal service documentation.",
                  owner: "Sam",
                  projectId: projects[1]?.id,
                  evidence: "Sam: update service documentation",
                },
              ],
            };
            const saveId = `tool-${randomUUID()}`;
            onEvent({ type: "tool_use", id: saveId, name: "mcp__jig__jig_meeting_save_notes", input });
            const saved = outputText(await toolHandlers.jig_meeting_save_notes(input));
            onEvent({ type: "tool_result", toolUseId: saveId, output: saved, isError: false });
            await stream(`${msg}:text:0`, saved, signal);
          } else
            await stream(
              `${msg}:text:0`,
              `Meeting answer using this chat's project and the captured transcript.\n\n${output.slice(0, 1000)}`,
              signal,
            );
        } else if (
          toolHandlers?.jig_meeting_read &&
          /with jig_meeting_read, id "([a-f\d-]{36})"/.test(sent)
        ) {
          // A message that mentions a meeting (`@meeting:…`, D-250): Jig's context names it; read it.
          const id = /with jig_meeting_read, id "([a-f\d-]{36})"/.exec(sent)![1]!;
          const readId = `tool-${randomUUID()}`;
          onEvent({ type: "tool_use", id: readId, name: "mcp__jig__jig_meeting_read", input: { id } });
          const output = outputText(await toolHandlers.jig_meeting_read({ id }));
          onEvent({ type: "tool_result", toolUseId: readId, output, isError: false });
          await stream(`${msg}:text:0`, `From the mentioned meeting:\n\n${output.slice(0, 500)}`, signal);
        } else if (
          toolHandlers?.jig_teams_chat_read &&
          /read it with jig_teams_chat_read, chat "([0-9a-f]{8})"/.test(sent)
        ) {
          // A message that mentions a Teams chat (`@chat:…`, D-333): Jig's context names it; read it.
          const chat = /read it with jig_teams_chat_read, chat "([0-9a-f]{8})"/.exec(sent)![1]!;
          const readId = `tool-${randomUUID()}`;
          onEvent({ type: "tool_use", id: readId, name: "mcp__jig__jig_teams_chat_read", input: { chat } });
          const output = outputText(await toolHandlers.jig_teams_chat_read({ chat }));
          onEvent({ type: "tool_result", toolUseId: readId, output, isError: false });
          await stream(
            `${msg}:text:0`,
            `From the mentioned Teams chat:

${output.slice(0, 600)}`,
            signal,
          );
        } else if (
          toolHandlers?.jig_knowledge_read &&
          /knowledge/i.test(text) &&
          /Documents the user keeps[^\n]*\n- (.+?) \(\d+k characters\)/.test(sent)
        ) {
          // Jig's context lists the project's knowledge (D-256): read the first document.
          const name = /Documents the user keeps[^\n]*\n- (.+?) \(\d+k characters\)/.exec(sent)![1]!;
          const readId = `tool-${randomUUID()}`;
          onEvent({ type: "tool_use", id: readId, name: "mcp__jig__jig_knowledge_read", input: { name } });
          const output = outputText(await toolHandlers.jig_knowledge_read({ name }));
          onEvent({ type: "tool_result", toolUseId: readId, output, isError: false });
          await stream(`${msg}:text:0`, `From the project's knowledge:\n\n${output.slice(0, 500)}`, signal);
        } else if (toolHandlers?.catalog) {
          await runFakeBuilder(text, toolHandlers, onEvent);
        } else if (/^\/\S/.test(text.trim())) {
          // A Claude Code command or skill: built-ins print something, skills answer like Claude.
          const name = /^\/(\S+)/.exec(text.trim())![1]!;
          const command = FAKE_COMMANDS.find((c) => c.name === name || c.aliases?.includes(name));
          if (!command)
            onEvent({
              type: "command_output",
              id: `command-${randomUUID()}`,
              text: `Unknown command: /${name}`,
            });
          else if (command.builtin)
            onEvent({
              type: "command_output",
              id: `command-${randomUUID()}`,
              text: `**/${command.name}** (fake): ${command.description}.${effort ? ` Effort: ${effort}.` : ""}`,
            });
          else await stream(`${msg}:text:0`, `Running the ${command.name} skill: ${text.trim()}`, signal);
        } else if (
          toolHandlers?.addon_tasks_report &&
          /^the task queue asks for the report of task/.test(lower)
        ) {
          // The task queue asks for a report (D-318): a late report with the task's id, unless this
          // chat was told to skip that one too.
          const taskId = /taskId "([^"]+)"/.exec(text)?.[1];
          if (reportsToSkip > 0) {
            reportsToSkip--;
            await stream(`${msg}:text:0`, "Still waiting for the local server to come up.", signal);
          } else {
            const toolId = `tool-${randomUUID()}`;
            const input = { outcome: "done", summary: "Reported when the queue asked", taskId };
            onEvent({ type: "tool_use", id: toolId, name: "mcp__jig__addon_tasks_report", input });
            const output = await reportTask(input);
            onEvent({ type: "tool_result", toolUseId: toolId, output, isError: output.startsWith("Error") });
            await stream(`${msg}:text:1`, "Reported.", signal);
          }
        } else if (toolHandlers?.addon_tasks_report && REPORT_AGAIN.test(lower)) {
          // "report the task as done", after you followed up in a task's chat: it reports again (D-353),
          // to the named task or (without one) the chat's last reported task.
          const [, taskId, outcome] = REPORT_AGAIN.exec(lower)!;
          const toolId = `tool-${randomUUID()}`;
          const input = { outcome, summary: `Reported again: ${outcome}`, ...(taskId ? { taskId } : {}) };
          onEvent({ type: "tool_use", id: toolId, name: "mcp__jig__addon_tasks_report", input });
          const output = await reportTask(input);
          onEvent({ type: "tool_result", toolUseId: toolId, output, isError: output.startsWith("Error") });
          await stream(`${msg}:text:1`, output.startsWith("Error") ? output : "Reported again.", signal);
        } else if (/skip (?:the report|two reports)/.test(lower)) {
          // A task that ends its turn without reporting (waiting for something); "two" also skips the
          // queue's first request for the report.
          reportsToSkip = /two reports/.test(lower) ? 1 : 0;
          await stream(`${msg}:text:0`, "Waiting for the local server to come up.", signal);
        } else if (toolHandlers?.addon_tasks_report && sent.includes("addon_tasks_report")) {
          // A task from the Tasks add-on's queue (its context says so): do it and report back.
          const toolId = `tool-${randomUUID()}`;
          const failed = /fail this task/.test(lower);
          const partly = /only partly/.test(lower);
          const task = text.replace(/^(?:\[[^\]]+\]\s*)+/, "").trim();
          const input = {
            outcome: failed ? "failed" : partly ? "partial" : "done",
            summary: failed ? `Could not do it: ${task}` : `Did it: ${task}`,
            notes: ["A fake note to know"],
            followUps: /with follow-ups/.test(lower) ? [`Follow up on: ${task}`] : [],
          };
          await stream(`${msg}:text:0`, "Working on the task.", signal);
          onEvent({
            type: "tool_use",
            id: toolId,
            name: "mcp__jig__addon_tasks_report",
            input,
          });
          const output = await reportTask(input);
          onEvent({
            type: "tool_result",
            toolUseId: toolId,
            output,
            isError: output.startsWith("Error"),
          });
          // The answer names who ran it, so tests see which engine the task's chat runs on.
          await stream(
            `${msg}:text:1`,
            `Reported${this.provider === "codex" ? " from ChatGPT" : ""}.`,
            signal,
          );
        } else if (toolHandlers?.addon_tasks_add && /\bqueue tasks for\b/.test(lower)) {
          // "queue tasks for the specs": Claude fills the Tasks add-on's queue.
          const toolId = `tool-${randomUUID()}`;
          const input = {
            tasks: [
              "Write the spec for Contoso",
              { title: "Fabrikam spec", prompt: "Write the spec for Fabrikam" },
            ],
          };
          onEvent({
            type: "tool_use",
            id: toolId,
            name: "mcp__jig__addon_tasks_add",
            input,
          });
          // Like Claude Code, it asks first (the Tasks add-on draws the request as an editable list).
          const decision =
            permissionMode === "bypassPermissions"
              ? { behavior: "allow" as const, updatedInput: undefined }
              : await options.askPermission(
                  { requestId: toolId, toolName: "mcp__jig__addon_tasks_add", input, canAlwaysAllow: false },
                  signal,
                );
          if (decision.behavior !== "allow") {
            onEvent({
              type: "tool_result",
              toolUseId: toolId,
              output: decision.message ?? "Denied",
              isError: true,
            });
            await stream(`${msg}:text:0`, "OK, I didn't queue them.", signal);
          } else {
            const output = outputText(
              await toolHandlers
                .addon_tasks_add(decision.updatedInput ?? input)
                .catch((e: Error) => `Error: ${e.message}`),
            );
            onEvent({
              type: "tool_result",
              toolUseId: toolId,
              output,
              isError: output.startsWith("Error"),
            });
            await stream(`${msg}:text:0`, output.startsWith("Error") ? output : "Queued the tasks.", signal);
          }
        } else if (toolHandlers?.addon_tasks_delete && /\bdelete the queued task\b/.test(lower)) {
          // "delete the queued task": Claude asks to delete queued task t1 (`addon_tasks_delete`), on the
          // Tasks add-on's card that names it; deletes it once allowed.
          const toolId = `tool-${randomUUID()}`;
          const input = { ids: ["t1"] };
          onEvent({ type: "tool_use", id: toolId, name: "mcp__jig__addon_tasks_delete", input });
          const decision =
            permissionMode === "bypassPermissions"
              ? { behavior: "allow" as const, updatedInput: undefined }
              : await options.askPermission(
                  {
                    requestId: toolId,
                    toolName: "mcp__jig__addon_tasks_delete",
                    input,
                    canAlwaysAllow: false,
                  },
                  signal,
                );
          const output =
            decision.behavior === "allow"
              ? outputText(
                  await toolHandlers
                    .addon_tasks_delete(decision.updatedInput ?? input)
                    .catch((e: Error) => `Error: ${e.message}`),
                )
              : `Error: ${decision.message ?? "Denied"}`;
          onEvent({ type: "tool_result", toolUseId: toolId, output, isError: output.startsWith("Error") });
          await stream(
            `${msg}:text:0`,
            output.startsWith("Error") ? "OK, I didn't delete it." : "Deleted the queued task.",
            signal,
          );
        } else if (isTestChat) {
          // Tools → Test something…: a short report that says which model and helpers ran it.
          const agents = Object.keys(options.agents ?? {}).join(", ") || "none";
          await stream(
            `${msg}:text:0`,
            `Test report (model ${model}; subagents: ${agents})

- PASS: the page opened and showed what was asked.`,
            signal,
          );
        } else if (lower.includes("routine")) {
          // Claude makes a routine with Claude Code's RemoteTrigger tool (it asks first, like any change).
          const toolId = `tool-${randomUUID()}`;
          const input = {
            action: "create",
            body: {
              name: "Daily standup notes",
              cron_expression: "45 8 * * 1-5",
              prompt: "Write my standup notes",
            },
          };
          onEvent({
            type: "tool_use",
            id: toolId,
            name: "RemoteTrigger",
            input,
          });
          const decision = await options.askPermission(
            {
              requestId: toolId,
              toolName: "RemoteTrigger",
              input,
              canAlwaysAllow: false,
            },
            signal,
          );
          if (decision.behavior === "allow") {
            const result = this.cloud.call({ tool: "RemoteTrigger", input });
            onEvent({
              type: "tool_result",
              toolUseId: toolId,
              output: result.text,
              isError: !result.ok,
            });
            await stream(
              `${msg}:text:0`,
              "I created the routine **Daily standup notes** (weekdays at 08:45).",
              signal,
            );
          } else {
            onEvent({
              type: "tool_result",
              toolUseId: toolId,
              output: "Denied",
              isError: true,
            });
            await stream(`${msg}:text:0`, "OK, no routine.", signal);
          }
        } else if (lower.includes("publish an artifact")) {
          // Claude writes a page and publishes it with Claude Code's Artifact tool.
          const path = join(options.cwd, "release-notes.html");
          await writeFile(
            path,
            "<!doctype html><title>Release notes</title><style>body{font-family:sans-serif;padding:24px}</style><h1>Release notes</h1><p>Discount codes at checkout.</p>",
          );
          const toolId = `tool-${randomUUID()}`;
          onEvent({
            type: "tool_use",
            id: toolId,
            name: "Artifact",
            input: { file_path: path, icon: "notes" },
          });
          await sleep(this.delayMs * 2, signal);
          onEvent({
            type: "tool_result",
            toolUseId: toolId,
            output: `Published ${path} at https://claude.ai/artifact/fakeReleaseNotes (Version 1).`,
            isError: false,
          });
          await stream(`${msg}:text:0`, "I published the release notes as an artifact.", signal);
        } else if (lower.includes("use a skill")) {
          // A skill (the Skill tool), a file read and an MCP tool: for the chat overview.
          const calls: Array<{
            name: string;
            input: Record<string, unknown>;
            output: string;
          }> = [
            {
              name: "Skill",
              input: { skill: "explain-code" },
              output: "Launching skill: explain-code",
            },
            {
              name: "Read",
              input: { file_path: join(options.cwd, "README.md") },
              output: "# Shop",
            },
            {
              name: "mcp__github__list_issues",
              input: { repo: "contoso/shop" },
              output: "[]",
            },
            {
              name: "mcp__jig__addon_releases_overview",
              input: {},
              output: "shop: 1.2.0, 3 unreleased",
            },
          ];
          for (const call of calls) {
            const toolId = `tool-${randomUUID()}`;
            onEvent({
              type: "tool_use",
              id: toolId,
              name: call.name,
              input: call.input,
              model: "opus",
            });
            await sleep(this.delayMs, signal);
            onEvent({
              type: "tool_result",
              toolUseId: toolId,
              output: call.output,
              isError: false,
            });
          }
          await stream(`${msg}:text:0`, "I explained the code with the explain-code skill.", signal);
        } else if (lower.includes("todo list")) {
          // Claude keeps a todo list (TodoWrite) and works through it.
          const todos = (done: number) =>
            ["Read the cart code", "Add the discount", "Write the tests"].map((content, i) => ({
              content,
              activeForm: ["Reading the cart code", "Adding the discount", "Writing the tests"][i],
              status: i < done ? "completed" : i === done ? "in_progress" : "pending",
            }));
          for (const done of [0, 1, 3]) {
            const toolId = `tool-${randomUUID()}`;
            onEvent({
              type: "tool_use",
              id: toolId,
              name: "TodoWrite",
              input: { todos: todos(done) },
            });
            await sleep(this.delayMs * 2, signal);
            onEvent({
              type: "tool_result",
              toolUseId: toolId,
              output: "Todos updated",
              isError: false,
            });
          }
          await stream(`${msg}:text:0`, "All three steps are done.", signal);
        } else if (lower.includes("look at the code")) {
          // Claude searches and reads the code to help plan (talking with Claude, D-210).
          const calls = [
            { name: "Grep", input: { pattern: "total", path: options.cwd }, output: "cart.ts:12: total()" },
            {
              name: "Read",
              input: { file_path: join(options.cwd, "cart.ts") },
              output: "export function total() {}",
            },
          ];
          for (const call of calls) {
            const toolId = `tool-${randomUUID()}`;
            onEvent({ type: "tool_use", id: toolId, name: call.name, input: call.input });
            // Slow enough (about 2 s in all) that a test can still talk to it while it works, even
            // with many tests running side by side.
            await sleep(this.delayMs * 60, signal);
            onEvent({ type: "tool_result", toolUseId: toolId, output: call.output, isError: false });
          }
          // A pause between the last tool and the answer, as while Claude writes: the steps line shows
          // it's still working then.
          await sleep(this.delayMs * 30, signal);
          await stream(
            `${msg}:text:0`,
            "The total is worked out in cart.ts. Shall the discount go there?",
            signal,
          );
        } else if (lower.includes("make a plan") || lower.startsWith("go ahead")) {
          // Plan mode: Claude proposes a plan and asks to leave plan mode (ExitPlanMode).
          const toolId = `tool-${randomUUID()}`;
          const input = {
            plan: "## Plan\n\n1. Add a `discount` field to the cart\n2. Apply it in `total()`\n3. Test it",
          };
          onEvent({
            type: "tool_use",
            id: toolId,
            name: "ExitPlanMode",
            input,
          });
          // A Codex chat presents it with Jig's exit_plan tool over MCP (D-315).
          const decision: PermissionDecision =
            mcpClient && this.provider === "codex"
              ? await callStandIn(EXIT_PLAN_TOOL, toolId, input).then((answer) =>
                  answer.startsWith("The user approved")
                    ? { behavior: "allow" as const }
                    : { behavior: "deny" as const, message: answer },
                )
              : await options.askPermission(
                  {
                    requestId: toolId,
                    toolName: "ExitPlanMode",
                    input,
                    canAlwaysAllow: false,
                  },
                  signal,
                );
          const approved = decision.behavior === "allow";
          onEvent({
            type: "tool_result",
            toolUseId: toolId,
            output: approved ? "User approved the plan" : (decision.message ?? "User rejected the plan"),
            isError: !approved,
          });
          await stream(
            `${msg}:text:0`,
            approved
              ? `Starting on the plan (mode: ${permissionMode}).`
              : `OK, let's keep planning.${decision.behavior === "deny" && decision.message ? ` You said: ${decision.message}` : ""}`,
            signal,
          );
        } else if (lower.includes("subagent")) {
          // A subagent (Task tool) with its own tool calls and progress.
          const toolId = `tool-${randomUUID()}`;
          onEvent({
            type: "tool_use",
            id: toolId,
            name: "Task",
            model: model === "opusplan" ? "opus" : model,
            input: {
              description: "Explore the cart code",
              subagent_type: "Explore",
              model: "sonnet",
              prompt: "Find the cart",
            },
          });
          const taskId = `task-${randomUUID()}`;
          onEvent({
            type: "task",
            toolUseId: toolId,
            task: {
              id: taskId,
              status: "running",
              description: "Explore the cart code",
            },
          });
          const inner = `tool-${randomUUID()}`;
          onEvent({
            type: "tool_use",
            id: inner,
            name: "Grep",
            input: { pattern: "total" },
            parentId: toolId,
            model: "sonnet",
          });
          await sleep(this.delayMs * 2, signal);
          onEvent({
            type: "tool_result",
            toolUseId: inner,
            output: "src/cart.ts",
            isError: false,
          });
          onEvent({
            type: "task",
            toolUseId: toolId,
            task: {
              id: taskId,
              status: "running",
              description: "",
              tokens: 5400,
              toolUses: 1,
              lastTool: "Grep",
            },
          });
          await sleep(this.delayMs * 2, signal);
          onEvent({
            type: "task",
            toolUseId: toolId,
            task: {
              id: taskId,
              status: "completed",
              description: "",
              tokens: 8200,
              toolUses: 2,
              durationMs: 3100,
            },
          });
          onEvent({
            type: "tool_result",
            toolUseId: toolId,
            output: "The cart total is in src/cart.ts.",
            isError: false,
          });
          await stream(`${msg}:text:0`, "The subagent found the cart code in src/cart.ts.", signal);
        } else if (lower.includes("background job")) {
          // A long command moved to the background: it keeps running after the turn.
          const toolId = `tool-${randomUUID()}`;
          const taskId = `bash-${randomUUID().slice(0, 8)}`;
          onEvent({
            type: "tool_use",
            id: toolId,
            name: "Bash",
            input: {
              command: "npm run watch",
              description: "Watch and rebuild",
              run_in_background: true,
            },
          });
          backgroundTasks.set(taskId, {
            id: taskId,
            description: "Watch and rebuild",
            type: "local_bash",
          });
          onEvent({
            type: "background_tasks",
            tasks: [...backgroundTasks.values()],
          });
          onEvent({
            type: "tool_result",
            toolUseId: toolId,
            output: `Command running in background with ID: ${taskId}`,
            isError: false,
          });
          await stream(`${msg}:text:0`, "The watcher runs in the background.", signal);
        } else if (lower.includes("list jig library skills")) {
          const names = (options.plugins ?? []).map((plugin) => basename(plugin.path));
          await stream(
            `${msg}:text:0`,
            `Available Jig library skills: ${names.join(", ") || "none"}.`,
            signal,
          );
        } else if (/\bedit\s+\S/.test(lower)) {
          // An edit with Claude Code's structured patch (the chat shows the diff).
          const name = /\bedit\s+(\S+)/i.exec(text)![1]!;
          const path = isAbsolute(name) ? name : join(options.cwd, name);
          const before = (await readFile(path, "utf8").catch(() => null)) ?? "one\ntwo\nthree\n";
          if (options.fileCheckpoints) checkpoints.push({ uuid, path, before });
          const lines = before.split("\n");
          const old = lines[0] ?? "";
          const next = `${old} (edited)`;
          const toolId = `tool-${randomUUID()}`;
          onEvent({
            type: "tool_use",
            id: toolId,
            name: "Edit",
            input: { file_path: path, old_string: old, new_string: next },
          });
          await writeFile(path, [next, ...lines.slice(1)].join("\n"));
          onEvent({
            type: "tool_result",
            toolUseId: toolId,
            output: `The file ${path} has been updated.`,
            isError: false,
            diff: patchText({
              structuredPatch: [
                {
                  oldStart: 1,
                  oldLines: 2,
                  newStart: 1,
                  newLines: 2,
                  lines: [`-${old}`, `+${next}`, ` ${lines[1] ?? ""}`],
                },
              ],
            }),
          });
          await stream(`${msg}:text:0`, `I edited ${name}.`, signal);
        } else if (mcpClient && /^call \S+ over mcp\b/i.test(text.trim())) {
          // "call jig_get_settings over mcp" / "call <tool> over mcp with {json}": asks first unless the
          // tool only reads or the chat is in Don't ask mode, like Codex (D-313).
          const match = /^call (\S+) over mcp(?:\s+with\s+(\{[\s\S]*\}))?\s*$/i.exec(text.trim());
          const tool = match?.[1] ?? "";
          let input: Record<string, unknown> = {};
          try {
            input = match?.[2] ? JSON.parse(match[2]) : {};
          } catch {
            input = {};
          }
          const server = mcpClient.serverOf(tool) ?? "jig";
          const name = `mcp__${server}__${tool}`;
          const toolId = `tool-${randomUUID()}`;
          onEvent({ type: "tool_use", id: toolId, name, input });
          const decision =
            permissionMode === "bypassPermissions" || isReadOnlyChatTool(toolServers, name)
              ? { behavior: "allow" as const }
              : await options.askPermission(
                  { requestId: toolId, toolName: name, input, canAlwaysAllow: true },
                  signal,
                );
          if (decision.behavior !== "allow") {
            onEvent({ type: "tool_result", toolUseId: toolId, output: "Denied", isError: true });
            await stream(`${msg}:text:0`, `OK, I didn't call ${tool}.`, signal);
          } else {
            const result = await mcpClient
              .call(server, tool, input)
              .catch((e: Error) => ({ text: `Error: ${e.message}`, images: [], isError: true }));
            onEvent({
              type: "tool_result",
              toolUseId: toolId,
              output: result.text,
              isError: result.isError,
              ...(result.images.length ? { imageData: result.images } : {}),
            });
            await stream(`${msg}:text:0`, `I called ${tool} over Jig's MCP server.`, signal);
          }
        } else if (toolHandlers?.jig_azure_tenants && /\bazure tenants?\b/.test(lower)) {
          // "which azure tenants…" lists them; "switch the azure tenant to X" also switches (asks first).
          const listId = `tool-${randomUUID()}`;
          onEvent({ type: "tool_use", id: listId, name: "mcp__jig__jig_azure_tenants", input: {} });
          const list = outputText(await toolHandlers.jig_azure_tenants({}));
          onEvent({ type: "tool_result", toolUseId: listId, output: list, isError: false });
          const wanted = /\bswitch\b.*\bto\s+(.+?)[.!?]?$/i.exec(text.trim())?.[1];
          if (!wanted || !toolHandlers.jig_azure_switch_tenant) {
            await stream(`${msg}:text:0`, "These are the Azure tenants Jig knows.", signal);
          } else {
            const toolId = `tool-${randomUUID()}`;
            const input = { tenant: wanted };
            onEvent({ type: "tool_use", id: toolId, name: "mcp__jig__jig_azure_switch_tenant", input });
            const decision =
              permissionMode === "bypassPermissions"
                ? { behavior: "allow" as const, updatedInput: undefined }
                : await options.askPermission(
                    {
                      requestId: toolId,
                      toolName: "mcp__jig__jig_azure_switch_tenant",
                      input,
                      canAlwaysAllow: false,
                    },
                    signal,
                  );
            if (decision.behavior !== "allow") {
              onEvent({
                type: "tool_result",
                toolUseId: toolId,
                output: decision.message ?? "Denied",
                isError: true,
              });
              await stream(`${msg}:text:0`, "OK, I kept the tenant.", signal);
            } else {
              const output = outputText(
                await toolHandlers.jig_azure_switch_tenant(input).catch((e: Error) => `Error: ${e.message}`),
              );
              onEvent({
                type: "tool_result",
                toolUseId: toolId,
                output,
                isError: output.startsWith("Error"),
              });
              await stream(`${msg}:text:0`, output, signal);
            }
          }
        } else if (
          toolHandlers?.jig_update_settings &&
          /\b(theme|light mode|dark mode|terminals? to the right|bottom panel full width|pipelines (?:below|under) git|make a project for this chat|add the stage links|by hand on the vm|weekly check-in|profile interview|since the last release|in the releases data|as a workflow|remember in the notes|run the unit tests|in a jig terminal|text my phone|close my phone room|my usage limits|any pipelines running)\b/.test(
            lower,
          )
        ) {
          // "switch to the light theme" / "move the terminals to the right": Claude configures Jig.
          const call = async (name: string, input: Record<string, unknown>) => {
            const toolId = `tool-${randomUUID()}`;
            onEvent({
              type: "tool_use",
              id: toolId,
              name: `mcp__jig__${name}`,
              input,
            });
            const output = outputText(
              await toolHandlers![name]!(input).catch((e: Error) => `Error: ${e.message}`),
            );
            onEvent({
              type: "tool_result",
              toolUseId: toolId,
              output,
              isError: output.startsWith("Error"),
            });
            return output;
          };
          if (/as a workflow/.test(lower)) {
            await call("addon_workflows_save", {
              name: "Write release notes",
              goal: "Notes for customers from the changes since the last release",
              steps: [
                "git fetch --tags",
                {
                  title: "Read the changes since the last release",
                  kind: "claude",
                },
                {
                  title: "Write the notes in Swedish for customers",
                  kind: "claude",
                },
                "Send the notes to the customer",
              ],
            });
            await stream(`${msg}:text:0`, "Saved as the workflow Write release notes.", signal);
          } else if (/since the last release/.test(lower)) {
            await call("addon_releases_changes", {});
            await stream(`${msg}:text:0`, "Here is what changed since the last release.", signal);
          } else if (/text my phone/.test(lower)) {
            // Jig on your phone (D-350): a message to the user's phone; their reply comes back here.
            await call("jig_phone_send", { text: "The build is done. Shall I deploy it?" });
            await stream(`${msg}:text:0`, "I sent it to your phone.", signal);
          } else if (/close my phone room/.test(lower)) {
            // As /close in the room: only the room goes, the chat stays.
            const output = await call("jig_phone_close_room", {});
            await stream(`${msg}:text:0`, output, signal);
          } else if (/my usage limits/.test(lower)) {
            // The footer's numbers for both providers, as text.
            const output = await call("jig_usage_limits", {});
            await stream(`${msg}:text:0`, output, signal);
          } else if (/in a jig terminal/.test(lower)) {
            // A command in a terminal the user sees: when it exits, Jig tells this chat (a new turn).
            await call("jig_terminal_run", { command: "echo build finished", title: "Build" });
            await stream(`${msg}:text:0`, "It runs in a Jig terminal; I'll hear when it ends.", signal);
          } else if (/run the unit tests/.test(lower)) {
            // The Tests add-on's tools: list the suites, start one without waiting, then wait for it
            // by its run id until it is done (D-359), as Claude does with a suite of several minutes.
            await call("addon_tests_list", {});
            let result = await call("addon_tests_run", { suite: "npm:test", wait: 0 });
            const runId = /\(run ([\w-]+)/.exec(result)?.[1];
            for (let i = 0; runId && i < 5 && /still running/.test(result); i++)
              result = await call("addon_tests_wait", { id: runId, wait: 10 });
            await stream(`${msg}:text:0`, `The unit tests ran. ${result.split("\n")[0]}`, signal);
          } else if (/any pipelines running/.test(lower)) {
            // The Pipelines and Repos tools (D-371): runs going, the newest runs, one run, repo status.
            const running = await call("addon_pipelines_runs", { state: "running" });
            const recent = await call("addon_pipelines_runs", {});
            const id = /#(\d+)/.exec(recent)?.[1];
            const run = id ? await call("addon_pipelines_run", { id: Number(id) }) : "";
            const repos = await call("addon_repos_status", {});
            await stream(
              `${msg}:text:0`,
              [running, recent, run, repos].map((r) => r.split("\n")[0]).join("\n\n"),
              signal,
            );
          } else if (/remember in the notes/.test(lower)) {
            // The project notes tool: a note for this project (it shows in its Knowledge and Notes view).
            await call("jig_notes_add", {
              kind: "wait",
              text: "Pipeline improvements are deferred until the Jenkins-to-Azure-DevOps migration is complete",
            });
            await stream(`${msg}:text:0`, "Noted: this chat waits on the API review.", signal);
          } else if (/change the queued task/.test(lower)) {
            // The Tasks add-on's edit tool: adds a line to the first queued task (t1 in a new queue).
            await call("addon_tasks_edit", { tasks: [{ id: "t1", append: "Don't run the e2e tests." }] });
            await stream(`${msg}:text:0`, "I added the line to the queued task.", signal);
          } else if (/move the queued task/.test(lower)) {
            // The edit tool's moves: the second queued task (t2) goes to the top in a chat of its own.
            await call("addon_tasks_edit", { tasks: [{ id: "t2", moveTo: "top", newChat: true }] });
            await stream(`${msg}:text:0`, "I moved the task to the top of the queue.", signal);
          } else if (/in the releases data/.test(lower)) {
            await call("jig_get_addon", { addonId: "releases" });
            await call("jig_set_addon_data", {
              addonId: "releases",
              key: "fake-note",
              value: { text: "from a chat" },
            });
            await stream(`${msg}:text:0`, "I saved a note in the Releases add-on's data.", signal);
          } else if (/by hand on the vm/.test(lower)) {
            await call("jig_note_evidence", {
              note: "Deploys the webshop by hand: publish, then upload to the VM",
              category: "manual-work",
            });
            await stream(
              `${msg}:text:0`,
              "Got it — that sounds like a good candidate for a workflow.",
              signal,
            );
          } else if (/weekly check-in|profile interview/.test(lower)) {
            await call("jig_read_profile", {});
            await call("jig_update_profile", {
              heading: "How I release and deploy",
              lines: ["Publishes the webshop and uploads it to a VM by hand"],
            });
            await stream(`${msg}:text:0`, "I added how you deploy to your profile.", signal);
          } else if (/add the stage links/.test(lower)) {
            await call("jig_list_projects", {});
            await call("jig_add_project_links", {
              group: "Stage",
              links: [
                { url: "https://stage.shop.se" },
                {
                  url: "https://portal.azure.com/#@/resource/subscriptions/abc/resourceGroups/shop-stage",
                },
              ],
            });
            await stream(
              `${msg}:text:0`,
              "I added the stage site and resource group to the Stage links.",
              signal,
            );
          } else if (/make a project for this chat/.test(lower)) {
            await call("jig_list_projects", {});
            await call("jig_create_project", {
              name: "Fake project",
              path: options.cwd,
              permissionMode: "plan",
            });
            const created = (await toolHandlers!.jig_list_projects!({}).then(outputText)).match(
              /Fake project \[([^\]]+)\]/,
            )?.[1];
            await call("jig_move_chat", { projectId: created, pinned: true });
            await stream(
              `${msg}:text:0`,
              "I made the project Fake project and put this chat in it, pinned.",
              signal,
            );
          } else if (/pipelines (?:below|under) git/.test(lower)) {
            await call("jig_get_layout", {});
            await call("jig_change_layout", {
              ops: [
                {
                  op: "below",
                  view: "addon.pipelines.pipelines",
                  host: "addon.git.git",
                },
              ],
            });
            await stream(
              `${msg}:text:0`,
              "Pipelines now shows in the lower half of the sidebar, below Git.",
              signal,
            );
          } else if (/bottom panel full width/.test(lower)) {
            await call("jig_get_layout", {});
            await call("jig_change_layout", { ops: [{ op: "span", span: "full" }] });
            await stream(`${msg}:text:0`, "The bottom panel now runs the full width of the window.", signal);
          } else if (/terminals? to the right/.test(lower)) {
            await call("jig_get_layout", {});
            await call("jig_change_layout", {
              ops: [{ op: "move", view: "jig.terminals", region: "right" }],
            });
            await stream(`${msg}:text:0`, "I moved the terminals to the right sidebar.", signal);
          } else {
            await call("jig_list_themes", {});
            const themeId = lower.includes("dark") ? "jig-dark" : "jig-light";
            await call("jig_update_settings", {
              patch: { appearance: { themeId, density: "compact" } },
            });
            await stream(
              `${msg}:text:0`,
              `I switched Jig to ${themeId === "jig-dark" ? "Jig Dark" : "Jig Light"} with compact density.`,
              signal,
            );
          }
        } else if (toolHandlers?.jig_browser_open && /^browse\s+\S+/i.test(text.trim())) {
          // "browse <url>": Claude opens the page in its browser, reads it and takes a screenshot.
          const url = /^browse\s+(\S+)/i.exec(text.trim())![1]!;
          const call = async (name: string, input: Record<string, unknown>) => {
            const toolId = `tool-${randomUUID()}`;
            onEvent({
              type: "tool_use",
              id: toolId,
              name: `mcp__jig__${name}`,
              input,
            });
            const result = await toolHandlers![name]!(input, signal).catch(
              (e: Error) => `Error: ${e.message}`,
            );
            const output = outputText(result);
            const images = outputImages(result);
            onEvent({
              type: "tool_result",
              toolUseId: toolId,
              output,
              isError: output.startsWith("Error"),
              ...(images?.length ? { imageData: images } : {}),
            });
            return output;
          };
          const page = await call("jig_browser_open", { url });
          if (/\[1\]/.test(page)) await call("jig_browser_click", { ref: 1 });
          // "browse … and read it again": the page text after the click (a page that hangs on it).
          if (/\bread it again\b/i.test(text)) await call("jig_browser_read", {});
          await call("jig_browser_screenshot", {});
          // "browse … at phone and desktop": one screenshot per size, the size is put back after.
          if (/\bphone\b/i.test(text))
            await call("jig_browser_screenshot", {
              sizes: ["phone", "desktop"],
            });
          // "browse … and check the requests": the network log, failed ones first.
          if (/\brequests?\b|\bnetwork\b/i.test(text)) {
            await call("jig_browser_network", {});
            await call("jig_browser_network", { errorsOnly: true });
          }
          await stream(`${msg}:text:0`, "I opened the page in my browser and took a screenshot.", signal);
        } else if (toolHandlers?.jig_browser_read && /^read the browser page\b/i.test(text.trim())) {
          // "read the browser page": Claude reads its chat's page again (each chat has its own, D-320).
          const toolId = `tool-${randomUUID()}`;
          onEvent({ type: "tool_use", id: toolId, name: "mcp__jig__jig_browser_read", input: {} });
          const output = outputText(
            await toolHandlers.jig_browser_read({}, signal).catch((e: Error) => `Error: ${e.message}`),
          );
          onEvent({ type: "tool_result", toolUseId: toolId, output, isError: output.startsWith("Error") });
          await stream(`${msg}:text:0`, `My page: ${output.split("\n")[0]}`, signal);
        } else if (/\S+\.(png|jpe?g|gif|webp|svg)\b/i.test(text)) {
          // "look at /path/shot.png": Claude reads the image (the card shows a thumbnail).
          const file = /(\S+\.(?:png|jpe?g|gif|webp|svg))\b/i.exec(text)![1]!;
          const toolId = `tool-${randomUUID()}`;
          onEvent({
            type: "tool_use",
            id: toolId,
            name: "Read",
            input: { file_path: file },
          });
          await sleep(this.delayMs, signal);
          onEvent({
            type: "tool_result",
            toolUseId: toolId,
            output: "[image]",
            isError: false,
          });
          await stream(`${msg}:text:0`, "I looked at the image.", signal);
        } else if (lower.includes("safety check")) {
          // Claude Code's own safety check: it asks even in Don't ask mode (D-293, D-336).
          const toolId = `tool-${randomUUID()}`;
          const input = { command: "rm -rf /fake-root/build", description: "Remove the build folder" };
          onEvent({ type: "tool_use", id: toolId, name: "Bash", input });
          const decision = await options.askPermission(
            {
              requestId: toolId,
              toolName: "Bash",
              input,
              title: "Dangerous rm operation on critical path",
              canAlwaysAllow: false,
            },
            signal,
          );
          onEvent({
            type: "tool_result",
            toolUseId: toolId,
            output: decision.behavior === "allow" ? "Removed." : (decision.message ?? "Denied"),
            isError: decision.behavior !== "allow",
          });
          await stream(
            `${msg}:text:0`,
            decision.behavior === "allow" ? "Removed the build folder." : "OK, I skipped removing it.",
            signal,
          );
        } else if (lower.includes("run") || lower.includes("permission")) {
          const toolId = `tool-${randomUUID()}`;
          const input = { command: "npm test", description: "Run the tests" };
          onEvent({ type: "tool_use", id: toolId, name: "Bash", input });
          const decision =
            permissionMode === "bypassPermissions" || permissionMode === "acceptEdits"
              ? { behavior: "allow" as const }
              : await options.askPermission(
                  {
                    requestId: toolId,
                    toolName: "Bash",
                    input,
                    title: "Claude wants to run npm test",
                    canAlwaysAllow: true,
                  },
                  signal,
                );
          if (decision.behavior === "allow") {
            await sleep(this.delayMs * 3, signal);
            onEvent({
              type: "tool_result",
              toolUseId: toolId,
              output: "Tests: 12 passed, 12 total",
              isError: false,
            });
            await stream(`${msg}:text:0`, "All **12 tests** passed.", signal);
          } else {
            onEvent({
              type: "tool_result",
              toolUseId: toolId,
              output: decision.message ?? "Denied",
              isError: true,
            });
            await stream(`${msg}:text:0`, "OK, I won't run the tests.", signal);
          }
        } else if (lower.includes("question")) {
          const toolId = `tool-${randomUUID()}`;
          const colour = {
            question: "Which colour should the button be?",
            header: "Colour",
            multiSelect: false,
            options: [
              { label: "Accent", description: "The theme's accent colour" },
              { label: "Neutral", description: "A quiet secondary button" },
            ],
          };
          // "several questions": three steps (one choice, several choices, your own words).
          const input = {
            questions: lower.includes("several questions")
              ? [
                  {
                    question: "Which step should come first?",
                    header: "First step",
                    multiSelect: false,
                    options: [
                      {
                        label: "Capture Jenkins (Recommended)",
                        description: "Export the job configs",
                      },
                      {
                        label: "Update docs",
                        description: "Bring the inventory up to date",
                      },
                    ],
                  },
                  {
                    question: "Which checks should stay?",
                    header: "Checks",
                    multiSelect: true,
                    options: [{ label: "check-stage" }, { label: "check-demo" }, { label: "check-websites" }],
                  },
                  {
                    question: "What happened to the credentials?",
                    header: "Credentials",
                    multiSelect: false,
                    options: [{ label: "Access removed" }, { label: "I changed them" }],
                  },
                ]
              : [colour],
          };
          onEvent({
            type: "tool_use",
            id: toolId,
            name: "AskUserQuestion",
            input,
          });
          let answer: string | undefined;
          if (mcpClient && this.provider === "codex") {
            // A Codex chat asks with Jig's ask_user tool over MCP (D-315): one "- question → answer" line each.
            const out = await callStandIn(ASK_USER_TOOL, toolId, input);
            const lines = out.startsWith("The user answered:")
              ? out
                  .split("\n")
                  .filter((l) => l.startsWith("- "))
                  .map((l) => l.split(" → ").pop())
              : [];
            answer = lines.length ? lines.join(" | ") : undefined;
          } else {
            const decision = await options.askPermission(
              {
                requestId: toolId,
                toolName: "AskUserQuestion",
                input,
                canAlwaysAllow: false,
              },
              signal,
            );
            const answers = (decision.behavior === "allow" ? decision.updatedInput?.answers : undefined) as
              | Record<string, string>
              | undefined;
            answer = answers ? Object.values(answers).join(" | ") : undefined;
          }
          onEvent({
            type: "tool_result",
            toolUseId: toolId,
            output: answer ? `User answered: ${answer}` : "No answer",
            isError: !answer,
          });
          await stream(`${msg}:text:0`, answer ? `Great, **${answer}** it is.` : "No problem.", signal);
        } else if (/\bwrite\s+\S/.test(lower)) {
          const name = /\bwrite\s+(\S+)/i.exec(text)![1]!;
          const path = isAbsolute(name) ? name : join(options.cwd, name);
          const before = await readFile(path, "utf8").catch(() => null);
          if (options.fileCheckpoints) checkpoints.push({ uuid, path, before });
          const toolId = `tool-${randomUUID()}`;
          const content = `Written by the fake engine.\n${before ?? ""}`;
          onEvent({
            type: "tool_use",
            id: toolId,
            name: "Write",
            input: { file_path: path, content },
          });
          await writeFile(path, content);
          onEvent({
            type: "tool_result",
            toolUseId: toolId,
            output: `Wrote ${path}`,
            isError: false,
          });
          await stream(`${msg}:text:0`, `I wrote ${name}.`, signal);
        } else if (lower.includes("build")) {
          const toolId = `tool-${randomUUID()}`;
          const goal = text.replace(/^(please\s+)?build( me)?\s*/i, "") || text;
          onEvent({
            type: "tool_use",
            id: toolId,
            name: "mcp__jig__jig_request_build",
            input: { goal },
          });
          const output = toolHandlers?.jig_request_build
            ? outputText(await toolHandlers.jig_request_build({ goal }))
            : "Build requested.";
          onEvent({
            type: "tool_result",
            toolUseId: toolId,
            output,
            isError: false,
          });
          await stream(`${msg}:text:0`, "I've asked Jig's builder to make that.", signal);
        } else if (lower.includes("slow")) {
          await stream(`${msg}:text:0`, `${"This is a long answer that keeps going. ".repeat(200)}`, signal);
        } else {
          const seen = /^\[(\d+) images?\]/.exec(text)?.[1];
          const docs = [...text.matchAll(/\[(?:pdf|doc): ([^\]]+)\]/g)].map((m) => m[1]);
          const reply = `${seen ? `I see ${seen} image${seen === "1" ? "" : "s"}. ` : ""}${docs.length ? `I read ${docs.join(", ")}. ` : ""}You said: *${text.slice(0, 200)}*\n\nHere is some code:\n\n\`\`\`ts\nconst answer: number = 42;\nconsole.log("hello", answer);\n\`\`\`\n\n- one\n- two`;
          await stream(`${msg}:text:0`, reply, signal);
        }
        while (steers.length) {
          const note = steers.shift()!;
          await stream(`${msg}:text:steer-${steers.length}`, `Noted while working: “${note}”.`, signal);
        }
        if (lower.includes("fail") && !isTestChat) {
          onEvent({
            type: "result",
            ok: false,
            durationMs: Date.now() - started,
            error: "Something went wrong (scripted).",
          });
          return;
        }
        if (options.promptSuggestions && turnsDone > 0)
          // What Claude Code would propose next (it skips the first turn, like the real one).
          suggestTimer = setTimeout(
            () =>
              onEvent({
                type: "suggestion",
                text: lower.includes("test") ? "Commit these changes" : "Now write tests for this",
              }),
            this.delayMs,
          );
        turnsDone++;
        onEvent({
          type: "result",
          ok: true,
          durationMs: Date.now() - started,
          totalCostUsd: undefined,
          usage: {
            inputTokens: 100,
            outputTokens: 20,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          modelUsage: {
            [model === "opusplan" ? "opus" : model]: {
              inputTokens: 100 * turnsDone,
              outputTokens: 20 * turnsDone,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
              costUsd: 0.01 * turnsDone,
            },
          },
          numTurns: 1,
          chainUuid: `chain-${uuid}`,
        });
      } catch {
        onEvent({
          type: "result",
          ok: false,
          durationMs: Date.now() - started,
          error: "Interrupted",
        });
      } finally {
        turn = undefined;
      }
    };

    const pump = async () => {
      while (queue.length > 0 && !closed) {
        if (turn) return;
        const next = queue.shift()!;
        await runTurn(next.text, next.uuid);
      }
    };

    return {
      send(text, attachments = [], priority) {
        // The fake says what it got: "[1 image] [pdf: spec.pdf] [doc: plan.docx] …".
        const images = attachments.filter((a) => a.type === "image").length;
        const tags = [
          ...(images ? [`[${images} image${images === 1 ? "" : "s"}]`] : []),
          ...attachments.flatMap((a) =>
            a.type === "pdf" ? [`[pdf: ${a.name}]`] : a.type === "text" ? [`[doc: ${a.name}]`] : [],
          ),
        ];
        const uuid = randomUUID();
        if (priority === "next" && turn) {
          steers.push(text);
          return uuid;
        }
        queue.push({
          text: tags.length ? `${tags.join(" ")} ${text}` : text,
          uuid,
        });
        void pump();
        return uuid;
      },
      async commands() {
        return FAKE_COMMANDS;
      },
      async models() {
        return FAKE_MODELS;
      },
      async setEffort(next) {
        effort = next ?? undefined;
      },
      async mcpStatus() {
        return mcp.map((m) => ({ ...m }));
      },
      async mcpReconnect(name) {
        const server = mcp.find((m) => m.name === name);
        if (server && server.status !== "disabled") server.status = "connected";
      },
      async mcpToggle(name, enabled) {
        const server = mcp.find((m) => m.name === name);
        if (server) server.status = enabled ? "connected" : "disabled";
      },
      async background() {
        return false;
      },
      async stopTask(taskId) {
        if (!backgroundTasks.delete(taskId)) return;
        onEvent({
          type: "background_tasks",
          tasks: [...backgroundTasks.values()],
        });
      },
      async rewindFiles(messageId, dryRun) {
        const from = messageOrder.indexOf(messageId);
        if (from < 0) return { canRewind: false, error: "No checkpoint for this message." };
        const later = new Set(messageOrder.slice(from));
        // Each file goes back to its content before the first change from this message on.
        const originals = new Map<string, string | null>();
        for (const c of checkpoints)
          if (later.has(c.uuid) && !originals.has(c.path)) originals.set(c.path, c.before);
        if (!dryRun) {
          for (const [path, before] of originals)
            before === null ? await rm(path, { force: true }) : await writeFile(path, before);
          for (let i = checkpoints.length - 1; i >= 0; i--)
            if (later.has(checkpoints[i]!.uuid)) checkpoints.splice(i, 1);
        }
        return {
          canRewind: true,
          filesChanged: [...originals.keys()],
          insertions: 0,
          deletions: originals.size,
        };
      },
      async interrupt() {
        turn?.abort();
      },
      async setModel(next) {
        model = next || "fake-model";
      },
      async setPermissionMode(mode) {
        permissionMode = mode;
      },
      async contextUsage() {
        const messages = contextTokens - 15_000;
        return contextFrom({
          totalTokens: contextTokens,
          maxTokens: CONTEXT_MAX,
          categories: [
            { name: "System prompt", tokens: 3_000, kind: "used" },
            { name: "System tools", tokens: 12_000, kind: "used" },
            { name: "Messages", tokens: messages, kind: "used" },
            {
              name: "Free space",
              tokens: CONTEXT_MAX - contextTokens,
              kind: "free",
            },
          ],
        });
      },
      close() {
        closed = true;
        mcpClient?.close();
        clearTimeout(suggestTimer);
        turn?.abort();
        onEvent({ type: "exit" });
      },
    };
  }

  /** Pattern reflection: one suggestion for the strongest pattern in the prompt. */
  /**
   * Scripted plan usage: 42 % of the 5-hour window (resets in 2 h 13 min) and 18 % of the week.
   * `JIG_FAKE_USAGE=unavailable` acts like an API-key login; a JSON value replaces the answer.
   */
  async models() {
    return FAKE_MODELS;
  }

  /** Two scripted saved conversations (`JIG_FAKE_SAVED_CWD` is their folder; the home folder by default). */
  async savedSessions(): Promise<SavedClaudeSession[]> {
    const cwd = process.env.JIG_FAKE_SAVED_CWD ?? homedir();
    const at = Date.now();
    // Standing in for Codex: its one saved thread, through the same conversion as Codex's (D-315).
    if (this.provider === "codex") return [savedThread(fakeCodexThread(cwd, at))!];
    return [
      {
        sessionId: FAKE_SAVED_ID,
        title: "Fix the cart total",
        cwd,
        gitBranch: "main",
        lastModified: at - 3_600_000,
        fileSize: 48_000,
      },
      {
        sessionId: "saved-2",
        title: "Plan the checkout",
        cwd,
        lastModified: at - 3 * 86_400_000,
        fileSize: 9_000,
      },
    ];
  }

  async savedToolUses(sessionId: string): Promise<SavedToolUse[]> {
    return (await this.savedMessages(sessionId)).flatMap((m) =>
      m.type !== "assistant"
        ? []
        : (
            (
              m.message as {
                content?: Array<{
                  type?: string;
                  name?: string;
                  input?: Record<string, unknown>;
                }>;
              }
            ).content ?? []
          )
            .filter((b) => b.type === "tool_use" && b.name)
            .map((b) => ({ name: b.name as string, input: b.input ?? {} })),
    );
  }

  async savedMessages(sessionId: string): Promise<SavedClaudeMessage[]> {
    if (this.provider === "codex")
      return threadMessages(fakeCodexThread(process.env.JIG_FAKE_SAVED_CWD ?? homedir(), Date.now()));
    if (sessionId !== FAKE_SAVED_ID)
      return [
        {
          type: "user",
          uuid: "p1",
          parent_tool_use_id: null,
          message: { role: "user", content: "Plan the checkout" },
        },
      ];
    const msg = (
      type: SavedClaudeMessage["type"],
      uuid: string,
      content: unknown,
      parent: string | null = null,
    ) => ({
      type,
      uuid,
      parent_tool_use_id: parent,
      message: { id: `m-${uuid}`, role: type, content },
    });
    return [
      msg("user", "u1", "<system-reminder>Context Claude Code adds.</system-reminder>"),
      msg("user", "u2", [{ type: "text", text: "The cart total is off by one, fix it" }]),
      msg("assistant", "a1", [
        { type: "text", text: "I'll fix the total in cart.ts." },
        {
          type: "tool_use",
          id: "t1",
          name: "Edit",
          input: { file_path: "cart.ts" },
        },
      ]),
      msg("assistant", "s1", [{ type: "text", text: "A subagent's note" }], "t1"),
      msg("user", "u3", [{ type: "tool_result", tool_use_id: "t1", content: "Edited cart.ts" }]),
      msg("assistant", "a2", [{ type: "text", text: "Fixed: the total no longer adds one." }]),
    ];
  }

  async planUsage(): Promise<RawUsage> {
    const scripted = process.env.JIG_FAKE_USAGE;
    if (scripted === "unavailable")
      return {
        subscription_type: null,
        rate_limits_available: false,
        rate_limits: null,
      };
    if (scripted) return JSON.parse(scripted) as RawUsage;
    const at = (ms: number) => new Date(Date.now() + ms).toISOString();
    return {
      subscription_type: "max",
      rate_limits_available: true,
      rate_limits: {
        five_hour: { utilization: 42, resets_at: at((2 * 60 + 13) * 60_000) },
        seven_day: {
          utilization: 18,
          resets_at: at(4 * 24 * 3_600_000 + 3 * 3_600_000),
        },
        // Per-model weekly limits come named by the server (today's plans: Fable).
        model_scoped: [
          {
            display_name: "Fable",
            utilization: 31,
            resets_at: at(4 * 24 * 3_600_000 + 3 * 3_600_000),
          },
        ],
      },
    };
  }

  /** Routines and artifacts "in the cloud", for the Routines and Artifacts tabs (one store per app run). */
  private cloud = new FakeCloud();

  async callTool(request: ToolCallRequest): Promise<ToolCallResult> {
    await new Promise((r) => setTimeout(r, this.delayMs));
    return this.cloud.call(request);
  }

  /** Completions: `return ` gets `total;`, anything else a short comment, after a short pause. */
  completer(_options: CompleterOptions): Completer {
    return {
      ask: async (prompt, signal) => {
        await new Promise((resolve) => setTimeout(resolve, this.delayMs * 4));
        if (signal?.aborted) throw new Error("Cancelled");
        // Meeting captions (D-277, in batches since D-384): "[sv-se] the caption" for each.
        const batch = /^Translate these meeting captions into .*\(([^)]+)\)\.\n/.exec(prompt);
        if (batch)
          return [...prompt.matchAll(/<caption n="(\d+)">\n([\s\S]*?)\n<\/caption>/g)]
            .map((m) => `<t n="${m[1]}">[${batch[1]}] ${m[2]}</t>`)
            .join("\n");
        return /return <CURSOR>/.test(prompt) ? "total;" : "// suggested by the fake engine";
      },
      close: () => {},
    };
  }

  async oneShot(prompt: string, _options: OneShotOptions): Promise<string> {
    const scripted = process.env.JIG_FAKE_ONESHOT;
    if (scripted) return scripted;
    // Reorganize the task queue (D-397): each block reversed, its second task joining the first's chat.
    if (/You organize a queue of prompts/.test(prompt)) {
      const fixed = prompt.indexOf("\nOther tasks");
      const blocks = prompt
        .slice(prompt.indexOf("BLOCKS:"), fixed < 0 ? undefined : fixed)
        .split(/^Block \d+:$/m)
        .slice(1)
        .map((b) => [...b.matchAll(/^- id (\S+?)[: ]/gm)].map((m) => m[1]!));
      return JSON.stringify({
        summary: "Reversed each block (scripted).",
        order: blocks.flatMap((ids) =>
          [...ids].reverse().map((id, i) => ({ id, continues: i === 1, reason: "Scripted: reversed." })),
        ),
      });
    }
    // A task run report (D-355): every task in a line, its follow-ups merged into one proposal.
    if (/Write a structured report on this task-queue run/.test(prompt)) {
      const ids = [...prompt.matchAll(/^id: (\S+)$/gm)].map((m) => m[1]!);
      const followUps = [...prompt.matchAll(/^- \[(\S+)\] /gm)].map((m) => m[1]!);
      return JSON.stringify({
        overview: `The run did ${ids.length} tasks (scripted report).`,
        tasks: ids.map((taskId) => ({
          taskId,
          line: `Changed what ${taskId} asked for.`,
          committed: "main",
        })),
        aware: [{ kind: "decision", text: "Picked the simpler fix on its own.", taskIds: ids.slice(0, 1) }],
        stuck: [...prompt.matchAll(/^id: (\S+)\ntitle: .*\nstatus: (Failed|Blocked|Partly done)$/gm)].map(
          (m) => ({
            taskId: m[1],
            what: `It ended ${m[2]!.toLowerCase()}.`,
            unblock: "Run it again once the cause is fixed.",
          }),
        ),
        needsYou: [{ kind: "push", text: "Push the commits on main.", repo: "shop", taskIds: ids }],
        proposals: followUps.length
          ? [
              {
                kind: "fix",
                title: "Do the follow-ups together",
                why: "They touch the same code.",
                prompt: "Do the run's follow-ups together, and check the tests pass.",
                sources: followUps,
              },
            ]
          : [],
      });
    }
    if (/Check these changes before they are committed/.test(prompt)) {
      const debug = /^\+.*console\.log/m.test(prompt);
      return JSON.stringify({
        findings: debug
          ? [
              {
                severity: "medium",
                file: "cart.ts",
                line: 1,
                message: "A console.log is left in.",
              },
            ]
          : [],
      });
    }
    if (/Prepare the release notes for/.test(prompt)) {
      const version = /Proposed version: (\S+) /.exec(prompt)?.[1] ?? "1.0.0";
      return JSON.stringify({
        bump: "minor",
        reason: "A new feature and a fix since the last release (scripted).",
        changelog: `## [${version}] - 2026-10-29\n\n### Added\n- Discount codes at checkout\n\n### Fixed\n- Rounding in totals`,
        notes: [
          {
            audience: "customers",
            language: "English",
            text: "You can now use discount codes at checkout.",
          },
        ],
      });
    }
    if (/Write my standup update/.test(prompt))
      return "**Done**\n- Worked on the shop (scripted standup).\n\n**Next**\n- Keep going.\n\n**Blockers**\n- None.";
    if (/guided tour of the code changes/.test(prompt)) {
      const files = [...prompt.matchAll(/^diff --git a\/(.+?) b\//gm)].map((m) => m[1]!);
      return JSON.stringify({
        title: "Scripted tour",
        overview: "The fake engine walks through each changed file in order.",
        steps: files.map((file, i) => ({
          title: `Step ${i + 1}: ${file}`,
          file,
          line: 1,
          explanation: `What changed in ${file}, and why it matters.`,
        })),
      });
    }
    if (/Several attempts were made/.test(prompt))
      return JSON.stringify({
        winner: 2,
        summary: "Attempt 2 is the better one: it does the same with less code.",
        notes: [
          { attempt: 1, strengths: "Works", weaknesses: "Longer than needed" },
          { attempt: 2, strengths: "Short and clear", weaknesses: "No tests" },
        ],
      });
    // The learning reflection has a "## Patterns" section and mentions commit messages in Jig's features.
    if (/commit message/i.test(prompt) && !/^## Patterns$/m.test(prompt))
      return "Apply the discount in the cart total\n\nSum the items with reduce and take the discount off the total.";
    // A risky practice (D-213): a "practice" suggestion that opens a chat to fix it.
    const practice = /key: (\S+) \| practice \| "([^"]*)"/.exec(prompt);
    if (practice)
      return JSON.stringify({
        suggestions: [
          {
            title: "Keep keys out of your messages to Claude",
            why: `${practice[2]}.`,
            goal: "Move the key into an environment variable, rotate it, and refer to it by name in chats",
            level: 1,
            kind: "practice",
            patternKeys: [practice[1]],
          },
        ],
      });
    // A prompting habit (D-214): a "prompting-tip" with the request rewritten as one complete prompt.
    const habit = /key: (\S+) \| habit \| "([^"]*)"/.exec(prompt);
    if (habit)
      return JSON.stringify({
        suggestions: [
          {
            title: "Ask for the whole feature in one go",
            why: `${habit[2]}.`,
            goal: "Describe the whole feature once, with how to check it's done, and let Claude plan and build it",
            level: 1,
            kind: "prompting-tip",
            before:
              "write a function that validates orders\nnow write an endpoint for it\nok now add a service that calls it",
            changes: [
              "One request for the whole feature: Claude plans all the layers together instead of waiting for the next piece",
              "Points to the existing products code: Claude follows your patterns instead of guessing",
              "Says when it's done (the tests pass): Claude checks its own work",
            ],
            example:
              "Add order validation to the Shop API end to end: a validator, a POST /orders endpoint that uses it, and the service between them, following the existing products code. Done when the tests for all three pass. Plan it first.",
            patternKeys: [habit[1]],
          },
        ],
      });
    const first = /key: (\S+) \| ([\w-]+) \| "([^"]*)" \| (\d+) times on (\d+) day/.exec(prompt);
    // A note from a chat (jig_note_evidence) about manual work: a workflow, and a profile addition.
    const note = /- id: (\S+) \| [\d-]+ \| manual-work \| (.+)/.exec(prompt);
    if (!first && note)
      return JSON.stringify({
        suggestions: [
          {
            title: "A workflow for deploying the webshop",
            why: `You said: “${note[2]}”.`,
            goal: "Deploy the webshop the same way every time",
            level: 2,
            kind: "workflow",
            steps: ["Build and publish", "Upload to the VM", "Check the site"],
            noteIds: [note[1]],
          },
        ],
        profileUpdates: ["Deploys the webshop to a VM by hand"],
      });
    if (!first) return JSON.stringify({ suggestions: [] });
    const [, key, kind, summary, count, days] = first;
    return JSON.stringify({
      suggestions: [
        {
          title: `A button for “${summary!.slice(0, 50)}”`,
          why: `You did this ${count} times on ${days} days (${kind}).`,
          goal: `A Tools-menu action and a status bar button that runs: ${summary}`,
          level: 2,
          kind: "new-addon",
          minutesPerWeek: Number(count) * 2,
          patternKeys: [key],
        },
      ],
    });
  }
}
