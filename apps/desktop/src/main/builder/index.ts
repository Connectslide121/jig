import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { addonService } from "../addons";
import { getConfig, updateConfig } from "../config";
import { getEngine } from "../engine";
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
    sessions: {
      create: ({ cwd, title, buildId }) =>
        sessions.create({
          projectId: "jig.builder",
          cwd,
          title,
          model: getConfig().engine.defaultModel,
          permissionMode: "acceptEdits",
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
    mcpServers: (meta) => {
      if (getEngine().kind !== "claude" || !meta.buildId) return undefined;
      const tools = s.toolsFor(meta.buildId).map((t) =>
        tool(t.name, t.description, t.shape, async (args) => {
          try {
            return {
              content: [{ type: "text" as const, text: await t.handler(args as Record<string, unknown>) }],
            };
          } catch (error) {
            return {
              content: [{ type: "text" as const, text: `Error: ${(error as Error).message}` }],
              isError: true,
            };
          }
        }),
      );
      return { "jig-builder": createSdkMcpServer({ name: "jig-builder", version: "1.0.0", tools }) };
    },
    toolHandlers: (meta) =>
      meta.buildId ? Object.fromEntries(s.toolsFor(meta.buildId).map((t) => [t.name, t.handler])) : undefined,
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
