import { cpus } from "node:os";
import { defineConfig } from "@playwright/test";

// Tests set the author with `git config user.name/email`; GIT_AUTHOR_* / GIT_COMMITTER_* from the
// environment (CI, dev containers) would override it, in the tests and in the app they start.
for (const key of ["GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"])
  delete process.env[key];

// Every test launches its own Jig with its own temporary JIG_HOME, so tests run side by side: one
// Electron per worker, a third of the cores (2–16). JIG_E2E_WORKERS overrides it.
const workers =
  Number(process.env.JIG_E2E_WORKERS) || Math.max(2, Math.min(16, Math.floor(cpus().length / 3)));

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  workers,
  fullyParallel: true,
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
});
