import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import type { BuildJob } from "../../shared/builds";
import { defaultConfig } from "../../shared/config";
import type { ChatItem, SessionMeta } from "../../shared/engine";
import { defaultLayout, type Layout, normalizeLayout } from "../../shared/layout";
import { setTokensFile } from "../addons/css";
import type { HostChannel } from "../addons/hostProcess";
import { createHostRuntime, type FromHost } from "../addons/hostRuntime";
import { git } from "../addons/repo";
import { AddonService } from "../addons/service";
import { runFakeBuilder } from "../engine/fakeBuilder";
import { BuildService } from "./service";

setTokensFile(fileURLToPath(new URL("../../renderer/styles/tokens.css", import.meta.url)));

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
let layout: Layout;
let configPatches: unknown[];
let chatItems: ChatItem[];

async function setup() {
  root = await mkdtemp(join(tmpdir(), "jig-builder-"));
  process.env.JIG_HOME = join(root, "home");
  const home = join(root, "home");
  await mkdir(join(root, "builtin", "notes"), { recursive: true });
  await writeFile(
    join(root, "builtin", "notes", "addon.json"),
    JSON.stringify({ id: "notes", name: "Notes" }),
  );
  await writeFile(join(root, "builtin", "notes", "README.md"), "# Notes\n");
  const addons = new AddonService({
    builtinDir: join(root, "builtin"),
    userDir: join(home, "addons"),
    cacheDir: join(home, "cache"),
    dataDir: join(home, "addon-data"),
    stateFile: join(home, "addons-state.json"),
    nodePaths: [],
    hostFactory: inProcess,
    rpc: () => async () => undefined,
    onChange: () => {},
  });
  await addons.start();
  layout = normalizeLayout(defaultLayout(), [
    { id: "jig.projects", defaultRegion: "left" },
    { id: "jig.terminals", defaultRegion: "bottom" },
  ]);
  configPatches = [];
  chatItems = [];
  let n = 0;
  const service: BuildService = new BuildService({
    file: join(home, "builds.json"),
    workDir: join(home, "work"),
    addonsRepo: join(home, "addons"),
    nodePaths: [],
    addons,
    sessions: {
      create: async ({ cwd, buildId }) => ({ id: `s${++n}`, cwd, buildId }) as unknown as SessionMeta,
      send: async (_id, text) => {
        const job = service.list()[0]!;
        const handlers = Object.fromEntries(service.toolsFor(job.id).map((t) => [t.name, t.handler]));
        await runFakeBuilder(text, handlers, () => {});
      },
      addItem: async (_id, item) => {
        chatItems.push(item);
      },
      stop: async () => {},
    },
    layout: {
      get: async () => layout,
      set: async (l) => {
        layout = l;
      },
    },
    config: {
      get: () => defaultConfig(),
      update: async (patch) => {
        configPatches.push(patch);
      },
    },
    onChange: () => {},
  });
  return { service, addons, home };
}

const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false,
  );

beforeEach(async () => {
  await setup();
});

describe("BuildService", () => {
  it("level 2: builds a new add-on in a worktree, previews it, and merges it on Accept", async () => {
    const { service, addons, home } = await setup();
    const job = await service.start({ goal: "Hello button for me", origin: "tools" });
    expect(job).toMatchObject({
      status: "preview",
      kind: "new-addon",
      level: 2,
      addonId: "hello-button-for",
    });
    expect(job.files?.map((f) => f.path).sort()).toEqual([
      "hello-button-for/README.md",
      "hello-button-for/addon.json",
      "hello-button-for/ui.tsx",
    ]);
    expect(addons.list().find((a) => a.id === "hello-button-for")).toMatchObject({
      preview: { buildId: job.id },
    });
    expect(await exists(join(home, "addons", "hello-button-for"))).toBe(false);

    const accepted = await service.accept(job.id);
    expect(accepted.status).toBe("accepted");
    expect(await exists(join(home, "addons", "hello-button-for", "ui.tsx"))).toBe(true);
    expect(await exists(job.worktree!)).toBe(false);
    const info = addons.list().find((a) => a.id === "hello-button-for");
    expect(info?.preview).toBeUndefined();
    expect(info?.source).toBe("user");
    expect((await git(join(home, "addons"), ["log", "--format=%s"])).stdout).toContain(
      "Build: Hello button for me",
    );
    expect((await git(join(home, "addons"), ["branch", "--list", "build/*"])).stdout.trim()).toBe("");
  });

  it("sends validation problems back to the builder until they are fixed", async () => {
    const { service } = await setup();
    const job = await service.start({ goal: "broken widget", origin: "tools" });
    expect(job.status).toBe("preview");
    expect(await readFile(join(job.worktree!, "broken-widget", "ui.tsx"), "utf8")).not.toContain("#ff0000");

    // Calling finish with an invalid add-on returns the problems and counts the round.
    const tools = Object.fromEntries(service.toolsFor(job.id).map((t) => [t.name, t.handler]));
    await writeFile(
      join(job.worktree!, "broken-widget", "ui.tsx"),
      'export const MainView = () => <div className="text-red-500" />;',
    );
    const answer = await tools.finish!({ summary: "x", kind: "new-addon", addonId: "broken-widget" });
    expect(answer).toMatch(/^Not valid yet \(try 1 of 3\)/);
    expect(answer).toContain("Tailwind palette colour");
    expect(answer).toContain('"hello"');
    expect(service.get(job.id).validationRounds).toBe(1);
  });

  it("level 1: stages a layout change and applies it on Accept", async () => {
    const { service } = await setup();
    const job = await service.start({ goal: "move the terminals", origin: "tools" });
    expect(job).toMatchObject({ status: "preview", kind: "layout", level: 1 });
    expect(job.staged?.layoutOps).toEqual([{ op: "move", view: "jig.terminals", region: "right" }]);
    expect(layout.right.views).not.toContain("jig.terminals");
    await service.accept(job.id);
    expect(layout.right.views).toContain("jig.terminals");
  });

  it("level 1: stages settings and applies them on Accept", async () => {
    const { service } = await setup();
    const job = await service.start({ goal: "compact please", origin: "tools" });
    expect(job.kind).toBe("settings");
    await service.accept(job.id);
    expect(configPatches).toEqual([{ appearance: { density: "compact" } }]);
  });

  it("changes a built-in add-on as your own copy", async () => {
    const { service, addons, home } = await setup();
    const job = await service.start({ goal: "add a word", origin: "addon", targetAddonId: "notes" });
    expect(job).toMatchObject({ status: "preview", kind: "change-addon", addonId: "notes" });
    await service.accept(job.id);
    expect(await readFile(join(home, "addons", "notes", "README.md"), "utf8")).toContain(
      "Changed by the builder: add a word",
    );
    expect(addons.list().find((a) => a.id === "notes")).toMatchObject({
      source: "user",
      overridesBuiltin: true,
    });
  });

  it("discards: removes the worktree and the branch, nothing goes live", async () => {
    const { service, addons, home } = await setup();
    const job = await service.start({ goal: "Throwaway thing", origin: "chat", originSessionId: "chat-1" });
    expect(chatItems).toEqual([expect.objectContaining({ kind: "build", buildId: job.id })]);
    const discarded = await service.discard(job.id);
    expect(discarded.status).toBe("discarded");
    expect(await exists(job.worktree!)).toBe(false);
    expect(addons.list().some((a) => a.id === "throwaway-thing")).toBe(false);
    expect((await git(join(home, "addons"), ["branch", "--list", "build/*"])).stdout.trim()).toBe("");
    await expect(service.accept(job.id)).rejects.toMatchObject({ code: "not_ready" });
  });

  it("requests no slot can do end with a proposed extension point, not a code change; jobs survive a restart", async () => {
    const { service, home } = await setup();
    const job = await service.start({ goal: "change jig itself", origin: "tools" });
    expect(job).toMatchObject({
      status: "needs_you",
      kind: "app",
      proposal: { reason: "No slot can change the window frame." },
    });
    expect(job.proposal?.proposal).toContain("window.decorations");
    expect(job.level).toBeUndefined();
    expect(job.worktree).toBeUndefined();
    await new Promise((r) => setTimeout(r, 50));
    const saved = JSON.parse(await readFile(join(home, "builds.json"), "utf8")) as { jobs: BuildJob[] };
    expect(saved.jobs[0]?.id).toBe(job.id);
  });
});
