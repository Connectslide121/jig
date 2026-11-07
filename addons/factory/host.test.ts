import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { AddonChatInfo, AddonHostApi } from "@jig/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Run } from "./lib/run";

type Host = typeof import("./host");

const GIT_ENV = {
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
};

interface FakeChat extends Partial<Omit<AddonChatInfo, "provider">> {
  id: string;
  cwd?: string;
  title?: string;
  permissionMode?: string;
  provider?: string;
  sent: string[];
}

let tmp: string;
let repo: string;
let host: Host;
let chats: Map<string, FakeChat>;
let data: Map<string, unknown>;
let api: AddonHostApi;
let concurrency: number | undefined;

/** Later than anything sent so far. */
let clock = Date.now();
const later = () => {
  clock += 1000;
  return new Date(clock + 60_000).toISOString();
};

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", ["-C", cwd, ...args], { env: { ...process.env, ...GIT_ENV } })
    .toString()
    .trim();
}

beforeEach(async () => {
  vi.resetModules();
  host = await import("./host");
  tmp = mkdtempSync(join(tmpdir(), "factory-host-"));
  repo = join(tmp, "shop");
  await mkdir(repo);
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "README.md"), "# Shop\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "first");
  chats = new Map();
  data = new Map();
  concurrency = undefined;
  let n = 0;
  const at = (key: string, opts?: { id?: string }) => `${key}@${opts?.id ?? ""}`;
  api = {
    addon: { id: "factory", dir: __dirname, dataDir: join(tmp, "data") },
    storage: {
      get: async (key: string, opts?: { id?: string }) => structuredClone(data.get(at(key, opts))),
      set: async (key: string, value: unknown, opts?: { id?: string }) => {
        data.set(at(key, opts), structuredClone(value));
      },
    },
    projects: async () => [
      { id: "shop", name: "Shop", path: repo, isGitRepo: true, exists: true, repos: [] },
    ],
    config: async () => (concurrency ? { concurrency } : undefined),
    exec: async (command: string, args: string[]) => {
      try {
        const stdout = execFileSync(command, args, {
          env: { ...process.env, ...GIT_ENV },
          stdio: "pipe",
        }).toString();
        return { code: 0, stdout, stderr: "" };
      } catch (e) {
        const err = e as { status?: number; stderr?: Buffer };
        return { code: err.status ?? 1, stdout: "", stderr: err.stderr?.toString() ?? "" };
      }
    },
    chats: {
      create: async (input: Record<string, string>) => {
        const id = `c${++n}`;
        chats.set(id, { id, status: "idle", background: 0, queued: 0, sent: [], ...input });
        return { sessionId: id, provider: input.provider ?? "claude" };
      },
      send: async ({ sessionId, text }: { sessionId: string; text: string }) => {
        const c = chats.get(sessionId);
        if (!c) throw new Error("no chat");
        c.sent.push(text);
        c.status = "working";
        clock += 1000;
        return { sessionId, sentAt: new Date(clock).toISOString() };
      },
      get: async (sessionId: string) => {
        const c = chats.get(sessionId);
        if (!c) throw new Error("no chat");
        return c;
      },
    },
    capture: {
      pdf: vi.fn(async ({ out }: { out: string }) => {
        writeFileSync(out, "%PDF-1.7\n");
        return { path: out, bytes: 9 };
      }),
    },
    addons: { call: vi.fn(async () => ({ id: "v1" })) },
    emit: vi.fn(),
    notify: vi.fn(),
    log: vi.fn(),
  } as unknown as AddonHostApi;
});

afterEach(() => rmSync(tmp, { recursive: true, force: true }));

const load = async (id: string) => (await host.run({ projectId: "shop", runId: id }, api)) as Run;
const stage = (r: Run, id: string) => r.stages.find((s) => s.id === id);
const chatOf = (r: Run, id: string) => {
  const s = stage(r, id);
  const c = s?.chatId ? chats.get(s.chatId) : undefined;
  if (!c) throw new Error(`stage ${id} has no chat`);
  return c;
};
const folder = (r: Run) => join(r.worktree ?? repo, "docs", "factory", r.slug);

/** The stage's chat does its work: writes the recipe's files, reports, and its turn ends. */
async function play(r: Run, id: string, extra: Record<string, unknown> = {}, files?: string[]) {
  const c = chatOf(r, id);
  const outs = files ?? outputsOf(c.sent[0] ?? "");
  for (const o of outs) {
    const file = join(folder(r), o);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(
      file,
      o.endsWith(".md")
        ? `# ${o}\n\nWritten by ${id}.\n`
        : o.endsWith(".json")
          ? JSON.stringify(extra.quality ?? { pass: true })
          : "<html></html>",
    );
  }
  await host.toolReport(
    { chat: { sessionId: c.id, projectId: "shop" }, summary: `${id} done`, outputs: outs, ...extra },
    api,
  );
  await endTurn(c);
}

async function endTurn(c: FakeChat) {
  c.status = "idle";
  c.lastAnswerAt = later();
  await host.chatChanged({ sessionId: c.id, status: "idle" }, api);
}

/** The files a stage prompt asks for (its "## Write" list). */
function outputsOf(prompt: string): string[] {
  const part = prompt.split("## Write\n")[1]?.split("\n\n")[0] ?? "";
  return part
    .split("\n")
    .map((l) => l.replace(/^- /, "").trim())
    .filter(Boolean);
}

const running = (r: Run) => r.stages.filter((s) => s.status === "running").map((s) => s.id);

describe("Jig factory's Conductor", () => {
  it("starts a run from a brief in a worktree of its own and its scout's chat", async () => {
    const r = await host.startRun({ projectId: "shop", brief: "shift-swap" }, api);
    expect(r).toMatchObject({ title: "Shift swap", slug: "shift-swap", level: "L1", state: "running" });
    expect(r.worktree).toBe(join(tmp, "data", "worktrees", r.id));
    expect(git(r.worktree ?? "", "branch", "--show-current")).toBe("factory/shift-swap");
    const brief = readFileSync(join(folder(r), "brief.md"), "utf8");
    expect(brief).toMatch(/^---\n[\s\S]*status: draft/);
    expect(stage(r, "S1")).toMatchObject({ status: "done" });
    expect(r.outputs.map((o) => o.id)).toEqual(["brief-v1"]);
    const c = chatOf(r, "S2");
    expect(c).toMatchObject({
      cwd: r.worktree,
      permissionMode: "acceptEdits",
      title: "Factory · Shift swap · Scout",
    });
    expect(c.sent[0]?.split("\n")[0]).toBe(`[factory stage scout run ${r.id}]`);
    expect(c.sent[0]).toContain("- brief: brief.md");
    // The repository's own checkout is untouched.
    expect(git(repo, "branch", "--show-current")).toBe("main");
    expect(existsSync(join(repo, "docs"))).toBe(false);
  });

  it("passes Don't ask on to its stage chats only when you picked it", async () => {
    const r = await host.startRun(
      { projectId: "shop", brief: "shift-swap", permissionMode: "bypassPermissions" },
      api,
    );
    expect(chatOf(r, "S2").permissionMode).toBe("bypassPermissions");
  });

  it("works through a whole run: gates, the critique loop and the pack within the concurrency limit", async () => {
    concurrency = 2;
    let r = await host.startRun({ projectId: "shop", brief: "shift-swap" }, api);
    await play(r, "S2");
    r = await load(r.id);
    expect(r.gates.map((g) => `${g.id}:${g.status}`)).toEqual(["G0:waiting"]);
    expect(api.notify).toHaveBeenCalledWith(expect.objectContaining({ title: "Jig factory: Go / no-go" }));
    r = await host.decide({ projectId: "shop", runId: r.id, gateId: "G0", kind: "approve" }, api);
    expect(readFileSync(join(folder(r), "scout.md"), "utf8")).toContain("status: approved");
    r = await load(r.id);
    await play(r, "S4b", {}, ["directions/README.md", "directions/1-calm.svg"]);
    r = await host.decide({ projectId: "shop", runId: r.id, gateId: "GD", kind: "approve" }, api);
    r = await load(r.id);
    expect(chatOf(r, "S5").sent[0]).toContain("[factory stage demo-l1 ");
    await play(r, "S5");
    r = await load(r.id);
    await play(r, "S6", {
      quality: { pass: false, score: 60 },
      notes: ["My shifts: the offer button is too small"],
    });
    r = await load(r.id);
    // The critic failed v1: the demo is built again as v2, in a new chat, with the fix list.
    expect(stage(r, "S5")).toMatchObject({ status: "running", version: 2 });
    expect(chatOf(r, "S5").sent[0]).toContain("the offer button is too small");
    await play(r, "S5");
    r = await load(r.id);
    await play(r, "S6", { quality: { pass: true, score: 86 } });
    r = await load(r.id);
    expect(r.outputs.find((o) => o.id === "demo-v1")?.status).toBe("superseded");
    expect(r.gates.find((g) => g.id === "G1")?.status).toBe("waiting");
    r = await host.decide({ projectId: "shop", runId: r.id, gateId: "G1", kind: "approve" }, api);
    r = await load(r.id);
    expect(running(r)).toHaveLength(2);
    for (let i = 0; i < 6 && running(r).length; i++) {
      for (const id of running(r)) await play(r, id);
      r = await load(r.id);
    }
    expect(r.stages.filter((s) => s.id.startsWith("S7:")).every((s) => s.status === "done")).toBe(true);
    for (const g of ["G2", "G4", "G4m"] as const)
      r = await host.decide({ projectId: "shop", runId: r.id, gateId: g, kind: "approve" }, api);
    r = await host.decide({ projectId: "shop", runId: r.id, gateId: "G5", kind: "approve" }, api);
    expect(r.state).toBe("done");
    // Every stage's files were committed on the run's branch.
    expect(git(r.worktree ?? "", "status", "--porcelain", "--", "docs")).toBe("");
    expect(git(r.worktree ?? "", "log", "--oneline").split("\n").length).toBeGreaterThan(8);
    expect(
      (await host.inspect({ projectId: "shop", runId: r.id }, api)).some((e) => e.kind === "prompt"),
    ).toBe(true);
  });

  /** A run of `outputs` taken to its approved demo (G1): the pack's stages are running. */
  async function toPack(outputs: string[]): Promise<Run> {
    let r = await host.startRun({ projectId: "shop", brief: "gift-cards", outputs }, api);
    await play(r, "S2");
    await host.decide({ projectId: "shop", runId: r.id, gateId: "G0", kind: "approve" }, api);
    r = await load(r.id);
    await play(r, "S4");
    r = await load(r.id);
    await play(r, "S5");
    r = await load(r.id);
    await play(r, "S6", { quality: { pass: true, score: 90 } });
    await host.decide({ projectId: "shop", runId: r.id, gateId: "G1", kind: "approve" }, api);
    return load(r.id);
  }

  it("prints a one-pager to PDF with it, and approves its gate once every output is reviewed (D-467)", async () => {
    let r = await toPack(["spec", "one-pager"]);
    await play(r, "S7:one-pager");
    r = await load(r.id);
    const pdf = r.outputs.find((o) => o.kind === "one-pager-file");
    expect(pdf).toMatchObject({ status: "draft", path: expect.stringMatching(/\.pdf$/) });
    expect(api.capture.pdf).toHaveBeenCalledWith(expect.objectContaining({ page: "a4" }));
    const page = r.outputs.find((o) => o.kind === "one-pager");
    const review = await host.reviewOf({ projectId: "shop", runId: r.id, outputId: page?.id ?? "" }, api);
    expect(review).toHaveLength(1);
    expect(review[0]?.files.map((f) => f.output.id)).toEqual([pdf?.id]);
    expect(review[0]?.files[0]?.file).toMatch(/\.pdf$/);
    expect(page?.hash).toMatch(/^[0-9a-f]{40}$/);
    await expect(
      host.decideOutput({ projectId: "shop", runId: r.id, outputId: page?.id ?? "", kind: "reject" }, api),
    ).rejects.toThrow(/why/);
    // You changed the page before approving it: the approval says it was edited.
    await writeFile(join(folder(r), page?.path ?? ""), "<html><body>Edited</body></html>");
    r = await host.decideOutput(
      { projectId: "shop", runId: r.id, outputId: page?.id ?? "", kind: "approve" },
      api,
    );
    const approved = r.outputs.find((o) => o.id === page?.id);
    expect(approved?.status).toBe("approved");
    expect(approved?.history.at(-1)).toMatchObject({ status: "approved", edited: true });
    expect(r.outputs.find((o) => o.id === pdf?.id)?.status).toBe("approved");
    expect(r.gates.find((g) => g.id === "G4")?.status).toBe("approved");
  });

  it("adds the stories as board cards through the Boards add-on, only when asked", async () => {
    const call = vi.fn(async (_addon: string, method: string, args: Record<string, string>) =>
      method === "cardTargets"
        ? [{ id: "b1", name: "Shop board", types: ["User Story"], type: "User Story" }]
        : { id: 1, url: "https://example.test/1", board: "Shop board", title: args.title },
    );
    api.addons.call = call as unknown as AddonHostApi["addons"]["call"];
    let r = await toPack(["stories"]);
    const c = chatOf(r, "S7:stories");
    await writeFile(
      join(folder(r), "stories.md"),
      "---\nstatus: draft\n---\n# Stories\n\n## Offer a shift\nAs staff…\n\n## Take a shift\nAs a colleague…\n",
    );
    await host.toolReport(
      { chat: { sessionId: c.id, projectId: "shop" }, summary: "stories", outputs: ["stories.md"] },
      api,
    );
    await endTurn(c);
    r = await load(r.id);
    expect(call).not.toHaveBeenCalledWith("boards", "createCard", expect.anything());
    expect((await host.boardTargets({ projectId: "shop" }, api)).targets).toEqual([
      { id: "b1", name: "Shop board", type: "User Story" },
    ]);
    const stories = r.outputs.find((o) => o.kind === "stories");
    const made = await host.storyCards(
      { projectId: "shop", runId: r.id, outputId: stories?.id ?? "", boardId: "b1", type: "User Story" },
      api,
    );
    expect(made).toEqual({ made: 2, board: "Shop board" });
    expect(call).toHaveBeenCalledWith(
      "boards",
      "createCard",
      expect.objectContaining({ boardId: "b1", title: "Take a shift", description: "As a colleague…" }),
    );
  });

  it("skips a ChatGPT output when ChatGPT isn't signed in, saying why", async () => {
    const create = api.chats.create;
    api.chats.create = (async (input: Parameters<typeof create>[0]) => {
      if (input.provider === "chatgpt") throw new Error("ChatGPT isn't signed in: sign in from Settings");
      return create(input);
    }) as typeof create;
    const r = await toPack(["one-pager-images"]);
    expect(stage(r, "S7:one-pager-images")).toMatchObject({
      status: "skipped",
      skipReason: expect.stringContaining("ChatGPT isn't signed in"),
    });
  });

  it("makes the teaser's storyboard a Motion video and waits for its render (D-458)", async () => {
    const call = vi.fn(async (_addon: string, method: string) => {
      if (method === "createVideo") return { id: "v1" };
      if (method === "render") return { queued: true };
      return { status: rendered ? "rendered" : "rendering", dir: motionDir, renders: [{ n: 1 }] };
    });
    let rendered = false;
    const motionDir = join(tmp, "motion", "v1");
    mkdirSync(join(motionDir, "renders", "1"), { recursive: true });
    writeFileSync(join(motionDir, "renders", "1", "video.mp4"), "mp4");
    writeFileSync(join(motionDir, "renders", "1", "poster.png"), "png");
    api.addons.call = call as unknown as AddonHostApi["addons"]["call"];
    let r = await toPack(["teaser"]);
    const c = chatOf(r, "S7:teaser");
    await mkdir(join(folder(r), "teaser"), { recursive: true });
    await writeFile(
      join(folder(r), "teaser", "storyboard.json"),
      JSON.stringify({
        title: "Gift cards",
        scenes: [{ type: "title", title: "Gift cards", media: "nope.png" }],
      }),
    );
    await host.toolReport(
      {
        chat: { sessionId: c.id, projectId: "shop" },
        summary: "storyboard",
        outputs: ["teaser/storyboard.json"],
      },
      api,
    );
    await endTurn(c);
    r = await load(r.id);
    expect(call).toHaveBeenCalledWith(
      "motion",
      "createVideo",
      expect.objectContaining({ kind: "teaser", scenes: [{ type: "title", title: "Gift cards" }] }),
    );
    expect(stage(r, "S7:teaser")).toMatchObject({ status: "running", video: { id: "v1", rendering: true } });
    rendered = true;
    await host.tick({}, api);
    r = await load(r.id);
    expect(stage(r, "S7:teaser")?.status).toBe("done");
    expect(readFileSync(join(folder(r), "teaser", "teaser.mp4"), "utf8")).toBe("mp4");
    expect(r.outputs.map((o) => o.kind)).toEqual(expect.arrayContaining(["teaser", "teaser-file"]));
  });

  it("asks for changes at the demo gate: the demo runs again with your note", async () => {
    let r = await host.startRun({ projectId: "shop", brief: "gift-cards" }, api);
    expect(r.plan?.productExists).toBe(true);
    await play(r, "S2");
    await host.decide({ projectId: "shop", runId: r.id, gateId: "G0", kind: "approve" }, api);
    r = await load(r.id);
    await play(r, "S4");
    r = await load(r.id);
    await play(r, "S5");
    r = await load(r.id);
    await play(r, "S6", { quality: { pass: true, score: 90 } });
    await expect(
      host.decide({ projectId: "shop", runId: r.id, gateId: "G1", kind: "changes" }, api),
    ).rejects.toThrow(/what to change/);
    r = await host.decide(
      {
        projectId: "shop",
        runId: r.id,
        gateId: "G1",
        kind: "changes",
        note: "Show the balance on the receipt",
      },
      api,
    );
    r = await load(r.id);
    expect(stage(r, "S5")).toMatchObject({ status: "running", version: 2 });
    expect(chatOf(r, "S5").sent[0]).toContain(
      "## Changes asked at the gate\nShow the balance on the receipt",
    );
    expect(r.gates.find((g) => g.id === "G1")).toMatchObject({ status: "closed", revisions: 1 });
  });

  it("sends your gates to your phone, acts on its taps, and settles the cards (D-468)", async () => {
    let n = 0;
    const send = vi.fn(async () => ({ messageId: `m${++n}` }));
    const update = vi.fn(async () => ({ ok: true }));
    (api as { phone: unknown }).phone = { send, update };
    let r = await host.startRun({ projectId: "shop", brief: "gift-cards" }, api);
    await play(r, "S2");
    r = await load(r.id);
    expect(r.phone).toEqual({ "gate:G0": "m1" });
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({
        projectId: "shop",
        buttons: [
          expect.objectContaining({ id: "approve" }),
          expect.objectContaining({ id: "changes", reply: true }),
          expect.objectContaining({ id: "open" }),
        ],
      }),
    );
    await host.phoneAction({ messageId: "m1", buttonId: "approve" }, api);
    r = await load(r.id);
    expect(r.gates.find((g) => g.id === "G0")?.status).toBe("approved");
    expect(update).toHaveBeenCalledWith("m1", { text: expect.stringContaining("✅ Approved") });
    expect(r.phone?.["gate:G0"]).toBeUndefined();
    await play(r, "S4");
    r = await load(r.id);
    await play(r, "S5");
    r = await load(r.id);
    await play(r, "S6", { quality: { pass: true, score: 90 } });
    r = await load(r.id);
    const g1 = r.phone?.["gate:G1"];
    expect(g1).toBeDefined();
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ text: expect.stringContaining("The demo is ready") }),
    );
    await host.phoneAction({ messageId: g1 ?? "", buttonId: "changes", text: "Bigger buttons" }, api);
    r = await load(r.id);
    expect(chatOf(r, "S5").sent[0]).toContain("## Changes asked at the gate\nBigger buttons");
    expect(update).toHaveBeenLastCalledWith(g1, { text: expect.stringContaining("Changes asked") });
    await host.phoneAction({ messageId: "unknown", buttonId: "approve" }, api);
  });

  it("publishes an approved demo on this computer or a site, scans it first and takes it down (D-470)", async () => {
    let r = await host.startRun({ projectId: "shop", brief: "gift-cards" }, api);
    r = await load(r.id);
    const page = join(folder(r), "demo", "v1", "index.html");
    await mkdir(dirname(page), { recursive: true });
    await writeFile(page, "<html><head></head><body><p>Mail ada@shop.example</p></body></html>");
    await writeFile(join(dirname(page), "app.js"), 'const x = "hello";');
    const demo = {
      id: "o-demo",
      kind: "demo",
      path: "demo/v1/index.html",
      version: 1,
      status: "approved" as const,
      history: [{ status: "draft" as const, by: "jig", at: later() }],
    };
    await api.storage.set(
      `run:${r.id}`,
      { ...r, outputs: [...r.outputs, demo] },
      { scope: "project", id: "shop" },
    );
    const target = {
      name: "Demos",
      app: "contoso-demos",
      resourceGroup: "rg",
      url: "https://demos.contoso.com",
    };
    api.config = (async () => ({ publishTargets: [target] })) as AddonHostApi["config"];
    const deploys: string[][] = [];
    const exec = api.exec;
    api.exec = (async (command: string, args: string[], opts?: unknown) => {
      if (command !== "npx") return exec(command, args, opts as never);
      deploys.push(args);
      return { code: 0, stdout: "", stderr: "" };
    }) as AddonHostApi["exec"];
    const args = { projectId: "shop", runId: r.id };

    expect(await host.publishInfo(args, api)).toMatchObject({ targets: [{ name: "Demos" }], versions: [1] });
    expect((await host.publishScan({ ...args, version: 1 }, api)).hits).toEqual([]);
    await expect(host.publish({ ...args, version: 2, where: "local", days: 30 }, api)).rejects.toThrow(
      "isn't approved",
    );
    await expect(host.publish({ ...args, version: 1, where: "local", days: 5 }, api)).rejects.toThrow(
      "7, 30 or 90",
    );

    const local = await host.publish(
      { ...args, version: 1, where: "local", days: 7, confirmTo: "pm@contoso.com" },
      api,
    );
    expect(local.path && readFileSync(local.path, "utf8")).toContain('data-jig-factory="confirm"');
    expect(existsSync(join(dirname(local.path ?? ""), "app.js"))).toBe(true);
    r = await load(r.id);
    expect(r.outputs.find((o) => o.id === "o-demo")?.status).toBe("published");

    const site = await host.publish({ ...args, version: 1, where: "Demos", days: 30 }, api);
    expect(site.url).toBe(`https://demos.contoso.com/${r.id}/v1/`);
    expect(deploys[0]).toEqual(
      expect.arrayContaining(["deploy", "--app-name", "contoso-demos", "--env", "production"]),
    );
    const mirror = deploys[0]?.[3] ?? "";
    expect(readFileSync(join(mirror, r.id, "v1", "index.html"), "utf8")).toContain(
      'data-jig-factory="expiry"',
    );

    await host.takeDown({ ...args, id: site.id }, api);
    expect(existsSync(join(mirror, r.id, "v1"))).toBe(false);
    expect(deploys).toHaveLength(2);
    await host.takeDown({ ...args, id: local.id }, api);
    expect(existsSync(local.path ?? "")).toBe(false);
    r = await load(r.id);
    expect(r.published?.every((p) => p.takenDown)).toBe(true);

    // Real-looking data blocks publishing.
    await writeFile(page, "<html><body>Call +46 70 123 45 67, ada@realcorp.io</body></html>");
    expect((await host.publishScan({ ...args, version: 1 }, api)).hits.map((h) => h.kind)).toEqual([
      "email",
      "phone",
    ]);
    await expect(host.publish({ ...args, version: 1, where: "local", days: 30 }, api)).rejects.toThrow(
      "real-looking",
    );
  });

  it("gives a gate a person owns a card on the run's board, and decides it from there (D-469)", async () => {
    let comments: Array<{ by: string; at: string; text: string }> = [];
    let done = false;
    const calls: Array<[string, string, Record<string, unknown>]> = [];
    api.addons.call = vi.fn(async (id: string, method: string, args: Record<string, unknown>) => {
      calls.push([id, method, args]);
      if (method === "cardAssignee") return { assignedTo: "dana@contoso.com", name: "Dana Fabrikam" };
      if (method === "createCard")
        return { id: 42, url: "https://dev.azure.com/contoso/Shop/_workitems/edit/42", board: "Shop" };
      if (method === "cardStatus") return { state: "Active", done, url: "", comments };
      if (method === "commentCard")
        comments = [...comments, { by: "Jig", at: later(), text: String(args.text) }];
      return undefined;
    }) as AddonHostApi["addons"]["call"];
    let r = await host.startRun({ projectId: "shop", brief: "gift-cards" }, api);
    r = await load(r.id);
    await api.storage.set(
      `run:${r.id}`,
      {
        ...r,
        owners: { G0: { kind: "person", name: "Dana" } },
        plan: {
          ...(r.plan ?? {
            outputs: ["spec"],
            build: false,
            permissionMode: "acceptEdits",
            productExists: true,
          }),
          approvals: { boardId: "b1", name: "Shop", type: "User Story" },
        },
      },
      { scope: "project", id: "shop" },
    );
    await play(r, "S2");
    await host.tick(undefined, api);
    r = await load(r.id);
    expect(r.gates.find((g) => g.id === "G0")?.card).toMatchObject({ id: 42, round: 0 });
    const made = calls.find((c) => c[1] === "createCard")?.[2];
    expect(made).toMatchObject({
      projectId: "shop",
      boardId: "b1",
      type: "User Story",
      assignedTo: "dana@contoso.com",
    });
    expect(String(made?.title)).toContain("·");
    expect(String(made?.description)).toContain('"changes:"');

    // Read at most every two minutes; a "changes:" comment asks for changes, by the commenter.
    comments = [{ by: "Dana Fabrikam", at: later(), text: "changes: name the second card type" }];
    await host.tick(undefined, api);
    expect((await load(r.id)).gates.find((g) => g.id === "G0")?.status).toBe("waiting");
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 3 * 60_000);
    await host.tick(undefined, api);
    r = await load(r.id);
    const g0 = r.gates.find((g) => g.id === "G0");
    expect(g0).toMatchObject({
      status: "closed",
      revisions: 1,
      decidedBy: "board:Dana Fabrikam",
      note: "name the second card type",
    });
    expect(chatOf(r, "S2").sent.at(-1)).toContain("name the second card type");

    // The brief again: one comment says so on the same card; moved to done approves it.
    await play(r, "S2");
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 6 * 60_000);
    await host.tick(undefined, api);
    expect(comments.at(-1)?.text).toContain("A new version is ready");
    expect(calls.filter((c) => c[1] === "createCard")).toHaveLength(1);
    done = true;
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 9 * 60_000);
    await host.tick(undefined, api);
    r = await load(r.id);
    expect(r.gates.find((g) => g.id === "G0")).toMatchObject({ status: "approved", decidedBy: "board:Dana" });
    await host.tick(undefined, api);
    r = await load(r.id);
    expect(r.gates.find((g) => g.id === "G0")?.card).toBeUndefined();
    vi.restoreAllMocks();
  });

  it("waits a minute when the phone isn't paired", async () => {
    const send = vi.fn(async () => ({ error: "not_paired" }));
    (api as { phone: unknown }).phone = { send, update: vi.fn() };
    const r = await host.startRun({ projectId: "shop", brief: "gift-cards" }, api);
    await play(r, "S2");
    await host.tick(undefined, api);
    expect(send).toHaveBeenCalledTimes(1);
    expect((await load(r.id)).phone).toBeUndefined();
  });

  it("picks a direction at GD, lists the demo's versions with scorecards, and sends pins as changes (D-462)", async () => {
    api.config = (async () => ({ designSources: ["/refs/calm-saas"] })) as AddonHostApi["config"];
    let r = await host.startRun({ projectId: "shop", brief: "shift-swap" }, api);
    await play(r, "S2");
    await host.decide({ projectId: "shop", runId: r.id, gateId: "G0", kind: "approve" }, api);
    r = await load(r.id);
    const brief = (id: string) => host.toolBrief({ chat: { sessionId: chatOf(r, id).id } }, api);
    expect(await brief("S4b")).toContain("Design references (DESIGN.md libraries");
    expect(await brief("S4b")).toContain("/refs/calm-saas");
    await play(r, "S4b", {}, ["directions/README.md", "directions/1-calm.svg", "directions/2-bold.svg"]);
    r = await load(r.id);
    expect((await host.directions({ projectId: "shop", runId: r.id }, api)).map((d) => d.name)).toEqual([
      "Calm",
      "Bold",
    ]);
    await expect(
      host.decide({ projectId: "shop", runId: r.id, gateId: "GD", kind: "approve", direction: "9-x" }, api),
    ).rejects.toThrow(/no direction/);
    r = await host.decide(
      { projectId: "shop", runId: r.id, gateId: "GD", kind: "approve", direction: "2-bold" },
      api,
    );
    expect(r.direction).toBe("2-bold");
    r = await load(r.id);
    expect(await brief("S5")).toContain("Picked direction: Bold (directions/2-bold.svg)");
    await play(r, "S5");
    r = await load(r.id);
    await play(r, "S6", {
      quality: { pass: false, score: 60, axes: { hierarchy: 3, spacing: 2.5 }, fixes: ["Bigger button"] },
    });
    r = await load(r.id);
    await play(r, "S5");
    r = await load(r.id);
    await play(r, "S6", { quality: { pass: true, score: 86, axes: { hierarchy: 4.5 } } });
    const { versions } = await host.review({ projectId: "shop", runId: r.id }, api);
    expect(versions.map((v) => [v.version, v.quality?.pass, v.quality?.axes[0]?.value])).toEqual([
      [1, false, 3],
      [2, true, 4.5],
    ]);
    expect(versions[0]?.quality?.fixes).toEqual([{ change: "Bigger button" }]);
    expect(versions[1]?.file).toBe(join(folder(r), "demo", "v2", "index.html"));
    r = await host.decide(
      {
        projectId: "shop",
        runId: r.id,
        gateId: "G1",
        kind: "changes",
        pins: [
          { device: "phone", screen: "", x: 10, y: 20, text: "Bigger title" },
          { device: "fridge", x: 1, y: 1, text: "dropped" },
        ] as never,
      },
      api,
    );
    r = await load(r.id);
    expect(stage(r, "S5")).toMatchObject({ status: "running", version: 3 });
    expect(chatOf(r, "S5").sent[0]).toContain(
      "Pins on the demo:\n1. phone (10% across, 20% down): Bigger title",
    );
    expect(chatOf(r, "S5").sent[0]).not.toContain("dropped");
  });

  it("asks once for a missing report, then waits for you", async () => {
    let r = await host.startRun({ projectId: "shop", brief: "shift-swap" }, api);
    const c = chatOf(r, "S2");
    await endTurn(c);
    expect(c.sent[1]).toMatch(/^\[factory nudge run /);
    await endTurn(c);
    r = await load(r.id);
    expect(stage(r, "S2")).toMatchObject({ status: "needs-you" });
    expect(stage(r, "S2")?.question).toContain("without a report");
    expect(r.state).toBe("waiting");
    // You answer in its chat: it works again.
    c.status = "working";
    await host.chatChanged({ sessionId: c.id, status: "working" }, api);
    expect(stage(await load(r.id), "S2")?.status).toBe("running");
  });

  it("retries a stage whose files aren't there in a new chat, once", async () => {
    let r = await host.startRun({ projectId: "shop", brief: "shift-swap" }, api);
    const first = chatOf(r, "S2");
    await host.toolReport({ chat: { sessionId: first.id }, summary: "x", outputs: ["scout.md"] }, api);
    await endTurn(first);
    r = await load(r.id);
    expect(stage(r, "S2")).toMatchObject({ status: "running", attempt: 2 });
    expect(stage(r, "S2")?.chats).toHaveLength(2);
    expect(chatOf(r, "S2").id).not.toBe(first.id);
    const inspector = await host.inspect({ projectId: "shop", runId: r.id }, api);
    expect(inspector.some((e) => e.kind === "error" && e.text.includes("scout.md"))).toBe(true);
  });

  it("waits for the plan's reset without nudging", async () => {
    let r = await host.startRun({ projectId: "shop", brief: "shift-swap" }, api);
    const c = chatOf(r, "S2");
    c.limit = { provider: "claude", state: "waiting" };
    await endTurn(c);
    r = await load(r.id);
    expect(c.sent).toHaveLength(1);
    expect(stage(r, "S2")).toMatchObject({ status: "running", chatNote: "Waiting for the plan's reset" });
  });

  it("tells a stage cut off by a restart to carry on, after the restart", async () => {
    let r = await host.startRun({ projectId: "shop", brief: "shift-swap" }, api);
    // Jig restarts: the module's memory is gone, the chat sits idle with no answer to the prompt.
    vi.resetModules();
    host = await import("./host");
    const c = chatOf(r, "S2");
    c.status = "idle";
    await host.tick({}, api);
    expect(c.sent[1]).toMatch(/^\[factory resume run /);
    r = await load(r.id);
    await play(r, "S2");
    expect(stage(await load(r.id), "S2")?.status).toBe("done");
  });

  it("runs the interview from an idea: question cards, your answers, the brief", async () => {
    let r = await host.startRun(
      { projectId: "shop", text: "Loyalty points for Shop\nCustomers collect points." },
      api,
    );
    expect(r.state).toBe("interview");
    expect(readFileSync(join(folder(r), "input", "idea.md"), "utf8")).toContain("Loyalty points");
    const c = chatOf(r, "S1");
    expect(c.sent[0]).toContain("[factory stage interview ");
    await host.toolQuestions(
      {
        chat: { sessionId: c.id },
        questions: [{ text: "Who earns points?", suggestion: "Every customer" }, { text: "Expiry?" }],
      },
      api,
    );
    await endTurn(c);
    r = await load(r.id);
    expect(stage(r, "S1")?.status).toBe("needs-you");
    // No brief yet: nothing covered (D-461).
    expect(r.brief?.coverage).toBeUndefined();
    const qs = r.questions ?? [];
    r = await host.answer(
      {
        projectId: "shop",
        runId: r.id,
        stageId: "S1",
        answers: qs.map((q) => ({ id: q.id, answer: "Yes" })),
      },
      api,
    );
    expect(c.sent.at(-1)).toMatch(/^\[factory answers run .* stage S1 round 1\]/);
    expect(stage(r, "S1")?.status).toBe("running");
    await play(r, "S1");
    r = await load(r.id);
    expect(r.state).toBe("running");
    expect(stage(r, "S2")?.status).toBe("running");
  });

  it("measures the brief's coverage, ends the interview with Good enough, and waits for the plan", async () => {
    let r = await host.startRun(
      {
        projectId: "shop",
        text: "Gift cards for Shop",
        attachments: [{ path: join(repo, "README.md"), name: "notes.md" }],
      },
      api,
    );
    expect(readFileSync(join(folder(r), "input", "notes.md"), "utf8")).toContain("# Shop");
    const c = chatOf(r, "S1");
    await writeFile(
      join(folder(r), "brief.md"),
      "---\nlevel: L2\n---\n# Gift cards\n\n## Problem\nNo gifts.\n\n## Users\nShoppers\n",
    );
    await host.toolQuestions(
      {
        chat: { sessionId: c.id },
        questions: [{ text: "Who pays?", suggestion: "The giver" }, { text: "Expiry?" }],
      },
      api,
    );
    await endTurn(c);
    r = await load(r.id);
    expect(r.brief?.coverage).toEqual({ covered: 2, total: 9 });
    expect(r.brief?.level).toBe("L2");
    expect(await host.briefDoc({ projectId: "shop", runId: r.id }, api)).toMatchObject({
      title: "Gift cards",
      coverage: { covered: 2, total: 9 },
    });
    r = await host.enough({ projectId: "shop", runId: r.id }, api);
    expect(c.sent.at(-1)).toMatch(/^\[factory answers run .* stage S1 round 1 enough\]/);
    expect(c.sent.at(-1)).toContain("The giver");
    expect(r.questions?.find((q) => q.text === "Who pays?")?.answer).toBe("The giver");
    await play(r, "S1", {}, ["brief.md"]);
    r = await load(r.id);
    await play(r, "S2");
    r = await host.decide({ projectId: "shop", runId: r.id, gateId: "G0", kind: "approve" }, api);
    expect(r.state).toBe("planning");
    expect(stage(r, "S3")).toMatchObject({ status: "needs-you", recipe: "plan" });
    expect(stage(r, "S4b")).toBeUndefined();
    await expect(host.plan({ projectId: "shop", runId: r.id, outputs: [] }, api)).rejects.toThrow(
      /at least one/,
    );
    r = await host.plan(
      {
        projectId: "shop",
        runId: r.id,
        outputs: ["spec"],
        level: "L3",
        languages: { docs: "en", sales: "sv" },
        owners: { G2: { kind: "person", name: "Alex" }, G4: { kind: "person", name: " " } },
        permissionMode: "acceptEdits",
      },
      api,
    );
    r = await load(r.id);
    expect(r).toMatchObject({ level: "L3", state: "running", languages: { docs: "en", sales: "sv" } });
    expect(r.owners).toEqual({ G2: { kind: "person", name: "Alex" } });
    expect(r.plan?.outputs).toEqual(["spec"]);
    expect(stage(r, "S3")?.status).toBe("done");
    expect(stage(r, "S4b")?.status).toBe("running");
    await expect(host.plan({ projectId: "shop", runId: r.id, outputs: ["spec"] }, api)).rejects.toThrow(
      /isn't waiting/,
    );
  });

  it("starts from a meeting, and keeps an idea from elsewhere for the New idea dialog", async () => {
    (api as unknown as { meetings: unknown }).meetings = {
      recent: async () => [
        {
          id: "m1",
          title: "Contoso sync",
          startedAt: "2026-01-01T09:00:00Z",
          excerpt: "We want gift cards.",
        },
      ],
    };
    expect(await host.meetings({}, api)).toEqual([
      { id: "m1", title: "Contoso sync", startedAt: "2026-01-01T09:00:00Z" },
    ]);
    const r = await host.startRun({ projectId: "shop", meetingId: "m1" }, api);
    expect(r.source).toEqual({ kind: "meeting", ref: "m1" });
    expect(readFileSync(join(folder(r), "input", "meeting.md"), "utf8")).toContain("We want gift cards.");
    await expect(host.startRun({ projectId: "shop", meetingId: "gone" }, api)).rejects.toThrow(
      /isn't in your history/,
    );
    await host.ideaFrom(
      { text: "Notes", title: "Fabrikam call", source: { kind: "meeting", ref: "m2" } },
      api,
    );
    expect(data.get("pending-idea@")).toMatchObject({
      text: "Notes",
      source: { kind: "meeting", ref: "m2" },
    });
    expect(api.emit).toHaveBeenCalledWith("new-idea", expect.objectContaining({ title: "Fabrikam call" }));
    await expect(host.ideaFrom({ text: " " }, api)).rejects.toThrow(/No idea/);
  });

  it("forks a run from a stage into a new worktree from its branch", async () => {
    let r = await host.startRun({ projectId: "shop", brief: "shift-swap" }, api);
    await play(r, "S2");
    r = await load(r.id);
    const f = await host.fork(
      { projectId: "shop", runId: r.id, stageId: "S2", note: "Look at Fabrikam too" },
      api,
    );
    expect(f).toMatchObject({ slug: "shift-swap-fork", forkOf: { runId: r.id, stage: "S2" } });
    expect(git(f.worktree ?? "", "branch", "--show-current")).toBe("factory/shift-swap-fork");
    expect(existsSync(join(folder(f), "brief.md"))).toBe(true);
    const forked = await load(f.id);
    expect(chatOf(forked, "S2").sent[0]).toContain("Look at Fabrikam too");
    expect(chatOf(forked, "S2").id).not.toBe(chatOf(r, "S2").id);
  });

  it("re-runs a stage, and stops a run", async () => {
    let r = await host.startRun({ projectId: "shop", brief: "shift-swap" }, api);
    await expect(host.rerun({ projectId: "shop", runId: r.id, stageId: "S2" }, api)).rejects.toThrow(
      /running/,
    );
    await play(r, "S2");
    r = await host.rerun({ projectId: "shop", runId: r.id, stageId: "S2", note: "Shorter" }, api);
    r = await load(r.id);
    expect(stage(r, "S2")).toMatchObject({ status: "running", version: 2, feedback: "Shorter" });
    expect(r.gates).toEqual([]);
    r = await host.stop({ projectId: "shop", runId: r.id }, api);
    expect(r.state).toBe("stopped");
    await play(r, "S2");
    expect((await load(r.id)).gates).toEqual([]);
  });

  it("answers only stage chats, and lists the runs for any chat", async () => {
    await expect(
      host.toolReport({ chat: { sessionId: "other" }, summary: "x", outputs: [] }, api),
    ).rejects.toThrow(/isn't a stage/);
    expect(await host.context({ chat: { sessionId: "other" } }, api)).toBe("");
    const r = await host.startRun({ projectId: "shop", brief: "shift-swap" }, api);
    expect(await host.context({ chat: { sessionId: chatOf(r, "S2").id } }, api)).toContain(
      '"Scout" stage (S2',
    );
    expect(await host.toolBrief({ chat: { sessionId: chatOf(r, "S2").id } }, api)).toContain("## The brief");
    expect(await host.toolRuns({ chat: { projectId: "shop" } }, api)).toContain("Shift swap");
    await expect(
      host.toolReport(
        { chat: { sessionId: chatOf(r, "S2").id }, summary: "x", outputs: ["../../escape.md"] },
        api,
      ),
    ).rejects.toThrow(/outside/);
  });
});
