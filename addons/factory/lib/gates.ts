/**
 * Gates and who decides them (docs/plan/28-factory/pipeline.md → Gates; D-433, D-435): labels, owners,
 * caps, what waits for a person (the inbox) and the trust numbers (approved without edits, time to
 * review). Pure.
 */
import {
  type GateId,
  type GateStatus,
  ME,
  type Output,
  type OutputStatus,
  type Owner,
  outputName,
  type Run,
} from "./run";

export const GATES: Record<GateId, { label: string; short: string }> = {
  G0: { label: "Go / no-go", short: "Go / no-go" },
  GD: { label: "Pick a direction", short: "Direction" },
  G1: { label: "Demo review", short: "Demo" },
  G2: { label: "Docs review", short: "Docs" },
  G3: { label: "Build merged", short: "Build" },
  G4: { label: "Sales material", short: "Sales" },
  G4m: { label: "Marketing", short: "Marketing" },
  G5: { label: "Publish", short: "Publish" },
};

export const GATE_ORDER: GateId[] = ["G0", "GD", "G1", "G2", "G3", "G4", "G4m", "G5"];

/** Which gate reviews which output kind; unknown kinds are docs (G2). */
const REVIEWER: Record<string, GateId> = {
  brief: "G0",
  scout: "G0",
  directions: "GD",
  kit: "G1",
  demo: "G1",
  quality: "G1",
  spec: "G2",
  stories: "G2",
  tests: "G2",
  "release-notes": "G2",
  glossary: "G2",
  code: "G3",
  pitch: "G4",
  deck: "G4",
  "deck-images": "G4",
  "one-pager": "G4",
  "one-pager-images": "G4",
  objections: "G4",
  letter: "G4",
  "course-sales": "G4",
  "course-customer": "G4",
  "sales-letter": "G4",
  marketing: "G4m",
  article: "G4m",
  linkedin: "G4m",
  newsletter: "G4m",
  "marketing-images": "G4m",
  teaser: "G4m",
  post: "G4m",
};

/** The gate that reviews an output kind; a stage's other files (`deck-file`) go with its main output. */
export function reviewerOf(kind: string): GateId {
  return REVIEWER[mainKind(kind)] ?? "G2";
}

/** The main output's kind of a stage's other file: `deck-file` → `deck`. */
export function mainKind(kind: string): string {
  return kind.endsWith("-file") ? kind.slice(0, -5) : kind;
}

/** Whether an output is a stage's other file (a PDF, the HTML form, an image), reviewed with its main output. */
export function isFile(o: { kind: string }): boolean {
  return o.kind.endsWith("-file");
}

/** A main output's other files: the same stage and version, kind `<kind>-file`. */
export function filesOf(run: Run, o: Output): Output[] {
  return run.outputs.filter(
    (x) => x.id !== o.id && isFile(x) && x.stage === o.stage && x.version === o.version,
  );
}

/** A gate's owner: set per run on the Plan step (D-433); you when nobody was picked. */
export function ownerOf(run: Run, gate: GateId): Owner {
  return run.owners[gate] ?? { kind: "me" };
}

export function isMine(owner: Owner): boolean {
  return owner.kind === "me";
}

export function ownerName(owner: Owner): string {
  return isMine(owner) ? "You" : owner.name || "Someone";
}

/** AI revisions a gate has left before the run needs a person. */
export function revisionsLeft(run: Run, gate: GateId, cap = 3): number {
  const used = run.gates.find((g) => g.id === gate)?.revisions ?? 0;
  return Math.max(0, cap - used);
}

/** Automatic retries a stage has left before it waits for you. */
export function retriesLeft(run: Run, stageId: string, retries = 1): number {
  const attempt = run.stages.find((s) => s.id === stageId)?.attempt ?? 0;
  return Math.max(0, retries + 1 - attempt);
}

export type InboxGroup = GateId | "ask" | "stuck";

/** One row of the inbox: a gate, an output or a question waiting for a person. */
export interface InboxItem {
  key: string;
  runId: string;
  projectId: string;
  runTitle: string;
  group: InboxGroup;
  kind: "gate" | "output" | "ask" | "stuck";
  /** What waits: "Demo v2", "spec v1", "Interview question"… */
  label: string;
  outputId?: string;
  stageId?: string;
  /** Since when it waits (ISO). */
  since: string;
  owner: Owner;
  status: "waiting" | "draft" | "reviewed" | "needs-you" | "stuck";
}

const PENDING: OutputStatus[] = ["draft", "reviewed"];

function pendingOutputs(run: Run, gate: GateId): Output[] {
  return run.outputs.filter((o) => !isFile(o) && reviewerOf(o.kind) === gate && PENDING.includes(o.status));
}

/**
 * Everything waiting for a person across runs. A waiting gate with outputs to review lists each
 * output (approve / edit / reject one by one); a gate without any is one row. A stage asking
 * something and a run that used its revisions are rows too. Oldest first in each group.
 */
export function inbox(runs: Run[]): InboxItem[] {
  const items: InboxItem[] = [];
  for (const run of runs) {
    if (run.state === "stopped" || run.state === "done") continue;
    const base = { runId: run.id, projectId: run.projectId, runTitle: run.title };
    if (run.state === "stuck") {
      const g = [...run.gates].reverse().find((x) => x.status === "changes");
      items.push({
        ...base,
        key: `${run.id}:stuck`,
        group: "stuck",
        kind: "stuck",
        label: g ? `${GATES[g.id].label}: out of revisions` : "Needs a person",
        since: g?.at ?? run.updatedAt,
        owner: g ? ownerOf(run, g.id) : { kind: "me" },
        status: "stuck",
      });
      continue;
    }
    for (const g of run.gates) {
      if (g.status !== "waiting") continue;
      const owner = ownerOf(run, g.id);
      const outs = pendingOutputs(run, g.id);
      if (outs.length === 0) {
        items.push({
          ...base,
          key: `${run.id}:${g.id}`,
          group: g.id,
          kind: "gate",
          label: GATES[g.id].label,
          since: g.at ?? run.updatedAt,
          owner,
          status: "waiting",
        });
        continue;
      }
      for (const o of outs)
        items.push({
          ...base,
          key: `${run.id}:${o.id}`,
          group: g.id,
          kind: "output",
          label: outputName(o),
          outputId: o.id,
          since: o.history[o.history.length - 1]?.at ?? g.at ?? run.updatedAt,
          owner,
          status: o.status === "reviewed" ? "reviewed" : "draft",
        });
    }
    for (const s of run.stages) {
      if (s.status !== "needs-you") continue;
      items.push({
        ...base,
        key: `${run.id}:${s.id}`,
        group: "ask",
        kind: "ask",
        label: s.recipe === "plan" ? "Plan the run" : `${stageName(s.id)} asks you`,
        stageId: s.id,
        since: s.endedAt ?? s.startedAt ?? run.updatedAt,
        owner: { kind: "me" },
        status: "needs-you",
      });
    }
  }
  return items.sort((a, b) => groupRank(a.group) - groupRank(b.group) || a.since.localeCompare(b.since));
}

/** A stage's name in the inbox: "S7:marketing" → "Marketing", "S2" stays "S2". */
function stageName(id: string): string {
  const sub = id.split(":")[1];
  return sub ? outputName({ kind: sub, version: 0 }).replace(/ v0$/, "") : id;
}

function groupRank(g: InboxGroup): number {
  if (g === "stuck") return -2;
  if (g === "ask") return -1;
  return GATE_ORDER.indexOf(g);
}

export function groupLabel(g: InboxGroup): string {
  if (g === "stuck") return "Needs a person";
  if (g === "ask") return "Questions";
  return GATES[g].label;
}

/** The top bar's count: inbox rows owned by you. */
export function mineCount(items: InboxItem[]): number {
  return items.filter((i) => isMine(i.owner)).length;
}

/** Whether a gate waits for you in this run (a card's "you" chip). */
export function waitsForMe(run: Run): boolean {
  return mineCount(inbox([run])) > 0;
}

/** Trust numbers: how much of what Jig drafts is approved as is, and how long reviews take. */
export interface Trust {
  decided: number;
  approvedAsIs: number;
  /** approvedAsIs / decided, or undefined with nothing decided. */
  rate?: number;
  /** Median minutes from a draft to a person's decision. */
  reviewMinutes?: number;
}

const DECIDED: OutputStatus[] = ["approved", "rejected"];

export function trust(outputs: Output[]): Trust {
  let decided = 0;
  let asIs = 0;
  const waits: number[] = [];
  for (const o of outputs) {
    const draft = o.history.find((h) => h.status === "draft");
    const decision = o.history.find((h) => DECIDED.includes(h.status));
    if (!decision) continue;
    decided++;
    const edited = o.history.some((h) => h.edited);
    if (decision.status === "approved" && !edited) asIs++;
    if (draft) waits.push((Date.parse(decision.at) - Date.parse(draft.at)) / 60_000);
  }
  return {
    decided,
    approvedAsIs: asIs,
    rate: decided ? asIs / decided : undefined,
    reviewMinutes: median(waits),
  };
}

export function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

/** A gate status's words and badge tone, for pills. */
export const GATE_STATUS: Record<
  GateStatus,
  { label: string; tone: "neutral" | "warning" | "success" | "danger" | "info" }
> = {
  closed: { label: "Not yet", tone: "neutral" },
  waiting: { label: "Waiting", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  changes: { label: "Changes asked", tone: "info" },
  rejected: { label: "Rejected", tone: "danger" },
};

export { ME, outputName };

/** Trust per output kind (D-467): the kinds with decisions, most decided first; a stage's files count with it. */
export function trustByKind(outputs: Output[]): Array<Trust & { kind: string }> {
  const kinds = new Map<string, Output[]>();
  for (const o of outputs) if (!isFile(o)) kinds.set(o.kind, [...(kinds.get(o.kind) ?? []), o]);
  return [...kinds]
    .map(([kind, list]) => ({ kind, ...trust(list) }))
    .filter((t) => t.decided > 0)
    .sort((a, b) => b.decided - a.decided || a.kind.localeCompare(b.kind));
}
