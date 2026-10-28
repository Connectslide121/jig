import { onActivity, publishActivity } from "../activity/bus";
import { addonService } from "../addons";
import { buildService } from "../builder";
import { getConfig, onConfigChange } from "../config";
import { getEngine, sessionEnv } from "../engine";
import { emit, handle } from "../ipc/router";
import { projectStore } from "../projects";
import { jigHome, paths } from "../state/paths";
import { ActivityLog } from "./activity";
import { REFLECTION_INSTRUCTIONS } from "./reflect";
import { LearningService } from "./service";

let service: LearningService | undefined;

export function learningService(): LearningService {
  if (!service) throw new Error("Learning not started");
  return service;
}

export async function startLearning(): Promise<void> {
  const projectPaths = new Map<string, string>();
  const refreshPaths = async () => {
    projectPaths.clear();
    for (const p of await projectStore().list()) projectPaths.set(p.id, p.path);
  };
  await refreshPaths();
  projectStore().onChange(() => void refreshPaths());

  const activity = new ActivityLog(
    paths.activity(),
    () => {
      const l = getConfig().learning;
      return { recording: l.recording, exclusions: l.exclusions, retentionDays: l.retentionDays };
    },
    (id) => (id ? projectPaths.get(id) : undefined),
  );
  onActivity((event) => void activity.record(event).catch(() => {}));

  service = new LearningService({
    file: paths.suggestions(),
    activity,
    schedule: () => getConfig().learning.schedule,
    recording: () => getConfig().learning.recording,
    catalog: () => addonService().catalog(),
    reflect: (prompt) => {
      const { engine, learning } = getConfig();
      return getEngine().oneShot(prompt, {
        cwd: jigHome(),
        model: learning.model,
        appendSystemPrompt: REFLECTION_INSTRUCTIONS,
        env: sessionEnv(process.env, engine.allowApiKey),
        claudePath: engine.claudePath,
      });
    },
    build: async (s) =>
      (await buildService().start({ goal: s.goal, origin: "suggestion", targetAddonId: s.addonId })).id,
    onChange: (state) => emit("learning.changed", state),
    notify: (n) => emit("notify", { title: n.title, message: n.message, tone: "info" }),
  });
  const s = service;
  await activity.prune().catch(() => {});
  setInterval(() => void activity.prune().catch(() => {}), 24 * 3_600_000).unref();
  await s.startSchedule();
  onConfigChange(() => s.arm());

  handle("learning.state", () => s.state());
  handle("learning.runNow", () => s.run("manual"));
  handle("learning.answer", ({ id, answer }) => s.answer(id, answer));
  handle("learning.clearActivity", async () => {
    await activity.clear();
    emit("learning.changed", await s.state());
  });
  handle("learning.record", ({ kind, text, detail, projectId }) =>
    publishActivity({ kind, text, detail, projectId }),
  );
}
