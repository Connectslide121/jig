import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "@lydell/node-pty";
import { describe, expect, it } from "vitest";
import type { SessionMeta } from "../../shared/engine";
import type { TerminalInfo } from "../../shared/terminals";
import { outputText } from "../engine/types";
import { exitNotice, terminalTools } from "./claudeTools";
import { TerminalManager } from "./manager";

describe("terminal tools for Claude", () => {
  it.skipIf(process.platform === "win32")(
    "runs, lists, reads and stops a command in a visible terminal",
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "jig-claude-term-"));
      const m = new TerminalManager({
        spawn: spawn as never,
        shell: () => "/bin/sh",
        env: () => ({ PATH: process.env.PATH, HOME: dir }),
        onData: () => {},
        onChange: () => {},
      });
      const revealed: string[] = [];
      const tools = Object.fromEntries(
        terminalTools({
          manager: () => m,
          projectPath: async () => dir,
          reveal: (id) => revealed.push(id),
        }).map((t) => [t.name, t]),
      );
      const meta = { id: "chat-1", projectId: "p", cwd: dir } as SessionMeta;
      const call = async (name: string, args: Record<string, unknown> = {}) =>
        outputText(await tools[name]!.handler(args, meta));

      const started = await call("jig_terminal_run", {
        command: "echo listening on 5173; sleep 30",
        title: "dev server",
      });
      expect(started).toContain("listening on 5173");
      const id = /terminal (\S+)/.exec(started)![1]!;
      expect(revealed).toEqual([id]);
      expect(m.get(id)).toMatchObject({ title: "Claude: dev server", sessionId: "chat-1" });

      expect(await call("jig_terminal_list")).toContain("running [started by Jig]");
      expect(await call("jig_terminal_read", { id })).toContain("listening on 5173");
      await expect(call("jig_terminal_run", { command: "ls", cwd: "/" })).rejects.toThrow(
        /inside the project/,
      );

      // Only terminals this chat started can be stopped.
      const other = m.create({ projectId: "p", cwd: dir, command: "sleep 30" });
      await expect(call("jig_terminal_stop", { id: other.id })).rejects.toThrow(
        /Only terminals this chat started/,
      );
      expect(await call("jig_terminal_stop", { id })).toBe(`Stopped and closed ${id}.`);
      expect(m.list().some((t) => t.id === id)).toBe(false);
      m.kill(other.id);
      expect(tools.jig_terminal_read!.readOnly).toBe(true);
      expect(tools.jig_terminal_run!.readOnly).toBeUndefined();
    },
  );

  it("tells the chat how a terminal it started ended, with the end of its output", () => {
    const t = { id: "t1", title: "Claude: Build", command: "npm run build", exitCode: 0 } as TerminalInfo;
    const ok = exitNotice(t, "\x1b[32mcompiled\x1b[0m\r\ndone\r\n");
    expect(ok.from).toBe('Terminal "Build" finished');
    expect(ok.text).toContain(
      'Terminal t1 "Build" (npm run build), which you started, has exited with code 0',
    );
    expect(ok.text).toContain("compiled\ndone");
    expect(ok.text).toMatch(/^\(Sent by Jig, not by the user\.\)/);
    expect(exitNotice({ ...t, exitCode: 2 }, "").from).toBe('Terminal "Build" failed with exit code 2');
  });
});
