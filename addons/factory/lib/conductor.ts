/**
 * The Conductor's decisions, pure (architecture.md → The stage runner): the graph's facts from a run,
 * moving a run on through its track, what to do with a stage's chat after a turn, re-running from a
 * stage and forking. The host (host.ts) only reads and writes what these return.
 */
import type { AddonChatInfo } from "@jig/sdk";
import { reviewerOf } from "./gates";
import { changeTargets, downstream, type Facts, itemId, nextSteps, type Track } from "./graph";
import { addStage, deriveState, type GateId, openGate, type Run, type StageRun, setStageStatus } from "./run";

const now = () => new Date().toISOString();

/** What the graph knows about a run besides its stages and gates. */
export function factsOf(run: Run): Facts {
  const demo = run.stages.find((s) => s.id === "S5");
  const critique = run.stages.find((s) => s.id === "S6");
  return {
    "product.exists": run.plan?.productExists ?? false,
    "quality.pass":
      critique?.status === "done" &&
      critique.report?.quality?.pass === true &&
      (critique.version ?? 1) === (demo?.version ?? 1),
    "plan.outputs": run.plan?.outputs ?? [],
    "build.requested": run.plan?.build ?? false,
  };
}

function stageOf(run: Run, id: string): StageRun | undefined {
  return run.stages.find((s) => s.id === id);
}

/**
 * Moves a run on as far as its graph allows without a chat: stages become ready or skipped, gates
 * open, a failed quality check loops back to the demo. Returns the run and the gates it opened.
 * Stopped, stuck and finished runs stay as they are.
 */
export function advance(track: Track, input: Run, at = now()): { run: Run; opened: GateId[] } {
  let run = input;
  const opened: GateId[] = [];
  if (run.state === "stopped" || run.state === "stuck") return { run, opened };
  if (run.state === "planning" || run.state === "interview") run = { ...run, state: "running" };
  for (let guard = 0; guard < 100; guard++) {
    const steps = nextSteps(track, run, factsOf(run));
    if (!steps.length) break;
    for (const step of steps) {
      if (step.kind === "open") {
        run = openGate(run, step.gate, at);
        opened.push(step.gate);
      } else if (step.kind === "skip") {
        run = stageOf(run, step.stage)
          ? setStageStatus(run, step.stage, "skipped")
          : addStage(run, { id: step.stage, recipe: step.stage, status: "skipped" });
      } else if (step.kind === "start") {
        const old = stageOf(run, step.stage);
        const item = track.stages.find((i) => itemId(i) === step.stage);
        // A looped stage (the critic) works on the version of the stage it loops back to; a stage that
        // ran before (everything after a re-run stage) makes its next version.
        const version = item?.loop
          ? (stageOf(run, item.loop.back)?.version ?? 1)
          : old?.startedAt
            ? (old.version ?? 1) + 1
            : (old?.version ?? 1);
        run = addStage(run, {
          ...old,
          id: step.stage,
          recipe: step.recipe,
          status: "ready",
          attempt: old?.attempt ?? 0,
          version,
        });
      } else {
        // The quality check failed: the demo is built again as the next version, then checked again.
        const back = stageOf(run, step.back);
        const looped = track.stages.find((i) => i.loop?.back === step.back);
        if (back)
          run = addStage(run, {
            ...back,
            status: "ready",
            attempt: 0,
            version: step.round,
            report: undefined,
            question: undefined,
            sentAt: undefined,
            nudgedAt: undefined,
            resumedAt: undefined,
            startedAt: undefined,
            endedAt: undefined,
            feedback: fixesOf(run, looped ? itemId(looped) : undefined),
          });
        if (looped) run = setStageStatus(run, itemId(looped), "blocked");
      }
    }
    run = deriveState(run);
  }
  return { run: settle(run), opened };
}

/** The run's state: `interview` until its interview (S1) is over, else what its stages and gates say. */
export function settle(input: Run): Run {
  if (input.state === "stopped" || input.state === "stuck") return input;
  const s1 = input.stages.find((s) => s.id === "S1");
  const interviewing = !!s1 && s1.status !== "done" && s1.status !== "skipped";
  if (interviewing) return input.state === "interview" ? input : { ...input, state: "interview" };
  return deriveState(
    input.state === "interview" || input.state === "planning" ? { ...input, state: "running" } : input,
  );
}

/** The critic's notes for the next version of the demo. */
function fixesOf(run: Run, critic?: string): string | undefined {
  const r = critic ? stageOf(run, critic)?.report : undefined;
  if (!r) return undefined;
  return [`The quality check failed: ${r.summary}`, ...r.notes.map((n) => `- ${n}`)].join("\n");
}

/** Stage chats running now, across every run (they share `factory.concurrency`). */
export function runningCount(runs: Run[]): number {
  return runs
    .filter((r) => r.state !== "stopped")
    .reduce((n, r) => n + r.stages.filter((s) => s.status === "running").length, 0);
}

/** A run's stages that may start now, in the track's order. */
export function readyStages(run: Run): StageRun[] {
  if (run.state === "stopped" || run.state === "stuck") return [];
  return run.stages.filter((s) => s.status === "ready");
}

const idsOf = (track: Track, run: Run, ids: Iterable<string>): Set<string> => {
  const out = new Set<string>();
  for (const id of ids) {
    out.add(id);
    // A fan-out stands for its instances (`S7` → `S7:spec`, `S7:pitch`…).
    if (track.stages.some((i) => i.fanout === id))
      for (const s of run.stages) if (s.id.startsWith(`${id}:`)) out.add(s.id);
  }
  return out;
};

/**
 * Runs stages again (Re-run, Ask for changes, Fork): each becomes ready as its next version, with the
 * note to address; everything after them waits again, and the gates after them are taken off (they
 * open again when their stages are done). `keepGate` is the gate that asked for the changes: it
 * closes, keeping its revision count, and opens again when the new version is in.
 */
export function resetFrom(
  track: Track,
  input: Run,
  stageIds: string[],
  options: { feedback?: string; keepGate?: GateId; at?: string } = {},
): Run {
  const at = options.at ?? now();
  const targets = idsOf(track, input, stageIds);
  const after = new Set<string>();
  for (const id of targets) for (const d of downstream(track, id.split(":")[0] ?? id)) after.add(d);
  const later = idsOf(track, input, after);
  for (const id of targets) later.delete(id);
  const stages = input.stages.map((s): StageRun => {
    if (targets.has(s.id))
      return {
        ...s,
        status: "ready",
        attempt: 0,
        version: (s.version ?? 1) + 1,
        feedback: options.feedback,
        report: undefined,
        question: undefined,
        chatNote: undefined,
        sentAt: undefined,
        nudgedAt: undefined,
        resumedAt: undefined,
        startedAt: undefined,
        endedAt: undefined,
      };
    if (later.has(s.id) && s.status !== "skipped")
      return { ...s, status: "blocked", report: undefined, question: undefined, chatNote: undefined };
    return s;
  });
  const gates = input.gates
    .filter((g) => g.id === options.keepGate || !later.has(g.id))
    .map((g) => (g.id === options.keepGate ? { ...g, status: "closed" as const } : g));
  const state =
    input.state === "stopped" || input.state === "done" || input.state === "stuck" ? "running" : input.state;
  return settle({ ...input, stages, gates, state, updatedAt: at });
}

/** "Ask for changes" at a gate: the stages it runs again. */
export function changesAt(track: Track, run: Run, gate: GateId): string[] {
  const ids = changeTargets(track, gate);
  return ids.filter((id) => run.stages.some((s) => s.id === id || s.id.startsWith(`${id}:`)));
}

/**
 * A new run from an old one, from a stage on ("redo from the demo with this change"): the stages
 * before it keep their results, it and everything after run again. Outputs of the stages that run
 * again are left out; the rest are copied as they were.
 */
export function forkRun(
  track: Track,
  run: Run,
  stageId: string,
  next: { id: string; slug: string; title: string; worktree?: string | null; feedback?: string; at?: string },
): Run {
  const at = next.at ?? now();
  const again = idsOf(track, run, [stageId, ...downstream(track, stageId.split(":")[0] ?? stageId)]);
  const copy: Run = {
    ...run,
    id: next.id,
    slug: next.slug,
    title: next.title,
    worktree: next.worktree,
    forkOf: { runId: run.id, stage: stageId },
    createdAt: at,
    updatedAt: at,
    outputs: run.outputs.filter((o) => !o.stage || !again.has(o.stage)),
    questions: run.questions?.filter((q) => !again.has(q.stage)),
    // The fork's stages start in chats of their own.
    stages: run.stages.map((s) => (again.has(s.id) ? { ...s, chatId: undefined, chats: [] } : s)),
  };
  return resetFrom(track, copy, [stageId], { feedback: next.feedback, at });
}

/** The draft outputs a gate reviews (its kinds, not superseded). */
export function gateOutputs(run: Run, gate: GateId) {
  return run.outputs.filter(
    (o) => reviewerOf(o.kind) === gate && o.status !== "superseded" && o.status !== "rejected",
  );
}

/** The chat fields the stage runner reads. */
export type ChatState = Pick<
  AddonChatInfo,
  "status" | "background" | "queued" | "lastAnswerAt" | "cutOffAt" | "userStoppedAt" | "limit" | "waitingFor"
>;

/** Background work a stage's chat may still be finishing before its turn counts as over (D-318). */
export const BACKGROUND_WAIT_MS = 10 * 60_000;

/**
 * What the Conductor does with a running stage's chat:
 * - `resume`: Jig closed in the middle of the stage's turn: tell it once to carry on.
 * - `wait`: still working, work in the background, a plan limit, or no answer yet.
 * - `finish` / `fail`: the turn is over and the stage reported (done, or that it couldn't).
 * - `ask`: the stage asked a person (questions, `factory_ask`), or ended twice without a report, or
 *   you stopped it: it waits for you.
 * - `nudge`: it ended without a report: ask once for the report.
 * - `error`: the chat failed: the stage fails (and is retried once).
 */
export type TurnStep = "wait" | "resume" | "nudge" | "finish" | "fail" | "ask" | "error";

/** When the Conductor last wrote to the stage's chat: its prompt, a nudge, a "carry on" or answers. */
export function lastSent(stage: StageRun): string {
  return (
    [stage.sentAt, stage.nudgedAt, stage.resumedAt]
      .filter((x): x is string => !!x)
      .sort()
      .at(-1) ?? ""
  );
}

export function afterTurn(
  stage: StageRun,
  chat: ChatState,
  input: { now?: number; catchingUp?: boolean; openQuestions?: number } = {},
): TurnStep {
  const nowMs = input.now ?? Date.now();
  const sent = lastSent(stage);
  if (chat.limit) return "wait";
  if (chat.status === "error") return stage.report ? (stage.report.failed ? "fail" : "finish") : "error";
  if (chat.status !== "idle") return "wait";
  const answered = !!chat.lastAnswerAt && chat.lastAnswerAt >= sent;
  const cutOff = !!chat.cutOffAt && chat.cutOffAt >= sent;
  if (cutOff && !stage.resumedAt && !stage.report) return "resume";
  if (!answered) {
    // Idle without an answer since the last message: after a restart, Jig closed before it got to it.
    if (input.catchingUp && !chat.background && !chat.queued && !stage.report)
      return stage.resumedAt ? "ask" : "resume";
    return "wait";
  }
  if (chat.background && !stage.report && nowMs - Date.parse(chat.lastAnswerAt ?? sent) < BACKGROUND_WAIT_MS)
    return "wait";
  if (stage.report) return stage.report.failed ? "fail" : "finish";
  if (chat.userStoppedAt && chat.userStoppedAt >= sent) return "ask";
  if (stage.question || (input.openQuestions ?? 0) > 0) return "ask";
  return stage.nudgedAt ? "ask" : "nudge";
}

/** What a running stage's chat waits for, for the run page. */
export function chatNote(chat: ChatState): string | undefined {
  if (chat.limit) return chat.limit.state === "continuing" ? undefined : "Waiting for the plan's reset";
  if (chat.status === "needs_you")
    return chat.waitingFor === "permission"
      ? "Waits for your permission in its chat"
      : chat.waitingFor === "plan"
        ? "Waits for you to approve a plan in its chat"
        : "Waits for your answer in its chat";
  return undefined;
}

/** The message that asks a stage's chat for its report, never for more work. */
export function nudgeText(run: Run, stage: StageRun): string {
  return [
    `[factory nudge run ${run.id} stage ${stage.id}]`,
    `Jig factory asks for the report of stage ${stage.id} of "${run.title}".`,
    "If your work is done, call addon_factory_report with the files you wrote. If it isn't and you can't go on, call addon_factory_ask with what you need.",
    "Don't start other work.",
  ].join("\n");
}

/** The message that tells a stage's chat to carry on after Jig closed in the middle of its turn. */
export function resumeText(run: Run, stage: StageRun): string {
  return [
    `[factory resume run ${run.id} stage ${stage.id}]`,
    `Jig restarted while you were working on stage ${stage.id} of "${run.title}", so your last turn was cut off.`,
    "Carry on where you left off (check what is already written first), then call addon_factory_report.",
  ].join("\n");
}

/** Your answers to a stage's questions, as the message its chat gets. */
export function answersText(
  run: Run,
  stage: StageRun,
  round: number,
  answers: Array<{ text: string; answer: string }>,
): string {
  return [
    `[factory answers run ${run.id} stage ${stage.id} round ${round}]`,
    "The answers to your questions:",
    ...answers.map((a) => `- ${a.text}\n  → ${a.answer}`),
  ].join("\n");
}
