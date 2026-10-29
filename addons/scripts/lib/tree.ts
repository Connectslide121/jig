/**
 * The Scripts view's tree, like the scripts plugin (pure, tested in tree.test.ts): a project folder's
 * scripts by top folder, then git repository (when a top folder holds several, or is not one itself),
 * then package or project. A package is a folder with scripts; its tag says what it is.
 */
import type { AddonScript } from "@jig/sdk";

export type PackageKind = "api" | "npm" | "script";

export interface PackageNode {
  /** Its folder, relative to the project folder ("" = the folder itself). */
  folder: string;
  /** What it's called: the folder's last part, or the project's name for the folder itself. */
  label: string;
  /** `api`: a .NET or Functions backend; `npm`: a package.json; `script`: .ps1 / .sh / .cmd files. */
  kind: PackageKind;
  scripts: AddonScript[];
}

export interface RepoNode {
  /** `<top>/<repo path>`, for the open/closed state. */
  key: string;
  /** Relative to its top folder ("" = the top folder is the repository). */
  label: string;
  packages: PackageNode[];
}

export interface TopNode {
  key: string;
  label: string;
  /** Its repositories; with `flat`, one whose packages show right under the top folder. */
  repos: RepoNode[];
  flat: boolean;
}

const kindOf = (scripts: AddonScript[]): PackageKind =>
  scripts.some((s) => s.kind === "dotnet-run" || s.kind === "func")
    ? "api"
    : scripts.some((s) => s.kind === "npm")
      ? "npm"
      : "script";

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });

/** The deepest repository (relative path) holding `folder`, or undefined. */
export function repoOf(folder: string, repos: string[]): string | undefined {
  return repos
    .filter((r) => folder === r || folder.startsWith(`${r}/`) || r === "")
    .sort((a, b) => b.length - a.length)[0];
}

/**
 * The tree of a project folder's scripts. `repos` are its git repositories, relative to it with
 * forward slashes ("" when the folder is one itself); `root` names the folder itself.
 */
export function scriptTree(scripts: AddonScript[], repos: string[], root: string): TopNode[] {
  const packages = new Map<string, AddonScript[]>();
  for (const s of scripts) packages.set(s.folder, [...(packages.get(s.folder) ?? []), s]);
  const tops = new Map<string, Map<string, PackageNode[]>>();
  for (const [folder, list] of packages) {
    const top = folder.split("/")[0] ?? "";
    const repo = repoOf(folder, repos) ?? top;
    const node: PackageNode = {
      folder,
      label: folder ? (folder.split("/").pop() ?? folder) : root,
      kind: kindOf(list),
      scripts: list,
    };
    const inTop = tops.get(top) ?? new Map<string, PackageNode[]>();
    inTop.set(repo, [...(inTop.get(repo) ?? []), node]);
    tops.set(top, inTop);
  }
  const order = (list: PackageNode[]) =>
    list.sort(
      (a, b) =>
        (a.kind === b.kind ? 0 : a.kind === "api" ? -1 : b.kind === "api" ? 1 : 0) ||
        byName(a.folder, b.folder),
    );
  return [...tops.entries()]
    .sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : byName(a, b)))
    .map(([top, inTop]) => {
      const repoList = [...inTop.entries()]
        .sort(([a], [b]) => byName(a, b))
        .map(([repo, list]) => ({
          key: `${top}|${repo}`,
          label: repo === top ? "" : top && repo.startsWith(`${top}/`) ? repo.slice(top.length + 1) : repo,
          packages: order(list),
        }));
      return {
        key: top,
        label: top || root,
        repos: repoList,
        flat: repoList.length === 1 && repoList[0]!.label === "",
      };
    });
}

/** `1 backend · 27 packages`; a kind with none is left out. */
export function countText(packages: PackageNode[]): string {
  const api = packages.filter((p) => p.kind === "api").length;
  const npm = packages.length - api;
  return [api && `${api} backend${api === 1 ? "" : "s"}`, npm && `${npm} package${npm === 1 ? "" : "s"}`]
    .filter(Boolean)
    .join(" · ");
}

/** Repositories of a workspace, relative to the project folder, forward slashes. */
export function relativeRepos(
  folder: string,
  repos: Array<{ path: string }>,
  folderIsRepo: boolean,
): string[] {
  const base = folder.replaceAll("\\", "/").replace(/\/+$/, "");
  const out = repos
    .map((r) => r.path.replaceAll("\\", "/"))
    .filter((p) => p.toLowerCase().startsWith(`${base.toLowerCase()}/`))
    .map((p) => p.slice(base.length + 1));
  return folderIsRepo ? ["", ...out] : out;
}
