import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import type {
  BackgroundTask,
  EffortLevel,
  EngineEvent,
  McpServerInfo,
  PermissionMode,
  SavedClaudeMessage,
  SavedClaudeSession,
  SlashCommandInfo,
} from "../../shared/engine";
import type { RawUsage } from "../../shared/usage";
import { runFakeBuilder } from "./fakeBuilder";
import { FakeCloud } from "./fakeCloud";
import { contextFrom, patchText } from "./normalize";
import type { ToolCallRequest, ToolCallResult } from "./toolCall";
import {
  type Engine,
  type EngineSession,
  type OneShotOptions,
  outputImages,
  outputText,
  type StartOptions,
} from "./types";

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
  { name: "review", description: "Review a pull request", argumentHint: "<pr>", builtin: true },
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
  { value: "sonnet", displayName: "Sonnet", description: "Coding and execution" },
  { value: "haiku", displayName: "Haiku", description: "Fastest" },
  {
    value: "opusplan",
    displayName: "Opus Plan Mode",
    description: "Opus to plan, Sonnet to execute",
    efforts: ["low", "medium", "high", "xhigh", "max"] as EffortLevel[],
  },
];

/** The fake saved conversation with a transcript (e2e opens it). */
export const FAKE_SAVED_ID = "saved-1";

/**
 * Scripted engine for tests and `JIG_ENGINE=fake` (D-015): no Claude Code process, no credentials,
 * no quota. What it does depends on words in your message; the full list is in
 * docs/guides/testing.md → The fake engine (keep it in step with the branches in `runTurn`).
 */
export class FakeEngine implements Engine {
  readonly kind = "fake" as const;
  constructor(private readonly delayMs = Number(process.env.JIG_FAKE_DELAY ?? 15)) {}

  start(options: StartOptions, onEvent: (event: EngineEvent) => void): EngineSession {
    // A fork continues the conversation under a new id, like Claude Code's forkSession.
    const engineSessionId = options.resume && !options.forkSession ? options.resume : `fake-${randomUUID()}`;
    let model = options.model || "fake-model";
    let permissionMode: PermissionMode = options.permissionMode;
    let initialised = false;
    let turn: AbortController | undefined;
    const queue: Array<{ text: string; uuid: string }> = [];
    // File checkpoints: the messages in order, and each file's content before a message changed it.
    const messageOrder: string[] = [];
    const checkpoints: Array<{ uuid: string; path: string; before: string | null }> = [];
    let closed = false;
    // Scripted context window: grows each turn ("read the big file" adds a lot), /compact shrinks it.
    const CONTEXT_MAX = 200_000;
    let contextTokens = 18_000;
    let turnsDone = 0;
    let suggestTimer: NodeJS.Timeout | undefined;
    let effort: EffortLevel | undefined = options.effort;
    const backgroundTasks = new Map<string, BackgroundTask>();
    const mcp: McpServerInfo[] = [
      { name: "github", status: "connected", scope: "user", tools: 12 },
      { name: "jira", status: "needs-auth", scope: "project" },
    ];
    /** Messages sent while a turn runs ("steer"): Claude sees them before it finishes. */
    const steers: string[] = [];
    const sleep = (ms: number, signal: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
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
      // The script answers what the user typed: add-ons' context (D-151) is left out of the matching.
      const text = sent.replace(/^<jig-context>[\s\S]*?<\/jig-context>\s*/, "");
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
            onEvent({ type: "error", code: "not_signed_in", message: "Not logged in · Please run /login" });
            onEvent({ type: "result", ok: false, durationMs: 1, error: "Not logged in" });
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
          onEvent({ type: "compacted", trigger: "manual", preTokens, postTokens: contextTokens });
          onEvent({ type: "result", ok: true, durationMs: Date.now() - started, numTurns: 0 });
          return;
        }
        contextTokens = Math.min(CONTEXT_MAX, contextTokens + (lower.includes("big file") ? 130_000 : 9_000));
        // A test chat's message mentions PASS/FAIL, which must not end the turn with an error.
        const isTestChat = lower.startsWith("test this in claude's browser");
        await stream(`${msg}:thinking:0`, "Thinking about the request.", signal, "thinking");
        if (options.toolHandlers?.catalog) {
          await runFakeBuilder(text, options.toolHandlers, onEvent);
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
          onEvent({ type: "tool_use", id: toolId, name: "RemoteTrigger", input });
          const decision = await options.askPermission(
            { requestId: toolId, toolName: "RemoteTrigger", input, canAlwaysAllow: false },
            signal,
          );
          if (decision.behavior === "allow") {
            const result = this.cloud.call({ tool: "RemoteTrigger", input });
            onEvent({ type: "tool_result", toolUseId: toolId, output: result.text, isError: !result.ok });
            await stream(
              `${msg}:text:0`,
              "I created the routine **Daily standup notes** (weekdays at 08:45).",
              signal,
            );
          } else {
            onEvent({ type: "tool_result", toolUseId: toolId, output: "Denied", isError: true });
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
            onEvent({ type: "tool_use", id: toolId, name: "TodoWrite", input: { todos: todos(done) } });
            await sleep(this.delayMs * 2, signal);
            onEvent({ type: "tool_result", toolUseId: toolId, output: "Todos updated", isError: false });
          }
          await stream(`${msg}:text:0`, "All three steps are done.", signal);
        } else if (lower.includes("make a plan")) {
          // Plan mode: Claude proposes a plan and asks to leave plan mode (ExitPlanMode).
          const toolId = `tool-${randomUUID()}`;
          const input = {
            plan: "## Plan\n\n1. Add a `discount` field to the cart\n2. Apply it in `total()`\n3. Test it",
          };
          onEvent({ type: "tool_use", id: toolId, name: "ExitPlanMode", input });
          const decision = await options.askPermission(
            { requestId: toolId, toolName: "ExitPlanMode", input, canAlwaysAllow: false },
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
            input: {
              description: "Explore the cart code",
              subagent_type: "Explore",
              prompt: "Find the cart",
            },
          });
          const taskId = `task-${randomUUID()}`;
          onEvent({
            type: "task",
            toolUseId: toolId,
            task: { id: taskId, status: "running", description: "Explore the cart code" },
          });
          const inner = `tool-${randomUUID()}`;
          onEvent({
            type: "tool_use",
            id: inner,
            name: "Grep",
            input: { pattern: "total" },
            parentId: toolId,
          });
          await sleep(this.delayMs * 2, signal);
          onEvent({ type: "tool_result", toolUseId: inner, output: "src/cart.ts", isError: false });
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
            input: { command: "npm run watch", description: "Watch and rebuild", run_in_background: true },
          });
          backgroundTasks.set(taskId, { id: taskId, description: "Watch and rebuild", type: "local_bash" });
          onEvent({ type: "background_tasks", tasks: [...backgroundTasks.values()] });
          onEvent({
            type: "tool_result",
            toolUseId: toolId,
            output: `Command running in background with ID: ${taskId}`,
            isError: false,
          });
          await stream(`${msg}:text:0`, "The watcher runs in the background.", signal);
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
        } else if (
          options.toolHandlers?.jig_update_settings &&
          /\b(theme|light mode|dark mode|terminals? to the right|pipelines (?:below|under) git|make a project for this chat|add the stage links|by hand on the vm|weekly check-in|since the last release|in the releases data|as a workflow|remember in the notes)\b/.test(
            lower,
          )
        ) {
          // "switch to the light theme" / "move the terminals to the right": Claude configures Jig.
          const call = async (name: string, input: Record<string, unknown>) => {
            const toolId = `tool-${randomUUID()}`;
            onEvent({ type: "tool_use", id: toolId, name: `mcp__jig__${name}`, input });
            const output = outputText(
              await options.toolHandlers![name]!(input).catch((e: Error) => `Error: ${e.message}`),
            );
            onEvent({ type: "tool_result", toolUseId: toolId, output, isError: output.startsWith("Error") });
          };
          if (/as a workflow/.test(lower)) {
            await call("addon_workflows_save", {
              name: "Write release notes",
              goal: "Notes for customers from the changes since the last release",
              steps: [
                "git fetch --tags",
                { title: "Read the changes since the last release", kind: "claude" },
                { title: "Write the notes in Swedish for customers", kind: "claude" },
                "Send the notes to the customer",
              ],
            });
            await stream(`${msg}:text:0`, "Saved as the workflow Write release notes.", signal);
          } else if (/since the last release/.test(lower)) {
            await call("addon_releases_changes", {});
            await stream(`${msg}:text:0`, "Here is what changed since the last release.", signal);
          } else if (/remember in the notes/.test(lower)) {
            // The Notes add-on's tool: a note for this chat (it shows in the Notes view).
            await call("addon_notes_add", { kind: "wait", text: "the API review from the backend team" });
            await stream(`${msg}:text:0`, "Noted: this chat waits on the API review.", signal);
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
          } else if (/weekly check-in/.test(lower)) {
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
                { url: "https://portal.azure.com/#@/resource/subscriptions/abc/resourceGroups/shop-stage" },
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
            const created = (await options.toolHandlers!.jig_list_projects!({}).then(outputText)).match(
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
              ops: [{ op: "below", view: "addon.pipelines.pipelines", host: "addon.git.git" }],
            });
            await stream(
              `${msg}:text:0`,
              "Pipelines now shows below Git, as a section you can collapse.",
              signal,
            );
          } else if (/terminals? to the right/.test(lower)) {
            await call("jig_get_layout", {});
            await call("jig_change_layout", {
              ops: [{ op: "move", view: "jig.terminals", region: "right" }],
            });
            await stream(`${msg}:text:0`, "I moved the terminals to the right sidebar.", signal);
          } else {
            await call("jig_list_themes", {});
            const themeId = lower.includes("dark") ? "jig-dark" : "jig-light";
            await call("jig_update_settings", { patch: { appearance: { themeId, density: "compact" } } });
            await stream(
              `${msg}:text:0`,
              `I switched Jig to ${themeId === "jig-dark" ? "Jig Dark" : "Jig Light"} with compact density.`,
              signal,
            );
          }
        } else if (options.toolHandlers?.jig_browser_open && /^browse\s+\S+/i.test(text.trim())) {
          // "browse <url>": Claude opens the page in its browser, reads it and takes a screenshot.
          const url = /^browse\s+(\S+)/i.exec(text.trim())![1]!;
          const call = async (name: string, input: Record<string, unknown>) => {
            const toolId = `tool-${randomUUID()}`;
            onEvent({ type: "tool_use", id: toolId, name: `mcp__jig__${name}`, input });
            const result = await options.toolHandlers![name]!(input).catch(
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
          await call("jig_browser_screenshot", {});
          // "browse … at phone and desktop": one screenshot per size, the size is put back after.
          if (/\bphone\b/i.test(text)) await call("jig_browser_screenshot", { sizes: ["phone", "desktop"] });
          // "browse … and check the requests": the network log, failed ones first.
          if (/\brequests?\b|\bnetwork\b/i.test(text)) {
            await call("jig_browser_network", {});
            await call("jig_browser_network", { errorsOnly: true });
          }
          await stream(`${msg}:text:0`, "I opened the page in my browser and took a screenshot.", signal);
        } else if (/\S+\.(png|jpe?g|gif|webp|svg)\b/i.test(text)) {
          // "look at /path/shot.png": Claude reads the image (the card shows a thumbnail).
          const file = /(\S+\.(?:png|jpe?g|gif|webp|svg))\b/i.exec(text)![1]!;
          const toolId = `tool-${randomUUID()}`;
          onEvent({ type: "tool_use", id: toolId, name: "Read", input: { file_path: file } });
          await sleep(this.delayMs, signal);
          onEvent({ type: "tool_result", toolUseId: toolId, output: "[image]", isError: false });
          await stream(`${msg}:text:0`, "I looked at the image.", signal);
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
                      { label: "Capture Jenkins (Recommended)", description: "Export the job configs" },
                      { label: "Update docs", description: "Bring the inventory up to date" },
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
          onEvent({ type: "tool_use", id: toolId, name: "AskUserQuestion", input });
          const decision = await options.askPermission(
            { requestId: toolId, toolName: "AskUserQuestion", input, canAlwaysAllow: false },
            signal,
          );
          const answers = (decision.behavior === "allow" ? decision.updatedInput?.answers : undefined) as
            | Record<string, string>
            | undefined;
          const answer = answers ? Object.values(answers).join(" | ") : undefined;
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
          onEvent({ type: "tool_use", id: toolId, name: "Write", input: { file_path: path, content } });
          await writeFile(path, content);
          onEvent({ type: "tool_result", toolUseId: toolId, output: `Wrote ${path}`, isError: false });
          await stream(`${msg}:text:0`, `I wrote ${name}.`, signal);
        } else if (lower.includes("build")) {
          const toolId = `tool-${randomUUID()}`;
          const goal = text.replace(/^(please\s+)?build( me)?\s*/i, "") || text;
          onEvent({ type: "tool_use", id: toolId, name: "mcp__jig__jig_request_build", input: { goal } });
          const output = options.toolHandlers?.jig_request_build
            ? outputText(await options.toolHandlers.jig_request_build({ goal }))
            : "Build requested.";
          onEvent({ type: "tool_result", toolUseId: toolId, output, isError: false });
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
          usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 },
          numTurns: 1,
          chainUuid: `chain-${uuid}`,
        });
      } catch {
        onEvent({ type: "result", ok: false, durationMs: Date.now() - started, error: "Interrupted" });
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
        queue.push({ text: tags.length ? `${tags.join(" ")} ${text}` : text, uuid });
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
        onEvent({ type: "background_tasks", tasks: [...backgroundTasks.values()] });
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
            { name: "Free space", tokens: CONTEXT_MAX - contextTokens, kind: "free" },
          ],
        });
      },
      close() {
        closed = true;
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

  async savedMessages(sessionId: string): Promise<SavedClaudeMessage[]> {
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
        { type: "tool_use", id: "t1", name: "Edit", input: { file_path: "cart.ts" } },
      ]),
      msg("assistant", "s1", [{ type: "text", text: "A subagent's note" }], "t1"),
      msg("user", "u3", [{ type: "tool_result", tool_use_id: "t1", content: "Edited cart.ts" }]),
      msg("assistant", "a2", [{ type: "text", text: "Fixed: the total no longer adds one." }]),
    ];
  }

  async planUsage(): Promise<RawUsage> {
    const scripted = process.env.JIG_FAKE_USAGE;
    if (scripted === "unavailable")
      return { subscription_type: null, rate_limits_available: false, rate_limits: null };
    if (scripted) return JSON.parse(scripted) as RawUsage;
    const at = (ms: number) => new Date(Date.now() + ms).toISOString();
    return {
      subscription_type: "max",
      rate_limits_available: true,
      rate_limits: {
        five_hour: { utilization: 42, resets_at: at((2 * 60 + 13) * 60_000) },
        seven_day: { utilization: 18, resets_at: at(4 * 24 * 3_600_000 + 3 * 3_600_000) },
        // Per-model weekly limits come named by the server (today's plans: Fable).
        model_scoped: [
          { display_name: "Fable", utilization: 31, resets_at: at(4 * 24 * 3_600_000 + 3 * 3_600_000) },
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

  async oneShot(prompt: string, _options: OneShotOptions): Promise<string> {
    const scripted = process.env.JIG_FAKE_ONESHOT;
    if (scripted) return scripted;
    if (/Check these changes before they are committed/.test(prompt)) {
      const debug = /^\+.*console\.log/m.test(prompt);
      return JSON.stringify({
        findings: debug
          ? [{ severity: "medium", file: "cart.ts", line: 1, message: "A console.log is left in." }]
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
          { audience: "customers", language: "English", text: "You can now use discount codes at checkout." },
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
    if (/commit message/i.test(prompt))
      return "Apply the discount in the cart total\n\nSum the items with reduce and take the discount off the total.";
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
