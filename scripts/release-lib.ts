/**
 * Pure parts of `npm run release` (scripts/release.ts): the plan Claude writes, version order,
 * the update feed and the status lines. Tested in release-lib.test.ts.
 */

/** What Claude decided for the next release, in `release/next.json` (ignored by git). */
export interface ReleasePlan {
  version: string;
  /** Which part of the version went up. */
  bump: "major" | "minor" | "patch";
  /** Why that part (one sentence). */
  reason: string;
  /** One or two sentences for docs/status.md. */
  summary: string;
  /** The release notes (Markdown), for the GitHub release. */
  notes: string;
}

const STABLE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Reads and checks the plan; throws with what is wrong. */
export function parsePlan(json: string): ReleasePlan {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(json) as Record<string, unknown>;
  } catch {
    throw new Error("release/next.json isn't valid JSON");
  }
  const text = (key: string, max: number) => {
    const value = data[key];
    if (typeof value !== "string" || !value.trim()) throw new Error(`release/next.json needs "${key}"`);
    if (value.length > max) throw new Error(`"${key}" is longer than ${max} characters`);
    return value.trim();
  };
  const version = text("version", 40);
  if (!STABLE.test(version)) throw new Error(`"${version}" isn't a stable version like 1.2.3`);
  const bump = text("bump", 10);
  if (bump !== "major" && bump !== "minor" && bump !== "patch")
    throw new Error(`"bump" must be major, minor or patch, not "${bump}"`);
  return {
    version,
    bump,
    reason: text("reason", 500),
    summary: text("summary", 1000),
    notes: text("notes", 20_000),
  };
}

/** -1, 0 or 1 as `a` is older, the same or newer than `b` (stable versions). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

/** The version `bump` makes from `from`. */
export function bumped(from: string, bump: ReleasePlan["bump"]): string {
  const [major = 0, minor = 0, patch = 0] = from.split(".").map(Number);
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** The plan's version must be exactly one step of its bump above the last release. */
export function checkBump(plan: ReleasePlan, latest: string | undefined): void {
  if (!latest) return;
  const expected = bumped(latest, plan.bump);
  if (plan.version !== expected)
    throw new Error(`A ${plan.bump} release after ${latest} is ${expected}, not ${plan.version}`);
}

export interface Feed {
  version: string;
  path: string;
  sha512: string;
  size?: number;
}

/** The fields Jig's updater reads from electron-builder's `latest.yml`. */
export function parseLatestYml(text: string): Feed {
  const field = (key: string) => new RegExp(`^${key}:\\s*['"]?([^'"\\r\\n]+)['"]?\\s*$`, "m").exec(text)?.[1];
  const size = /^\s+size:\s*(\d+)\s*$/m.exec(text)?.[1];
  const version = field("version");
  const path = field("path");
  const sha512 = field("sha512");
  if (!version || !path || !sha512) throw new Error("latest.yml lacks version, path or sha512");
  return { version, path, sha512, size: size ? Number(size) : undefined };
}

/** The "being prepared" paragraph the release commit adds to docs/status.md. */
export function preparedParagraph(plan: ReleasePlan, date: string): string {
  return `Jig ${plan.version} being prepared (${date}): ${plan.summary} Publication not yet verified.`;
}

/** The paragraph that replaces it once the release is published and verified. */
export function publishedParagraph(
  plan: ReleasePlan,
  info: { date: string; url: string; sha: string; size: number; sha256: string },
): string {
  return [
    `Jig ${plan.version} published (${info.date}): [GitHub release](${info.url}),`,
    `source/tag \`${info.sha}\`. Installer: ${info.size.toLocaleString("en-US")} bytes;`,
    `SHA-256 \`${info.sha256}\`.`,
    "Published by `npm run release`: npm run check, the whole e2e suite and the packaged app test passed;",
    "the draft's installer matched the local one, and unauthenticated latest-release discovery returns",
    `v${plan.version} with its feed and installer. In ${plan.version}: ${plan.summary}`,
  ].join("\n");
}

/**
 * docs/status.md with `paragraph` for `version`: it replaces that version's "being prepared"
 * paragraph, or goes before the newest "Jig x.y.z published" paragraph (or at the end).
 */
export function withStatus(status: string, version: string, paragraph: string): string {
  const lines = status.split("\n");
  const prepared = lines.findIndex((l) => l.startsWith(`Jig ${version} being prepared`));
  if (prepared >= 0) {
    let end = prepared;
    while (end + 1 < lines.length && lines[end + 1]!.trim()) end++;
    lines.splice(prepared, end - prepared + 1, ...paragraph.split("\n"));
    return lines.join("\n");
  }
  const newest = lines.findIndex((l) => /^Jig \d+\.\d+\.\d+ (published|being prepared)/.test(l));
  if (newest < 0) return `${status.trimEnd()}\n\n${paragraph}\n`;
  lines.splice(newest, 0, ...paragraph.split("\n"), "");
  return lines.join("\n");
}

/** Where `npm run e2e` records the commit the whole suite last passed on (ignored by git, D-272). */
export const E2E_STAMP = ".jig-e2e-passed.json";

/** What the release commit itself changes: the version and the status line, nothing the tests run. */
const RELEASE_FILES = new Set([
  "package.json",
  "apps/desktop/package.json",
  "package-lock.json",
  "docs/status.md",
]);

/**
 * Whether the e2e suite that passed on an earlier commit still stands for this one: true when the
 * files changed since then (`git diff --name-only <passed> HEAD`) are only the release's own.
 */
export function e2eStillPasses(changed: string[]): boolean {
  return changed.every((file) => RELEASE_FILES.has(file.trim()) || !file.trim());
}
