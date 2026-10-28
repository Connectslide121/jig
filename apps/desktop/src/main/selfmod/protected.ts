/**
 * Paths the builder may only change after you confirm explicitly (AGENTS.md, architecture §9): the
 * launcher that restarts Jig and falls back to the previous build, and the builder core itself.
 */
export const PROTECTED_PATHS = [
  "apps/launcher/",
  "apps/desktop/src/main/builder/",
  "apps/desktop/src/main/selfmod/",
  "apps/desktop/src/main/engine/claude.ts",
  "AGENTS.md",
];

export function protectedFiles(paths: string[]): string[] {
  return paths.filter((p) => {
    const n = p.replaceAll("\\", "/");
    return PROTECTED_PATHS.some((pp) => (pp.endsWith("/") ? n.startsWith(pp) : n === pp));
  });
}
