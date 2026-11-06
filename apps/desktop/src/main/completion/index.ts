import { homedir } from "node:os";
import {
  activeCompletionProvider,
  type CompletionRequest,
  type CompletionState,
  type CompletionSuggestion,
  cleanCompletion,
  completionPrompt,
} from "../../shared/completion";
import { getConfig, onConfigChange } from "../config";
import { getEngine } from "../engine";
import { type Completer, sessionEnv } from "../engine/types";
import { emit, handle } from "../ipc/router";
import { logger } from "../log";
import { resolveCodexModel } from "../providers";
import { Copilot } from "./copilot";

const log = logger("completion");

const COMPLETION_INSTRUCTIONS =
  "You are an inline code completion engine inside Jig's file editor. Each message is the code around the user's caret, marked <CURSOR>. Reply with only the exact text to insert there: no explanation, no Markdown, never text that is already before or after the caret. Keep it short. If nothing fits, reply with nothing.";

let copilot: Copilot;
/** The warm completer of the chosen model (a new one when the model or provider changes). */
let completer: { key: string; value: Completer } | undefined;
let running: AbortController | undefined;

function state(): CompletionState {
  const editor = getConfig().editor;
  return {
    provider: activeCompletionProvider(editor.completionProvider, copilot.state.signedIn),
    copilot: copilot.state,
    claudeModel: editor.claudeCompletionModel,
    chatgptModel: editor.chatgptCompletionModel,
  };
}
const changed = () => emit("completion.changed", state());

/** The warm completer for `key` (provider and model), replacing the one for another key. */
function warm(key: string, make: () => Completer): Completer {
  if (completer?.key !== key) {
    completer?.value.close();
    completer = { key, value: make() };
  }
  return completer.value;
}

/** The warm Claude Code process for the chosen model. */
function claude(): Completer {
  const { editor, engine } = getConfig();
  return warm(`claude:${editor.claudeCompletionModel}`, () =>
    getEngine().completer({
      cwd: homedir(),
      model: editor.claudeCompletionModel,
      appendSystemPrompt: COMPLETION_INSTRUCTIONS,
      env: sessionEnv(process.env, engine.allowApiKey),
      claudePath: engine.claudePath,
    }),
  );
}

/** The warm Codex process for the chosen model (a family becomes its newest version now). */
async function chatgpt(): Promise<Completer> {
  const { editor, engine } = getConfig();
  const { model } = await resolveCodexModel(editor.chatgptCompletionModel);
  return warm(`chatgpt:${model}`, () =>
    getEngine("codex").completer({
      cwd: homedir(),
      model,
      appendSystemPrompt: COMPLETION_INSTRUCTIONS,
      env: process.env,
      claudePath: "",
      codexPath: engine.codexPath,
      effort: "low",
    }),
  );
}

async function complete(request: CompletionRequest): Promise<CompletionSuggestion | null> {
  // Only the newest request matters: an older one still waiting is dropped.
  running?.abort();
  const abort = new AbortController();
  running = abort;
  const provider = getConfig().editor.completionProvider;
  if (provider !== "copilot") {
    const started = Date.now();
    try {
      const answer = await (provider === "chatgpt" ? await chatgpt() : claude()).ask(
        completionPrompt(request),
        abort.signal,
      );
      if (abort.signal.aborted) return null;
      log.debug(`${provider} completion`, { ms: Date.now() - started });
      const text = cleanCompletion(answer, request.text, request.offset);
      return text ? { text, from: request.offset, to: request.offset, provider } : null;
    } catch (error) {
      if (!abort.signal.aborted) log.debug(`${provider} completion failed`, error);
      return null;
    }
  }
  const suggestion = await copilot.complete(request).catch(() => undefined);
  return abort.signal.aborted ? null : (suggestion ?? null);
}

/**
 * Inline code completion for the editor (D-247, D-255, D-401): the provider chosen in Settings →
 * Editor: GitHub Copilot's language server (when signed in), Claude Code or ChatGPT (Codex).
 */
export async function startCompletion(): Promise<void> {
  copilot = new Copilot(changed);
  await copilot.load();
  // A set-up Copilot starts with Jig (unless another provider completes), so the first suggestion is quick.
  if (getConfig().editor.completionProvider === "copilot" && process.env.JIG_ENGINE !== "fake")
    setTimeout(() => void copilot.warm(), 4000).unref();
  onConfigChange((config) => {
    if (config.editor.completionProvider === "copilot" && completer) {
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
