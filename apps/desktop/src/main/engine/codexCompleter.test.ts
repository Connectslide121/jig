import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { codexCompleter } from "./codex";
import type { Completer } from "./types";

/**
 * A scripted `codex app-server` (a node script behind a launcher the completer starts as the Codex
 * CLI): it answers `echo: <prompt>` after a short delay ("slow" is longer, "hang" never answers,
 * "die" exits), and logs what it was asked so the tests can see the thread and turn calls.
 */
const SERVER = `
const { createInterface } = require("node:readline");
const fs = require("node:fs");
const log = (x) => fs.appendFileSync(process.env.FAKE_CODEX_LOG, JSON.stringify(x) + "\\n");
log({ argv: process.argv.slice(2), env: Object.keys(process.env).filter((k) => /^(OPENAI|CODEX)_API_KEY$/.test(k)) });
let threads = 0, turns = 0;
const send = (m) => process.stdout.write(JSON.stringify(m) + "\\n");
createInterface({ input: process.stdin }).on("line", (line) => {
  const m = JSON.parse(line);
  if (m.id === undefined) return;
  log({ method: m.method, params: m.params });
  if (m.method === "initialize") send({ id: m.id, result: { userAgent: "fake/0" } });
  else if (m.method === "thread/start") send({ id: m.id, result: { thread: { id: "t" + ++threads } } });
  else if (m.method === "turn/start") {
    const id = "u" + ++turns, threadId = m.params.threadId;
    const text = m.params.input[0].text;
    send({ id: m.id, result: { turn: { id } } });
    if (text === "die") process.exit(3);
    if (text === "hang") return;
    setTimeout(() => {
      send({ method: "item/completed", params: { threadId, item: { type: "agentMessage", text: "echo: " + text } } });
      send({ method: "turn/completed", params: { threadId, turn: { id, status: "completed" } } });
    }, text === "slow" ? 150 : 5);
  } else send({ id: m.id, result: {} });
});
`;

type Entry = Record<string, any>;

let dir: string;
let completer: Completer;

function start(options: { timeoutMs?: number } = {}) {
  const script = join(dir, "server.js");
  writeFileSync(script, SERVER);
  const launcher = join(dir, process.platform === "win32" ? "codex.cmd" : "codex");
  writeFileSync(
    launcher,
    process.platform === "win32"
      ? `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`
      : `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`,
  );
  chmodSync(launcher, 0o755);
  completer = codexCompleter({
    cwd: homedir(),
    model: "gpt-6-luna",
    appendSystemPrompt: "Complete code.",
    env: { ...process.env, FAKE_CODEX_LOG: join(dir, "log.jsonl"), OPENAI_API_KEY: "sk-test" },
    claudePath: "",
    codexPath: launcher,
    effort: "low",
    timeoutMs: options.timeoutMs,
  });
}

function log(): Entry[] {
  return readFileSync(join(dir, "log.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as Entry);
}

const processes = () => log().filter((e) => e.argv);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jig-codex-completer-"));
});
afterEach(() => {
  completer?.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("the Codex completer", () => {
  it("answers asks in order, each on its own thread, with no tools and a read-only sandbox", async () => {
    start();
    const answers = await Promise.all([completer.ask("one"), completer.ask("two"), completer.ask("three")]);
    expect(answers).toEqual(["echo: one", "echo: two", "echo: three"]);
    const entries = log();
    const starts = entries.filter((e) => e.method === "thread/start");
    expect(starts.length).toBeGreaterThanOrEqual(3);
    expect(starts[0]?.params).toMatchObject({
      model: "gpt-6-luna",
      approvalPolicy: "never",
      sandbox: "read-only",
      developerInstructions: "Complete code.",
      ephemeral: true,
    });
    const turns = entries.filter((e) => e.method === "turn/start");
    expect(new Set(turns.map((t) => t.params.threadId)).size).toBe(3);
    expect(turns[0]?.params.effort).toBe("low");
    // One process served all of them; no API key reached it; text-only flags were passed.
    expect(processes()).toHaveLength(1);
    expect(processes()[0]?.env).toEqual([]);
    expect(processes()[0]?.argv).toEqual(expect.arrayContaining(["app-server", "--disable", "shell_tool"]));
  });

  it("rejects an aborted ask and still answers the next one on the same process", async () => {
    start();
    const abort = new AbortController();
    const first = completer.ask("hang", abort.signal);
    const rejected = expect(first).rejects.toThrow("Cancelled");
    await new Promise((r) => setTimeout(r, 300));
    abort.abort();
    await rejected;
    expect(await completer.ask("next")).toBe("echo: next");
    expect(processes()).toHaveLength(1);
    expect(log().some((e) => e.method === "turn/interrupt")).toBe(true);
    await expect(completer.ask("late", AbortSignal.abort())).rejects.toThrow("Cancelled");
  });

  it("times an ask out without killing the process", async () => {
    start({ timeoutMs: 600 });
    await expect(completer.ask("hang")).rejects.toThrow("didn't answer in time");
    expect(await completer.ask("after")).toBe("echo: after");
    expect(processes()).toHaveLength(1);
  });

  it("starts a new process after the old one dies", async () => {
    start();
    expect(await completer.ask("first")).toBe("echo: first");
    await expect(completer.ask("die")).rejects.toThrow();
    expect(await completer.ask("again")).toBe("echo: again");
    expect(processes()).toHaveLength(2);
  });

  it("rejects asks after close", async () => {
    start();
    await completer.ask("x");
    completer.close();
    await expect(completer.ask("y")).rejects.toThrow("Closed");
  });
});
