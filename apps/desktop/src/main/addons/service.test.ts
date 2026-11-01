import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import type { AddonInfo } from "../../shared/addons";
import { setTokensFile } from "./css";
import type { HostChannel } from "./hostProcess";
import { createHostRuntime, type FromHost } from "./hostRuntime";
import { AddonService } from "./service";

setTokensFile(fileURLToPath(new URL("../../renderer/styles/tokens.css", import.meta.url)));

/** Runs host code in-process instead of a utilityProcess. */
const inProcess = (): HostChannel => {
  const listeners: Array<(m: FromHost) => void> = [];
  const runtime = createHostRuntime((m) =>
    queueMicrotask(() => {
      for (const l of listeners) l(m);
    }),
  );
  return {
    send: (m) => void runtime.handle(m),
    onMessage: (l) => listeners.push(l),
    onExit: () => {},
    kill: () => {},
  };
};

let root: string;
let changes: AddonInfo[][];
let rpcs: string[];

async function addon(dir: string, files: Record<string, unknown>) {
  await mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(files))
    await writeFile(join(dir, name), typeof content === "string" ? content : JSON.stringify(content));
}

function service() {
  return new AddonService({
    builtinDir: join(root, "builtin"),
    userDir: join(root, "home", "addons"),
    cacheDir: join(root, "home", "cache"),
    dataDir: join(root, "home", "addon-data"),
    stateFile: join(root, "home", "addons-state.json"),
    nodePaths: [],
    hostFactory: inProcess,
    rpc: () => async (op) => {
      rpcs.push(op);
      return op === "projects" ? [] : undefined;
    },
    onChange: (list) => changes.push(list),
  });
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "jig-addon-svc-"));
  process.env.JIG_HOME = join(root, "home");
  changes = [];
  rpcs = [];
  await addon(join(root, "builtin", "hello"), {
    "addon.json": {
      id: "hello",
      name: "Hello",
      description: "Says hello",
      permissions: ["exec:node"],
      contributes: {
        views: [{ id: "main", title: "Hello", component: "HelloView" }],
        actions: [{ id: "greet", title: "Greet", run: "greet" }],
      },
    },
    "ui.tsx": `export function HelloView() { return <div className="p-2 bg-surface">Hi</div>; }\nexport function greet() {}\n`,
    "host.ts": `export async function ping(args: { n: number }) { return args.n * 2; }\nexport async function emitIt(_: unknown, api: any) { api.emit("x", 1); return true; }\nexport async function bytes(_: unknown, api: any) { return (await api.exec("node", ["-e", "process.stdout.write(Buffer.from([0, 255, 1]))"], { encoding: "base64" })).stdout; }`,
  });
});

describe("AddonService", () => {
  it("loads built-in add-ons: UI bundle, CSS, host calls", async () => {
    const s = service();
    await s.start();
    const [hello] = s.list();
    expect(hello).toMatchObject({ id: "hello", source: "builtin", enabled: true, errors: [], hasHost: true });
    expect(hello?.uiUrl).toMatch(/^jig-addon:\/\/hello\/ui\.js\?v=[0-9a-f]{16}$/);
    expect(s.ui("hello")?.css).toContain(".bg-surface");
    expect(await s.call("hello", "ping", { n: 21 })).toBe(42);
    expect(await s.call("hello", "emitIt", {})).toBe(true);
    // Binary output survives as base64 (images from git show).
    expect(await s.call("hello", "bytes", {})).toBe("AP8B");
    expect(rpcs).toEqual(["emit"]);
    await expect(s.call("hello", "nope", {})).rejects.toMatchObject({ code: "addon_error" });
    expect(s.catalog()).toContain("hello — Hello (builtin): Says hello");
    expect(s.catalog()).toContain('view "Hello" (addon.hello.main)');
    s.stop();
  });

  it("runs event handlers, asks search providers, and lets add-ons call shared methods", async () => {
    await addon(join(root, "builtin", "board"), {
      "addon.json": {
        id: "board",
        name: "Board",
        description: "Work items",
        exports: ["cards"],
        contributes: {
          views: [{ id: "cards", title: "Cards", component: "Cards" }],
          events: [{ on: "chat.finished", run: "chatFinished" }],
          search: [
            { id: "cards", title: "Work items", icon: "kanban", run: "find" },
            { id: "slow", title: "Slow", run: "slow" },
          ],
        },
      },
      "README.md": "# Board\n\nShows your **work items** as cards ([docs](https://example.com)).\n\nMore.",
      "ui.tsx": `export function Cards() { return <div className="p-2">Cards</div>; }\n`,
      "host.ts": `export async function chatFinished(p: { title: string }, api: any) { api.emit("done", p.title); }
export async function find(q: { query: string }) { return [{ id: "1", label: "Card " + q.query, open: { view: "cards" } }, { id: "bad" }]; }
export async function slow() { await new Promise((r) => setTimeout(r, 500)); return [{ id: "2", label: "Late", open: { url: "https://x" } }]; }
export async function cards() { return ["A"]; }
export async function secret() { return "no"; }`,
    });
    const s = service();
    await s.start();
    s.dispatchEvent("chat.finished", { title: "Fix the cart" });
    s.dispatchEvent("git.commit", { repo: "/r" });
    await expect.poll(() => rpcs.filter((r) => r === "emit").length).toBe(1);

    expect(await s.search({ query: "42" }, 200)).toEqual([
      {
        addonId: "board",
        provider: "cards",
        title: "Work items",
        icon: "kanban",
        results: [{ id: "1", label: "Card 42", open: { view: "cards" } }],
      },
    ]);

    expect(await s.callShared("hello", "board", "cards", {})).toEqual(["A"]);
    await expect(s.callShared("hello", "board", "secret", {})).rejects.toMatchObject({ code: "not_shared" });
    expect(await s.callShared("board", "board", "secret", {})).toBe("no");
    expect(s.shared().find((a) => a.id === "board")).toEqual({
      id: "board",
      name: "Board",
      enabled: true,
      exports: ["cards"],
    });

    const catalog = s.catalog();
    expect(catalog).toContain("runs on chat.finished");
    expect(catalog).toContain('search results "Work items"');
    expect(catalog).toContain("shares cards with other add-ons");
    expect(catalog).toContain("Purpose: Shows your work items as cards (docs).");
    s.stop();
  });

  it("runs an atStart watcher shortly after loading, not only after its interval", async () => {
    await addon(join(root, "builtin", "warm"), {
      "addon.json": {
        id: "warm",
        name: "Warm",
        description: "Warms a cache",
        contributes: { watchers: [{ id: "w", every: "1h", run: "warm", atStart: true }] },
      },
      "host.ts": `export async function warm(_: unknown, api: any) { api.emit("warmed", 1); }`,
    });
    const s = service();
    await s.start();
    await expect.poll(() => rpcs.includes("emit"), { timeout: 8_000 }).toBe(true);
    s.stop();
  }, 10_000);

  it("switches add-ons off and on, and remembers it", async () => {
    const s = service();
    await s.start();
    await s.setEnabled("hello", false);
    expect(s.list()[0]?.enabled).toBe(false);
    expect(s.list()[0]?.uiUrl).toBeUndefined();
    await expect(s.call("hello", "ping", {})).rejects.toMatchObject({ code: "disabled" });
    const again = service();
    await again.start();
    expect(again.list()[0]?.enabled).toBe(false);
    await again.setEnabled("hello", true);
    expect(again.list()[0]?.uiUrl).toBeDefined();
    s.stop();
    again.stop();
  });

  it("reports build errors and token warnings without crashing", async () => {
    await addon(join(root, "home", "addons", "broken"), {
      "addon.json": {
        id: "broken",
        name: "Broken",
        contributes: { views: [{ id: "v", title: "V", component: "V" }] },
      },
      "ui.tsx": `export const V = () => <div className="text-red-500">;`,
    });
    await addon(join(root, "home", "addons", "colours"), {
      "addon.json": { id: "colours", name: "Colours" },
      "ui.tsx": `export const V = () => <div style={{ color: "#ff0000" }} />;`,
    });
    await addon(join(root, "home", "addons", "noui"), {
      "addon.json": {
        id: "noui",
        name: "No UI",
        contributes: { views: [{ id: "v", title: "V", component: "V" }] },
      },
    });
    const s = service();
    await s.start();
    const byId = Object.fromEntries(s.list().map((a) => [a.id, a]));
    expect(byId.broken?.errors[0]).toMatch(/^ui: .*ui\.tsx:1:/);
    expect(byId.broken?.uiUrl).toBeUndefined();
    expect(byId.colours?.errors).toEqual([]);
    expect(byId.colours?.warnings?.[0]).toMatch(/^ui\.tsx:1:\d+ Hard-coded hex colour/);
    expect(byId.noui?.errors).toEqual(["addon.json refers to UI exports but there is no ui.tsx"]);
    s.stop();
  });

  it("user add-ons override built-ins, keep storage, history and roll back", async () => {
    const s = service();
    await s.start();
    const dir = join(root, "home", "addons", "hello");
    await addon(dir, { "addon.json": { id: "hello", name: "Hello v2" }, "ui.tsx": "export const A = 1;" });
    await s.reload("hello");
    expect(s.list()[0]).toMatchObject({
      name: "Hello v2",
      source: "user",
      overridesBuiltin: true,
      hasHost: false,
    });
    const first = await s.commit("hello", "Change hello");
    expect(first).toMatch(/^[0-9a-f]{40}$/);
    await addon(dir, { "addon.json": { id: "hello", name: "Hello v3" } });
    await s.commit("hello", "Change hello again");
    expect((await s.history("hello")).map((c) => c.message)).toEqual(["Change hello again", "Change hello"]);
    await s.rollback("hello", first!);
    expect(s.list()[0]?.name).toBe("Hello v2");
    await s.storageSet("hello", "count", 3);
    expect(await s.storageGet("hello", "count")).toBe(3);
    // Quick writes keep every key; unknown or path-like ids are refused.
    await Promise.all([s.storageSet("hello", "a", 1), s.storageSet("hello", "b", 2)]);
    expect([await s.storageGet("hello", "a"), await s.storageGet("hello", "b")]).toEqual([1, 2]);
    await expect(s.storageSet("../config", "updates", {})).rejects.toThrow(/not found/);
    await expect(s.storageGet("nope", "x")).rejects.toThrow(/not found/);
    expect(changes.length).toBeGreaterThan(2);
    s.stop();
  });

  it("deletes your add-ons, brings back the built-in a copy replaced, and keeps the data", async () => {
    const s = service();
    await s.start();
    await expect(s.remove("hello")).rejects.toThrow(/Only your own add-ons/);
    const copy = join(root, "home", "addons", "hello");
    await addon(copy, { "addon.json": { id: "hello", name: "Hello copy" } });
    const mine = join(root, "home", "addons", "mine");
    await addon(mine, { "addon.json": { id: "mine", name: "Mine" } });
    await s.reloadAll();
    await s.commit("mine", "Add mine");
    await s.storageSet("mine", "kept", true);

    await s.remove("hello");
    expect(s.list().find((a) => a.id === "hello")).toMatchObject({ name: "Hello", source: "builtin" });
    await s.remove("mine");
    expect(s.list().find((a) => a.id === "mine")).toBeUndefined();
    await expect(stat(mine)).rejects.toThrow();
    expect((await readFile(join(root, "home", "addon-data", "mine.json"), "utf8")).includes("kept")).toBe(
      true,
    );
    s.stop();
  });
});
