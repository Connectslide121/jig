import { conventionalShare } from "./commits";
import { versionFileKind } from "./files";
import { DEFAULT_POLICY, type ReleasePolicy } from "./policy";
import { latestTagged } from "./version";

/**
 * What a repository already does about versions (pure, tested; no AI): version files, tags and their
 * format, a changelog, conventional commits, versioning tools, and versioning in pipelines. The setup
 * chat starts from this, so a team that versions already is adopted, not changed.
 */
export interface Detection {
  versionFiles: Array<{ path: string; version?: string }>;
  tags: number;
  tagFormat?: string;
  latest?: { tag: string; version: string };
  changelog?: string;
  conventional: number;
  tools: string[];
  pipelineVersioning: boolean;
  /** Versioning is in place: tags in a known format, or a tool. */
  versioned: boolean;
}

const TOOL_FILES: Record<string, string> = {
  "gitversion.yml": "GitVersion",
  "version.json": "Nerdbank.GitVersioning",
  ".releaserc": "semantic-release",
  ".releaserc.json": "semantic-release",
  "release.config.js": "semantic-release",
  "release-please-config.json": "release-please",
  ".changeset": "Changesets",
};

export function detect(input: {
  /** Files at the root and a level down (relative, forward slashes). */
  files: string[];
  /** path → version found in it */
  versions: Record<string, string | undefined>;
  tags: string[];
  subjects: string[];
  /** Contents of pipeline YAML files. */
  pipelines: string[];
}): Detection {
  const lower = input.files.map((f) => f.toLowerCase());
  const tools = [
    ...new Set(lower.map((f) => TOOL_FILES[f.split("/").pop()!]).filter((t): t is string => Boolean(t))),
  ];
  // The tag format most tags follow.
  const formats = ["v{version}", "{version}", "release-{version}", "release/{version}"];
  const scored = formats
    .map((f) => ({
      f,
      latest: latestTagged(input.tags, f),
      count: input.tags.filter((t) => latestTagged([t], f)).length,
    }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);
  const tagFormat = scored[0]?.f;
  const latest = scored[0]?.latest;
  const versionFiles = input.files
    .filter((f) => versionFileKind(f))
    .map((path) => ({ path, version: input.versions[path] }));
  return {
    versionFiles,
    tags: input.tags.length,
    tagFormat,
    latest,
    changelog: input.files.find((f) => /^changelog(\.md)?$/i.test(f)),
    conventional: conventionalShare(input.subjects),
    tools,
    pipelineVersioning: input.pipelines.some((p) =>
      /GitVersion|gitversion|nbgv|semantic-release|\$\(Build\.BuildNumber\)|version:/i.test(p),
    ),
    versioned: Boolean(latest) || tools.length > 0,
  };
}

/**
 * A policy from what detection found, for "Use what's there" without a chat: the tag format, the
 * version file and changelog in use, a versioning tool in charge, and the commit convention if most
 * commits follow it. Planned releases, SemVer unless the latest tag looks like CalVer.
 */
export function policyFromDetection(d: Detection): ReleasePolicy {
  // A version file at the top is the one place it lives (Directory.Build.props first, then package.json).
  const rank = (p: string) => (/directory\.build\.props$/i.test(p) ? 0 : p.includes("/") ? 2 : 1);
  const file = [...d.versionFiles].sort((a, b) => rank(a.path) - rank(b.path))[0];
  return {
    ...DEFAULT_POLICY,
    scheme: d.latest && /^\d{4}\.\d{1,2}\.\d+$/.test(d.latest.version) ? "calver" : "semver",
    tagFormat: d.tagFormat ?? DEFAULT_POLICY.tagFormat,
    ...(file ? { versionFile: file.path } : {}),
    ...(d.tools[0] ? { managedBy: d.tools[0] } : {}),
    changelog: { path: d.changelog ?? "CHANGELOG.md" },
    commitConvention: d.conventional >= 0.6 ? "conventional" : "none",
  };
}
