import { describe, expect, it } from "vitest";
import {
  bumped,
  checkBump,
  compareVersions,
  e2eStillPasses,
  failedSpecFiles,
  parseLatestYml,
  parsePlan,
  preparedParagraph,
  publishedParagraph,
  rerunSpecs,
  withStatus,
} from "./release-lib.ts";

const plan = {
  version: "0.2.0",
  bump: "minor",
  reason: "A new feature: a natural voice.",
  summary: "A natural voice reads Claude's replies.",
  notes: "## New\n- A natural voice",
};

describe("parsePlan", () => {
  it("accepts a complete plan and trims it", () => {
    expect(parsePlan(JSON.stringify({ ...plan, version: " 0.2.0 " }))).toEqual(plan);
  });

  it("says what is missing or wrong", () => {
    expect(() => parsePlan("{")).toThrow("valid JSON");
    expect(() => parsePlan(JSON.stringify({ ...plan, notes: "" }))).toThrow('"notes"');
    expect(() => parsePlan(JSON.stringify({ ...plan, version: "0.2" }))).toThrow("stable version");
    expect(() => parsePlan(JSON.stringify({ ...plan, version: "1.0.0-rc.1" }))).toThrow("stable version");
    expect(() => parsePlan(JSON.stringify({ ...plan, bump: "huge" }))).toThrow("major, minor or patch");
  });
});

describe("versions", () => {
  it("orders stable versions numerically", () => {
    expect(compareVersions("0.10.0", "0.9.9")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.1.3", "0.2.0")).toBe(-1);
  });

  it("bumps one part and resets the ones after it", () => {
    expect(bumped("0.1.3", "patch")).toBe("0.1.4");
    expect(bumped("0.1.3", "minor")).toBe("0.2.0");
    expect(bumped("0.1.3", "major")).toBe("1.0.0");
  });

  it("checks the plan's version against its bump", () => {
    expect(() => checkBump(parsePlan(JSON.stringify(plan)), "0.1.3")).not.toThrow();
    expect(() => checkBump(parsePlan(JSON.stringify({ ...plan, version: "0.3.0" })), "0.1.3")).toThrow(
      "is 0.2.0, not 0.3.0",
    );
  });
});

describe("parseLatestYml", () => {
  it("reads the updater's fields", () => {
    const yml = [
      "version: 0.2.0",
      "files:",
      "  - url: Jig-Setup-0.2.0.exe",
      "    sha512: abc==",
      "    size: 1234",
      "path: Jig-Setup-0.2.0.exe",
      "sha512: abc==",
      "releaseDate: '2026-11-02T12:00:00.000Z'",
    ].join("\n");
    expect(parseLatestYml(yml)).toEqual({
      version: "0.2.0",
      path: "Jig-Setup-0.2.0.exe",
      sha512: "abc==",
      size: 1234,
    });
    expect(() => parseLatestYml("version: 1.0.0")).toThrow("lacks");
  });
});

describe("withStatus", () => {
  const p = parsePlan(JSON.stringify(plan));
  const status =
    "# Status\n\nUpdates: something.\n\nJig 0.1.3 published (2026-11-01): old.\nMore.\n\n## What works\n";

  it("puts a new release before the newest published one", () => {
    const next = withStatus(status, "0.2.0", preparedParagraph(p, "2026-11-02"));
    expect(next).toContain(
      "Jig 0.2.0 being prepared (2026-11-02): A natural voice reads Claude's replies. Publication not yet verified.\n\nJig 0.1.3 published",
    );
  });

  it("replaces the prepared paragraph once published", () => {
    const prepared = withStatus(status, "0.2.0", preparedParagraph(p, "2026-11-02"));
    const published = withStatus(
      prepared,
      "0.2.0",
      publishedParagraph(p, {
        date: "2026-11-02",
        url: "https://x/v0.2.0",
        sha: "abc",
        size: 1000,
        sha256: "def",
      }),
    );
    expect(published).not.toContain("being prepared");
    expect(published).toContain("Jig 0.2.0 published (2026-11-02): [GitHub release](https://x/v0.2.0),");
    expect(published).toContain("Installer: 1,000 bytes;");
    expect(published.indexOf("Jig 0.2.0 published")).toBeLessThan(published.indexOf("Jig 0.1.3 published"));
  });

  it("appends when there is no release yet", () => {
    expect(withStatus("# Status\n", "0.2.0", "Jig 0.2.0 x")).toBe("# Status\n\nJig 0.2.0 x\n");
  });
});

describe("skipping an e2e suite that already passed (D-272)", () => {
  it("holds when only the version and the status line changed", () => {
    expect(e2eStillPasses([])).toBe(true);
    expect(
      e2eStillPasses([
        "package.json",
        "apps/desktop/package.json",
        "package-lock.json",
        "docs/status.md",
        "",
      ]),
    ).toBe(true);
  });
  it("doesn't hold once anything else changed", () => {
    expect(e2eStillPasses(["package.json", "addons/tasks/ui.tsx"])).toBe(false);
    expect(e2eStillPasses(["docs/decisions.md"])).toBe(false);
  });
});

describe("rerunning only what failed (D-325)", () => {
  const report = {
    suites: [
      {
        file: "chat.spec.ts",
        specs: [
          { file: "chat.spec.ts", tests: [{ status: "expected" }] },
          { file: "chat.spec.ts", tests: [{ status: "unexpected" }] },
        ],
      },
      { file: "tasks.spec.ts", specs: [{ file: "tasks.spec.ts", tests: [{ status: "flaky" }] }] },
      {
        file: "meetings.spec.ts",
        suites: [{ specs: [{ file: "meetings.spec.ts", tests: [{ status: "unexpected" }] }] }],
      },
    ],
  };
  it("lists spec files with a failed test, not flaky or passing ones", () => {
    expect(failedSpecFiles(report)).toEqual(["chat.spec.ts", "meetings.spec.ts"]);
    expect(failedSpecFiles(undefined)).toEqual([]);
  });
  it("adds the specs the changes since need, or runs everything", () => {
    expect(rerunSpecs(["chat.spec.ts"], ["smoke.spec.ts", "chat.spec.ts"])).toEqual([
      "chat.spec.ts",
      "smoke.spec.ts",
    ]);
    expect(rerunSpecs(["chat.spec.ts"], "all")).toBe("all");
  });
});
