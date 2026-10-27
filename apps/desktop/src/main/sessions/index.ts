import { app } from "electron";
import type { PermissionMode } from "../../shared/engine";
import { getConfig } from "../config";
import { getEngine, sessionEnv } from "../engine";
import { jigContext, jigMcpServer } from "../engine/jigTools";
import { emit, handle } from "../ipc/router";
import { projectStore } from "../projects";
import { paths } from "../state/paths";
import { SessionManager } from "./manager";

let manager: SessionManager | undefined;
type ActivityListener = NonNullable<ConstructorParameters<typeof SessionManager>[0]["onActivity"]>;
const activityListeners = new Set<ActivityListener>();

export function sessionManager(): SessionManager {
  if (!manager) throw new Error("Sessions not started");
  return manager;
}

/** Session activity (prompts, tool calls) for the learning log. */
export function onSessionActivity(listener: ActivityListener): () => void {
  activityListeners.add(listener);
  return () => activityListeners.delete(listener);
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
    engine: getEngine(),
    engineSettings: () => {
      const { engine } = getConfig();
      return {
        claudePath: engine.claudePath,
        allowApiKey: engine.allowApiKey,
        env: sessionEnv(process.env, engine.allowApiKey),
      };
    },
    appendSystemPrompt: (meta) => jigContext(meta, projectNames.get(meta.projectId)),
    mcpServers: (meta) => (getEngine().kind === "claude" ? { jig: jigMcpServer(meta) } : undefined),
    onUpdate: (sessionId, updates) => emit("sessions.update", { sessionId, updates }),
    onActivity: (event) => {
      for (const listener of activityListeners) listener(event);
    },
  });
  const m = manager;

  handle("sessions.list", () => m.list());
  handle("sessions.get", ({ id }) => m.snapshot(id));
  handle("sessions.create", async ({ projectId, title }) => {
    const project = await projectStore().get(projectId);
    const { engine } = getConfig();
    return m.create({
      projectId,
      cwd: project.path,
      title,
      model: engine.defaultModel,
      permissionMode: engine.defaultPermissionMode as PermissionMode,
    });
  });
  handle("sessions.send", ({ id, text }) => m.send(id, text));
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
