import { cpus } from "node:os";
import { defineConfig } from "@playwright/test";
import { heldByOther } from "./scripts/e2e-lock.ts";

// Tests set the author with `git config user.name/email`; GIT_AUTHOR_* / GIT_COMMITTER_* from the
// environment (CI, dev containers) would override it, in the tests and in the app they start.
for (const key of ["GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"])
  delete process.env[key];

/** The share of the CPU busy over a short sample, 0–1 (os.loadavg is always 0 on Windows). */
function busyShare(ms = 300): number {
  const total = () => cpus().reduce((sum, c) => sum + Object.values(c.times).reduce((a, b) => a + b, 0), 0);
  const idle = () => cpus().reduce((sum, c) => sum + c.times.idle, 0);
  const [t0, i0] = [total(), idle()];
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  const dt = total() - t0;
  return dt > 0 ? Math.min(1, Math.max(0, 1 - (idle() - i0) / dt)) : 0;
}

/**
 * Every test launches its own Jig with its own temporary JIG_HOME, so tests run side by side, one
 * Electron per worker. Each takes about 3 cores, so a fifth of the cores that are free (2–8) (D-420):
 * measured on 40 cores, 8 workers ran a 19-spec run in 161 s, 13 in 180 s with more flaky tests, 5 in
 * 186 s. Counted once and passed to the workers (which load this file too). JIG_E2E_WORKERS overrides it.
 */
function chooseWorkers(): number {
  // Waiting for another run: the CPU it uses now is free by the time this one starts.
  const free = cpus().length * (heldByOther() ? 1 : 1 - busyShare());
  return Math.max(2, Math.min(8, Math.floor(free / 5)));
}
process.env.JIG_E2E_WORKERS ||= String(chooseWorkers());
const workers = Number(process.env.JIG_E2E_WORKERS);

export default defineConfig({
  testDir: "e2e",
  // One e2e run at a time on this computer: a run started while another goes waits for it (D-420).
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  workers,
  fullyParallel: true,
  // Under the whole suite in parallel, an occasional test misses a timeout or Windows holds a file for
  // a moment: one retry, so a release isn't stopped by a flake. A real failure fails twice and still
  // stops it; a flaky test shows as "flaky" in the report to be fixed (D-258).
  retries: 1,
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
});
