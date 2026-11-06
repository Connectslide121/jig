import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { matchesGlob } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type AffectedRules,
  chooseBase,
  type E2ePass,
  selectSpecs,
  testIds,
  versionOnly,
} from "./e2e-select";

const root = new URL("..", import.meta.url);
const rules = JSON.parse(readFileSync(new URL("e2e/affected.json", root), "utf8")) as AffectedRules;
const specNames = readdirSync(new URL("e2e", root)).filter((f) => f.endsWith(".spec.ts"));

const specs = [
  { name: "smoke.spec.ts", text: "" },
  { name: "files.spec.ts", text: 'getByTestId(`files-entry-${name}`); getByTestId("files-view")' },
  { name: "meetings.spec.ts", text: 'getByTestId("meeting-room")' },
  { name: "navigation.spec.ts", text: "" },
  { name: "workbench.spec.ts", text: "" },
];
const sample: AffectedRules = {
  always: ["smoke.spec.ts"],
  all: ["e2e/fixtures.ts"],
  ignore: ["docs/**", "**/*.test.ts"],
  fallback: ["navigation.spec.ts", "workbench.spec.ts"],
  rules: [{ files: ["addons/meetings/**"], specs: ["meetings.spec.ts"] }],
};

describe("e2e spec selection", () => {
  it("finds rendered test ids, templated ones by their prefix", () => {
    expect(testIds('<div data-testid="files-view" /> <b data-testid={`files-entry-${n}`} />')).toEqual([
      "files-view",
      "files-entry-",
    ]);
    expect(testIds('<i data-testid="loading" /> <i data-testid={`x${n}`} />')).toEqual([]);
  });

  it("runs nothing for docs and unit tests, everything for the fixtures", () => {
    expect(selectSpecs([{ path: "docs/status.md", text: "" }], specs, sample).specs).toEqual([]);
    expect(selectSpecs([{ path: "e2e/fixtures.ts", text: "" }], specs, sample).specs).toBe("all");
  });

  it("picks specs by rule and by the test ids a changed view renders, plus the always set", () => {
    const pick = selectSpecs(
      [
        { path: "addons/meetings/ui.tsx", text: "" },
        { path: "addons/files/ui.tsx", text: "<button data-testid={`files-entry-${e.name}`}>" },
      ],
      specs,
      sample,
    );
    expect(pick.specs).toEqual(["files.spec.ts", "meetings.spec.ts", "smoke.spec.ts"]);
    expect(pick.unmapped).toEqual([]);
  });

  it("runs the fallback for a file nothing maps, and a changed spec itself", () => {
    const pick = selectSpecs(
      [
        { path: "apps/desktop/src/main/odd.ts", text: "" },
        { path: "e2e/files.spec.ts", text: "" },
      ],
      specs,
      sample,
    );
    expect(pick.specs).toEqual(["files.spec.ts", "navigation.spec.ts", "smoke.spec.ts", "workbench.spec.ts"]);
    expect(pick.unmapped).toEqual(["apps/desktop/src/main/odd.ts"]);
  });
});

describe("e2e/affected.json", () => {
  const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);

  it("names only specs that exist", () => {
    const named = [...rules.always, ...rules.fallback, ...rules.rules.flatMap((r) => r.specs)];
    expect(named.filter((s) => !specNames.includes(s))).toEqual([]);
  });

  it("gives every spec a rule, so a change can pick it", () => {
    const covered = new Set([...rules.always, ...rules.fallback, ...rules.rules.flatMap((r) => r.specs)]);
    const orphans = specNames.filter(
      (s) => !covered.has(s) && !rules.ignore.some((g) => matchesGlob(`e2e/${s}`, g)),
    );
    expect(orphans).toEqual([]);
  });

  it("has no globs that match nothing (a renamed folder would silently stop picking its specs)", () => {
    const globs = [...rules.all, ...rules.rules.flatMap((r) => r.files)];
    expect(globs.filter((g) => !tracked.some((f) => matchesGlob(f, g)))).toEqual([]);
  });
});

describe("e2e:changed base", () => {
  const full: E2ePass = { ref: "a".repeat(40), at: "2026-11-05T08:00:00.000Z", by: "e2e" };
  const changed: E2ePass = { ref: "b".repeat(40), at: "2026-11-05T09:00:00.000Z", by: "e2e:changed" };
  const all = () => true;

  it("uses --since when given, whatever passed", () => {
    expect(chooseBase("origin/main", [full, changed], all)).toEqual({ kind: "since", ref: "origin/main" });
  });

  it("uses the newest recorded pass of either command", () => {
    expect(chooseBase(undefined, [full, changed], all)).toEqual({ kind: "passed", ...changed });
    const later = { ...full, at: "2026-11-05T10:00:00.000Z" };
    expect(chooseBase(undefined, [later, changed], all)).toEqual({ kind: "passed", ...later });
  });

  it("skips passes git no longer has, and broken records", () => {
    expect(chooseBase(undefined, [full, changed], (ref) => ref === full.ref)).toEqual({
      kind: "passed",
      ...full,
    });
    expect(chooseBase(undefined, [{ ...changed, at: "never" }, undefined], all)).toEqual({
      kind: "head",
      ref: "HEAD",
    });
  });

  it("falls back to HEAD (uncommitted changes only) when nothing passed", () => {
    expect(chooseBase(undefined, [undefined, undefined], all)).toEqual({ kind: "head", ref: "HEAD" });
    expect(chooseBase("", [], all)).toEqual({ kind: "head", ref: "HEAD" });
  });
});

describe("a release's version bump (D-420)", () => {
  it("runs nothing when only version lines changed", () => {
    const bump = [
      "diff --git a/package-lock.json b/package-lock.json",
      "--- a/package-lock.json",
      "+++ b/package-lock.json",
      "@@ -3 +3 @@",
      '-  "version": "0.17.0",',
      '+  "version": "0.17.1",',
      "@@ -9 +9 @@",
      '-      "version": "0.17.0",',
      '+      "version": "0.17.1",',
    ].join("\n");
    expect(versionOnly(bump)).toBe(true);
  });

  it("still counts a dependency change and an empty diff", () => {
    const upgrade = [
      "@@ -40,3 +40,3 @@",
      '-      "version": "1.2.0",',
      '-      "resolved": "https://registry.npmjs.org/x/-/x-1.2.0.tgz",',
      '+      "version": "1.3.0",',
      '+      "resolved": "https://registry.npmjs.org/x/-/x-1.3.0.tgz",',
    ].join("\n");
    expect(versionOnly(upgrade)).toBe(false);
    expect(versionOnly('@@ -20 +20 @@\n-    "vite": "^7.0.0",\n+    "vite": "^7.1.0",')).toBe(false);
    expect(versionOnly("")).toBe(false);
  });
});
