import { exec } from "node:child_process";
import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { aiLineHashes, correctionSignal } from "@jig/learning";
import { app, BrowserWindow, dialog, Notification } from "electron";
import { chatToMarkdown } from "../../shared/chatExport";
import type { PermissionMode, SessionMeta, SessionStatus } from "../../shared/engine";
import { JigError } from "../../shared/ipc";
import { publishActivity } from "../activity/bus";
import { appWindows } from "../appWindows";
import { getConfig } from "../config";
import { getEngine, sessionEnv } from "../engine";
import { jigContext, jigMcpServer, jigToolHandlers } from "../engine/jigTools";
import type { ToolOutput } from "../engine/types";
import { emit, handle } from "../ipc/router";
import { projectStore } from "../projects";
import { routinesChanged } from "../routines";
import { paths } from "../state/paths";
import { usageService } from "../usage";
import { SessionManager } from "./manager";
import { notificationFor } from "./notify";

let manager: SessionManager | undefined;

/**
 * Sessions of other kinds (the builder's) get their own instructions and tools. The builder module
 * registers here, so sessions don't depend on it.
 */
export interface SessionKindHooks {
  appendSystemPrompt: (meta: SessionMeta) => string;
  mcpServers: (meta: SessionMeta) => Record<string, unknown> | undefined;
  toolHandlers: (
    meta: SessionMeta,
  ) => Record<string, (args: Record<string, unknown>) => Promise<ToolOutput>> | undefined;
  onTurnEnd?: (meta: SessionMeta) => void;
  onWorking?: (meta: SessionMeta) => void;
}
const kindHooks = new Map<string, SessionKindHooks>();
export function registerSessionKind(kind: NonNullable<SessionMeta["kind"]>, hooks: SessionKindHooks): void {
  kindHooks.set(kind, hooks);
}

export function sessionManager(): SessionManager {
  if (!manager) throw new Error("Sessions not started");
  return manager;
}

export function startSessions(): void {
  // Names and instructions of the projects, for Jig's addition to the system prompt.
  const projects = new Map<string, { name: string; instructions?: string }>();
  const known = new Set<string>();
  const remember = (list: Array<{ id: string; name: string; instructions?: string }>) => {
    projects.clear();
    for (const p of list) projects.set(p.id, { name: p.name, instructions: p.instructions });
  };
  void projectStore()
    .list()
    .then((list) => {
      remember(list);
      for (const p of list) known.add(p.id);
    });
  projectStore().onChange((state) => {
    remember(state.projects);
    // A removed project: its chats move to "No project".
    for (const id of known)
      if (!projects.has(id)) {
        known.delete(id);
        void manager?.leaveProject(id);
      }
    for (const p of state.projects) known.add(p.id);
  });

  manager = new SessionManager({
    dir: paths.sessions(),
    attachmentsDir: paths.attachments(),
    engine: getEngine(),
    engineSettings: () => {
      const { engine } = getConfig();
      return {
        claudePath: engine.claudePath,
        allowApiKey: engine.allowApiKey,
        env: sessionEnv(process.env, engine.allowApiKey),
        promptSuggestions: engine.promptSuggestions,
        fileCheckpoints: engine.fileCheckpoints,
      };
    },
    appendSystemPrompt: (meta) =>
      kindHooks.get(meta.kind ?? "")?.appendSystemPrompt(meta) ??
      jigContext(meta, meta.projectId ? projects.get(meta.projectId) : undefined),
    mcpServers: (meta) => {
      const hooks = kindHooks.get(meta.kind ?? "");
      if (hooks) return hooks.mcpServers(meta);
      return getEngine().kind === "claude" ? { jig: jigMcpServer(meta) } : undefined;
    },
    toolHandlers: (meta) => {
      const hooks = kindHooks.get(meta.kind ?? "");
      return hooks ? hooks.toolHandlers(meta) : jigToolHandlers(meta);
    },
    onTurnEnd: (meta) => {
      kindHooks.get(meta.kind ?? "")?.onTurnEnd?.(meta);
      // A chat used some of the plan: refresh the usage meter (at most once a minute).
      usageService().refreshIfOlder(60_000);
    },
    onRateLimit: (event) => usageService().rateLimit(event),
    runShell: (cwd, command) => runShellCommand(cwd, command),
    onUpdate: (sessionId, updates) => {
      emit("sessions.update", { sessionId, updates });
      for (const u of updates) if (u.op === "meta") notifyStatus(u.meta);
      // Claude changed a routine from the chat: the Routines tab reloads.
      if (
        updates.some(
          (u) =>
            u.op === "upsert" &&
            u.item.kind === "tool" &&
            u.item.name === "RemoteTrigger" &&
            u.item.status === "done" &&
            ["create", "update", "run"].includes(String(u.item.input.action)),
        )
      )
        routinesChanged();
      for (const u of updates)
        if (u.op === "meta" && u.meta.kind && u.meta.status === "working")
          kindHooks.get(u.meta.kind)?.onWorking?.(u.meta);
    },
    onActivity: (event) => {
      const projectId = event.session.projectId;
      if (event.kind === "friction") {
        publishActivity({
          kind: "friction",
          text: event.text,
          projectId,
          detail: { signal: event.signal ?? "" },
        });
        return;
      }
      if (event.kind === "prompt") {
        publishActivity({ kind: "prompt", text: event.text, projectId, detail: { chat: event.session.id } });
        if (correctionSignal(event.text))
          publishActivity({
            kind: "friction",
            text: "corrected Claude",
            projectId,
            detail: { signal: "correction" },
          });
        return;
      }
      publishActivity({
        kind: "session.tool",
        text: event.text,
        projectId,
        detail: { tool: event.tool ?? "" },
      });
      // The lines Claude writes, as hashes, to tell them from hand-written ones at commit time (2e).
      const file = event.input?.file_path;
      if (event.tool && event.input && typeof file === "string") {
        const lines = aiLineHashes(event.tool, event.input);
        if (lines.length)
          publishActivity({ kind: "ai.lines", text: file, projectId, detail: { lines: lines.join(",") } });
      }
    },
  });
  const m = manager;

  // A system notification when a chat needs you or finishes while Jig is in the background.
  const lastStatus = new Map<string, SessionStatus>();
  function notifyStatus(meta: SessionMeta) {
    const previous = lastStatus.get(meta.id);
    lastStatus.set(meta.id, meta.status);
    const note = notificationFor(previous, meta);
    const windows = appWindows();
    if (!note || !getConfig().notifications.desktop || windows.some((w) => w.isFocused())) return;
    if (meta.status === "needs_you") for (const w of windows) w.flashFrame(true);
    if (!Notification.isSupported()) return;
    const n = new Notification({ title: note.title, body: note.body });
    n.on("click", () => {
      const w = appWindows()[0];
      if (w) {
        if (w.isMinimized()) w.restore();
        w.show();
        w.focus();
      }
      emit("sessions.reveal", { sessionId: meta.id });
    });
    n.show();
  }

  handle("sessions.list", () => m.list());
  handle("sessions.get", ({ id }) => m.snapshot(id));
  handle("sessions.create", async ({ projectId, title, cwd }) => {
    const project = projectId ? await projectStore().get(projectId) : undefined;
    const folder = cwd || project?.path;
    if (!folder) throw new JigError("invalid_args", "Choose a folder for a chat without a project");
    const info = await stat(folder).catch(() => undefined);
    if (!info?.isDirectory()) throw new JigError("not_a_folder", `${folder} is not a folder`);
    const { engine } = getConfig();
    // The project's defaults first, then Jig's.
    return m.create({
      projectId,
      cwd: folder,
      title,
      model: project?.model ?? engine.defaultModel,
      permissionMode: (project?.permissionMode ?? engine.defaultPermissionMode) as PermissionMode,
      effort: project?.effort,
    });
  });
  handle("sessions.setProject", async ({ id, projectId }) => {
    if (projectId) await projectStore().get(projectId);
    await m.setProject(id, projectId);
  });
  handle("sessions.setPinned", ({ id, pinned }) => m.setPinned(id, pinned));
  handle("sessions.send", ({ id, text, attachments, now }) => m.send(id, text, attachments, now));
  handle("sessions.rewind", ({ id, itemId, files }) => m.rewind(id, itemId, files));
  handle("sessions.runShell", ({ id, command }) => m.runShell(id, command));
  handle("sessions.remember", async ({ id, text, scope }) => {
    const { meta } = await m.snapshot(id);
    const path = scope === "user" ? join(homedir(), ".claude", "CLAUDE.md") : join(meta.cwd, "CLAUDE.md");
    await rememberLine(path, text);
    return { path };
  });
  handle("sessions.commands", ({ id }) => m.commands(id));
  handle("sessions.models", ({ id }) => m.models(id));
  handle("sessions.setEffort", ({ id, effort }) => m.setEffort(id, effort));
  handle("sessions.setDirs", ({ id, dirs }) => m.setDirs(id, dirs));
  handle("sessions.mcpStatus", ({ id }) => m.mcpStatus(id));
  handle("sessions.mcpReconnect", ({ id, name }) => m.mcpReconnect(id, name));
  handle("sessions.mcpToggle", ({ id, name, enabled }) => m.mcpToggle(id, name, enabled));
  handle("sessions.background", ({ id, toolUseId }) => m.background(id, toolUseId));
  handle("sessions.stopTask", ({ id, taskId }) => m.stopTask(id, taskId));
  handle("sessions.export", async ({ id }, ctx) => {
    const { meta, items } = await m.snapshot(id);
    const window = BrowserWindow.fromWebContents(ctx.sender);
    const name = `${meta.title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "chat"}.md`;
    const options = { title: "Save the chat as Markdown", defaultPath: join(app.getPath("documents"), name) };
    const picked = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options);
    if (picked.canceled || !picked.filePath) return undefined;
    await writeFile(picked.filePath, chatToMarkdown(meta, items));
    return picked.filePath;
  });
  handle("sessions.addAttachment", ({ id, ...input }) => m.addAttachment(id, input));
  handle("sessions.interrupt", ({ id }) => m.interrupt(id));
  handle("sessions.answerPermission", ({ id, requestId, decision }) =>
    m.answerPermission(id, requestId, decision),
  );
  handle("sessions.removeQueued", ({ id, queuedId }) => m.removeQueued(id, queuedId));
  handle("sessions.setModel", ({ id, model }) => m.setModel(id, model));
  handle("sessions.setPermissionMode", ({ id, mode }) => m.setPermissionMode(id, mode));
  handle("sessions.rename", ({ id, title }) => m.rename(id, title));
  handle("sessions.archive", ({ id, archived }) => m.setArchived(id, archived));
  handle("sessions.stop", ({ id }) => m.stopProcess(id));
  handle("sessions.fork", ({ id }) => m.fork(id));
  handle("sessions.rewindFiles", ({ id, itemId, dryRun }) => m.rewindFiles(id, itemId, dryRun));
  handle("sessions.delete", ({ id }) => m.delete(id));

  // Wait for the last session writes before quitting (once; the second quit goes through).
  let quitting = false;
  app.on("before-quit", (event) => {
    if (quitting) return;
    quitting = true;
    event.preventDefault();
    void m
      .shutdown()
      .catch(() => {})
      .finally(() => app.quit());
  });
}

/** Output kept from a `!` command (the end, where errors are). */
const SHELL_OUTPUT_MAX = 30_000;

/**
 * Runs a `!` command from the message box in the chat's folder: the user's shell (PowerShell on
 * Windows), the same environment as chats, at most 2 minutes. Output is stdout and stderr together.
 */
export function runShellCommand(cwd: string, command: string): Promise<{ output: string; exitCode: number }> {
  const shell = process.platform === "win32" ? "powershell.exe" : process.env.SHELL || "/bin/sh";
  return new Promise((resolve) => {
    exec(
      command,
      {
        cwd,
        shell,
        timeout: 120_000,
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
        env: sessionEnv(process.env, getConfig().engine.allowApiKey) as NodeJS.ProcessEnv,
      },
      (error, stdout, stderr) => {
        let output = [stdout, stderr]
          .filter((x) => x?.trim())
          .join("\n")
          .trimEnd();
        if (error?.killed) output += "\n(stopped after 2 minutes)";
        if (output.length > SHELL_OUTPUT_MAX) output = `…\n${output.slice(-SHELL_OUTPUT_MAX)}`;
        const code = typeof error?.code === "number" ? error.code : error ? 1 : 0;
        resolve({ output, exitCode: code });
      },
    );
  });
}

/** Appends a line to a CLAUDE.md file (Claude Code's memory), creating it when needed. */
export async function rememberLine(path: string, text: string): Promise<void> {
  const line = text.trim().replace(/^#\s*/, "");
  if (!line) throw new JigError("invalid_args", "Nothing to remember");
  await mkdir(dirname(path), { recursive: true });
  const existing = await readFile(path, "utf8").catch(() => "");
  const separator = existing && !existing.endsWith("\n") ? "\n" : "";
  await appendFile(path, `${separator}- ${line}\n`);
}
