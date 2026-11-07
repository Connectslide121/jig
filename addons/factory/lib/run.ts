import type { Published } from "./publish";
/**
 * Jig factory's data model and its transitions (docs/plan/28-factory/architecture.md → Data model).
 * Every change to a run is a pure function here, so the Conductor (host.ts) stays a thin loop and the
 * rules are unit-tested. Functions return a new run; they never change the one they are given.
 */

export type Level = "L1" | "L2" | "L3";
export type TrackId = "new-idea" | "existing-product" | "change-request" | "tender";
export type GateId = "G0" | "GD" | "G1" | "G2" | "G3" | "G4" | "G4m" | "G5";
export type RunState = "interview" | "planning" | "running" | "waiting" | "stuck" | "done" | "stopped";
export type StageStatus = "blocked" | "ready" | "running" | "needs-you" | "done" | "failed" | "skipped";
export type OutputStatus = "draft" | "reviewed" | "approved" | "published" | "rejected" | "superseded";
export type GateStatus = "closed" | "waiting" | "approved" | "changes" | "rejected";

/** The brief's front-matter and how much of the interview's topics it covers. */
export interface BriefMeta {
  status: OutputStatus;
  level?: Level;
  product?: string;
  audience?: string;
  coverage: { covered: number; total: number };
}

export interface Run {
  id: string;
  slug: string;
  title: string;
  projectId: string;
  repo?: string;
  track: TrackId;
  level?: Level;
  languages: Record<string, string>;
  state: RunState;
  brief?: BriefMeta;
  owners: Partial<Record<GateId, Owner>>;
  stages: StageRun[];
  outputs: Output[];
  gates: GateState[];
  createdAt: string;
  updatedAt: string;
  source: { kind: "typed" | "voice" | "meeting" | "message" | "ticket"; ref?: string };
  /** What the run makes and how its chats ask (the Plan step; session 2: the start modal). */
  plan?: RunPlan;
  /**
   * Where the run works (D-451): its git worktree on `factory/<slug>`, or `null` when it works in the
   * repository itself (a repository without commits). Unset on sample runs.
   */
  worktree?: string | null;
  /** Question cards stages asked (`factory_questions`), answered or not. */
  questions?: Question[];
  /** The run and stage it was forked from. */
  forkOf?: { runId: string; stage: string };
  /** A new brand's direction picked at GD (`2-bold`, its board in `directions/`, D-462). */
  direction?: string;
  /** The Pages page the demo is shown as (Show in Pages, D-462): each version updates it. */
  demoPage?: string;
  /** Its cards on your phone (D-468, `lib/phone.ts`): card key (`gate:G1`, `ask:<stage>`…) → message id. */
  phone?: Record<string, string>;
  /** Copies of the demo published outside Jig (D-470, `lib/publish.ts`), taken down ones included. */
  published?: Published[];
  /** The release package a change request went into (D-471, `lib/package.ts`): its day and folder. */
  packaged?: { day: string; path: string; at: string };
  /**
   * A recipe eval (D-472, `lib/evals.ts`): a golden brief run up to its quality gate. Jig decides its
   * gates and stops it there; it stays out of estimates, the report and the release package.
   */
  eval?: { brief: string; recipes: Record<string, string> };
}

export interface RunPlan {
  /** The pack's outputs (the fan-out's recipes): `spec`, `stories`, `pitch`… */
  outputs: string[];
  /** Whether S8 builds the product after the docs gate. */
  build: boolean;
  /** How stage chats ask: Accept edits, or Don't ask when you picked it (D-449). */
  permissionMode: "acceptEdits" | "bypassPermissions";
  /** An existing product (its kit is extracted) or a new one (three directions). */
  productExists: boolean;
  /**
   * A critical bug (change requests, D-471): it skips the demo, the quote and the release package and is
   * fixed at once. From the intake's brief (`critical: true`), changeable on the Plan step.
   */
  critical?: boolean;
  /** Confirmed by a person: the start dialog, or the Plan step (D-460). The Plan step then passes by itself. */
  confirmed?: boolean;
  /**
   * Where gates other people own get their cards (D-435, D-469): a board the project follows in the
   * Boards add-on (its id and name) and the card type. None: they decide in Jig.
   */
  approvals?: { boardId: string; name: string; type: string };
}

export interface Question {
  id: string;
  stage: string;
  round: number;
  text: string;
  suggestion?: string;
  options?: string[];
  askedAt: string;
  answer?: string;
  answeredAt?: string;
}

/** What a stage reported with `factory_report`. */
export interface StageReport {
  summary: string;
  outputs: string[];
  notes: string[];
  /** The critic's verdict (critique stages). */
  quality?: { pass: boolean; score?: number };
  /** The stage says it couldn't do its work: it is retried once, then waits for you. */
  failed?: boolean;
}

export interface StageRun {
  id: string;
  recipe: string;
  status: StageStatus;
  chatId?: string;
  attempt: number;
  version?: number;
  startedAt?: string;
  endedAt?: string;
  report?: StageReport;
  /** Every chat the stage ran in, oldest first (a retry starts a new one); `chatId` is the last. */
  chats?: string[];
  /** When the Conductor last sent the stage's prompt, a nudge or a "carry on". */
  sentAt?: string;
  nudgedAt?: string;
  resumedAt?: string;
  /** What the stage asked a person (`factory_ask`), or why it waits for you. */
  question?: string;
  /** What its chat waits for while it runs: the plan's reset, or you in the chat. */
  chatNote?: string;
  /** A gate's "Ask for changes" note this version must address. */
  feedback?: string;
  /** Why the stage was skipped, when it says (no ChatGPT sign-in for an image stage, D-446). */
  skipReason?: string;
  /** The teaser's Motion video (D-458): rendering until its MP4 is in, and what went wrong. */
  video?: { id: string; rendering?: boolean; note?: string };
}

export interface OutputHistoryEntry {
  status: OutputStatus;
  by: string;
  at: string;
  edited: boolean;
  note?: string;
}

export interface Output {
  id: string;
  kind: string;
  /** The stage that wrote it. */
  stage?: string;
  path: string;
  version: number;
  status: OutputStatus;
  history: OutputHistoryEntry[];
  /** The file's content hash when Jig wrote it: a review compares it to see whether a person edited it. */
  hash?: string;
}

export interface Owner {
  kind: "me" | "person";
  name?: string;
  board?: { org: string; project: string };
}

export interface Pin {
  screen: string;
  x: number;
  y: number;
  device: "desktop" | "tablet" | "phone";
  text: string;
}

export interface GateState {
  id: GateId;
  status: GateStatus;
  revisions: number;
  decidedBy?: string;
  /** When its status last changed: opened (waiting) or decided. */
  at?: string;
  note?: string;
  pins?: Pin[];
  /** Its card on the run's approvals board, while a person owns it (D-469). */
  card?: BoardCard;
}

/** A gate's card on a board (D-469): which revision it was last told about, how many comments were read. */
export interface BoardCard {
  id: number;
  url: string;
  round: number;
  seen: number;
}

/** Who writes AI-made drafts in an output's history. AI only ever writes `draft`. */
export const JIG = "jig";
/** Who a person's own decisions are recorded as (the gate owner "me"). */
export const ME = "me";

const now = () => new Date().toISOString();

function touch(run: Run, at: string): Run {
  return { ...run, updatedAt: at };
}

function stageAt(run: Run, stageId: string): { i: number; stage: StageRun } {
  const i = run.stages.findIndex((s) => s.id === stageId);
  const stage = run.stages[i];
  if (!stage) throw new Error(`No stage ${stageId} in run ${run.id}`);
  return { i, stage };
}

function withStage(run: Run, stageId: string, change: (s: StageRun) => StageRun): Run {
  const { i, stage } = stageAt(run, stageId);
  const stages = run.stages.slice();
  stages[i] = change(stage);
  return { ...run, stages };
}

/** Adds a stage (or replaces one with the same id), `blocked` unless given another status. */
export function addStage(run: Run, stage: Pick<StageRun, "id" | "recipe"> & Partial<StageRun>): Run {
  const next: StageRun = { status: "blocked", attempt: 0, ...stage };
  const stages = run.stages.some((s) => s.id === stage.id)
    ? run.stages.map((s) => (s.id === stage.id ? next : s))
    : [...run.stages, next];
  return { ...run, stages };
}

/** A stage starts in its chat. Only a `ready` stage can start (a failed one is made ready to retry). */
export function startStage(run: Run, stageId: string, input: { chatId?: string; at?: string } = {}): Run {
  const at = input.at ?? now();
  const s = stageAt(run, stageId).stage;
  if (s.status !== "ready") throw new Error(`Stage ${stageId} is ${s.status}, not ready`);
  return deriveState(
    touch(
      withStage(run, stageId, (x) => ({
        ...x,
        status: "running",
        chatId: input.chatId ?? x.chatId,
        attempt: x.attempt + 1,
        startedAt: at,
        endedAt: undefined,
      })),
      at,
    ),
  );
}

/** The stage reported (`factory_report`) and its chat is done. */
export function finishStage(run: Run, stageId: string, report: StageRun["report"], at = now()): Run {
  const s = stageAt(run, stageId).stage;
  if (s.status !== "running" && s.status !== "needs-you")
    throw new Error(`Stage ${stageId} is ${s.status}, not running`);
  return deriveState(
    touch(
      withStage(run, stageId, (x) => ({ ...x, status: "done", endedAt: at, report })),
      at,
    ),
  );
}

/**
 * The stage failed its own checks. It goes back to `ready` while it has automatic retries left
 * (`retries`, 1 by default, so a stage gets two tries), else it waits for a person (`needs-you`).
 */
export function failStage(run: Run, stageId: string, input: { retries?: number; at?: string } = {}): Run {
  const at = input.at ?? now();
  const retries = input.retries ?? 1;
  return deriveState(
    touch(
      withStage(run, stageId, (x) => ({
        ...x,
        status: x.attempt <= retries ? "ready" : "needs-you",
        endedAt: at,
      })),
      at,
    ),
  );
}

/** A stage that waits for a person (`factory_ask`, or no report after a nudge). */
export function stageNeedsYou(run: Run, stageId: string, at = now()): Run {
  return deriveState(
    touch(
      withStage(run, stageId, (x) => ({ ...x, status: "needs-you" })),
      at,
    ),
  );
}

/** A stage that waited for you works again (you answered in its chat). */
export function resumeStage(run: Run, stageId: string, at = now()): Run {
  const s = stageAt(run, stageId).stage;
  if (s.status !== "needs-you") return run;
  return deriveState(
    touch(
      withStage(run, stageId, (x) => ({ ...x, status: "running", question: undefined, nudgedAt: undefined })),
      at,
    ),
  );
}

/** Changes a stage's bookkeeping (chat, times, report, question) without changing its status. */
export function patchStage(
  run: Run,
  stageId: string,
  change: Partial<Omit<StageRun, "id" | "status">>,
  at = now(),
): Run {
  return touch(
    withStage(run, stageId, (x) => ({ ...x, ...change })),
    at,
  );
}

/** Sets a stage's status as the graph decided (`blocked` → `ready` or `skipped`). */
export function setStageStatus(run: Run, stageId: string, status: "ready" | "skipped" | "blocked"): Run {
  return deriveState(withStage(run, stageId, (x) => ({ ...x, status })));
}

function gateIndex(run: Run, gateId: GateId): number {
  return run.gates.findIndex((g) => g.id === gateId);
}

/** A gate opens: it waits for its owner. Adds the gate when the run doesn't have it yet. */
export function openGate(run: Run, gateId: GateId, at = now()): Run {
  const i = gateIndex(run, gateId);
  const gates = run.gates.slice();
  const base: GateState = gates[i] ?? { id: gateId, status: "closed", revisions: 0 };
  const next: GateState = { ...base, status: "waiting", at, decidedBy: undefined, note: undefined };
  if (i >= 0) gates[i] = next;
  else gates.push(next);
  return deriveState(touch({ ...run, gates }, at));
}

export type GateDecision =
  | { kind: "approve"; by: string; note?: string }
  | { kind: "changes"; by: string; note?: string; pins?: Pin[] }
  | { kind: "reject"; by: string; note?: string };

/**
 * The gate's owner decides. "Ask for changes" uses one AI revision; once the gate has used `cap`
 * revisions (3 by default) another request stops the run with "needs a person" (`stuck`). Rejecting
 * stops the run.
 */
export function decideGate(
  run: Run,
  gateId: GateId,
  decision: GateDecision,
  input: { cap?: number; at?: string } = {},
): Run {
  const at = input.at ?? now();
  const cap = input.cap ?? 3;
  const i = gateIndex(run, gateId);
  const g = run.gates[i];
  if (g?.status !== "waiting") throw new Error(`Gate ${gateId} isn't waiting`);
  const gates = run.gates.slice();
  if (decision.kind === "changes") {
    const over = g.revisions >= cap;
    gates[i] = {
      ...g,
      status: "changes",
      revisions: over ? g.revisions : g.revisions + 1,
      decidedBy: decision.by,
      at,
      note: decision.note,
      pins: decision.pins,
    };
    if (over) return { ...touch({ ...run, gates }, at), state: "stuck" };
    return deriveState(touch({ ...run, gates }, at));
  }
  gates[i] = {
    ...g,
    status: decision.kind === "approve" ? "approved" : "rejected",
    decidedBy: decision.by,
    at,
    note: decision.note,
  };
  if (decision.kind === "reject") return { ...touch({ ...run, gates }, at), state: "stopped" };
  return deriveState(touch({ ...run, gates }, at));
}

/** A new output (or a new version of one), always a `draft` by Jig. Older open versions are superseded. */
export function addOutput(run: Run, output: Omit<Output, "status" | "history">, at = now()): Run {
  const draft: Output = {
    ...output,
    status: "draft",
    history: [{ status: "draft", by: JIG, at, edited: false }],
  };
  const outputs = run.outputs.map((o) =>
    o.kind === output.kind && o.id !== output.id && o.version < output.version && isOpen(o.status)
      ? {
          ...o,
          status: "superseded" as const,
          history: [...o.history, { status: "superseded" as const, by: JIG, at, edited: false }],
        }
      : o,
  );
  const i = outputs.findIndex((o) => o.id === output.id);
  if (i >= 0) outputs[i] = draft;
  else outputs.push(draft);
  return touch({ ...run, outputs }, at);
}

function isOpen(s: OutputStatus): boolean {
  return s === "draft" || s === "reviewed" || s === "approved";
}

/** Which status an output may move to from which (`draft → reviewed → approved → published`). */
export const OUTPUT_MOVES: Record<OutputStatus, OutputStatus[]> = {
  draft: ["reviewed", "approved", "rejected", "superseded"],
  reviewed: ["approved", "rejected", "superseded"],
  approved: ["published", "superseded"],
  published: ["superseded"],
  rejected: [],
  superseded: [],
};

/**
 * A person moves an output on; the move is recorded (who, when, whether they edited it). Jig itself
 * may only supersede (a newer version); every other move is a person's.
 */
export function moveOutput(
  run: Run,
  outputId: string,
  to: OutputStatus,
  input: { by: string; edited?: boolean; note?: string; at?: string },
): Run {
  const at = input.at ?? now();
  const i = run.outputs.findIndex((o) => o.id === outputId);
  const o = run.outputs[i];
  if (!o) throw new Error(`No output ${outputId}`);
  if (!OUTPUT_MOVES[o.status].includes(to)) throw new Error(`An output can't go from ${o.status} to ${to}`);
  if (input.by === JIG && to !== "superseded") throw new Error("Only a person moves an output on");
  const outputs = run.outputs.slice();
  outputs[i] = {
    ...o,
    status: to,
    history: [
      ...o.history,
      { status: to, by: input.by, at, edited: input.edited ?? false, note: input.note },
    ],
  };
  return touch({ ...run, outputs }, at);
}

/**
 * The run's state from its stages and gates: `waiting` while a gate or a stage waits for a person,
 * `running` while anything is left, `done` when nothing is. `interview`, `planning`, `stuck` and
 * `stopped` are set by the Conductor and kept.
 */
export function deriveState(run: Run): Run {
  if (run.state === "stopped" || run.state === "stuck") return run;
  if (run.state === "interview" || run.state === "planning") return run;
  const waiting =
    run.gates.some((g) => g.status === "waiting") || run.stages.some((s) => s.status === "needs-you");
  const left =
    run.stages.some((s) => s.status === "running" || s.status === "ready" || s.status === "blocked") ||
    run.gates.some((g) => g.status === "closed" || g.status === "changes");
  const state: RunState = waiting ? "waiting" : left ? "running" : "done";
  return state === run.state ? run : { ...run, state };
}

/** One line of a run's timeline: what happened when. */
export interface TimelineEvent {
  at: string;
  text: string;
  kind: "stage" | "gate" | "output";
}

const GATE_WORDS: Record<GateStatus, string> = {
  closed: "",
  waiting: "waits for its owner",
  approved: "approved",
  changes: "changes asked",
  rejected: "rejected",
};

const who = (by: string) => (by === ME ? "you" : by === JIG ? "Jig" : by);

/** The run's timeline, oldest first, from its stages, gates and output histories. */
export function timeline(run: Run, label: (stage: StageRun) => string = (s) => s.id): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (const s of run.stages) {
    if (s.startedAt) events.push({ at: s.startedAt, kind: "stage", text: `${label(s)} started` });
    if (s.endedAt && s.status === "done")
      events.push({ at: s.endedAt, kind: "stage", text: s.report?.summary || `${label(s)} done` });
  }
  for (const g of run.gates) {
    if (!g.at || g.status === "closed") continue;
    const by = g.decidedBy && g.status !== "waiting" ? ` by ${who(g.decidedBy)}` : "";
    events.push({ at: g.at, kind: "gate", text: `${g.id} ${GATE_WORDS[g.status]}${by}` });
  }
  for (const o of run.outputs) {
    for (const h of o.history.slice(1))
      events.push({ at: h.at, kind: "output", text: `${outputName(o)} ${h.status} by ${who(h.by)}` });
  }
  for (const p of run.published ?? []) {
    const where = p.url ?? "this computer";
    events.push({ at: p.at, kind: "output", text: `Demo v${p.version} published to ${where}` });
    if (p.takenDown)
      events.push({ at: p.takenDown, kind: "output", text: `Demo v${p.version} taken down from ${where}` });
  }
  if (run.packaged)
    events.push({
      at: run.packaged.at,
      kind: "output",
      text: `In the release package of ${run.packaged.day}`,
    });
  return events.sort((a, b) => a.at.localeCompare(b.at));
}

const KIND_LABEL: Record<string, string> = {
  brief: "Brief",
  scout: "Scout notes",
  kit: "Product kit",
  directions: "Design directions",
  demo: "Demo",
  spec: "Spec",
  stories: "User stories",
  tests: "Test cases",
  pitch: "Pitch",
  deck: "Deck",
  "release-notes": "Release notes",
  glossary: "Glossary changes",
  "deck-images": "Deck images",
  "one-pager": "One-pager",
  "one-pager-images": "One-pager image",
  objections: "Objection handling",
  letter: "Customer letter",
  "course-sales": "Sales course",
  "course-customer": "Customer course",
  article: "Article",
  linkedin: "LinkedIn drafts",
  "marketing-images": "Marketing images",
  teaser: "Teaser",
  "sales-letter": "Sales letter",
  marketing: "Marketing",
  newsletter: "Newsletter",
  post: "Post",
  code: "Code",
  quote: "Quote",
  "tender-matrix": "Requirement matrix",
  "tender-gaps": "Gap report",
};

/** An output's name as cards and the inbox show it: "Demo v2", "Spec v1". */
/** An output kind's name ("Spec", "Deck as images"); a stage's other files read "Deck (file)". */
export function kindLabel(kind: string): string {
  if (kind.endsWith("-file")) return `${kindLabel(kind.slice(0, -5))} (file)`;
  return KIND_LABEL[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1).replace(/-/g, " ");
}

export function outputName(output: { kind: string; version: number }): string {
  return `${kindLabel(output.kind)} v${output.version}`;
}

/** An idea from elsewhere (a meeting's ⋯ menu) waiting for the New idea dialog (global storage). */
export interface PendingIdea {
  text: string;
  title?: string;
  source: Run["source"];
  at: string;
}

export const PENDING_IDEA = "pending-idea";
