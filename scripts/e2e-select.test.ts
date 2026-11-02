import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { matchesGlob } from "node:path";
import { describe, expect, it } from "vitest";
import { type AffectedRules, selectSpecs, testIds } from "./e2e-select";

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
