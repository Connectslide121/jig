import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { contributedIconThemes, type FileIconTheme, iconThemeSetting, parseJsonc } from "@jig/themes";
import { JigError } from "../../shared/ipc";
import type { FileIconThemeData, FileIconThemeList, FileIconThemeSummary } from "../../shared/themes";
import { logger } from "../log";
import { isInside } from "./sources";

const log = logger("file-icons");

/** File types an icon theme may serve through `jig-icons:`. */
export const ICON_FILE_TYPES: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

/** Where VS Code-family editors keep the user's settings.json. */
export function vscodeSettingsFiles(home = homedir(), env = process.env): string[] {
  const apps = ["Code", "Code - Insiders", "Cursor", "VSCodium", "Windsurf"];
  const base =
    process.platform === "win32"
      ? (env.APPDATA ?? join(home, "AppData", "Roaming"))
      : process.platform === "darwin"
        ? join(home, "Library", "Application Support")
        : (env.XDG_CONFIG_HOME ?? join(home, ".config"));
  return apps.map((app) => join(base, app, "User", "settings.json"));
}

interface Entry extends FileIconThemeSummary {
  file: string;
  extDir: string;
}

export interface FileIconServiceOptions {
  extensionDirs: string[];
  openVsxDir: string;
  settingsFiles: string[];
}

/**
 * File icon themes from editor installs and Open VSX. Loading a theme registers its extension folder
 * under a short key, so `jig-icons://<key>/<path>` can serve its icons and fonts — and nothing else.
 * Nothing from an extension is executed.
 */
export class FileIconService {
  private entries: Map<string, Entry> | undefined;
  private loaded = new Map<string, FileIconThemeData>();
  private roots = new Map<string, string>();

  constructor(private readonly options: FileIconServiceOptions) {}

  invalidate(): void {
    this.entries = undefined;
    this.loaded.clear();
  }

  private async scanDir(root: string, source: Entry["source"]): Promise<Entry[]> {
    let folders: string[];
    try {
      folders = await readdir(root);
    } catch {
      return [];
    }
    folders.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    const out: Entry[] = [];
    const seen = new Set<string>();
    for (const folder of folders) {
      const extDir = join(root, folder);
      let manifest: { name?: string; publisher?: string; displayName?: string };
      try {
        if (!(await stat(extDir)).isDirectory()) continue;
        manifest = parseJsonc(await readFile(join(extDir, "package.json"), "utf8")) as typeof manifest;
      } catch {
        continue;
      }
      const themes = contributedIconThemes(manifest);
      const extension = manifest.publisher
        ? `${manifest.publisher}.${manifest.name}`
        : (manifest.name ?? folder);
      if (themes.length === 0 || seen.has(extension.toLowerCase())) continue;
      seen.add(extension.toLowerCase());
      for (const t of themes) {
        const file = resolve(extDir, t.path);
        if (!isInside(file, extDir)) continue;
        const label = (await localise(t.label, extDir)) ?? t.id;
        out.push({
          id: `${source}:${extension.toLowerCase()}/${t.id}`,
          label,
          source,
          extension,
          themeId: t.id,
          file,
          extDir,
        });
      }
    }
    return out;
  }

  private async scan(): Promise<Map<string, Entry>> {
    if (this.entries) return this.entries;
    const groups = await Promise.all([
      this.scanDir(this.options.openVsxDir, "openvsx"),
      ...this.options.extensionDirs.map((d) => this.scanDir(d, "vscode")),
    ]);
    const map = new Map<string, Entry>();
    for (const e of groups.flat()) if (!map.has(e.id)) map.set(e.id, e);
    this.entries = map;
    return map;
  }

  /** VS Code's `workbench.iconTheme` (Seti when VS Code has settings but none is set). */
  async vscodeSetting(): Promise<string | undefined> {
    for (const file of this.options.settingsFiles) {
      try {
        const value = iconThemeSetting(parseJsonc(await readFile(file, "utf8")));
        return value === undefined ? "vs-seti" : value;
      } catch {
        // Not there, or not readable.
      }
    }
    return undefined;
  }

  async list(): Promise<FileIconThemeList> {
    const entries = [...(await this.scan()).values()].sort((a, b) => a.label.localeCompare(b.label));
    const vscodeSetting = await this.vscodeSetting();
    const match = vscodeSetting
      ? (entries.find((e) => e.themeId === vscodeSetting && e.source === "vscode") ??
        entries.find((e) => e.themeId === vscodeSetting))
      : undefined;
    return {
      themes: entries.map(({ file: _f, extDir: _d, ...summary }) => summary),
      vscodeSetting,
      vscodeMatch: match?.id,
    };
  }

  /** The theme chosen in Settings: `jig` (Jig's own icons), `vscode` (same as VS Code) or a theme id. */
  async active(choice: string): Promise<FileIconThemeData | null> {
    if (choice === "jig" || !choice) return null;
    const id = choice === "vscode" ? (await this.list()).vscodeMatch : choice;
    if (!id) return null;
    try {
      return await this.get(id);
    } catch (error) {
      log.warn(`File icon theme ${id} could not be loaded`, error);
      return null;
    }
  }

  async get(id: string): Promise<FileIconThemeData> {
    const cached = this.loaded.get(id);
    if (cached) return cached;
    const entry = (await this.scan()).get(id);
    if (!entry) throw new JigError("not_found", `File icon theme ${id} not found`);
    const theme = parseJsonc(await readFile(entry.file, "utf8")) as FileIconTheme;
    if (!theme || typeof theme.iconDefinitions !== "object")
      throw new JigError("invalid_theme", `${entry.label} has no icon definitions`);
    const key = createHash("sha256").update(entry.extDir).digest("hex").slice(0, 16);
    this.roots.set(key, entry.extDir);
    const url = (path: string) => {
      const target = resolve(dirname(entry.file), path);
      if (!isInside(target, entry.extDir) || !ICON_FILE_TYPES[extname(target).toLowerCase()])
        return undefined;
      return `jig-icons://${key}/${relative(entry.extDir, target).split(sep).map(encodeURIComponent).join("/")}`;
    };
    const definitions: FileIconTheme["iconDefinitions"] = {};
    for (const [name, def] of Object.entries(theme.iconDefinitions)) {
      if (def.iconPath) {
        const iconPath = url(def.iconPath);
        if (iconPath) definitions[name] = { iconPath };
      } else if (def.fontCharacter) definitions[name] = { ...def };
    }
    const fonts = (theme.fonts ?? [])
      .map((f) => ({
        ...f,
        src: f.src.map((s) => ({ ...s, path: url(s.path) ?? "" })).filter((s) => s.path),
      }))
      .filter((f) => f.src.length > 0);
    const data: FileIconThemeData = {
      id,
      label: entry.label,
      theme: { ...theme, iconDefinitions: definitions, fonts },
    };
    this.loaded.set(id, data);
    return data;
  }

  /** The file behind a `jig-icons:` URL, or undefined if it isn't an icon or font of a loaded theme. */
  resolveUrl(url: string): string | undefined {
    const parsed = new URL(url);
    const root = this.roots.get(parsed.hostname);
    if (!root) return undefined;
    const path = resolve(root, ...decodeURIComponent(parsed.pathname).split("/").filter(Boolean));
    if (!isInside(path, root) || !ICON_FILE_TYPES[extname(path).toLowerCase()]) return undefined;
    return path;
  }
}

async function localise(label: string | undefined, extDir: string): Promise<string | undefined> {
  const key = /^%(.+)%$/.exec(label ?? "")?.[1];
  if (!key) return label;
  try {
    const nls = parseJsonc(await readFile(join(extDir, "package.nls.json"), "utf8")) as Record<
      string,
      unknown
    >;
    const value = nls[key];
    return typeof value === "string" ? value : ((value as { message?: string })?.message ?? label);
  } catch {
    return label;
  }
}
