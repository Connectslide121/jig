import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import {
  BUILTIN_THEMES,
  contributedThemes,
  isJigThemeFile,
  type JigTheme,
  jigThemeFromFile,
  mapVsCodeTheme,
  parseJsonc,
  resolveIncludes,
  slugify,
  type ThemeSource,
  type VsCodeTheme,
} from "@jig/themes";

/**
 * Where themes come from. Every source yields `ThemeEntry`s that know how to load the full theme;
 * the service (service.ts) caches loaded themes. Nothing here executes code from an extension:
 * only `package.json`, `package.nls.json` and the theme JSON files are read.
 */
export interface ThemeEntry {
  id: string;
  label: string;
  source: ThemeSource;
  load(): Promise<JigTheme>;
}

export function builtinEntries(): ThemeEntry[] {
  return BUILTIN_THEMES.map((theme) => ({
    id: theme.id,
    label: theme.label,
    source: theme.source,
    load: async () => theme,
  }));
}

async function readJsonc(path: string): Promise<unknown> {
  return parseJsonc(await readFile(path, "utf8"));
}

/** Loads a VS Code theme file and follows its `include` chain, staying inside `root`. */
async function loadVsCodeFile(path: string, root: string): Promise<VsCodeTheme> {
  const loader = async (relative: string, from: string) => {
    const target = resolve(dirname(from), relative);
    if (!isInside(target, root)) throw new Error(`include outside the theme folder: ${relative}`);
    return { theme: (await readJsonc(target)) as VsCodeTheme, path: target };
  };
  return resolveIncludes((await readJsonc(path)) as VsCodeTheme, loader, path);
}

export function isInside(path: string, root: string): boolean {
  const r = resolve(root);
  const p = resolve(path);
  return p === r || p.startsWith(r.endsWith(sep) ? r : r + sep);
}

/** One theme file (Jig or VS Code format) as an entry; includes may not leave `root`. */
export function fileEntry(
  path: string,
  id: string,
  label: string,
  source: ThemeSource,
  root: string,
): ThemeEntry {
  return {
    id,
    label,
    source,
    load: async () => {
      const json = await readJsonc(path);
      if (isJigThemeFile(json)) return jigThemeFromFile({ label, ...json }, id, source);
      return mapVsCodeTheme(await loadVsCodeFile(path, root), { id, label, source });
    },
  };
}

/** Theme files in `~/.jig/themes` (top level only): Jig format or VS Code format. */
export async function userEntries(dir: string): Promise<ThemeEntry[]> {
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const entries: ThemeEntry[] = [];
  for (const file of files.sort()) {
    if (![".json", ".jsonc"].includes(extname(file).toLowerCase())) continue;
    const path = join(dir, file);
    const id = `user:${slugify(basename(file, extname(file)))}`;
    const source: ThemeSource = { kind: "user", file: path };
    let label = basename(file, extname(file));
    try {
      const json = (await readJsonc(path)) as { name?: string; label?: string };
      label = json.label ?? json.name ?? label;
    } catch {
      // Reported when loaded.
    }
    entries.push(fileEntry(path, id, label, source, dir));
  }
  return entries;
}

/** Folders where VS Code-family editors install extensions, plus VS Code's own built-in themes. */
export function vscodeExtensionDirs(home = homedir(), env = process.env): string[] {
  const dirs = [".vscode", ".vscode-insiders", ".cursor", ".vscode-oss", ".windsurf"].map((d) =>
    join(home, d, "extensions"),
  );
  if (process.platform === "win32") {
    const local = env.LOCALAPPDATA ?? join(home, "AppData", "Local");
    dirs.push(
      join(local, "Programs", "Microsoft VS Code", "resources", "app", "extensions"),
      join(local, "Programs", "Microsoft VS Code Insiders", "resources", "app", "extensions"),
    );
    if (env.ProgramFiles)
      dirs.push(join(env.ProgramFiles, "Microsoft VS Code", "resources", "app", "extensions"));
  } else if (process.platform === "darwin") {
    dirs.push("/Applications/Visual Studio Code.app/Contents/Resources/app/extensions");
  } else {
    dirs.push(
      "/usr/share/code/resources/app/extensions",
      "/snap/code/current/usr/share/code/resources/app/extensions",
    );
  }
  return dirs;
}

async function localise(label: string | undefined, extDir: string): Promise<string | undefined> {
  const key = /^%(.+)%$/.exec(label ?? "")?.[1];
  if (!key) return label;
  try {
    const nls = (await readJsonc(join(extDir, "package.nls.json"))) as Record<string, unknown>;
    const value = nls[key];
    return typeof value === "string" ? value : ((value as { message?: string })?.message ?? label);
  } catch {
    return label;
  }
}

/**
 * Themes contributed by the extensions in `root` (one sub-folder per extension). `kind` is
 * `vscode` for editor installs and `openvsx` for themes installed by Jig from Open VSX.
 */
export async function extensionEntries(root: string, kind: "vscode" | "openvsx"): Promise<ThemeEntry[]> {
  let folders: string[];
  try {
    folders = await readdir(root);
  } catch {
    return [];
  }
  const entries: ThemeEntry[] = [];
  const seen = new Set<string>();
  // Newest version first, so an editor's leftover old version of an extension is skipped.
  folders.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const folder of folders) {
    const extDir = join(root, folder);
    let manifest: { name?: string; publisher?: string };
    try {
      if (!(await stat(extDir)).isDirectory()) continue;
      manifest = (await readJsonc(join(extDir, "package.json"))) as typeof manifest;
    } catch {
      continue;
    }
    const themes = contributedThemes(manifest);
    const extension = manifest.publisher
      ? `${manifest.publisher}.${manifest.name}`
      : (manifest.name ?? folder);
    if (themes.length === 0 || seen.has(extension.toLowerCase())) continue;
    seen.add(extension.toLowerCase());
    for (const contributed of themes) {
      const file = resolve(extDir, contributed.path);
      if (!isInside(file, extDir) || ![".json", ".jsonc"].includes(extname(file).toLowerCase())) continue;
      const label = (await localise(contributed.label, extDir)) ?? contributed.id ?? basename(file);
      const id = `${kind}:${extension.toLowerCase()}/${slugify(contributed.id ?? label)}`;
      const source: ThemeSource =
        kind === "vscode" ? { kind, extension, file, installDir: root } : { kind, extension, file };
      entries.push({
        id,
        label,
        source,
        load: async () =>
          mapVsCodeTheme(await loadVsCodeFile(file, extDir), {
            id,
            label,
            source,
            uiTheme: contributed.uiTheme,
          }),
      });
    }
  }
  return entries.sort((a, b) => a.label.localeCompare(b.label));
}
