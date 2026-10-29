import { homedir } from "node:os";
import { spawn } from "@lydell/node-pty";
import { publishActivity } from "../activity/bus";
import { getConfig } from "../config";
import { getEngine, sessionEnv } from "../engine";
import { registerJigTools } from "../engine/jigTools";
import { emit, handle } from "../ipc/router";
import { projectStore } from "../projects";
import { execTool } from "../setup/checks";
import { type ClaudeSignIn, parseSignIn } from "../setup/signIn";
import { claudeBinary } from "./claudeBinary";
import { terminalTools } from "./claudeTools";
import { TerminalManager } from "./manager";
import { defaultShell, makeWhich } from "./shell";

let manager: TerminalManager | undefined;
/** The terminal running Claude Code's sign-in: when it ends, Jig asks whether it worked. */
let signInTerminal: string | undefined;

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
    // A script that fails by itself is friction for Learning (not one you stopped).
    onExit: (terminal) => {
      if (terminal.id === signInTerminal) void afterSignIn(terminal.id);
      if (terminal.scriptId && !terminal.private && terminal.exitCode && terminal.exitCode > 0)
        publishActivity({
          kind: "friction",
          text: terminal.title,
          projectId: terminal.projectId,
          detail: { signal: "script-failed", code: String(terminal.exitCode) },
        });
    },
  });
  const m = manager;
  registerJigTools(
    terminalTools({
      manager: () => m,
      projectPath: async (id) =>
        id
          ? (
              await projectStore()
                .get(id)
                .catch(() => undefined)
            )?.path
          : undefined,
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
  // Claude Code's own sign-in (`claude auth login`), which ends by itself once you're signed in.
  handle("terminals.claudeLogin", async ({ projectId }) => {
    const cwd = projectId ? (await projectStore().get(projectId)).path : homedir();
    const title = "Claude Code sign-in";
    // The fake engine never starts the real Claude Code, not even for this.
    const binary = claudeBinary(getConfig().engine.claudePath);
    // A private terminal: nothing typed here (the sign-in code) is recorded anywhere.
    const t =
      getEngine().kind === "fake"
        ? m.create({
            cwd,
            projectId,
            command: "echo Fake engine: Claude Code would sign you in here",
            title,
            private: true,
          })
        : binary
          ? m.create({ cwd, projectId, file: binary, args: ["auth", "login"], title, private: true })
          : m.create({ cwd, projectId, command: "claude auth login", title, private: true });
    signInTerminal = t.id;
    return t;
  });

  /** The sign-in ended: ask Claude Code whether it worked, say so, and close the terminal if it did. */
  async function afterSignIn(id: string) {
    signInTerminal = undefined;
    const binary = claudeBinary(getConfig().engine.claudePath) ?? "claude";
    const signIn: ClaudeSignIn =
      getEngine().kind === "fake"
        ? { loggedIn: true, method: "the fake engine" }
        : (parseSignIn((await execTool(binary, ["auth", "status", "--json"])).stdout) ?? { loggedIn: false });
    emit("claude.signIn", signIn);
    if (signIn.loggedIn) m.close(id);
  }
}

export function stopTerminals(): void {
  manager?.closeAll();
}
