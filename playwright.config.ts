import { defineConfig } from "@playwright/test";

// Tests set the author with `git config user.name/email`; GIT_AUTHOR_* / GIT_COMMITTER_* from the
// environment (CI, dev containers) would override it, in the tests and in the app they start.
for (const key of ["GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"])
  delete process.env[key];

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  workers: 1,
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
});
