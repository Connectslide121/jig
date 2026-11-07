import { execFile, spawn } from "node:child_process";
import { type FSWatcher, watch } from "node:fs";
import { access, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_TENANT_REF } from "@jig/azure";
import { type AddonHostApi, allowsExec, scopedKey } from "@jig/sdk";
import type { AzureContext } from "../azure/env";
import { runAz } from "../azure/run";
import { resolveCommand } from "./winCommand";

/**
 * Runs inside an add-on's own process (Electron utilityProcess, D-017). It loads the bundled host
 * code and answers calls from the main process. The API checks the manifest's permissions; things
 * only the main process can do (storage, notifications, events, projects) are forwarded to it.
 *
 * Messages, main → here: init, call, rpcResult. Here → main: ready, result, rpc.
 */
export type ToHost =
  | {
      t: "init";
      addonId: string;
      dir: string;
      dataDir: string;
      bundle: string;
      permissions: string[];
      /**
       * The active Azure tenant (D-282): its environment is added to every program the add-on runs,
       * and `api.azure` names it.
       */
      azure?: AzureContext;
    }
  /** The active Azure tenant changed: programs started from now on use it. */
  | { t: "azure"; azure: AzureContext }
  | { t: "call"; id: number; method: string; args: unknown }
  | { t: "rpcResult"; id: number; ok: boolean; value?: unknown; error?: string };

export type FromHost =
  | { t: "ready"; exports: string[] }
  | { t: "initError"; error: string }
  | { t: "result"; id: number; ok: boolean; value?: unknown; error?: string }
  | {
      t: "rpc";
      id: number;
      op:
        | "storage.get"
        | "storage.set"
        | "notify"
        | "emit"
        | "config"
        | "projects"
        | "workspaces"
        | "log"
        | "chats.create"
        | "chats.send"
        | "chats.get"
        | "chats.list"
        | "chats.timeline"
        | "attachments.remove"
        | "setBadge"
        | "addons.list"
        | "addons.call"
        | "meetings.recent"
        | "speech.say"
        | "capture.record";
      args: unknown;
    };

class PermissionError extends Error {}

export function createHostRuntime(send: (message: FromHost) => void) {
  let module: Record<string, unknown> = {};
  let api: AddonHostApi | undefined;
  let rpcId = 0;
  /** The active Azure tenant and its `AZURE_CONFIG_DIR` (empty for your own az login), D-282. */
  let azure: AzureContext = { env: {}, tenant: DEFAULT_TENANT_REF };
  /**
   * Every tenant that has been active in this process, by key: an operation that pins the tenant it
   * started with (`az(args, { tenant })`) keeps running there after a switch (D-345).
   */
  const tenants = new Map<string, AzureContext>([[azure.tenant.key, azure]]);
  const setAzure = (next: AzureContext) => {
    azure = next;
    tenants.set(next.tenant.key, next);
  };
  /** Open file watchers (they end with the process, which stops when the add-on reloads). */
  const watchers = new Set<FSWatcher>();
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  const rpc = (op: Extract<FromHost, { t: "rpc" }>["op"], args: unknown) =>
    new Promise<unknown>((resolve, reject) => {
      const id = ++rpcId;
      pending.set(id, { resolve, reject });
      send({ t: "rpc", id, op, args });
    });

  function makeApi(init: Extract<ToHost, { t: "init" }>): AddonHostApi {
    const has = (p: string) => init.permissions.includes(p);
    const need = (p: string) => {
      if (!has(p)) throw new PermissionError(`This add-on needs the "${p}" permission in addon.json`);
    };
    return {
      addon: { id: init.addonId, dir: init.dir, dataDir: init.dataDir },
      exec(command, args, options = {}) {
        if (!allowsExec(init.permissions, command))
          return Promise.reject(
            new PermissionError(`This add-on needs "exec:${command}" (or "exec") in addon.json`),
          );
        const resolved = resolveCommand(command, args, process.platform, process.env);
        return new Promise((resolve) => {
          const child = execFile(
            resolved.file,
            resolved.args,
            {
              windowsVerbatimArguments: resolved.verbatim,
              cwd: options.cwd,
              timeout: options.timeoutMs ?? 120_000,
              maxBuffer: 64 * 1024 * 1024,
              windowsHide: true,
              env: { ...process.env, ...azure.env, ...options.env },
              encoding: "buffer",
            },
            (error, stdout, stderr) => {
              const code =
                error && typeof (error as NodeJS.ErrnoException).code === "number"
                  ? Number((error as NodeJS.ErrnoException).code)
                  : error
                    ? (error as { code?: unknown }).code === "ENOENT"
                      ? 127
                      : 1
                    : 0;
              resolve({
                code,
                stdout: Buffer.from(stdout ?? "").toString(options.encoding === "base64" ? "base64" : "utf8"),
                stderr:
                  Buffer.from(stderr ?? "").toString("utf8") ||
                  (error && code === 127 ? `${command} not found` : ""),
              });
            },
          );
          if (options.input !== undefined) {
            child.stdin?.end(options.input);
          }
        });
      },
      azure: {
        tenant: () => azure.tenant,
        az(args, options = {}) {
          if (!allowsExec(init.permissions, "az"))
            return Promise.reject(
              new PermissionError('This add-on needs "exec:az" (or "exec") in addon.json'),
            );
          const context = options.tenant === undefined ? azure : tenants.get(options.tenant);
          if (!context)
            return Promise.reject(
              new Error(`The Azure tenant "${options.tenant}" isn't known to Jig (any more).`),
            );
          return runAz(args, { env: context.env, tenant: context.tenant, timeoutMs: options.timeoutMs });
        },
      },
      fs: {
        readFile: async (path, encoding = "utf8") => {
          need("fs:read");
          return readFile(path, encoding === "base64" ? "base64" : "utf8");
        },
        writeFile: async (path, content) => {
          need("fs:write");
          await writeFile(path, content, "utf8");
        },
        readdir: async (path) => {
          need("fs:read");
          return readdir(path);
        },
        exists: async (path) => {
          need("fs:read");
          return access(path).then(
            () => true,
            () => false,
          );
        },
        watch: (path, listener, options = {}) => {
          need("fs:read");
          const ignore = options.ignore ?? ["node_modules", ".git"];
          const changed = new Set<string>();
          let timer: NodeJS.Timeout | undefined;
          const watcher = watch(path, { recursive: options.recursive ?? false }, (_event, file) => {
            const rel = file ? String(file) : "";
            if (rel.split(/[\\/]/).some((part) => ignore.includes(part))) return;
            changed.add(rel ? join(path, rel) : path);
            clearTimeout(timer);
            timer = setTimeout(() => {
              const list = [...changed];
              changed.clear();
              listener(list);
            }, options.debounceMs ?? 200);
          });
          watcher.on("error", () => {});
          watchers.add(watcher);
          return () => {
            clearTimeout(timer);
            watcher.close();
            watchers.delete(watcher);
          };
        },
      },
      spawn(command, args, options = {}) {
        if (!allowsExec(init.permissions, command))
          throw new PermissionError(`This add-on needs "exec:${command}" (or "exec") in addon.json`);
        const resolved = resolveCommand(command, args, process.platform, process.env);
        const child = spawn(resolved.file, resolved.args, {
          windowsVerbatimArguments: resolved.verbatim,
          cwd: options.cwd,
          windowsHide: true,
          env: { ...process.env, ...azure.env, ...options.env },
        });
        child.stdout?.setEncoding("utf8");
        child.stderr?.setEncoding("utf8");
        child.stdout?.on("data", (text: string) => options.onOutput?.(text, "stdout"));
        child.stderr?.on("data", (text: string) => options.onOutput?.(text, "stderr"));
        const done = new Promise<{ code: number }>((resolve) => {
          child.on("error", (error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") options.onOutput?.(`${command} not found\n`, "stderr");
            resolve({ code: error.code === "ENOENT" ? 127 : 1 });
          });
          child.on("close", (code) => resolve({ code: code ?? 1 }));
        });
        child.stdin?.on("error", () => {});
        return {
          pid: child.pid,
          write: (text) => void child.stdin?.write(text),
          end: () => void child.stdin?.end(),
          kill: () => void child.kill(),
          done,
        };
      },
      fetch: async (url, init2) => {
        need("net");
        return fetch(url, init2);
      },
      storage: {
        get: (key, options) =>
          rpc("storage.get", {
            key: scopedKey(options?.scope ?? "global", options?.id, key),
          }) as Promise<never>,
        set: async (key, value, options) => {
          await rpc("storage.set", { key: scopedKey(options?.scope ?? "global", options?.id, key), value });
        },
      },
      notify: (input) => void rpc("notify", input),
      setBadge: (viewId, value) => void rpc("setBadge", { view: viewId, value }),
      addons: {
        list: () => rpc("addons.list", {}) as Promise<never>,
        call: (addonId, method, args) => rpc("addons.call", { id: addonId, method, args }) as Promise<never>,
      },
      emit: (topic, payload) => void rpc("emit", { topic, payload }),
      config: () => rpc("config", {}) as Promise<never>,
      meetings: {
        recent: async (options) => {
          need("meetings:read");
          return rpc("meetings.recent", options ?? {}) as Promise<never>;
        },
      },
      speech: {
        say: async (input) => {
          need("speech");
          return rpc("speech.say", input) as Promise<never>;
        },
      },
      capture: {
        record: async (input) => {
          need("capture");
          return rpc("capture.record", input) as Promise<never>;
        },
      },
      projects: () => rpc("projects", {}) as Promise<never>,
      workspaces: () => rpc("workspaces", {}) as Promise<never>,
      chats: {
        create: async (input) => {
          need("chat");
          return rpc("chats.create", input) as Promise<never>;
        },
        send: async (input) => {
          need("chat");
          return rpc("chats.send", input) as Promise<never>;
        },
        get: async (sessionId) => {
          need("chat");
          return rpc("chats.get", { sessionId }) as Promise<never>;
        },
        list: async (filter) => {
          if (!has("chat:read") && !has("chat")) need("chat:read");
          return rpc("chats.list", filter ?? {}) as Promise<never>;
        },
        timeline: async (sessionId) => {
          if (!has("chat:read") && !has("chat")) need("chat:read");
          return rpc("chats.timeline", { sessionId }) as Promise<never>;
        },
      },
      attachments: {
        remove: async (list) => {
          await rpc("attachments.remove", { attachments: list });
        },
      },
      log: (message, detail) => void rpc("log", { message, detail }),
    };
  }

  async function handle(message: ToHost): Promise<void> {
    if (message.t === "azure") {
      setAzure(message.azure);
    } else if (message.t === "init") {
      setAzure(message.azure ?? azure);
      try {
        api = makeApi(message);
        module = (await import(`${pathToFileURL(message.bundle).href}?t=${Date.now()}`)) as Record<
          string,
          unknown
        >;
        if (typeof module.activate === "function")
          await (module.activate as (a: AddonHostApi) => unknown)(api);
        send({ t: "ready", exports: Object.keys(module).filter((k) => typeof module[k] === "function") });
      } catch (error) {
        send({ t: "initError", error: (error as Error).stack ?? String(error) });
      }
    } else if (message.t === "call") {
      const fn = module[message.method];
      if (typeof fn !== "function" || message.method === "activate") {
        send({
          t: "result",
          id: message.id,
          ok: false,
          error: `host.ts has no export named "${message.method}"`,
        });
        return;
      }
      try {
        const value = await (fn as (args: unknown, api: AddonHostApi) => unknown)(message.args, api!);
        send({ t: "result", id: message.id, ok: true, value });
      } catch (error) {
        send({ t: "result", id: message.id, ok: false, error: (error as Error).message ?? String(error) });
      }
    } else if (message.t === "rpcResult") {
      const waiter = pending.get(message.id);
      pending.delete(message.id);
      if (!waiter) return;
      if (message.ok) waiter.resolve(message.value);
      else waiter.reject(new Error(message.error));
    }
  }

  return { handle };
}
