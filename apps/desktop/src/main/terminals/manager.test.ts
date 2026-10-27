import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "@lydell/node-pty";
import { beforeEach, describe, expect, it } from "vitest";
import type { TerminalInfo } from "../../shared/terminals";
import { shellName, TerminalManager } from "./manager";

let dir: string;
let output: Record<string, string>;
let changes: TerminalInfo[][];
let commands: string[];

const manager = () =>
  new TerminalManager({
    spawn: spawn as never,
    shell: () => "/bin/sh",
    env: () => ({ PATH: process.env.PATH, HOME: dir }),
    onData: (id, data) => {
      output[id] = (output[id] ?? "") + data;
    },
    onChange: (list) => changes.push(list),
    onCommand: (_t, line) => commands.push(line),
  });

async function until(fn: () => boolean, timeout = 5000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 20));
  }
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "jig-term-"));
  process.env.JIG_HOME = dir;
  output = {};
  changes = [];
  commands = [];
});

describe.skipIf(process.platform === "win32")("TerminalManager", () => {
  it("runs a command, streams its output and reports the exit code", async () => {
    const m = manager();
    const t = m.create({ cwd: dir, command: "echo hello-from-jig; exit 3" });
    expect(t).toMatchObject({ status: "running", title: "echo hello-from-jig; exit 3" });
    await until(() => m.get(t.id).status === "exited");
    expect(m.get(t.id).exitCode).toBe(3);
    await until(() => (output[t.id] ?? "").includes("process exited"));
    expect(output[t.id]).toContain("hello-from-jig");
    expect(m.buffer(t.id)).toContain("hello-from-jig");
  });

  it("runs an interactive shell, records typed commands, resizes and closes", async () => {
    const m = manager();
    const t = m.create({ cwd: dir, projectId: "p" });
    m.resize(t.id, 120, 40);
    m.write(t.id, "echo typed-$((40+2))\r");
    await until(() => (output[t.id] ?? "").includes("typed-42"));
    expect(commands).toEqual(["echo typed-$((40+2))"]);
    m.rename(t.id, "My shell");
    expect(m.get(t.id).title).toBe("My shell");
    m.close(t.id);
    expect(m.list()).toEqual([]);
    expect(() => m.get(t.id)).toThrow();
  });

  it("does not record private terminals and kill keeps the terminal visible", async () => {
    const m = manager();
    const t = m.create({ cwd: dir, private: true });
    m.write(t.id, "echo secret\r");
    await until(() => (output[t.id] ?? "").includes("secret"));
    expect(commands).toEqual([]);
    m.kill(t.id);
    await until(() => m.get(t.id).status === "exited");
    expect(m.list()).toHaveLength(1);
  });

  it("reports a shell that can't start instead of throwing", () => {
    const m = new TerminalManager({
      spawn: () => {
        throw new Error("ENOENT");
      },
      shell: () => "nope-shell",
      env: () => ({}),
      onData: () => {},
      onChange: () => {},
    });
    const t = m.create({ cwd: dir });
    expect(t).toMatchObject({ status: "exited", exitCode: -1 });
    expect(m.buffer(t.id)).toContain("Could not start nope-shell");
  });

  it("names shells", () => {
    expect(shellName("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe")).toBe("powershell");
    expect(shellName("/bin/zsh")).toBe("zsh");
  });
});
