/**
 * What Claude's `run` and `wait` tools answer (D-359). The add-on host gives a call 120 s, and a full
 * e2e suite takes minutes, so a tool waits at most `MAX_WAIT_S` for a run and, when it is still going,
 * says so with the run's id: Claude calls `wait` again until it is done. Pure.
 */
import { plainText } from "./results";

/** The longest a tool call waits for a run (seconds), well under the host's 120 s call limit. */
export const MAX_WAIT_S = 100;
/** How long a tool call waits when Claude doesn't say. */
export const DEFAULT_WAIT_S = 90;

/** The seconds to wait: Claude's number, kept between 0 and `MAX_WAIT_S`. */
export function waitSeconds(wait: unknown): number {
  const n = typeof wait === "number" && Number.isFinite(wait) ? wait : DEFAULT_WAIT_S;
  return Math.min(MAX_WAIT_S, Math.max(0, Math.round(n)));
}

/** The promise's value, or undefined when it takes longer than `ms`. */
export async function within<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  try {
    return await Promise.race([promise, late]);
  } finally {
    clearTimeout(timer);
  }
}

/** "45 s", "3 min 05 s". */
export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
}

/** The output's last lines as plain text. */
export function tail(output: string, lines: number): string {
  return plainText(output).trimEnd().split("\n").slice(-lines).join("\n");
}

export interface ReportRun {
  id: string;
  label: string;
  status: "running" | "passed" | "failed" | "stopped";
  startedAt: string;
  endedAt?: string;
  exitCode?: number;
  passed: number;
  failed: number;
  skipped: number;
  failures: string[];
  parsed: boolean;
}

/** A finished run: status, counts, failing tests and the output's last 60 lines. */
export function doneReport(run: ReportRun, output: string): string {
  const took = run.endedAt ? `, ${duration(Date.parse(run.endedAt) - Date.parse(run.startedAt))}` : "";
  return [
    `${run.label}: ${run.status} (exit ${run.exitCode ?? "none"}${took}, run ${run.id})`,
    run.parsed ? `${run.passed} passed, ${run.failed} failed, ${run.skipped} skipped` : "",
    run.failures.length ? `Failing:\n${run.failures.map((f) => `- ${f}`).join("\n")}` : "",
    output ? `Output (last lines):\n${tail(output, 60)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** A run still going: its id, how long so far, what to call next, and the output's last 15 lines. */
export function runningReport(run: ReportRun, output: string, now = Date.now()): string {
  const last = tail(output, 15);
  return [
    `${run.label}: still running (run ${run.id}, ${duration(now - Date.parse(run.startedAt))} so far).`,
    `Call addon_tests_wait with id "${run.id}" to keep waiting; call it again each time it says still running. The user sees it in the Tests view.`,
    last ? `Output so far (last lines):\n${last}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
