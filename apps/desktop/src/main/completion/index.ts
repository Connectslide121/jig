import { homedir } from "node:os";
import {
  type CompletionRequest,
  type CompletionState,
  type CompletionSuggestion,
  claudePrompt,
  cleanClaudeCompletion,
} from "../../shared/completion";
import { getConfig, onConfigChange } from "../config";
import { getEngine } from "../engine";
import { type Completer, sessionEnv } from "../engine/types";
import { emit, handle } from "../ipc/router";
import { logger } from "../log";
import { Copilot } from "./copilot";

const log = logger("completion");

const CLAUDE_INSTRUCTIONS =
  "You are an inline code completion engine inside Jig's file editor. Each message is the code around the user's caret, marked <CURSOR>. Reply with only the exact text to insert there: no explanation, no Markdown, never text that is already before or after the caret. Keep it short. If nothing fits, reply with nothing.";

let copilot: Copilot;
let completer: { model: string; value: Completer } | undefined;
let running: AbortController | undefined;

function state(): CompletionState {
  const editor = getConfig().editor;
  return {
    provider: editor.claudeCompletion ? "claude" : copilot.state.signedIn ? "copilot" : "off",
    copilot: copilot.state,
    claudeModel: editor.claudeCompletionModel,
  };
}
const changed = () => emit("completion.changed", state());

/** The warm Claude Code process for the chosen model (a new one when the model changes). */
function claude(): Completer {
  const { editor, engine } = getConfig();
  if (completer?.model !== editor.claudeCompletionModel) {
    completer?.value.close();
    completer = {
      model: editor.claudeCompletionModel,
      value: getEngine().completer({
        cwd: homedir(),
        model: editor.claudeCompletionModel,
        appendSystemPrompt: CLAUDE_INSTRUCTIONS,
        env: sessionEnv(process.env, engine.allowApiKey),
        claudePath: engine.claudePath,
      }),
    };
  }
  return completer.value;
}

async function complete(request: CompletionRequest): Promise<CompletionSuggestion | null> {
  // Only the newest request matters: an older one still waiting is dropped.
  running?.abort();
  const abort = new AbortController();
  running = abort;
  if (getConfig().editor.claudeCompletion) {
    const started = Date.now();
    try {
      const answer = await claude().ask(claudePrompt(request), abort.signal);
      if (abort.signal.aborted) return null;
      log.debug("Claude completion", { ms: Date.now() - started });
      const text = cleanClaudeCompletion(answer, request.text, request.offset);
      return text ? { text, from: request.offset, to: request.offset, provider: "claude" } : null;
    } catch (error) {
      if (!abort.signal.aborted) log.debug("Claude completion failed", error);
      return null;
    }
  }
  const suggestion = await copilot.complete(request).catch(() => undefined);
  return abort.signal.aborted ? null : (suggestion ?? null);
}

/**
 * Inline code completion for the editor (D-247, D-255): GitHub Copilot's language server when you
 * signed in to it, or Claude Code when "Code completion with Claude" is on. Completions only.
 */
export async function startCompletion(): Promise<void> {
  copilot = new Copilot(changed);
  await copilot.load();
  // A set-up Copilot starts with Jig (unless Claude completes), so the first suggestion is quick.
  if (!getConfig().editor.claudeCompletion && process.env.JIG_ENGINE !== "fake")
    setTimeout(() => void copilot.warm(), 4000).unref();
  onConfigChange((config) => {
    if (!config.editor.claudeCompletion && completer) {
      completer.value.close();
      completer = undefined;
    }
    changed();
  });
  handle("completion.state", () => state());
  handle("completion.request", (request) => complete(request));
  handle("completion.accepted", ({ id }) => copilot.accepted(id));
  handle("completion.closeFile", ({ path }) => copilot.close(path));
  handle("completion.copilotSetup", async () => {
    if (!copilot.state.installed) await copilot.install();
    await copilot.warm();
  });
  handle("completion.copilotSignIn", async () => {
    if (!copilot.state.installed) await copilot.install();
    return copilot.signIn();
  });
  handle("completion.copilotSignOut", () => copilot.signOut());
}

export function stopCompletion(): void {
  completer?.value.close();
  copilot?.stop();
}
