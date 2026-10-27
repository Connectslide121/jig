import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createHostRuntime, type FromHost } from "./hostRuntime";

async function runtime(code: string, permissions: string[]) {
  const dir = await mkdtemp(join(tmpdir(), "jig-host-"));
  const bundle = join(dir, "host.mjs");
  await writeFile(bundle, code);
  const sent: FromHost[] = [];
  const rt = createHostRuntime((m) => {
    sent.push(m);
    if (m.t === "rpc") {
      const value =
        m.op === "storage.get" ? { stored: true } : m.op === "projects" ? [{ id: "p" }] : undefined;
      queueMicrotask(() => void rt.handle({ t: "rpcResult", id: m.id, ok: true, value }));
    }
  });
  await rt.handle({ t: "init", addonId: "a", dir, dataDir: dir, bundle, permissions });
  const call = async (method: string, args?: unknown) => {
    const id = Math.floor(Math.random() * 1e9);
    await rt.handle({ t: "call", id, method, args });
    for (let i = 0; i < 200; i++) {
      const r = sent.find((m) => m.t === "result" && m.id === id);
      if (r) return r;
      await new Promise((res) => setTimeout(res, 10));
    }
    throw new Error("no result");
  };
  return { sent, call, dir };
}

describe("add-on host runtime", () => {
  it("loads the bundle, runs activate, lists exports and answers calls", async () => {
    const { sent, call } = await runtime(
      `export let activated = false; export function activate() { activated = true; }
       export async function add(args) { return args.a + args.b; }
       export async function boom() { throw new Error("nope"); }`,
      [],
    );
    expect(sent[0]).toEqual({ t: "ready", exports: ["activate", "add", "boom"] });
    expect(await call("add", { a: 2, b: 3 })).toMatchObject({ ok: true, value: 5 });
    expect(await call("boom")).toMatchObject({ ok: false, error: "nope" });
    expect(await call("missing")).toMatchObject({
      ok: false,
      error: 'host.ts has no export named "missing"',
    });
    expect(await call("activate")).toMatchObject({ ok: false });
  });

  it("checks permissions for exec, fs and net", async () => {
    const { call } = await runtime(
      `export async function run(_, api) { return api.exec("node", ["-e", "process.stdout.write('hi')"]); }
       export async function read(args, api) { return api.fs.readFile(args.path); }
       export async function net(_, api) { return api.fetch("http://127.0.0.1:1"); }`,
      [],
    );
    expect(await call("run")).toMatchObject({ ok: false, error: expect.stringContaining('"exec:node"') });
    expect(await call("read", { path: "/etc/hostname" })).toMatchObject({
      ok: false,
      error: expect.stringContaining('"fs:read"'),
    });
    expect(await call("net")).toMatchObject({ ok: false, error: expect.stringContaining('"net"') });
  });

  it("runs allowed programs and forwards storage, events and projects to the main process", async () => {
    const { call, sent, dir } = await runtime(
      `export async function run(_, api) { return api.exec("node", ["-e", "process.stdout.write('hi'); process.exit(2)"]); }
       export async function missing(_, api) { return api.exec("definitely-not-a-program-jig", []); }
       export async function data(_, api) { api.emit("changed", 1); api.notify({ title: "t" }); return [await api.storage.get("k"), await api.projects()]; }
       export async function write(args, api) { await api.fs.writeFile(args.path, "x"); return api.fs.exists(args.path); }`,
      ["exec:node", "exec:definitely-not-a-program-jig", "fs:read", "fs:write"],
    );
    expect(await call("run")).toMatchObject({ ok: true, value: { code: 2, stdout: "hi" } });
    expect(await call("missing")).toMatchObject({ ok: true, value: { code: 127 } });
    expect(await call("data")).toMatchObject({ ok: true, value: [{ stored: true }, [{ id: "p" }]] });
    expect(sent.filter((m) => m.t === "rpc").map((m) => m.t === "rpc" && m.op)).toEqual([
      "emit",
      "notify",
      "storage.get",
      "projects",
    ]);
    expect(await call("write", { path: join(dir, "out.txt") })).toMatchObject({ ok: true, value: true });
  });

  it("reports a bundle that fails to load", async () => {
    const { sent } = await runtime(`throw new Error("broken at load");`, []);
    expect(sent[0]).toMatchObject({ t: "initError", error: expect.stringContaining("broken at load") });
  });
});
