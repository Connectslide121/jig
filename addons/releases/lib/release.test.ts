import { describe, expect, it } from "vitest";
import { classify, draftChangelog, insertChangelog, suggestedBump } from "./commits";
import { deployAction, shouldRemind, unreleasedLabel, whatsLive } from "./deploys";
import { detect, policyFromDetection } from "./detect";
import { readVersion, versionFileKind, writeVersion } from "./files";
import { nextVersion } from "./next";
import { notesMarkdown, parseDraft, releasePrompt, setupPrompt } from "./notes";
import { parsePolicy, production } from "./policy";
import { bumpSemVer, compareVersions, latestTagged, nextCalVer, tagFor, versionFromTag } from "./version";

const commit = (subject: string, body = "") => classify({ hash: "h", subject, body, date: "", author: "" });

describe("version", () => {
  it("bumps SemVer, with release candidates", () => {
    expect(bumpSemVer("1.2.3", "minor")).toBe("1.3.0");
    expect(bumpSemVer("1.2.3", "major")).toBe("2.0.0");
    expect(bumpSemVer(undefined, "patch")).toBe("0.0.1");
    expect(bumpSemVer("1.2.3", "minor", "rc")).toBe("1.3.0-rc.1");
    expect(bumpSemVer("1.3.0-rc.1", "minor", "rc")).toBe("1.3.0-rc.2");
    expect(bumpSemVer("1.3.0-rc.2", "minor")).toBe("1.3.0");
  });
  it("compares, reads tags and finds the latest", () => {
    expect(compareVersions("1.3.0-rc.1", "1.3.0")).toBeLessThan(0);
    expect(compareVersions("1.10.0", "1.9.9")).toBeGreaterThan(0);
    expect(versionFromTag("v1.2.3")).toBe("1.2.3");
    expect(versionFromTag("release-1.2", "release-{version}")).toBe("1.2");
    expect(versionFromTag("latest")).toBeUndefined();
    expect(latestTagged(["v1.9.0", "v1.10.0", "v1.10.0-rc.1", "junk"])).toEqual({
      tag: "v1.10.0",
      version: "1.10.0",
    });
    expect(tagFor("2.0.0")).toBe("v2.0.0");
  });
  it("counts CalVer releases in the month", () => {
    const now = new Date(2026, 9, 29);
    expect(nextCalVer(undefined, now)).toBe("2026.10.1");
    expect(nextCalVer("2026.10.3", now)).toBe("2026.10.4");
    expect(nextCalVer("2026.9.7", now)).toBe("2026.10.1");
  });
});

describe("commits and changelog", () => {
  it("classifies conventional commits, work items and the bump", () => {
    const c = commit("feat(cart): discount codes AB#123");
    expect(c).toMatchObject({
      kind: "feat",
      scope: "cart",
      text: "discount codes AB#123",
      workItems: ["123"],
    });
    expect(suggestedBump([commit("fix: x"), commit("feat: y")])).toBe("minor");
    expect(suggestedBump([commit("fix: x"), commit("refactor!: drop v1 api")])).toBe("major");
    expect(suggestedBump([commit("fix: x"), commit("Update readme")])).toBe("patch");
  });
  it("drafts a Keep a Changelog section and inserts it", () => {
    const section = draftChangelog("1.3.0", "2026-10-29", [
      commit("feat: discount codes AB#12"),
      commit("fix: rounding in totals"),
      commit("Update README"),
      commit("chore: bump deps"),
      commit("Merge branch 'x'"),
    ]);
    expect(section).toBe(
      [
        "## [1.3.0] - 2026-10-29",
        "",
        "### Added",
        "- discount codes AB#12 (AB#12)",
        "",
        "### Changed",
        "- Update README",
        "",
        "### Fixed",
        "- rounding in totals",
      ].join("\n"),
    );
    expect(insertChangelog(undefined, "## [1.0.0]")).toContain("# Changelog");
    const existing = "# Changelog\n\n## [Unreleased]\n\n## [1.2.0] - 2026-09-01\n- old\n";
    expect(insertChangelog(existing, "## [1.3.0] - x\n- new")).toBe(
      "# Changelog\n\n## [Unreleased]\n\n## [1.3.0] - x\n- new\n\n## [1.2.0] - 2026-09-01\n- old\n",
    );
  });
});

describe("version files", () => {
  it("reads and writes msbuild, package.json and plain files", () => {
    expect(versionFileKind("src/Shop.Api/Shop.Api.csproj")).toBe("msbuild");
    expect(versionFileKind("Directory.Build.props")).toBe("msbuild");
    expect(versionFileKind("package.json")).toBe("package.json");
    expect(versionFileKind("README.md")).toBeUndefined();
    const props =
      "<Project>\n  <PropertyGroup>\n    <VersionPrefix>1.2.0</VersionPrefix>\n  </PropertyGroup>\n</Project>";
    expect(readVersion("msbuild", props)).toBe("1.2.0");
    expect(writeVersion("msbuild", props, "1.3.0")).toContain("<VersionPrefix>1.3.0</VersionPrefix>");
    expect(writeVersion("msbuild", "<Project><PropertyGroup></PropertyGroup></Project>", "1.0.0")).toContain(
      "<Version>1.0.0</Version>",
    );
    const pkg = '{\n  "name": "shop",\n  "version": "0.1.0"\n}\n';
    expect(readVersion("package.json", pkg)).toBe("0.1.0");
    expect(writeVersion("package.json", pkg, "0.2.0")).toBe(
      '{\n  "name": "shop",\n  "version": "0.2.0"\n}\n',
    );
    expect(writeVersion("plain", "1.0.0\n", "1.0.1")).toBe("1.0.1\n");
  });
});

describe("policy and detection", () => {
  it("reads a policy with defaults and finds production", () => {
    const p = parsePolicy(
      JSON.stringify({
        style: "continuous",
        scheme: "calver",
        environments: [{ name: "Prod", deploy: "manual" }],
      }),
    )!;
    expect(p).toMatchObject({ style: "continuous", scheme: "calver", tagFormat: "v{version}" });
    expect(production(p)?.name).toBe("Prod");
    expect(parsePolicy("nope")).toBeUndefined();
  });
  it("detects existing versioning, or none", () => {
    const d = detect({
      files: ["package.json", "CHANGELOG.md", "GitVersion.yml", "src/Shop.csproj"],
      versions: { "package.json": "1.4.0" },
      tags: ["v1.3.0", "v1.4.0", "old-thing"],
      subjects: ["feat: a", "fix: b", "Update c"],
      pipelines: ["steps:\n- task: gitversion/setup@0"],
    });
    expect(d).toMatchObject({
      tagFormat: "v{version}",
      latest: { tag: "v1.4.0", version: "1.4.0" },
      changelog: "CHANGELOG.md",
      tools: ["GitVersion"],
      pipelineVersioning: true,
      versioned: true,
    });
    expect(d.versionFiles.map((f) => f.path)).toEqual(["package.json", "src/Shop.csproj"]);
    expect(d.conventional).toBeCloseTo(2 / 3);
    expect(
      detect({ files: ["README.md"], versions: {}, tags: [], subjects: [], pipelines: [] }).versioned,
    ).toBe(false);
  });
});

describe("next version, drafts and deploys", () => {
  it("suggests the next version, with a baseline for the first release", () => {
    const planned = parsePolicy("{}")!;
    expect(nextVersion({ policy: planned, commits: [] })).toMatchObject({ version: "1.0.0", baseline: true });
    expect(nextVersion({ policy: planned, fileVersion: "0.4.0", commits: [] }).version).toBe("0.4.0");
    expect(nextVersion({ policy: planned, latest: "1.2.0", commits: [commit("feat: x")] }).version).toBe(
      "1.3.0",
    );
    expect(
      nextVersion({ policy: planned, latest: "1.2.0", commits: [commit("fix: x")], pre: "rc" }).version,
    ).toBe("1.2.1-rc.1");
    const calver = parsePolicy('{"scheme":"calver"}')!;
    expect(
      nextVersion({ policy: calver, latest: "2026.10.1", commits: [], now: new Date(2026, 9, 2) }).version,
    ).toBe("2026.10.2");
  });
  it("builds a policy from detection", () => {
    const d = detect({
      files: ["src/Api/Api.csproj", "Directory.Build.props", "CHANGELOG.md"],
      versions: {},
      tags: ["release-1.0.0"],
      subjects: ["feat: a", "fix: b"],
      pipelines: [],
    });
    expect(policyFromDetection(d)).toMatchObject({
      tagFormat: "release-{version}",
      versionFile: "Directory.Build.props",
      changelog: { path: "CHANGELOG.md" },
      commitConvention: "conventional",
      scheme: "semver",
    });
  });
  it("asks Claude for a draft and reads its answer", () => {
    const prompt = releasePrompt({
      repo: "shop",
      current: "1.2.0",
      version: "1.3.0",
      policy: parsePolicy('{"notes":[{"audience":"customers","language":"Swedish"}]}')!,
      commits: [commit("feat: discount codes")],
      date: "2026-10-29",
    });
    expect(prompt).toContain("Prepare the release notes for shop");
    expect(prompt).toContain("customers (Swedish)");
    expect(prompt).toContain("## [1.3.0] - 2026-10-29");
    const draft = parseDraft(
      '```json\n{"bump":"minor","reason":"A feature","changelog":"## [1.3.0]","notes":[{"audience":"customers","language":"Swedish","text":"Rabattkoder"}]}\n```',
    );
    expect(draft).toEqual({
      bump: "minor",
      reason: "A feature",
      changelog: "## [1.3.0]",
      notes: [{ audience: "customers", language: "Swedish", text: "Rabattkoder" }],
    });
    expect(parseDraft("no json")).toBeUndefined();
    expect(notesMarkdown("1.3.0", draft!.notes)).toBe("# 1.3.0\n\nRabattkoder\n");
    expect(setupPrompt({ repo: "shop", detection: { versioned: false } })).toContain(".jig/release.json");
  });
  it("decides what a deploy means, what's live and when to remind", () => {
    const planned = parsePolicy("{}")!;
    const continuous = parsePolicy('{"style":"continuous"}')!;
    const prod = { name: "prod", production: true };
    expect(deployAction(planned, prod, undefined)).toBe("warn");
    expect(deployAction(planned, prod, "1.0.0")).toBe("log");
    expect(deployAction(planned, { name: "stage" }, undefined)).toBe("log");
    expect(deployAction(continuous, prod, undefined)).toBe("tag");
    expect(
      whatsLive([
        { env: "prod", commit: "a", at: "2026-10-01", source: "manual" },
        { env: "prod", commit: "b", at: "2026-10-20", source: "pipeline" },
        { env: "stage", commit: "c", at: "2026-10-21", source: "pipeline" },
      ]).prod?.commit,
    ).toBe("b");
    const weekly = parsePolicy('{"cadence":"weekly"}')!;
    const now = new Date("2026-10-29T10:00:00Z");
    expect(shouldRemind({ policy: weekly, unreleased: 3, lastRelease: "2026-10-01", now })).toBe(true);
    expect(shouldRemind({ policy: weekly, unreleased: 3, lastRelease: "2026-10-27", now })).toBe(false);
    expect(
      shouldRemind({
        policy: weekly,
        unreleased: 3,
        lastRelease: "2026-10-01",
        lastReminded: "2026-10-26",
        now,
      }),
    ).toBe(false);
    expect(shouldRemind({ policy: planned, unreleased: 3, now })).toBe(false);
    expect(unreleasedLabel(14, "2026-10-08T10:00:00Z", now)).toBe("14 commits, 3 weeks");
    expect(unreleasedLabel(1, "2026-10-28T10:00:00Z", now)).toBe("1 commit, 1 day");
    expect(unreleasedLabel(0, undefined, now)).toBe("Nothing unreleased");
  });
});
