/**
 * A repository's release policy (`.jig/release.json`, committed so a team shares it): how it versions,
 * how it ships, what the notes are like. Written by the setup chat (or by hand); pure helpers, tested.
 */
export type ReleaseStyle = "planned" | "continuous" | "none";

export interface Environment {
  name: string;
  /** How it is deployed: a pipeline (seen through az), by hand (a Deployed button), or both. */
  deploy: "pipeline" | "manual" | "both";
  /** Azure DevOps pipeline that deploys it. */
  pipeline?: { org: string; project: string; id: number };
  /** Pre-release label for this environment (stage: "rc"); none = the release itself. */
  prerelease?: string;
  /** The environment that counts as production (deploy checks, "what's live"). */
  production?: boolean;
}

export interface ReleasePolicy {
  version: 1;
  style: ReleaseStyle;
  scheme: "semver" | "calver";
  /** Where the version lives; none = only git tags. */
  versionFile?: string;
  /** A tool that computes the version (GitVersion, Nerdbank.GitVersioning…): Jig reads, never bumps files. */
  managedBy?: string;
  tagFormat: string;
  changelog?: { path: string };
  /** Who reads the release notes, and in which language. */
  notes?: Array<{ audience: string; language: string }>;
  commitConvention?: "conventional" | "none";
  /** When to release (planned): before every production deploy, weekly, or no reminders. */
  cadence?: "before-prod-deploy" | "weekly" | "none";
  environments?: Environment[];
}

export const DEFAULT_POLICY: ReleasePolicy = {
  version: 1,
  style: "planned",
  scheme: "semver",
  tagFormat: "v{version}",
  changelog: { path: "CHANGELOG.md" },
  commitConvention: "none",
  cadence: "before-prod-deploy",
};

/** A policy read from JSON, with defaults for what's missing; undefined if it isn't one. */
export function parsePolicy(text: string): ReleasePolicy | undefined {
  try {
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== "object") return undefined;
    const style = ["planned", "continuous", "none"].includes(raw.style) ? raw.style : DEFAULT_POLICY.style;
    const scheme = raw.scheme === "calver" ? "calver" : "semver";
    return {
      ...DEFAULT_POLICY,
      ...raw,
      version: 1,
      style,
      scheme,
      tagFormat:
        typeof raw.tagFormat === "string" && raw.tagFormat.includes("{version}")
          ? raw.tagFormat
          : "v{version}",
    };
  } catch {
    return undefined;
  }
}

export function production(policy: ReleasePolicy): Environment | undefined {
  return (
    policy.environments?.find((e) => e.production) ?? policy.environments?.find((e) => /prod/i.test(e.name))
  );
}
