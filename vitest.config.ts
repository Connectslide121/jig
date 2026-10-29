import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/*/src/**/*.test.ts",
      "apps/desktop/src/**/*.test.ts",
      "apps/desktop/src/**/*.test.tsx",
      "addons/**/*.test.ts",
      "apps/launcher/**/*.test.ts",
      "scripts/**/*.test.ts",
    ],
    environment: "node",
    // Tests that run git spawn it many times, which is several times slower on Windows.
    testTimeout: 30_000,
    // Git for Windows defaults to core.autocrlf=true; tests expect files exactly as written.
    env: {
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "core.autocrlf",
      GIT_CONFIG_VALUE_0: "false",
      // Never the user's ~/.jig (the log, state) from a test that doesn't set its own home.
      JIG_HOME: join(tmpdir(), "jig-vitest-home"),
    },
  },
});
