import { app } from "electron";
import type { PermissionMode, SessionMeta } from "../../shared/engine";
import { JigError } from "../../shared/ipc";
import { publishActivity } from "../activity/bus";
import { getConfig } from "../config";
import { getEngine, sessionEnv } from "../engine";
import { jigContext, jigMcpServer, jigToolHandlers } from "../engine/jigTools";
import { emit, handle } from "../ipc/router";
import { projectStore } from "../projects";
import { paths } from "../state/paths";
import { isInside } from "../themes/sources";
import { usageService } from "../usage";
import { SessionManager } from "./manager";

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
  ) => Record<string, (args: Record<string, unknown>) => Promise<string>> | undefined;
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
  const projectNames = new Map<string, string>();
  void projectStore()
    .list()
    .then((list) => {
      for (const p of list) projectNames.set(p.id, p.name);
    });
  projectStore().onChange((state) => {
    projectNames.clear();
    for (const p of state.projects) projectNames.set(p.id, p.name);
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
      jigContext(meta, projectNames.get(meta.projectId)),
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
    onUpdate: (sessionId, updates) => {
      emit("sessions.update", { sessionId, updates });
      for (const u of updates)
        if (u.op === "meta" && u.meta.kind && u.meta.status === "working")
          kindHooks.get(u.meta.kind)?.onWorking?.(u.meta);
    },
    onActivity: (event) =>
      publishActivity(
        event.kind === "prompt"
          ? { kind: "prompt", text: event.text, projectId: event.session.projectId }
          : {
              kind: "session.tool",
              text: event.text,
              projectId: event.session.projectId,
              detail: { tool: event.tool ?? "" },
            },
      ),
  });
  const m = manager;

  handle("sessions.list", () => m.list());
  handle("sessions.get", ({ id }) => m.snapshot(id));
  handle("sessions.create", async ({ projectId, title, cwd }) => {
    const project = await projectStore().get(projectId);
    if (cwd && !isInside(cwd, project.path))
      throw new JigError("invalid_args", "A chat's folder must be inside its project");
    const { engine } = getConfig();
    return m.create({
      projectId,
      cwd: cwd || project.path,
      title,
      model: engine.defaultModel,
      permissionMode: engine.defaultPermissionMode as PermissionMode,
    });
  });
  handle("sessions.send", ({ id, text, attachments }) => m.send(id, text, attachments));
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
  handle("sessions.delete", ({ id }) => m.delete(id));

  app.on("before-quit", () => {
    void m.shutdown();
  });
}
