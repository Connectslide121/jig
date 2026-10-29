import type { Bump } from "./version";

/**
 * Commits since the last release (pure, tested): conventional types, the bump they suggest, work items
 * they mention, and a changelog grouped like Keep a Changelog.
 */
export interface Commit {
  hash: string;
  subject: string;
  body: string;
  date: string;
  author: string;
}

export interface Classified extends Commit {
  /** feat, fix, docs, chore… (conventional commits), else undefined. */
  kind?: string;
  scope?: string;
  breaking: boolean;
  /** The subject without its `feat(x):` prefix. */
  text: string;
  /** Azure DevOps work items (AB#n). */
  workItems: string[];
  /** The pull request it came from (an Azure DevOps squash merge: "Merged PR 123: …"). */
  pr?: string;
}

const CONVENTIONAL = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;

export function classify(c: Commit): Classified {
  const merged = /^Merged PR (\d+):\s*(.+)$/.exec(c.subject);
  if (merged) return { ...classify({ ...c, subject: merged[2]! }), subject: c.subject, pr: merged[1] };
  const m = CONVENTIONAL.exec(c.subject);
  const breaking = Boolean(m?.[3]) || /BREAKING[ -]CHANGE/.test(c.body);
  const items = new Set<string>();
  for (const x of `${c.subject}\n${c.body}`.matchAll(/\bAB#(\d+)\b/g)) items.add(x[1]!);
  return {
    ...c,
    kind: m?.[1]?.toLowerCase(),
    scope: m?.[2],
    breaking,
    text: m?.[4] ?? c.subject,
    workItems: [...items],
  };
}

export interface PullRequest {
  number: string;
  title: string;
}

/**
 * A merged pull request from a merge commit: GitHub's "Merge pull request #12 from owner/branch" (the
 * title is the body's first line) or Azure DevOps' "Merged PR 12: title".
 */
export function parsePullRequest(subject: string, body = ""): PullRequest | undefined {
  const gh = /^Merge pull request #(\d+) from (\S+)/.exec(subject);
  if (gh) return { number: gh[1]!, title: body.trim().split("\n")[0]?.trim() || gh[2]! };
  const az = /^Merged PR (\d+):\s*(.+)$/.exec(subject);
  if (az) return { number: az[1]!, title: az[2]!.trim() };
  return undefined;
}

/** The bump the commits ask for: a breaking change → major, a feature → minor, else patch. */
export function suggestedBump(commits: Classified[]): Bump {
  if (commits.some((c) => c.breaking)) return "major";
  if (commits.some((c) => c.kind === "feat")) return "minor";
  return "patch";
}

/** Share of commits that follow conventional commits (to detect a team's convention). */
export function conventionalShare(subjects: string[]): number {
  if (!subjects.length) return 0;
  return subjects.filter((s) => CONVENTIONAL.test(s)).length / subjects.length;
}

const SKIP = new Set(["chore", "ci", "build", "test", "style"]);

/** A changelog section without AI: Added / Changed / Fixed from the commits. */
export function draftChangelog(version: string, date: string, commits: Classified[]): string {
  const added: string[] = [];
  const changed: string[] = [];
  const fixed: string[] = [];
  for (const c of commits) {
    if (/^Merge /.test(c.subject) || (c.kind && SKIP.has(c.kind))) continue;
    const line = `- ${c.text}${c.workItems.length ? ` (${c.workItems.map((w) => `AB#${w}`).join(", ")})` : ""}`;
    if (c.kind === "feat") added.push(line);
    else if (c.kind === "fix") fixed.push(line);
    else changed.push(line);
  }
  const parts = [`## [${version}] - ${date}`];
  if (added.length) parts.push("", "### Added", ...added);
  if (changed.length) parts.push("", "### Changed", ...changed);
  if (fixed.length) parts.push("", "### Fixed", ...fixed);
  if (parts.length === 1) parts.push("", "- Maintenance release.");
  return parts.join("\n");
}

/** Puts a new section into a CHANGELOG.md: after its title (and an Unreleased section), or a new file. */
export function insertChangelog(existing: string | undefined, section: string): string {
  if (!existing?.trim()) return `# Changelog\n\nAll notable changes are listed here.\n\n${section}\n`;
  const lines = existing.split("\n");
  // Before the first released section ("## [x" or "## x"), skipping an "Unreleased" one.
  let at = lines.findIndex((l) => /^##\s/.test(l) && !/unreleased/i.test(l));
  if (at < 0) at = lines.length;
  const before = lines.slice(0, at).join("\n").replace(/\s*$/, "");
  const after = lines.slice(at).join("\n");
  return `${before}\n\n${section}\n${after ? `\n${after}` : ""}`.replace(/\n{3,}/g, "\n\n");
}
