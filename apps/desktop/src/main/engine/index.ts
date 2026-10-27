import { ClaudeEngine } from "./claude";
import { FakeEngine } from "./fake";
import type { Engine } from "./types";

let engine: Engine | undefined;

/** The engine for this run: `JIG_ENGINE=fake` selects the scripted engine. */
export function getEngine(): Engine {
  engine ??= process.env.JIG_ENGINE === "fake" ? new FakeEngine() : new ClaudeEngine();
  return engine;
}

export type { Engine, EngineSession, StartOptions } from "./types";
export { sessionEnv } from "./types";
