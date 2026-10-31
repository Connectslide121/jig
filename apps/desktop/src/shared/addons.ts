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
