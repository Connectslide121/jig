import { type FSWatcher, watch } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { addonToolName, addonViewId, checkTokens, intervalMs, scopeLabel, uiExports } from "@jig/sdk";
import { z } from "zod";
import type { AddonCommit, AddonInfo } from "../../shared/addons";
import { JigError } from "../../shared/ipc";
import { publishActivity } from "../activity/bus";
import { logger } from "../log";
import { readJson, writeJson } from "../state/jsonStore";
import { bundleHost, bundleUi } from "./bundle";
import { type AddonRecord, readAddon, scanAddons } from "./catalog";
import { addonCss } from "./css";
import { AddonHostProcess, type HostChannelFactory, type RpcHandler } from "./hostProcess";
import { commitAll, ensureRepo, history, rollback } from "./repo";

const log = logger("addons");

const StateSchema = z.object({ disabled: z.array(z.string()).default([]) });

/** Git operations of the built-in Git add-on, recorded in the activity log. */
const GIT_OPERATIONS = new Set(
  ["commit", "push", "pull", "fetch", "switchBranch", "createBranch", "stage", "unstage", "discard"].map(
    (m) => `git:${m}`,
  ),
);

export interface AddonServiceOptions {
  builtinDir: string | undefined;
  userDir: string;
  cacheDir: string;
  dataDir: string;
  stateFile: string;
  /** Where @jig/sdk and friends resolve from when bundling host code. */
  nodePaths: string[];
  hostFactory: HostChannelFactory;
  /** Answers RPCs from host code that need the main process (notify, emit, projects). */
  rpc: (addonId: string) => RpcHandler;
  onChange: (addons: AddonInfo[]) => void;
  /** Safe mode (the launcher's last resort): your own add-ons stay off; built-ins still load. */
  safeMode?: boolean;
}

interface Loaded {
  record: AddonRecord;
  info: AddonInfo;
  ui?: { code: string; css: string; hash: string };
  host?: AddonHostProcess;
  timers: NodeJS.Timeout[];
}

/** Every add-on: discovery, validation, bundling, the host process, storage, watchers and history. */
export class AddonService {
  private loaded = new Map<string, Loaded>();
  private disabled = new Set<string>();
  private watchers: FSWatcher[] = [];
  private readonly reloadTimers = new Map<string, NodeJS.Timeout>();
  private hasRepo = false;
  /** Add-ons loaded from a build worktree instead of their live folder (id → preview). */
  private previews = new Map<string, { dir: string; buildId: string }>();

  constructor(private readonly options: AddonServiceOptions) {}

  async start(): Promise<void> {
    this.disabled = new Set((await readJson(this.options.stateFile, StateSchema)).disabled);
    this.hasRepo = await ensureRepo(this.options.userDir);
    await this.reloadAll();
  }

  list(): AddonInfo[] {
    return [...this.loaded.values()].map((l) => l.info);
  }

  get(id: string): Loaded {
    const loaded = this.loaded.get(id);
    if (!loaded) throw new JigError("not_found", `Add-on ${id} not found`);
    return loaded;
  }

  ui(id: string) {
    return this.loaded.get(id)?.ui;
  }

  get repoReady(): boolean {
    return this.hasRepo;
  }

  private async records(): Promise<AddonRecord[]> {
    const records = await scanAddons(this.options.builtinDir, this.options.userDir);
    for (const [id, preview] of this.previews) {
      const record = await readAddon(preview.dir, "user");
      if (!record) continue;
      const i = records.findIndex((r) => r.id === id);
      const marked = { ...record, id, preview: { buildId: preview.buildId } };
      if (i >= 0)
        records[i] = {
          ...marked,
          overridesBuiltin: records[i]!.source === "builtin" || records[i]!.overridesBuiltin,
        };
      else records.push(marked);
    }
    return records;
  }

  /** Shows an add-on from a build worktree (or stops, with `dir` undefined). */
  async setPreview(id: string, preview: { dir: string; buildId: string } | undefined): Promise<void> {
    if (preview) this.previews.set(id, preview);
    else this.previews.delete(id);
    await this.reload(id);
  }

  async reloadAll(): Promise<void> {
    const records = await this.records();
    const ids = new Set(records.map((r) => r.id));
    for (const [id, l] of this.loaded) if (!ids.has(id)) this.unload(l);
    for (const id of [...this.loaded.keys()]) if (!ids.has(id)) this.loaded.delete(id);
    await Promise.all(records.map((r) => this.load(r)));
    this.options.onChange(this.list());
  }

  /** Rebuilds one add-on (after a file change). */
  async reload(id: string): Promise<void> {
    const records = await this.records();
    const record = records.find((r) => r.id === id);
    const existing = this.loaded.get(id);
    if (!record) {
      if (existing) this.unload(existing);
      this.loaded.delete(id);
    } else await this.load(record);
    this.options.onChange(this.list());
  }

  private unload(l: Loaded) {
    for (const t of l.timers) clearInterval(t);
    l.timers = [];
    l.host?.stop();
  }

  private async load(record: AddonRecord): Promise<void> {
    const previous = this.loaded.get(record.id);
    if (previous) this.unload(previous);
    const enabled = !this.disabled.has(record.id) && !(this.options.safeMode && record.source === "user");
    const errors = [...record.errors];
    const warnings: string[] = [];
    const info: AddonInfo = {
      id: record.id,
      name: record.manifest?.name ?? record.id,
      description: record.manifest?.description ?? "",
      version: record.manifest?.version ?? "",
      source: record.source,
      overridesBuiltin: record.overridesBuiltin,
      preview: record.preview,
      dir: record.dir,
      enabled,
      manifest: record.manifest,
      errors,
      hasHost: Boolean(record.hostEntry),
      readme: record.readme,
    };
    const loaded: Loaded = { record, info, timers: [] };
    this.loaded.set(record.id, loaded);
    // A newer load of the same add-on (a file save, turning it on/off) replaces this one: stop here
    // after any await, so no host process or watcher timer is created for an entry nobody unloads.
    const stale = () => this.loaded.get(record.id) !== loaded;
    if (!record.manifest || errors.length > 0 || !enabled) return;
    const manifest = record.manifest;

    if (record.uiEntry) {
      const bundle = await bundleUi(record.uiEntry);
      if (stale()) return;
      if (bundle.errors.length) errors.push(...bundle.errors.map((e) => `ui: ${e}`));
      else {
        const sources = await Promise.all(bundle.inputs.map((f) => readFile(f, "utf8").catch(() => "")));
        for (const [i, source] of sources.entries()) {
          const file = relative(record.dir, bundle.inputs[i]!).split(sep).join("/");
          for (const v of checkTokens(source)) warnings.push(`${file}:${v.line}:${v.column} ${v.message}`);
        }
        const css = await addonCss(sources).catch((error: Error) => {
          warnings.push(`css: ${error.message}`);
          return "";
        });
        loaded.ui = { code: bundle.code!, css, hash: bundle.hash! };
        info.uiUrl = `jig-addon://${record.id}/ui.js?v=${bundle.hash}`;
        info.cssUrl = `jig-addon://${record.id}/ui.css?v=${bundle.hash}`;
      }
    } else if (uiExports(manifest).length > 0) {
      errors.push("addon.json refers to UI exports but there is no ui.tsx");
    }

    if (record.hostEntry) {
      const bundle = await bundleHost(record.hostEntry, this.options.nodePaths);
      if (stale()) return;
      if (bundle.errors.length) errors.push(...bundle.errors.map((e) => `host: ${e}`));
      else {
        const dir = join(this.options.cacheDir, "addons");
        await mkdir(dir, { recursive: true });
        const file = join(dir, `${record.id}-${bundle.hash}.mjs`);
        await writeFile(file, bundle.code!);
        // Earlier builds of this add-on's host code (a running host has already loaded its own).
        for (const old of await readdir(dir).catch(() => []))
          if (old.startsWith(`${record.id}-`) && old.endsWith(".mjs") && join(dir, old) !== file)
            await rm(join(dir, old), { force: true }).catch(() => {});
        const dataDir = join(this.options.dataDir, record.id);
        await mkdir(dataDir, { recursive: true });
        if (stale()) return;
        loaded.host = new AddonHostProcess(
          this.options.hostFactory,
          { addonId: record.id, dir: record.dir, dataDir, bundle: file, permissions: manifest.permissions },
          this.rpcFor(record.id),
        );
        for (const watcher of manifest.contributes.watchers) {
          // A run that takes longer than the interval isn't started again until it's done.
          let running = false;
          loaded.timers.push(
            setInterval(() => {
              if (running || !loaded.host) return;
              running = true;
              void loaded.host
                .call(watcher.run, {})
                .catch((error: Error) =>
                  log.warn(`Watcher ${record.id}/${watcher.id} failed: ${error.message}`),
                )
                .finally(() => {
                  running = false;
                });
            }, intervalMs(watcher.every)),
          );
        }
      }
    } else if (manifest.contributes.watchers.length > 0) {
      errors.push("addon.json has watchers but there is no host.ts");
    } else if (manifest.contributes.tools.length > 0) {
      errors.push("addon.json has tools for Claude but there is no host.ts");
    }
    if (warnings.length) info.warnings = warnings.slice(0, 50);
    if (errors.length) {
      this.unload(loaded);
      loaded.ui = undefined;
      info.uiUrl = undefined;
      info.cssUrl = undefined;
    }
  }

  private rpcFor(addonId: string): RpcHandler {
    const outer = this.options.rpc(addonId);
    return async (op, args) => {
      if (op === "storage.get") return this.storageGet(addonId, (args as { key: string }).key);
      if (op === "storage.set") {
        const { key, value } = args as { key: string; value: unknown };
        return this.storageSet(addonId, key, value);
      }
      return outer(op, args);
    };
  }

  async call(id: string, method: string, args: unknown): Promise<unknown> {
    const l = this.get(id);
    if (!l.info.enabled) throw new JigError("disabled", `${l.info.name} is switched off`);
    if (!l.host) throw new JigError("no_host", `${l.info.name} has no host code`);
    if (GIT_OPERATIONS.has(`${id}:${method}`))
      publishActivity({ kind: "git", text: `git ${method}`, detail: { addon: id } });
    try {
      return await l.host.call(method, args);
    } catch (error) {
      throw new JigError("addon_error", (error as Error).message);
    }
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    this.get(id);
    if (enabled) this.disabled.delete(id);
    else this.disabled.add(id);
    await writeJson(this.options.stateFile, { disabled: [...this.disabled] });
    await this.reload(id);
  }

  /** An add-on's storage file: only for add-ons Jig knows, so an id can't point anywhere else. */
  private storageFile(id: string) {
    if (!/^[a-z0-9][a-z0-9.-]*$/.test(id) || id.includes("..") || !this.loaded.has(id))
      throw new JigError("not_found", `Add-on ${id} not found`);
    return join(this.options.dataDir, `${id}.json`);
  }

  /** Storage reads and writes of one add-on run one after another, so quick sets don't lose keys. */
  private storageQueue = new Map<string, Promise<unknown>>();
  private inOrder<T>(id: string, work: () => Promise<T>): Promise<T> {
    const result = (this.storageQueue.get(id) ?? Promise.resolve()).then(work, work);
    this.storageQueue.set(
      id,
      result.catch(() => {}),
    );
    return result;
  }

  async storageGet(id: string, key: string): Promise<unknown> {
    const file = this.storageFile(id);
    return this.inOrder(id, async () => (await readJson(file, z.record(z.string(), z.unknown())))[key]);
  }

  /** Every key of an add-on's storage with its value (for Claude's add-on data tools). */
  async storageAll(id: string): Promise<Record<string, unknown>> {
    const file = this.storageFile(id);
    return this.inOrder(id, async () => readJson(file, z.record(z.string(), z.unknown())));
  }

  async storageDelete(id: string, key: string): Promise<void> {
    const file = this.storageFile(id);
    await this.inOrder(id, async () => {
      const data = await readJson(file, z.record(z.string(), z.unknown()));
      delete data[key];
      await writeJson(file, data);
    });
  }

  async storageSet(id: string, key: string, value: unknown): Promise<void> {
    const file = this.storageFile(id);
    await this.inOrder(id, async () => {
      const data = await readJson(file, z.record(z.string(), z.unknown()));
      data[key] = value;
      await writeJson(file, data);
    });
  }

  async history(id: string): Promise<AddonCommit[]> {
    const l = this.get(id);
    if (l.info.source !== "user" || !this.hasRepo) return [];
    return history(this.options.userDir, relative(this.options.userDir, l.info.dir).split(sep).join("/"));
  }

  async rollback(id: string, commit: string): Promise<void> {
    const l = this.get(id);
    if (l.info.source !== "user" || !this.hasRepo)
      throw new JigError("no_history", "Only your own add-ons have history");
    await rollback(
      this.options.userDir,
      relative(this.options.userDir, l.info.dir).split(sep).join("/"),
      commit,
    );
    await this.reload(id);
  }

  /**
   * Deletes one of your add-ons (D-122): its folder goes, recorded as a commit so it stays in the
   * repository's history; its stored data stays, so importing it again finds it. A built-in add-on
   * it replaced comes back. Built-in add-ons can only be turned off.
   */
  async remove(id: string): Promise<void> {
    const l = this.get(id);
    if (l.info.source !== "user" || l.info.preview)
      throw new JigError("not_yours", "Only your own add-ons can be deleted; turn this one off instead");
    this.unload(l);
    await rm(l.info.dir, { recursive: true, force: true, maxRetries: 5 });
    if (this.hasRepo)
      await commitAll(
        this.options.userDir,
        `Delete ${l.info.name}`,
        relative(this.options.userDir, l.info.dir).split(sep).join("/"),
      );
    await this.reload(id);
  }

  /** Records the current state of an add-on folder in the history (used by the builder on Accept). */
  async commit(id: string, message: string): Promise<string | undefined> {
    const l = this.get(id);
    if (!this.hasRepo || l.info.source !== "user") return undefined;
    return commitAll(
      this.options.userDir,
      message,
      relative(this.options.userDir, l.info.dir).split(sep).join("/"),
    );
  }

  /** Watches add-on folders and reloads an add-on when its files change. */
  watchFiles(): void {
    const roots = [this.options.userDir, this.options.builtinDir].filter((d): d is string => Boolean(d));
    const timers = this.reloadTimers;
    for (const root of roots) {
      try {
        this.watchers.push(
          watch(root, { recursive: true }, (_event, file) => {
            if (!file) return;
            const folder = String(file).split(/[\\/]/)[0];
            if (!folder || folder.startsWith(".") || folder === "node_modules") return;
            const id = [...this.loaded.values()].find((l) => l.info.dir === join(root, folder))?.info.id;
            const key = id ?? `new:${folder}`;
            clearTimeout(timers.get(key));
            timers.set(
              key,
              setTimeout(() => {
                timers.delete(key);
                void (id ? this.reload(id) : this.reloadAll()).catch((error) =>
                  log.error("Reload failed", error),
                );
              }, 200),
            );
          }),
        );
      } catch (error) {
        log.warn(`Can't watch ${root}; add-on changes apply after a restart`, error);
      }
    }
  }

  /** A text catalog of the add-ons for Claude (jig_list_addons) and the builder. */
  catalog(): string {
    const lines: string[] = [];
    for (const { info } of this.loaded.values()) {
      const c = info.manifest?.contributes;
      const parts = c
        ? [
            ...c.views.map((v) => `view "${v.title}" (${addonViewId(info.id, v.id)})`),
            ...c.tabs.map((t) => `tab "${t.title}"`),
            ...c.actions.map((a) => `Tools action "${a.title}"`),
            ...c.menus.map((m) => `${m.slot} menu "${m.title}"`),
            ...c.statusbar.map(() => "status bar item"),
            ...c.dashboard.map(() => "dashboard widget"),
            ...c.watchers.map((w) => `watcher every ${w.every}`),
            ...c.tools.map((t) => `Claude tool ${addonToolName(info.id, t.id)}`),
            ...(c.settings ? ["settings page"] : []),
          ]
        : [];
      lines.push(
        `- ${info.id} — ${info.name} (${info.source}${info.enabled ? "" : ", switched off"}): ${info.description}` +
          (parts.length ? `\n  Contributes: ${parts.join(", ")}` : "") +
          (info.manifest?.permissions.length
            ? `\n  Permissions: ${info.manifest.permissions.join(", ")}`
            : "") +
          (info.manifest?.storage?.scope && info.manifest.storage.scope !== "global"
            ? `\n  Data: ${scopeLabel(info.manifest.storage.scope)}`
            : ""),
      );
    }
    return lines.length ? lines.join("\n") : "No add-ons are installed.";
  }

  stop(): void {
    for (const w of this.watchers) w.close();
    for (const t of this.reloadTimers.values()) clearTimeout(t);
    this.reloadTimers.clear();
    for (const l of this.loaded.values()) this.unload(l);
  }
}
