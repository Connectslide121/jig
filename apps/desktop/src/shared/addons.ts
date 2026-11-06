import type { AddonManifest } from "@jig/sdk";

/** An add-on as the renderer sees it (`addons.list`). Documented in docs/reference/addon-api.md. */
export interface AddonInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  /** builtin = shipped in Jig's `addons/`; user = `~/.jig/addons` (overrides a built-in with the same id). */
  source: "builtin" | "user";
  /** A user add-on that replaces the built-in one with the same id. */
  overridesBuiltin?: boolean;
  /** Loaded from a build's worktree while you decide (Accept / Discard). */
  preview?: { buildId: string };
  dir: string;
  enabled: boolean;
  manifest?: AddonManifest;
  /** Problems with the manifest or the build; the add-on is not loaded while there are any. */
  errors: string[];
  /** `jig-addon://<id>/ui.js?v=<hash>` when it has a UI part. */
  uiUrl?: string;
  cssUrl?: string;
  hasHost: boolean;
  /** Non-fatal problems (e.g. design-token violations); the add-on still loads. */
  warnings?: string[];
  /** Short README text for the builder and the add-ons page. */
  readme?: string;
}

/** An add-on that is switched on but didn't load, for the notice that says so (D-417). */
export interface AddonLoadFailure {
  id: string;
  name: string;
  error: string;
  /** The same add-on with the same error gives the same key: tell it once, not on every reload. */
  key: string;
}

/**
 * The add-ons that are switched on but failed: the host's errors (manifest, bundling) and the
 * renderer's (`loadErrors`: loading `ui.js`, missing exports). An add-on the builder is previewing is
 * left out: the build shows its own errors.
 */
export function addonLoadFailures(
  addons: AddonInfo[],
  loadErrors: Record<string, string>,
): AddonLoadFailure[] {
  const out: AddonLoadFailure[] = [];
  for (const a of addons) {
    if (!a.enabled || a.preview) continue;
    const errors = [...a.errors, ...(loadErrors[a.id] ? [loadErrors[a.id] as string] : [])];
    if (errors.length === 0) continue;
    const error = errors.join("\n");
    out.push({ id: a.id, name: a.name, error, key: `${a.id}\n${error}` });
  }
  return out;
}

export interface AddonCommit {
  hash: string;
  date: string;
  message: string;
}

/** An add-on offered by a gallery source (D-179). */
export interface GalleryAddon {
  id: string;
  name: string;
  version?: string;
  description?: string;
  icon?: string;
  permissions: string[];
  /** Problems with its manifest; it can't be installed while there are any. */
  errors: string[];
  /** The one you have with this id: yours, or a built-in one it would replace. */
  installed?: { source: "builtin" | "user"; version?: string };
}

/** A gallery source (a git URL or a folder from Settings → Add-ons) and what it offers. */
export interface GallerySource {
  source: string;
  error?: string;
  addons: GalleryAddon[];
}

/** Where an installed add-on came from (D-249), for "edited" and Restore original. */
export interface AddonOriginInfo {
  kind: "gallery" | "import";
  /** The gallery source it was installed from. */
  source?: string;
  version?: string;
  /** Its files differ from how it came. */
  modified: boolean;
}
