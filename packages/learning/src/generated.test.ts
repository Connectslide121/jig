import { describe, expect, it } from "vitest";
import { isGenerated, parseLogPatch, summarizeWork } from "./attribution";

describe("generated files", () => {
  it("knows lock files, minified code, maps and snapshots, on any path separator", () => {
    for (const path of [
      "package-lock.json",
      "apps/web/yarn.lock",
      "pnpm-lock.yaml",
      "bun.lock",
      "Cargo.lock",
      "go.sum",
      "dist/app.min.js",
      "styles.min.css",
      "app.js.map",
      "tests/__snapshots__/cart.snap",
      "apps\\web\\package-lock.json",
    ])
      expect(isGenerated(path), path).toBe(true);
    for (const path of ["src/cart.ts", "docs/lock.md", "src/locks.ts", "package.json", "src/snap.ts"])
      expect(isGenerated(path), path).toBe(false);
  });

  it("leaves their lines out of the summary", () => {
    const log = [
      "\x1eaaa\x1f2026-10-29T10:00:00+00:00\x1fAdd the cart",
      "diff --git a/package-lock.json b/package-lock.json",
      "--- /dev/null",
      "+++ b/package-lock.json",
      "@@ -0,0 +1,2 @@",
      '+  "lockfileVersion": 3,',
      '+  "requires": true,',
      "diff --git a/cart.ts b/cart.ts",
      "--- /dev/null",
      "+++ b/cart.ts",
      "@@ -0,0 +1,1 @@",
      "+export const total = 1;",
    ].join("\n");
    const summary = summarizeWork(parseLogPatch(log), () => undefined, "2026-10-19");
    expect(summary).toMatchObject({ commits: 1, ai: 0, hand: 1 });
  });
});
