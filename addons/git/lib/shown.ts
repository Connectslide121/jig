/**
 * Which repositories of a workspace the Git view lists (pure, tested). By default only the focus
 * repository, the one you work in, plus the ones you chose to show next to it (per project and per
 * focus repository, so "podium + elearning" while you integrate them, and podium alone again after).
 * "All repositories" lists every one.
 */
export interface Shown {
  /** List every repository (like VS Code's Source Control with several repositories). */
  all?: boolean;
  /** Focus repository path → the other repository paths shown with it. */
  extras: Record<string, string[]>;
}

export const NO_SHOWN: Shown = { extras: {} };

/** Lists every repository: chosen, or when there is no focus repository to start from. */
export function showsAll(shown: Shown, focus: string | undefined, repos: string[]): boolean {
  return Boolean(shown.all) || !focus || !repos.includes(focus);
}

/** The repositories to list, in the workspace's order, the focus repository first. */
export function visibleRepos(repos: string[], focus: string | undefined, shown: Shown): string[] {
  if (showsAll(shown, focus, repos)) return repos;
  const extras = new Set(shown.extras[focus!] ?? []);
  return [focus!, ...repos.filter((r) => r !== focus && extras.has(r))];
}

/** Shows `repo` next to `focus`, or hides it again. */
export function toggleExtra(shown: Shown, focus: string, repo: string): Shown {
  const current = shown.extras[focus] ?? [];
  const next = current.includes(repo) ? current.filter((r) => r !== repo) : [...current, repo];
  const extras = { ...shown.extras };
  if (next.length) extras[focus] = next;
  else delete extras[focus];
  return { ...shown, extras };
}
