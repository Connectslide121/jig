import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { spawn } from "@lydell/node-pty";
import { JigError } from "../../shared/ipc";
import { publishActivity } from "../activity/bus";
import { azureTag, withAzureEnv } from "../azure/env";
import { getConfig } from "../config";
import { getEngine, sessionEnv } from "../engine";
import { registerJigTools } from "../engine/jigTools";
import { emit, handle } from "../ipc/router";
import { projectStore } from "../projects";
import { CODEX_UNSET_ENV, codexBinary } from "../providers";
import { type CodexSignIn, parseCodexLoginStatus } from "../providers/codex";
import { sessionManager } from "../sessions";
import { execTool } from "../setup/checks";
import { type ClaudeSignIn, parseSignIn } from "../setup/signIn";
import { refreshChatGptUsage } from "../usage";
import { claudeBinary } from "./claudeBinary";
import { exitNotice, terminalTools } from "./claudeTools";
import { TerminalManager } from "./manager";
import { defaultShell, makeWhich } from "./shell";
import { detectShells } from "./shells";

let manager: TerminalManager | undefined;
/** The terminal running Claude Code's sign-in: when it ends, Jig asks whether it worked. */
let signInTerminal: string | undefined;
/** The terminal running the Codex CLI's ChatGPT sign-in (D-294). */
let codexSignInTerminal: string | undefined;

export function terminalManager(): TerminalManager {
  if (!manager) throw new Error("Terminals not started");
  return manager;
}

export function startTerminals(): void {
  const which = makeWhich(process.env);
  manager = new TerminalManager({
    spawn: spawn as never,
    shell: () => defaultShell(getConfig().terminal.shell, process.platform, process.env, which),
    // Terminals (and scripts, which run in them) get the same environment as chats: no stray API
    // keys unless allowed, and the active Azure tenant's sign-in for az (D-285).
    env: () => withAzureEnv(sessionEnv(process.env, getConfig().engine.allowApiKey)),
    tenant: azureTag,
    onData: (id, data) => emit("terminals.data", { id, data }),
    onChange: (terminals) => emit("terminals.changed", terminals),
    onCommand: (terminal, command) =>
      publishActivity({ kind: "terminal.command", text: command, projectId: terminal.projectId }),
    // A script that fails by itself is friction for Learning (not one you stopped).
    onExit: (terminal) => {
      if (terminal.id === signInTerminal) void afterSignIn(terminal.id);
      if (terminal.id === codexSignInTerminal) void afterCodexSignIn(terminal.id);
      // A command Claude started has finished: tell its chat, so Claude reacts instead of polling.
      if (terminal.sessionId) {
        const notice = exitNotice(terminal, manager?.buffer(terminal.id) ?? "");
        void Promise.resolve()
          .then(() => sessionManager().notify(terminal.sessionId!, notice.text, notice.from))
          .catch(() => {});
      }
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
  const shells = () =>
    detectShells({
      platform: process.platform,
      env: process.env,
      exists: existsSync,
      list: (dir) => {
        try {
          return readdirSync(dir);
        } catch {
          return [];
        }
      },
      read: (path) => {
        try {
          return readFileSync(path, "utf8");
        } catch {
          return undefined;
        }
      },
      which,
    });
  handle("terminals.shells", () => shells());
  handle("terminals.create", async ({ projectId, cwd, command, shell, title, cols, rows }) => {
    const folder = cwd ?? (projectId ? (await projectStore().get(projectId)).path : homedir());
    // The renderer may pick a shell, but only one the host detected (or the configured one).
    if (shell && shell !== getConfig().terminal.shell && !shells().options.some((o) => o.path === shell))
      throw new JigError("invalid_args", "That shell was not found on this machine");
    return m.create({ projectId, cwd: folder, command, shell, title, cols, rows });
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

  // The Codex CLI's own ChatGPT sign-in (`codex login`): it opens the browser and ends once you're in.
  handle("terminals.codexLogin", async ({ projectId }) => {
    const cwd = projectId ? (await projectStore().get(projectId)).path : homedir();
    const title = "ChatGPT sign-in (Codex)";
    const binary = codexBinary();
    if (getEngine().kind !== "fake" && !binary)
      throw new JigError(
        "codex_missing",
        "The Codex CLI isn't installed. See Get started → ChatGPT (Codex).",
      );
    // A private terminal, like Claude Code's sign-in; without OPENAI_API_KEY so Codex asks for ChatGPT.
    const t =
      getEngine().kind === "fake"
        ? m.create({
            cwd,
            projectId,
            command: "echo Fake engine: Codex would sign you in to ChatGPT here",
            title,
            private: true,
          })
        : /\.(cmd|bat|ps1)$/i.test(binary!)
          ? m.create({
              cwd,
              projectId,
              command: "codex login",
              title,
              private: true,
              unsetEnv: CODEX_UNSET_ENV,
            })
          : m.create({
              cwd,
              projectId,
              file: binary!,
              args: ["login"],
              title,
              private: true,
              unsetEnv: CODEX_UNSET_ENV,
            });
    codexSignInTerminal = t.id;
    return t;
  });

  /** The Codex sign-in ended: ask Codex whether it worked, say so, and close the terminal if it did. */
  async function afterCodexSignIn(id: string) {
    codexSignInTerminal = undefined;
    const binary = codexBinary();
    const signIn: CodexSignIn =
      getEngine().kind === "fake"
        ? { loggedIn: true, method: "the fake engine" }
        : binary
          ? (parseCodexLoginStatus((await execTool(binary, ["login", "status"])).stdout) ?? {
              loggedIn: false,
            })
          : { loggedIn: false };
    emit("codex.signIn", signIn);
    refreshChatGptUsage();
    if (signIn.loggedIn) m.close(id);
  }

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
