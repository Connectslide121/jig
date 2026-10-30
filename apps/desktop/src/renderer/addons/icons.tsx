import type { AddonManifest } from "@jig/sdk";
import * as lucide from "lucide-react";
import { icons, type LucideProps, Puzzle } from "lucide-react";

type LucideComponent = (typeof icons)[keyof typeof icons];

/**
 * A Lucide icon by its kebab-case name ("git-branch" → GitBranch), as manifests name them. Aliases
 * such as "history" are only named exports, not in `icons`, so those are tried too.
 */
export function iconByName(name: string | undefined) {
  if (!name) return undefined;
  const pascal = name.replace(/(^|-)(\w)/g, (_m, _d, c: string) => c.toUpperCase());
  const found = (icons as Record<string, LucideComponent>)[pascal];
  if (found) return found;
  const alias = (lucide as unknown as Record<string, unknown>)[pascal];
  return alias && typeof alias === "object" && pascal !== "Icons" ? (alias as LucideComponent) : undefined;
}

/**
 * `<Icon name="rocket" />` for add-ons that choose an icon at runtime (from settings or data). A name
 * Lucide doesn't have shows the puzzle piece. Fixed icons are better imported from "lucide-react".
 */
export function Icon({ name, ...props }: LucideProps & { name: string }) {
  const Found = iconByName(name) ?? Puzzle;
  return <Found {...props} />;
}

/** Icon names in a manifest that Lucide doesn't have (they would show as a puzzle piece). */
export function unknownIcons(manifest: AddonManifest | undefined): string[] {
  if (!manifest) return [];
  const c = manifest.contributes;
  const names = [
    manifest.icon,
    ...c.views.map((v) => v.icon),
    ...c.tabs.map((t) => t.icon),
    ...c.actions.map((a) => a.icon),
    ...c.menus.map((m) => m.icon),
  ].filter((n): n is string => Boolean(n));
  return [...new Set(names.filter((n) => !iconByName(n)))];
}
