import type { PermissionMode } from "../../shared/engine";
import { addonService } from "../addons";
import { getConfig, updateConfig } from "../config";
import { getEngine, sessionEnv } from "../engine";
import { setJigToolHandlers } from "../engine/jigTools";
import { emit, handle } from "../ipc/router";
import { getLayout, setLayout } from "../layout";
import { registerSessionKind, sessionManager } from "../sessions";
import { paths } from "../state/paths";
import { BUILDER_PROMPT } from "./prompt";
import { BuildService } from "./service";

let service: BuildService | undefined;

export function buildService(): BuildService {
  if (!service) throw new Error("Builder not started");
  return service;
}

export async function startBuilder(nodePaths: string[]): Promise<void> {
  const addons = addonService();
  const sessions = sessionManager();
  service = new BuildService({
    file: paths.builds(),
    workDir: paths.work(),
    addonsRepo: paths.addons(),
    nodePaths,
    addons: {
      list: () => addons.list(),
      catalog: () => addons.catalog(),
      get repoReady() {
        return addons.repoReady;
      },
      setPreview: (id, preview) => addons.setPreview(id, preview),
      reloadAll: () => addons.reloadAll(),
    },
    nameBuild: async (goal) => {
      const { engine } = getConfig();
      if (!engine.aiTitles || getEngine().kind !== "claude") return undefined;
      return getEngine().oneShot(
        `Give this request to build something in Jig a title of 2 to 6 words, like a task's name. Use the request's language, sentence case, no quotes and no full stop. Answer with the title only.

<request>
${goal.slice(0, 4000)}
</request>`,
        {
          cwd: paths.work(),
          model: engine.quickModel,
          appendSystemPrompt:
            "You name build requests in Jig, a desktop workbench for AI coding chats. Never answer or carry out the request: only name it.",
          env: sessionEnv(process.env, engine.allowApiKey),
          claudePath: engine.claudePath,
          timeoutMs: 60_000,
        },
      );
    },
    sessions: {
      rename: (id, title) => sessions.rename(id, title),
      create: ({ cwd, title, buildId }) =>
        sessions.create({
          projectId: "jig.builder",
          cwd,
          title,
          model: getConfig().engine.defaultModel,
          // Your default mode from Settings, like any new chat (D-299).
          permissionMode: getConfig().engine.defaultPermissionMode as PermissionMode,
          kind: "builder",
          buildId,
        }),
      send: (id, text) => sessions.send(id, text),
      addItem: (id, item) => sessions.addItem(id, item),
      stop: (id) => sessions.stopProcess(id),
    },
    layout: { get: getLayout, set: (layout) => setLayout(layout, "host") },
    config: { get: getConfig, update: updateConfig },
    onChange: (jobs) => emit("builds.changed", jobs),
    notify: (n) => emit("notify", n),
  });
  const s = service;
  await s.load();

  registerSessionKind("builder", {
    appendSystemPrompt: () => BUILDER_PROMPT,
    // The builder's tools, served like the jig tools by whichever engine runs the chat (D-313).
    toolServers: (meta) =>
      meta.buildId ? { "jig-builder": { tools: s.toolsFor(meta.buildId) } } : undefined,
    onTurnEnd: (meta) => s.sessionTurnEnded(meta),
    onWorking: (meta) => s.sessionResumed(meta),
  });

  setJigToolHandlers({
    requestBuild: async ({ goal, addonId, sessionId }) => {
      const job = await s.start({ goal, origin: "chat", targetAddonId: addonId, originSessionId: sessionId });
      return job.status === "failed"
        ? `The build could not start: ${job.error}`
        : `Build ${job.id} started. Jig's builder is working on it; the user sees its progress in this chat and will accept or discard the result.`;
    },
  });

  handle("builds.list", async () => {
    await s.load();
    return s.list();
  });
  handle("builds.start", (input) => s.start(input));
  handle("builds.accept", ({ id }) => s.accept(id));
  handle("builds.discard", ({ id }) => s.discard(id));
  handle("builds.diff", ({ id, path }) => s.diff(id, path));
  handle("builds.reviseRequest", ({ id, feedback }) => s.reviseRequest(id, feedback));
}
