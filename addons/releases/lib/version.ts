/**
 * Version numbers (pure, tested): SemVer (`2.4.1`, `1.3.0-rc.2`) and CalVer (`2026.10.3`), bumping,
 * comparing, and the tag format (`v{version}`).
 */
export type Bump = "major" | "minor" | "patch";
export type Scheme = "semver" | "calver";

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  /** e.g. ["rc", 2] */
  pre: Array<string | number>;
}

export function parseSemVer(text: string): SemVer | undefined {
  const m = /^v?(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(text.trim());
  if (!m) return undefined;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3] ?? 0),
    pre: m[4] ? m[4].split(".").map((p) => (/^\d+$/.test(p) ? Number(p) : p)) : [],
  };
}

export function formatSemVer(v: SemVer): string {
  return `${v.major}.${v.minor}.${v.patch}${v.pre.length ? `-${v.pre.join(".")}` : ""}`;
}

/** Negative when a < b. Pre-releases come before their release (1.3.0-rc.1 < 1.3.0). */
export function compareVersions(a: string, b: string): number {
  const x = parseSemVer(a);
  const y = parseSemVer(b);
  if (!x || !y) return a.localeCompare(b, undefined, { numeric: true });
  for (const k of ["major", "minor", "patch"] as const) if (x[k] !== y[k]) return x[k] - y[k];
  if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (p === q) continue;
    if (typeof p === "number" && typeof q === "number") return p - q;
    return String(p).localeCompare(String(q));
  }
  return 0;
}

/** The next SemVer: a bump, or with `pre` ("rc") a release candidate of it (rc.1, then rc.2…). */
export function bumpSemVer(current: string | undefined, bump: Bump, pre?: string): string {
  const v = (current && parseSemVer(current)) || { major: 0, minor: 0, patch: 0, pre: [] };
  // Already a candidate of the same bump: the next candidate, or the release itself.
  if (v.pre.length && pre && v.pre[0] === pre)
    return formatSemVer({ ...v, pre: [pre, Number(v.pre[1] ?? 0) + 1] });
  if (v.pre.length && !pre) return formatSemVer({ ...v, pre: [] });
  const next =
    bump === "major"
      ? { major: v.major + 1, minor: 0, patch: 0 }
      : bump === "minor"
        ? { major: v.major, minor: v.minor + 1, patch: 0 }
        : { major: v.major, minor: v.minor, patch: v.patch + 1 };
  return formatSemVer({ ...next, pre: pre ? [pre, 1] : [] });
}

/** The next CalVer `YYYY.M.N`: N counts releases in the month. */
export function nextCalVer(current: string | undefined, now = new Date()): string {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const c = current ? /^v?(\d{4})\.(\d{1,2})\.(\d+)/.exec(current) : null;
  const n = c && Number(c[1]) === y && Number(c[2]) === m ? Number(c[3]) + 1 : 1;
  return `${y}.${m}.${n}`;
}

export function tagFor(version: string, format = "v{version}"): string {
  return format.replace("{version}", version);
}

/** The version in a tag made with `format`, if it is one. */
export function versionFromTag(tag: string, format = "v{version}"): string | undefined {
  const [before, after] = format.split("{version}");
  if (!tag.startsWith(before ?? "") || !tag.endsWith(after ?? "")) return undefined;
  const v = tag.slice((before ?? "").length, tag.length - (after ?? "").length);
  return parseSemVer(v) || /^\d{4}\.\d{1,2}\.\d+$/.test(v) ? v : undefined;
}

/** The newest version among tags (by version, not by date). */
export function latestTagged(
  tags: string[],
  format = "v{version}",
): { tag: string; version: string } | undefined {
  return tags
    .map((tag) => ({ tag, version: versionFromTag(tag, format) }))
    .filter((t): t is { tag: string; version: string } => Boolean(t.version))
    .sort((a, b) => compareVersions(b.version, a.version))[0];
}
