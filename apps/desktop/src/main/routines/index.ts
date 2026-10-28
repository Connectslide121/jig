import {
  parseRoutines,
  parseRunLog,
  parseRuns,
  type Routine,
  type RoutineLogEntry,
  type RoutineRun,
  remoteTriggerBody,
} from "../../shared/routines";
import { callClaudeTool } from "../engine/claudeTools";
import { emit, handle } from "../ipc/router";

/** Routines are cached this long: every refresh costs a small model call. */
const CACHE_MS = 5 * 60_000;

let cache: { at: string; routines: Routine[] } | undefined;

async function remoteTrigger(input: Record<string, unknown>): Promise<unknown> {
  const result = await callClaudeTool({ tool: "RemoteTrigger", input });
  return remoteTriggerBody(result.structured, result.text);
}

export async function listRoutines(refresh = false): Promise<{ at: string; routines: Routine[] }> {
  if (cache && !refresh && Date.now() - new Date(cache.at).getTime() < CACHE_MS) return cache;
  cache = { at: new Date().toISOString(), routines: parseRoutines(await remoteTrigger({ action: "list" })) };
  return cache;
}

/** Something changed the routines (here, or Claude from a chat): the Routines tab reloads. */
export function routinesChanged(): void {
  cache = undefined;
  emit("routines.changed", undefined);
}

/**
 * Claude Code routines through Claude Code's own RemoteTrigger tool (D-092): list, run now, switch on
 * or off, runs and their logs. Creating and editing happen in a chat, where Claude writes the details.
 */
export function registerRoutineHandlers(): void {
  handle("routines.list", ({ refresh }) => listRoutines(Boolean(refresh)));
  handle("routines.run", async ({ id }) => {
    await remoteTrigger({ action: "run", trigger_id: id });
    routinesChanged();
  });
  handle("routines.setEnabled", async ({ id, enabled }) => {
    await remoteTrigger({ action: "update", trigger_id: id, body: { enabled } });
    routinesChanged();
  });
  handle(
    "routines.runs",
    async ({ id }): Promise<RoutineRun[]> =>
      parseRuns(await remoteTrigger({ action: "list_runs", trigger_id: id })),
  );
  handle(
    "routines.runLog",
    async ({ sessionId }): Promise<RoutineLogEntry[]> =>
      parseRunLog(await remoteTrigger({ action: "get_run_log", session_id: sessionId })),
  );
}
