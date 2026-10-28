import { randomUUID } from "node:crypto";
import type { EngineEvent, PermissionMode } from "../../shared/engine";
import type { RawUsage } from "../../shared/usage";
import { runFakeBuilder } from "./fakeBuilder";
import type { Engine, EngineSession, OneShotOptions, StartOptions } from "./types";

/**
 * Scripted engine for tests and `JIG_ENGINE=fake` (D-015): no Claude Code process, no credentials,
 * no quota. What it does depends on words in your message:
 *
 * - "run" / "permission" → asks to run `npm test` (permission prompt), then reports the result
 * - "question" → asks a multiple-choice question (AskUserQuestion)
 * - "slow" → streams for a long time (try Stop)
 * - "fail" → the turn ends with an error
 * - "login" → behaves like Claude Code that isn't signed in
 * - "build" → calls the jig_request_build tool (needs the jig MCP server)
 * - anything else → a short markdown reply with a code block
 */
export class FakeEngine implements Engine {
  readonly kind = "fake" as const;
  constructor(private readonly delayMs = Number(process.env.JIG_FAKE_DELAY ?? 15)) {}

  start(options: StartOptions, onEvent: (event: EngineEvent) => void): EngineSession {
    const engineSessionId = options.resume ?? `fake-${randomUUID()}`;
    let model = options.model || "fake-model";
    let permissionMode: PermissionMode = options.permissionMode;
    let initialised = false;
    let turn: AbortController | undefined;
    const queue: string[] = [];
    let closed = false;
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

    const runTurn = async (text: string) => {
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
        await stream(`${msg}:thinking:0`, "Thinking about the request.", signal, "thinking");
        if (options.toolHandlers?.catalog) {
          await runFakeBuilder(text, options.toolHandlers, onEvent);
        } else if (
          options.toolHandlers?.jig_update_settings &&
          /\b(theme|light mode|dark mode|terminals? to the right)\b/.test(lower)
        ) {
          // "switch to the light theme" / "move the terminals to the right": Claude configures Jig.
          const call = async (name: string, input: Record<string, unknown>) => {
            const toolId = `tool-${randomUUID()}`;
            onEvent({ type: "tool_use", id: toolId, name: `mcp__jig__${name}`, input });
            const output = await options.toolHandlers![name]!(input).catch(
              (e: Error) => `Error: ${e.message}`,
            );
            onEvent({ type: "tool_result", toolUseId: toolId, output, isError: output.startsWith("Error") });
          };
          if (/terminals? to the right/.test(lower)) {
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
          const input = {
            questions: [
              {
                question: "Which colour should the button be?",
                header: "Colour",
                multiSelect: false,
                options: [
                  { label: "Accent", description: "The theme's accent colour" },
                  { label: "Neutral", description: "A quiet secondary button" },
                ],
              },
            ],
          };
          onEvent({ type: "tool_use", id: toolId, name: "AskUserQuestion", input });
          const decision = await options.askPermission(
            { requestId: toolId, toolName: "AskUserQuestion", input, canAlwaysAllow: false },
            signal,
          );
          const answers = (decision.behavior === "allow" ? decision.updatedInput?.answers : undefined) as
            | Record<string, string>
            | undefined;
          const answer = answers ? Object.values(answers)[0] : undefined;
          onEvent({
            type: "tool_result",
            toolUseId: toolId,
            output: answer ? `User answered: ${answer}` : "No answer",
            isError: !answer,
          });
          await stream(`${msg}:text:0`, answer ? `Great, **${answer}** it is.` : "No problem.", signal);
        } else if (lower.includes("build")) {
          const toolId = `tool-${randomUUID()}`;
          const goal = text.replace(/^(please\s+)?build( me)?\s*/i, "") || text;
          onEvent({ type: "tool_use", id: toolId, name: "mcp__jig__jig_request_build", input: { goal } });
          const output = options.toolHandlers?.jig_request_build
            ? await options.toolHandlers.jig_request_build({ goal })
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
        if (lower.includes("fail")) {
          onEvent({
            type: "result",
            ok: false,
            durationMs: Date.now() - started,
            error: "Something went wrong (scripted).",
          });
          return;
        }
        onEvent({
          type: "result",
          ok: true,
          durationMs: Date.now() - started,
          totalCostUsd: undefined,
          usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 },
          numTurns: 1,
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
        await runTurn(queue.shift()!);
      }
    };

    return {
      send(text, attachments = []) {
        // The fake says what it got: "[1 image] [pdf: spec.pdf] [doc: plan.docx] …".
        const images = attachments.filter((a) => a.type === "image").length;
        const tags = [
          ...(images ? [`[${images} image${images === 1 ? "" : "s"}]`] : []),
          ...attachments.flatMap((a) =>
            a.type === "pdf" ? [`[pdf: ${a.name}]`] : a.type === "text" ? [`[doc: ${a.name}]`] : [],
          ),
        ];
        queue.push(tags.length ? `${tags.join(" ")} ${text}` : text);
        void pump();
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
      close() {
        closed = true;
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
        seven_day_opus: { utilization: 31, resets_at: at(4 * 24 * 3_600_000 + 3 * 3_600_000) },
      },
    };
  }

  async oneShot(prompt: string, _options: OneShotOptions): Promise<string> {
    const scripted = process.env.JIG_FAKE_ONESHOT;
    if (scripted) return scripted;
    const first = /key: (\S+) \| (\w+) \| "([^"]*)" \| (\d+) times on (\d+) day/.exec(prompt);
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
