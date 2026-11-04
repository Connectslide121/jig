import type { ChatProvider } from "../../shared/engine";
import { ClaudeEngine } from "./claude";
import { CodexEngine } from "./codex";
import { FakeEngine } from "./fake";
import type { Engine } from "./types";

const engines = new Map<ChatProvider, Engine>();

function makeEngine(provider: ChatProvider): Engine {
  // The scripted engine stands in for both providers, so tests cover Codex chats too.
  if (process.env.JIG_ENGINE === "fake") return new FakeEngine(undefined, provider);
  return provider === "codex" ? new CodexEngine() : new ClaudeEngine();
}

/**
 * The engine for a provider's chats, one per provider for this run (D-309). Without a provider:
 * Claude's, which also answers Jig's non-chat calls (one-shots, tool calls, usage). `JIG_ENGINE=fake`
 * selects the scripted engine for both.
 */
export function getEngine(provider: ChatProvider = "claude"): Engine {
  let engine = engines.get(provider);
  if (!engine) {
    engine = makeEngine(provider);
    engines.set(provider, engine);
  }
  return engine;
}

export type { Engine, EngineSession, StartOptions } from "./types";
export { codexSessionEnv, sessionEnv } from "./types";
