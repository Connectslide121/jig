import { homedir } from "node:os";
import { spawn } from "@lydell/node-pty";
import { publishActivity } from "../activity/bus";
import { getConfig } from "../config";
import { getEngine, sessionEnv } from "../engine";
import { registerJigTools } from "../engine/jigTools";
import { emit, handle } from "../ipc/router";
import { projectStore } from "../projects";
import { claudeBinary } from "./claudeBinary";
import { terminalTools } from "./claudeTools";
import { TerminalManager } from "./manager";
import { defaultShell, makeWhich } from "./shell";

let manager: TerminalManager | undefined;

export function terminalManager(): TerminalManager {
  if (!manager) throw new Error("Terminals not started");
  return manager;
}

export function startTerminals(): void {
  const which = makeWhich(process.env);
  manager = new TerminalManager({
    spawn: spawn as never,
    shell: () => defaultShell(getConfig().terminal.shell, process.platform, process.env, which),
    // Terminals get the same environment rule as sessions: no stray API keys unless allowed.
    env: () => sessionEnv(process.env, getConfig().engine.allowApiKey),
    onData: (id, data) => emit("terminals.data", { id, data }),
    onChange: (terminals) => emit("terminals.changed", terminals),
    onCommand: (terminal, command) =>
      publishActivity({ kind: "terminal.command", text: command, projectId: terminal.projectId }),
  });
  const m = manager;
  registerJigTools(
    terminalTools({
      manager: () => m,
      projectPath: async (id) =>
        (
          await projectStore()
            .get(id)
            .catch(() => undefined)
        )?.path,
      reveal: (id) => emit("terminals.reveal", { id }),
    }),
  );

  handle("terminals.list", () => m.list());
  handle("terminals.create", async ({ projectId, cwd, command, title, cols, rows }) => {
    const folder = cwd ?? (projectId ? (await projectStore().get(projectId)).path : homedir());
    return m.create({ projectId, cwd: folder, command, title, cols, rows });
  });
  handle("terminals.write", ({ id, data }) => m.write(id, data));
  handle("terminals.resize", ({ id, cols, rows }) => m.resize(id, cols, rows));
  handle("terminals.buffer", ({ id }) => m.buffer(id));
  handle("terminals.rename", ({ id, title }) => m.rename(id, title));
  handle("terminals.kill", ({ id }) => m.kill(id));
  handle("terminals.close", ({ id }) => m.close(id));
  handle("terminals.claudeLogin", async ({ projectId }) => {
    const cwd = projectId ? (await projectStore().get(projectId)).path : homedir();
    // The fake engine never starts the real Claude Code, not even for this.
    if (getEngine().kind === "fake")
      return m.create({
        cwd,
        projectId,
        command: "echo Fake engine: this terminal would run Claude Code for /login",
        title: "Claude Code sign-in",
        private: true,
      });
    const binary = claudeBinary(getConfig().engine.claudePath);
    // A private terminal: nothing typed here (the sign-in code) is recorded anywhere.
    return binary
      ? m.create({ cwd, projectId, file: binary, args: [], title: "Claude Code sign-in", private: true })
      : m.create({ cwd, projectId, command: "claude", title: "Claude Code sign-in", private: true });
  });
}

export function stopTerminals(): void {
  manager?.closeAll();
}
