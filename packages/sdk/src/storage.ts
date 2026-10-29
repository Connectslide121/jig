/**
 * Where an add-on's data lives (D-116): global (one copy), per project, or per repository. The add-on
 * declares it (`"storage": { "scope": "project" }`); `ctx.storage` and `useStorage` then keep a
 * separate copy for each project or repository. Underneath it is one JSON file per add-on, with the
 * scope in the key: `@project(<id>) <key>`, `@repo(<path>) <key>`.
 */
export type StorageScope = "global" | "project" | "repo";

export interface StorageOptions {
  /** Default: the add-on's declared scope (UI) or global (host code). */
  scope?: StorageScope;
  /** The project id or repository path; default (UI): the active project / its repository. */
  id?: string;
}

const normalizePath = (p: string) => p.replaceAll("\\", "/").replace(/\/+$/, "");

/** The stored key for `key` in a scope. */
export function scopedKey(scope: StorageScope, id: string | undefined, key: string): string {
  if (scope === "global") return key;
  if (!id) throw new Error(`No ${scope === "project" ? "project" : "repository"} is active for this data`);
  return `@${scope}(${scope === "repo" ? normalizePath(id) : id}) ${key}`;
}

/** A stored key read back: its scope, the project/repository and the add-on's own key. */
export function parseScopedKey(stored: string): { scope: StorageScope; id?: string; key: string } {
  const m = /^@(project|repo)\((.*?)\) (.*)$/s.exec(stored);
  return m ? { scope: m[1] as StorageScope, id: m[2], key: m[3]! } : { scope: "global", key: stored };
}

export function scopeLabel(scope: StorageScope): string {
  return scope === "project" ? "per project" : scope === "repo" ? "per repository" : "global";
}
