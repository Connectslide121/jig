/**
 * A track's stage graph (docs/plan/28-factory/architecture.md → Tracks): what may start now from a
 * track and a run's state. Joins (`after`), alternatives (`"S4|GD"`), fan-out over the plan's outputs
 * (`"S7:spec"`), `when` conditions and loops with a cap. Pure: the Conductor applies what it returns.
 */
import type { GateId, Level, Run, StageRun } from "./run";

export interface TrackLoop {
  /** The stage to run again. */
  back: string;
  /** The fact that ends the loop (`quality.pass`). */
  until: string;
  /** Rounds at most, the first one included. */
  max: number;
}

export interface TrackItem {
  id?: string;
  gate?: GateId;
  fanout?: string;
  recipe?: string;
  title?: string;
  interactive?: boolean;
  after?: string[];
  when?: string;
  loop?: TrackLoop;
  /** For a fan-out: the fact that lists its outputs (`plan.outputs`). */
  outputs?: string;
}

export interface Track {
  id: string;
  title?: string;
  caps: { revisionsPerGate: number; retriesPerStage: number };
  stages: TrackItem[];
}

/** What the graph knows besides the run: `product.exists`, `quality.pass`, the plan's outputs… */
export type Facts = Record<string, boolean | string[] | undefined>;

export type NodeState = "done" | "skipped" | "pending";

/** The id an item has in the graph: its stage id, its gate or its fan-out prefix. */
export function itemId(item: TrackItem): string {
  return item.id ?? item.gate ?? item.fanout ?? "";
}

/** A stage's recipe with its template filled in: `demo-{level}` → `demo-l1`. */
export function recipeFor(template: string, level?: Level): string {
  return template.replace("{level}", (level ?? "L1").toLowerCase());
}

function list(facts: Facts, key: string | undefined): string[] {
  const v = key ? facts[key] : undefined;
  return Array.isArray(v) ? v : [];
}

/** Whether a `when` holds: `product.exists`, or `!product.exists` for its opposite. No `when` holds. */
export function holds(when: string | undefined, facts: Facts): boolean {
  if (!when) return true;
  const negate = when.startsWith("!");
  const value = facts[negate ? when.slice(1) : when] === true;
  return negate ? !value : value;
}

function stageOf(run: Run, id: string): StageRun | undefined {
  return run.stages.find((s) => s.id === id);
}

function findItem(track: Track, id: string): TrackItem | undefined {
  return track.stages.find((i) => itemId(i) === id);
}

/**
 * One node's state. A stage is done when done, skipped when skipped; a looped stage is done once its
 * loop is over (it passed, or used its rounds: then its owner sees it at the next gate). A gate is done
 * when approved. A fan-out instance the plan doesn't list is skipped. An item not in the run yet is
 * skipped when its inputs are all skipped or its `when` doesn't hold, so gates need no skip record.
 */
export function nodeState(track: Track, run: Run, facts: Facts, id: string): NodeState {
  const [prefix, kind] = id.split(":");
  if (kind !== undefined) {
    const fan = findItem(track, prefix ?? "");
    // Until the fan-out is reached the plan may still change, so nothing after it is skipped yet.
    if (!list(facts, fan?.outputs).includes(kind))
      return fan && inputs(track, run, facts, fan) === "pending" ? "pending" : "skipped";
  }
  const gate = run.gates.find((g) => g.id === id);
  if (gate) return gate.status === "approved" ? "done" : "pending";
  const stage = stageOf(run, id);
  if (stage?.status === "skipped") return "skipped";
  const item = kind === undefined ? findItem(track, id) : undefined;
  if (!stage || stage.status === "blocked")
    return item && derivedSkip(track, run, facts, item) ? "skipped" : "pending";
  if (stage.status !== "done") return "pending";
  if (item?.loop && !loopOver(run, facts, item.loop)) return "pending";
  return "done";
}

function derivedSkip(track: Track, run: Run, facts: Facts, item: TrackItem): boolean {
  const ready = inputs(track, run, facts, item);
  return ready === "skipped" || (ready === "done" && !holds(item.when, facts));
}

function loopOver(run: Run, facts: Facts, loop: TrackLoop): boolean {
  return facts[loop.until] === true || round(run, loop) >= loop.max;
}

function round(run: Run, loop: TrackLoop): number {
  return stageOf(run, loop.back)?.version ?? 1;
}

/** One `after` term: a plain id, or alternatives `A|B` (done when any is done, skipped when all are). */
export function termState(track: Track, run: Run, facts: Facts, term: string): NodeState {
  const states = term.split("|").map((id) => nodeState(track, run, facts, id));
  if (states.includes("done")) return "done";
  if (states.every((s) => s === "skipped")) return "skipped";
  return "pending";
}

/** Whether an item's inputs are in: every term done or skipped. All of them skipped skips the item. */
export function inputs(track: Track, run: Run, facts: Facts, item: TrackItem): NodeState {
  const after = item.after ?? [];
  if (after.length === 0) return "done";
  const states = after.map((t) => termState(track, run, facts, t));
  if (states.some((s) => s === "pending")) return "pending";
  return states.every((s) => s === "skipped") ? "skipped" : "done";
}

export type Step =
  | { kind: "start"; stage: string; recipe: string; interactive: boolean }
  | { kind: "open"; gate: GateId }
  | { kind: "skip"; stage: string }
  | { kind: "loop"; back: string; round: number };

function notStarted(run: Run, id: string): boolean {
  const s = stageOf(run, id);
  return !s || s.status === "blocked";
}

/**
 * What may happen now: stages to start or skip, gates to open, a loop back to an earlier stage.
 * Applying the steps and asking again moves the run on; nothing returned means it waits.
 */
export function nextSteps(track: Track, run: Run, facts: Facts = {}): Step[] {
  const steps: Step[] = [];
  for (const item of track.stages) {
    const id = itemId(item);
    if (item.loop && stageOf(run, id)?.status === "done") {
      if (!loopOver(run, facts, item.loop))
        steps.push({ kind: "loop", back: item.loop.back, round: round(run, item.loop) + 1 });
      continue;
    }
    const ready = inputs(track, run, facts, item);
    if (ready === "pending") continue;
    const skip = ready === "skipped" || !holds(item.when, facts);
    if (item.gate) {
      if (!skip && !run.gates.some((g) => g.id === item.gate)) steps.push({ kind: "open", gate: item.gate });
      continue;
    }
    if (item.fanout) {
      for (const kind of list(facts, item.outputs)) {
        const sid = `${item.fanout}:${kind}`;
        if (notStarted(run, sid))
          steps.push(
            skip
              ? { kind: "skip", stage: sid }
              : { kind: "start", stage: sid, recipe: kind, interactive: false },
          );
      }
      continue;
    }
    if (!notStarted(run, id)) continue;
    steps.push(
      skip
        ? { kind: "skip", stage: id }
        : {
            kind: "start",
            stage: id,
            recipe: recipeFor(item.recipe ?? id, run.level),
            interactive: !!item.interactive,
          },
    );
  }
  return steps;
}

/** One box of the stage-graph row on a run's page, in the track's order. */
export interface GraphNode {
  id: string;
  kind: "stage" | "gate" | "fanout";
  title: string;
}

/** The track's items in order, for the stage-graph row. A fan-out is one box (`S7 Pack`). */
export function order(track: Track): GraphNode[] {
  return track.stages.map((item) => ({
    id: itemId(item),
    kind: item.gate ? "gate" : item.fanout ? "fanout" : "stage",
    title: item.title ?? itemId(item),
  }));
}
