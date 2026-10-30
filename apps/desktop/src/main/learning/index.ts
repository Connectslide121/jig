import { dirname } from "node:path";
import { maskSecrets } from "@jig/learning";
import { z } from "zod";
import type { EvidenceNote, WorkedState } from "../../shared/learning";
import { onActivity, publishActivity } from "../activity/bus";
import { addonService } from "../addons";
import { buildService } from "../builder";
import { getConfig, onConfigChange, updateConfig } from "../config";
import { card } from "../configure/tools";
import { getEngine, sessionEnv } from "../engine";
import { registerJigTools } from "../engine/jigTools";
import { emit, handle } from "../ipc/router";
import { projectStore } from "../projects";
import { sessionManager } from "../sessions";
import { jigHome, paths } from "../state/paths";
import { ActivityLog, isExcluded } from "./activity";
import { claudeWrittenLines } from "./claudeLines";
import { KnowledgeStore, profileIsEmpty } from "./knowledge";
import { profileInterviewPrompt, REFLECTION_INSTRUCTIONS } from "./reflect";
import { LearningService } from "./service";
import { ANYWHERE, computeWorked } from "./worked";

let service: LearningService | undefined;
let knowledge: KnowledgeStore | undefined;

export function knowledgeStore(): KnowledgeStore {
  if (!knowledge) throw new Error("Learning not started");
  return knowledge;
}

const CATEGORIES = ["manual-work", "outside-jig", "frustration", "chore", "preference", "other"] as const;

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
  const k = new KnowledgeStore({ evidence: paths.evidence(), profile: paths.profile() }, () =>
    emit("learning.knowledgeChanged", undefined),
  );
  knowledge = k;

  // "How you worked": the project and workspace repositories plus the ones Claude wrote in.
  let worked: WorkedState | undefined;
  const computeWorkedNow = async (refresh = false) => {
    if (!refresh && worked && Date.now() - new Date(worked.at).getTime() < 3_600_000) return worked;
    const state = await projectStore().state();
    const repos = new Set<string>();
    for (const w of state.workspaces) {
      if (w.isGitRepo) repos.add(w.path);
      for (const r of w.repos) repos.add(r.path);
    }
    const events = await activity.read(21);
    for (const e of events) if (e.kind === "ai.lines") repos.add(dirname(e.text));
    // What Claude wrote in chats outside Jig (Claude Code's own history) counts as Claude's too, and
    // the folders it wrote in are measured (D-162). Chats from the last 28 days: 21 read + 7 shown.
    const elsewhere = await claudeWrittenLines(getEngine(), new Date(Date.now() - 28 * 86_400_000)).catch(
      () => new Map<string, Set<string>>(),
    );
    for (const file of elsewhere.keys()) if (file !== ANYWHERE) repos.add(dirname(file));
    worked = await computeWorked([...repos], events, new Date(), elsewhere);
    return worked;
  };

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
    knowledge: k,
    worked: async () => (await computeWorkedNow()).text || undefined,
    checkInFrequency: () => getConfig().learning.checkIn,
    setCheckInFrequency: async (frequency) => {
      await updateConfig({ learning: { checkIn: frequency } });
    },
  });
  const s = service;
  await activity.prune().catch(() => {});
  setInterval(() => void activity.prune().catch(() => {}), 24 * 3_600_000).unref();
  await s.startSchedule();
  // The schedule or the check-in setting may have changed.
  let checkInWas = getConfig().learning.checkIn;
  onConfigChange(() => {
    s.arm();
    if (getConfig().learning.checkIn === checkInWas) return;
    checkInWas = getConfig().learning.checkIn;
    void s.state().then((state) => emit("learning.changed", state));
  });

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
  handle("learning.knowledge", async () => {
    const profile = await k.profile();
    const counts = new Map<string, number>();
    for (const e of await activity.read(28)) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
    return {
      profile: profile.text,
      profileExists: profile.exists,
      profileEmpty: profileIsEmpty(profile.text),
      notes: [...(await k.list())].reverse(),
      activity: [...counts.entries()]
        .map(([kind, count]) => ({ kind, count }))
        .sort((a, b) => b.count - a.count),
    };
  });
  handle("learning.setProfile", ({ text }) => k.setProfile(text));
  handle("learning.removeNote", async ({ id }) => {
    await k.remove(id);
  });
  handle("learning.clearNotes", () => k.clear());
  handle("learning.worked", ({ refresh }) => computeWorkedNow(refresh));
  handle("learning.interview", async () => ({
    prompt: profileInterviewPrompt((await k.profile()).text, await k.recent(30)),
  }));
  handle("learning.checkIn", async ({ action }) => ({ prompt: await s.checkIn(action) }));

  registerJigTools([
    {
      name: "jig_note_evidence",
      description:
        "Save a short note for Jig's suggestions when the user mentions work they do by hand, work outside Jig (other tools, portals, a VM, Postman, the browser's network tab), frustration, a chore, or a preference about how they work. Don't ask first; Jig shows a card the user can remove. One note per thing; use the user's words where possible. Never include secrets or pasted content.",
      shape: {
        note: z.string().min(3).max(500).describe("What the user does or said, in a sentence"),
        category: z.enum(CATEGORIES).describe("What kind of evidence this is"),
      },
      readOnly: true,
      handler: async (args, meta) => {
        const { recording, exclusions } = getConfig().learning;
        if (!recording) return "Not saved: the user has paused learning in Jig.";
        const text = maskSecrets(String(args.note).trim());
        if (
          isExcluded(
            { kind: "evidence", text },
            exclusions,
            meta.projectId ? projectPaths.get(meta.projectId) : undefined,
          )
        )
          return "Not saved: it matches something the user asked Jig never to record.";
        const note: EvidenceNote = await k.add({
          text,
          category: args.category as EvidenceNote["category"],
          projectId: meta.projectId,
          sessionId: meta.id,
        });
        publishActivity({
          kind: "evidence",
          text: note.text,
          projectId: meta.projectId,
          detail: { category: note.category },
        });
        await sessionManager().addItem(
          meta.id,
          card("Noted for suggestions", [note.text], { type: "evidence", id: note.id }),
        );
        return `Saved (${note.id}). The user sees it as a card and can remove it.`;
      },
    },
    {
      name: "jig_read_profile",
      description:
        "Read the user's profile in Jig: how they work (stack, how they release and deploy, tools outside Jig, preferences, what they know well). Markdown.",
      shape: {},
      readOnly: true,
      handler: async () => (await k.profile()).text,
    },
    {
      name: "jig_update_profile",
      description:
        "Add short facts to the user's profile in Jig (after a check-in, or when the user tells you how they work and wants Jig to remember it). Adds bullets under a heading; the user sees a card with Undo.",
      shape: {
        lines: z.array(z.string().min(2).max(300)).min(1).max(20).describe("Short facts, one per line"),
        heading: z
          .string()
          .max(80)
          .optional()
          .describe(
            "Section: Stack, How I release and deploy, Tools I use outside Jig, Preferences, What I already know well",
          ),
      },
      handler: async (args, meta) => {
        const before = (await k.profile()).text;
        const lines = (args.lines as string[]).map((l) => l.trim()).filter(Boolean);
        await k.addToProfile(lines, args.heading as string | undefined);
        await sessionManager().addItem(
          meta.id,
          card("Added to what Jig knows about you", lines, { type: "profile", text: before }),
        );
        return "Added to the profile.";
      },
    },
  ]);
}
