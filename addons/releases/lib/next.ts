import { type Classified, suggestedBump } from "./commits";
import type { ReleasePolicy } from "./policy";
import { type Bump, bumpSemVer, nextCalVer } from "./version";

/**
 * The version a release would get (pure, tested), before Claude has a say:
 * - the first release: the version in the version file, else 1.0.0 (the baseline) or this month's CalVer;
 * - SemVer: the bump the commits ask for (or `bump`), as a candidate with `pre` ("rc");
 * - CalVer: the next release of the month.
 */
export function nextVersion(input: {
  policy: ReleasePolicy;
  latest?: string;
  fileVersion?: string;
  commits: Classified[];
  bump?: Bump;
  pre?: string;
  now?: Date;
}): { version: string; bump: Bump; baseline: boolean } {
  const { policy, latest, fileVersion, commits, pre, now } = input;
  const bump = input.bump ?? suggestedBump(commits);
  if (policy.scheme === "calver") return { version: nextCalVer(latest, now), bump, baseline: !latest };
  if (!latest) {
    const base = fileVersion && fileVersion !== "0.0.0" ? fileVersion : "1.0.0";
    return { version: pre ? `${base}-${pre}.1` : base, bump, baseline: true };
  }
  return { version: bumpSemVer(latest, bump, pre), bump, baseline: false };
}
