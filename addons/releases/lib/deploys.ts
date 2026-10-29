import type { ReleasePolicy } from "./policy";

/**
 * Deploys and the discipline around them (pure, tested): what to do when an environment gets a new
 * build, what each environment runs, and when to remind. Plain code, no AI.
 */
export interface Deploy {
  env: string;
  commit: string;
  /** The release on that commit, if any. */
  version?: string;
  at: string;
  source: "pipeline" | "manual";
  runId?: number;
}

/**
 * What a deploy of a commit to `env` means:
 * - `tag`: continuous style, production: the deploy is the release; tag it with the next version;
 * - `warn`: planned style, production, no release on that commit: "release first?";
 * - `log`: anything else; it's only recorded.
 */
export function deployAction(
  policy: ReleasePolicy,
  env: { name: string; production?: boolean },
  version: string | undefined,
): "tag" | "warn" | "log" {
  const prod = env.production || /prod/i.test(env.name);
  if (!prod || version) return "log";
  if (policy.style === "continuous") return "tag";
  if (policy.style === "planned") return "warn";
  return "log";
}

/** The latest deploy per environment ("what's live"), newest first within the list given. */
export function whatsLive(deploys: Deploy[]): Record<string, Deploy> {
  const live: Record<string, Deploy> = {};
  for (const d of deploys) if (!live[d.env] || live[d.env]!.at < d.at) live[d.env] = d;
  return live;
}

const WEEK = 7 * 24 * 3600 * 1000;

/**
 * A weekly reminder (planned style, `cadence: "weekly"`): there is unreleased work, the last release is
 * a week old or more, and no reminder in the last week.
 */
export function shouldRemind(input: {
  policy: ReleasePolicy;
  unreleased: number;
  lastRelease?: string;
  lastReminded?: string;
  now: Date;
}): boolean {
  const { policy, unreleased, lastRelease, lastReminded, now } = input;
  if (policy.style !== "planned" || policy.cadence !== "weekly" || unreleased === 0) return false;
  const t = now.getTime();
  if (lastReminded && t - new Date(lastReminded).getTime() < WEEK) return false;
  return !lastRelease || t - new Date(lastRelease).getTime() >= WEEK;
}

/** "14 commits, 3 weeks" for a badge. */
export function unreleasedLabel(count: number, oldest: string | undefined, now = new Date()): string {
  if (count === 0) return "Nothing unreleased";
  const commits = `${count} commit${count === 1 ? "" : "s"}`;
  if (!oldest) return commits;
  const days = Math.floor((now.getTime() - new Date(oldest).getTime()) / (24 * 3600 * 1000));
  if (days < 1) return `${commits}, today`;
  if (days < 14) return `${commits}, ${days} day${days === 1 ? "" : "s"}`;
  return `${commits}, ${Math.floor(days / 7)} weeks`;
}
