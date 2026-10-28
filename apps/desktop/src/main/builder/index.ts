import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { app } from "electron";
import { addonService } from "../addons";
import { getConfig, updateConfig } from "../config";
import { getEngine } from "../engine";
import { setJigToolHandlers } from "../engine/jigTools";
import { emit, handle } from "../ipc/router";
import { getLayout, setLayout } from "../layout";
import { logger } from "../log";
import { restartWithLauncher } from "../selfmod/restart";
import { isJigRepo } from "../selfmod/workspace";
import { registerSessionKind, sessionManager } from "../sessions";
import { jigHome, paths } from "../state/paths";
import { BuildService } from "./service";

const log = logger("builder");
const here = dirname(fileURLToPath(import.meta.url));

/** Jig's source repository: the setting, or the repository Jig runs from (development). */
async function sourceRepo(): Promise<string | undefined> {
  const configured = getConfig().builder.sourcePath;
  if (configured) return configured;
  const running = join(app.getAppPath(), "..", "..");
  return (await isJigRepo(running)) ? running : undefined;
}

export function stopBuilder(): void {
  service?.stop();
}

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
    app: {
      sourceRepo,
      commands: () => {
        const b = getConfig().builder;
        return { check: b.checkCommand, build: b.buildCommand, install: b.installCommand };
      },
      home: jigHome(),
      workDir: paths.work(),
      appBuildsDir: paths.appBuilds(),
      electron: process.execPath,
      // JIG_NO_RESTART (tests): accept without restarting; Jig says a restart is pending.
      restart: process.env.JIG_NO_RESTART
        ? undefined
        : (appDir, previous) => {
            log.info(`Restarting through the launcher into ${appDir}`);
            restartWithLauncher({
              launcher: join(here, "launcher.mjs"),
              electron: process.execPath,
              app: appDir,
              previous,
              home: jigHome(),
            });
            app.quit();
          },
    },
    onChange: (jobs) => emit("builds.changed", jobs),
    notify: (n) => emit("notify", n),
  });
  const s = service;
  await s.load();

  registerSessionKind("builder", {
    appendSystemPrompt: (meta) => s.promptFor(meta),
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
  handle("builds.accept", ({ id, confirmProtected }) => s.accept(id, { confirmProtected }));
  handle("builds.startAppChange", ({ id }) => s.startAppChange(id));
  handle("builds.openPreview", ({ id }) => s.openPreview(id));
  handle("app.undoLastChange", () => s.undoLastAppChange());
  handle("builds.discard", ({ id }) => s.discard(id));
  handle("builds.diff", ({ id, path }) => s.diff(id, path));
}
