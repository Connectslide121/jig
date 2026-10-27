import { type FSWatcher, watch } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { type JigTheme, summarize, type ThemeSummary } from "@jig/themes";
import { JigError } from "../../shared/ipc";
import { logger } from "../log";
import { type Fetch, installOpenVsx, searchOpenVsx } from "./openvsx";
import { builtinEntries, extensionEntries, isInside, type ThemeEntry, userEntries } from "./sources";

const log = logger("themes");

export interface ThemeServiceOptions {
  /** `~/.jig/themes` */
  themesDir: string;
  /** Editor extension folders to scan (see `vscodeExtensionDirs`). */
  extensionDirs: string[];
  fetch?: Fetch;
  /** More themes, e.g. contributed by add-ons. */
  extra?: () => Promise<ThemeEntry[]>;
}

/**
 * Lists and loads themes from every source, caches loaded themes, and watches `~/.jig/themes` so a
 * saved theme file re-applies immediately. Duplicate ids (the same extension installed in two
 * editors) keep the first one found.
 */
export class ThemeService {
  private entries: Map<string, ThemeEntry> | undefined;
  private loaded = new Map<string, JigTheme>();
  private watcher: FSWatcher | undefined;
  private listeners = new Set<(changedIds: string[] | "all") => void>();

  constructor(private readonly options: ThemeServiceOptions) {}

  get openVsxDir(): string {
    return join(this.options.themesDir, "openvsx");
  }

  private async scan(): Promise<Map<string, ThemeEntry>> {
    if (this.entries) return this.entries;
    const groups = await Promise.all([
      builtinEntries(),
      userEntries(this.options.themesDir),
      extensionEntries(this.openVsxDir, "openvsx"),
      ...this.options.extensionDirs.map((dir) => extensionEntries(dir, "vscode")),
      this.options.extra?.() ?? Promise.resolve([]),
    ]);
    const map = new Map<string, ThemeEntry>();
    for (const entry of groups.flat()) if (!map.has(entry.id)) map.set(entry.id, entry);
    this.entries = map;
    return map;
  }

  /** Forgets everything and tells listeners (e.g. an add-on with themes changed). */
  refresh(): void {
    this.invalidate();
    this.notify("all");
  }

  /** Forgets everything; the next call rescans. */
  invalidate(): void {
    this.entries = undefined;
    this.loaded.clear();
  }

  async list(): Promise<ThemeSummary[]> {
    const entries = [...(await this.scan()).values()];
    const out = await Promise.all(
      entries.map(async (entry) => {
        try {
          return summarize(await this.get(entry.id));
        } catch (error) {
          log.warn(`Theme ${entry.id} could not be loaded`, error);
          return undefined;
        }
      }),
    );
    return out.filter((s): s is ThemeSummary => s !== undefined);
  }

  async get(id: string): Promise<JigTheme> {
    const cached = this.loaded.get(id);
    if (cached) return cached;
    const entry = (await this.scan()).get(id);
    if (!entry) throw new JigError("not_found", `Theme ${id} not found`);
    try {
      const theme = await entry.load();
      this.loaded.set(id, theme);
      return theme;
    } catch (error) {
      throw new JigError(
        "invalid_theme",
        `Theme ${entry.label} could not be read: ${(error as Error).message}`,
      );
    }
  }

  searchOpenVsx(query: string) {
    return searchOpenVsx(query, this.options.fetch);
  }

  /** Installs an Open VSX extension and returns the themes it adds. */
  async installOpenVsx(namespace: string, name: string): Promise<ThemeSummary[]> {
    await mkdir(this.openVsxDir, { recursive: true });
    await installOpenVsx(namespace, name, this.openVsxDir, this.options.fetch);
    this.invalidate();
    const extension = `${namespace}.${name}`.toLowerCase();
    const added = (await this.list()).filter((s) => s.id.startsWith(`openvsx:${extension}/`));
    this.notify("all");
    return added;
  }

  /** Removes a user theme file or an Open VSX install. Built-in and editor themes can't be removed. */
  async remove(id: string): Promise<void> {
    const entry = (await this.scan()).get(id);
    if (!entry) throw new JigError("not_found", `Theme ${id} not found`);
    if (entry.source.kind === "user") await rm(entry.source.file, { force: true });
    else if (entry.source.kind === "openvsx") {
      const dir = join(this.openVsxDir, entry.source.extension);
      if (!isInside(dir, this.openVsxDir)) throw new JigError("invalid_args", "Bad theme path");
      await rm(dir, { recursive: true, force: true });
    } else throw new JigError("not_removable", "Only your own and Open VSX themes can be removed");
    this.invalidate();
    this.notify("all");
  }

  onChange(listener: (changedIds: string[] | "all") => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(changed: string[] | "all") {
    for (const listener of this.listeners) listener(changed);
  }

  /** Watches `~/.jig/themes`; changes are debounced and reported as "all" (a rescan). */
  async watch(): Promise<void> {
    await mkdir(this.options.themesDir, { recursive: true });
    let timer: NodeJS.Timeout | undefined;
    try {
      this.watcher = watch(this.options.themesDir, { recursive: true }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          this.invalidate();
          this.notify("all");
        }, 150);
      });
    } catch (error) {
      log.warn("Theme folder can't be watched; changes apply after a restart", error);
    }
  }

  close(): void {
    this.watcher?.close();
  }
}
