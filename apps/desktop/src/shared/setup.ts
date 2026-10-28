/**
 * First-run checks and updates (phase 11). Documented in docs/reference/setup.md.
 * Jig only runs each tool's `--version` (or similar); it never reads anyone's login. Whether Claude
 * Code is signed in shows when your first session starts (Claude Code reports it).
 */
export type SetupCheckId = "claude" | "git" | "gh" | "az" | "az-devops" | "code";

export interface SetupCheck {
  id: SetupCheckId;
  label: string;
  ok: boolean;
  /** Jig works without it; some add-ons don't. */
  optional: boolean;
  /** Version or what's wrong, in plain language. */
  detail: string;
  /** What to do when it's missing. */
  help?: string;
  url?: string;
}

export interface UpdateInfo {
  /** `source`: Jig runs from a git clone (pull + build); `release`: an installed build (GitHub releases). */
  mode: "source" | "release";
  current: string;
  latest?: string;
  available: boolean;
  detail: string;
  /** Release page to download from (release mode). */
  url?: string;
}

/** Compares dotted versions ("0.10.1" > "0.9.3"); a leading "v" and pre-release suffixes are ignored. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) =>
    v
      .trim()
      .replace(/^v/i, "")
      .split(/[-+]/)[0]!
      .split(".")
      .map((n) => Number.parseInt(n, 10) || 0);
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}
