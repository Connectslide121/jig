import { describe, expect, it } from "vitest";
import { GOT_LINE, parseResults, runStatus, WAITING_LINE, waitingForOtherRun } from "./results";
import { dotnetSuite, npmSuites, sortSuites, suiteKind } from "./suites";

describe("finding test suites", () => {
  it("takes npm scripts that run tests, not watchers or npm's placeholder", () => {
    const pkg = JSON.stringify({
      scripts: {
        dev: "vite",
        test: "vitest run",
        "test:watch": "vitest",
        e2e: "node scripts/build-if-stale.ts && playwright test",
        "e2e:changed": "node scripts/e2e-changed.ts",
        check: "npm run typecheck && npm run test",
        lint: "biome check .",
      },
    });
    const suites = npmSuites(pkg);
    expect(suites.map((s) => [s.id, s.kind])).toEqual([
      ["npm:test", "unit"],
      ["npm:e2e", "e2e"],
      ["npm:e2e:changed", "changed"],
      ["npm:check", "check"],
    ]);
    expect(suites[0]).toMatchObject({ command: "npm", args: ["run", "test"], cwd: "" });
    expect(
      npmSuites(JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } })),
    ).toEqual([]);
    expect(npmSuites("not json")).toEqual([]);
  });

  it("names scripts in a sub-folder by the folder, and runs them there", () => {
    const [suite] = npmSuites(JSON.stringify({ scripts: { test: "ng test --watch=false" } }), "client");
    expect(suite).toMatchObject({ id: "npm:client/test", label: "client · test", cwd: "client" });
  });

  it("recognises .NET test projects by name or test SDK", () => {
    expect(dotnetSuite("tests/Shop.Tests/Shop.Tests.csproj", "<Project/>")).toMatchObject({
      id: "dotnet:tests/Shop.Tests/Shop.Tests.csproj",
      label: "Shop.Tests",
      kind: "unit",
      args: ["test", "tests/Shop.Tests/Shop.Tests.csproj"],
    });
    expect(
      dotnetSuite("Shop.Checks.csproj", '<PackageReference Include="Microsoft.NET.Test.Sdk" />')?.label,
    ).toBe("Shop.Checks");
    expect(dotnetSuite("src/Shop.Api/Shop.Api.csproj", "<Project/>")).toBeUndefined();
    expect(suiteKind("integration", "jest")).toBe("e2e");
  });

  it("lists what a change needs first, then unit, check and end-to-end", () => {
    const suites = npmSuites(
      JSON.stringify({
        scripts: { e2e: "playwright test", test: "vitest run", "e2e:changed": "x", check: "y" },
      }),
    );
    expect(sortSuites(suites).map((s) => s.label)).toEqual(["e2e:changed", "test", "check", "e2e"]);
  });
});

describe("waiting for another e2e run (D-420)", () => {
  it("waits from the waiting line until the starting line", () => {
    expect(waitingForOtherRun("Base: HEAD\n")).toBe(false);
    expect(waitingForOtherRun(`${WAITING_LINE} (e2e:changed in E:\\shop, pid 4)…\n`)).toBe(true);
    expect(waitingForOtherRun(`${WAITING_LINE} (…)…\n${GOT_LINE}\nRunning 12 tests`)).toBe(false);
    expect(waitingForOtherRun(`${WAITING_LINE}…\n${GOT_LINE}\n${WAITING_LINE}…`)).toBe(true);
  });
});

describe("reading a run's results", () => {
  it("reads Playwright's list output: counts and failing tests", () => {
    const out = [
      "Running 154 tests using 13 workers",
      "  ok   2 e2e\\addon-scope.spec.ts:29:1 › an add-on's data per project (10.2s)",
      "  x   31 e2e\\chat-changes.spec.ts:8:1 › whole-chat changes stay above the input (7.0s)",
      "  -  150 e2e\\packaged.spec.ts:19:1 › the packaged app starts",
      "",
      "  1 failed",
      "    e2e\\chat-changes.spec.ts:8:1 › whole-chat changes stay above the input ",
      "  3 skipped",
      "  139 passed (4.1m)",
    ].join("\n");
    const r = parseResults(out);
    expect(r).toMatchObject({ passed: 139, failed: 1, skipped: 3, parsed: true });
    expect(r.failures).toEqual(["e2e/chat-changes.spec.ts › whole-chat changes stay above the input"]);
    expect(runStatus(1, r)).toBe("failed");
  });

  it("reads Vitest's summary and failures, through colour codes", () => {
    const out =
      " \u001b[31m×\u001b[39m src/cart.test.ts > total > applies the discount 12ms\n" +
      "      Tests  \u001b[1m\u001b[31m1 failed\u001b[39m\u001b[22m\u001b[2m | \u001b[22m\u001b[1m\u001b[32m722 passed\u001b[39m\u001b[22m\u001b[90m | 8 skipped (731)\u001b[39m\n";
    const r = parseResults(out);
    expect(r).toMatchObject({ passed: 722, failed: 1, skipped: 8, parsed: true });
    expect(r.failures).toEqual(["src/cart.test.ts › total > applies the discount"]);
  });

  it("reads Jest, dotnet test and Karma summaries", () => {
    expect(parseResults("Tests:       2 failed, 40 passed, 42 total")).toMatchObject({
      passed: 40,
      failed: 2,
    });
    const dotnet = parseResults(
      "  Failed Shop.Tests.CartTests.Total_applies_discount [12 ms]\nFailed!  - Failed:     1, Passed:    11, Skipped:     0, Total:    12, Duration: 1 s",
    );
    expect(dotnet).toMatchObject({
      passed: 11,
      failed: 1,
      failures: ["Shop.Tests.CartTests.Total_applies_discount"],
    });
    expect(
      parseResults("Chrome Headless: Executed 41 of 42 (1 FAILED) (skipped 1) (0.3 secs / 0.2 secs)"),
    ).toMatchObject({ passed: 40, failed: 1, skipped: 1 });
  });

  it("falls back to the exit code when no runner summary is printed", () => {
    const r = parseResults("All checks passed.");
    expect(r.parsed).toBe(false);
    expect(runStatus(0, r)).toBe("passed");
    expect(runStatus(2, r)).toBe("failed");
  });
});
