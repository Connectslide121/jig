import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/*/src/**/*.test.ts",
      "apps/desktop/src/**/*.test.ts",
      "apps/desktop/src/**/*.test.tsx",
      "addons/**/*.test.ts",
      "scripts/**/*.test.ts",
    ],
    environment: "node",
  },
});
