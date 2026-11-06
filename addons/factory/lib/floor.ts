/**
 * What the Floor shows (docs/plan/28-factory/ui.md → Floor): a run's lane, its card's progress ring
 * and line, and the KPI strip. Pure.
 */
import { inbox, median, mineCount, trust } from "./gates";
import { order, type Track } from "./graph";
import type { Run } from "./run";

export type Lane = "interview" | "demo" | "review" | "pack" | "launch" | "done";

export const LANES: { id: Lane; title: string }[] = [
  { id: "interview", title: "Interview" },
  { id: "demo", title: "Demo" },
  { id: "review", title: "Review" },
  { id: "pack", title: "Pack" },
  { id: "launch", title: "Launch" },
  { id: "done", title: "Done" },
];

const opened = (run: Run, ids: string[]) =>
  run.gates.some((g) => ids.includes(g.id) && g.status !== "closed") ||
  run.stages.some(
    (s) => ids.some((id) => s.id === id || s.id.startsWith(`${id}:`)) && s.status !== "blocked",
  );

/**
 * The lane by how far the run got: Interview (interview, planning), Demo (S4–S6), Review (G1),
 * Pack (S7–G4), Launch (S8–G5), Done (done or stopped).
 */
export function laneOf(run: Run): Lane {
  if (run.state === "done" || run.state === "stopped") return "done";
  if (run.state === "interview" || run.state === "planning") return "interview";
  if (opened(run, ["S8", "G3", "G5"])) return "launch";
  if (opened(run, ["S7", "G2", "G4", "G4m"])) return "pack";
  const g1 = run.gates.find((g) => g.id === "G1");
  if (g1?.status === "approved") return "pack";
  return g1?.status === "waiting" ? "review" : "demo";
}

/** A card's progress ring (0…1) and the words beside it. */
export interface Progress {
  value: number;
  label: string;
}

export function progress(run: Run): Progress {
  const lane = laneOf(run);
  if (lane === "interview") {
    const c = run.brief?.coverage ?? { covered: 0, total: 0 };
    return { value: c.total ? c.covered / c.total : 0, label: `coverage ${c.covered}/${c.total}` };
  }
  const pack = run.stages.filter((s) => s.id.startsWith("S7:"));
  if (lane === "pack" || (lane === "launch" && pack.length)) {
    const done = pack.filter((s) => s.status === "done").length;
    return { value: pack.length ? done / pack.length : 0, label: `${done} / ${pack.length} outputs` };
  }
  if (lane === "done") {
    const n = run.outputs.filter((o) => o.status !== "superseded" && o.status !== "rejected").length;
    return { value: 1, label: run.state === "stopped" ? "stopped" : `${n} outputs` };
  }
  const counted = run.stages.filter((s) => s.status !== "skipped");
  const done = counted.filter((s) => s.status === "done").length;
  const value = counted.length ? done / counted.length : 0;
  const demo = latest(run, "demo");
  if (lane === "review") return { value: 1, label: demo ? `demo v${demo.version}` : "waiting" };
  const s5 = run.stages.find((s) => s.id === "S5");
  if (s5?.version && s5.status !== "blocked") return { value, label: `v${s5.version} · building` };
  return { value, label: run.stages.find((s) => s.status === "running")?.recipe ?? "starting" };
}

function latest(run: Run, kind: string) {
  return run.outputs.filter((o) => o.kind === kind).sort((a, b) => b.version - a.version)[0];
}

/** "25 m", "3 h 40 m", "1 d 2 h": how long a run has been going, or something has waited. */
export function since(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `${minutes} m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return minutes % 60 ? `${hours} h ${String(minutes % 60).padStart(2, "0")} m` : `${hours} h`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days} d ${hours % 24} h` : `${days} d`;
}

/** The KPI strip: running, waiting for you, median idea → demo, approved without edits. */
export interface Kpis {
  running: number;
  waitingForYou: number;
  /** Median minutes from a run's start to its first demo draft. */
  ideaToDemo?: number;
  /** Share of decided outputs approved without edits (0…1). */
  approvedAsIs?: number;
}

export function kpis(runs: Run[]): Kpis {
  const toDemo: number[] = [];
  for (const run of runs) {
    const first = run.outputs
      .filter((o) => o.kind === "demo")
      .map((o) => o.history[0]?.at)
      .filter((at): at is string => !!at)
      .sort()[0];
    if (first) toDemo.push((Date.parse(first) - Date.parse(run.createdAt)) / 60_000);
  }
  return {
    running: runs.filter((r) => r.state !== "done" && r.state !== "stopped").length,
    waitingForYou: mineCount(inbox(runs)),
    ideaToDemo: median(toDemo),
    approvedAsIs: trust(runs.flatMap((r) => r.outputs)).rate,
  };
}

/** Minutes as the KPI strip shows them ("4 h 10 m"). */
export function duration(minutes: number): string {
  return since(new Date(0).toISOString(), minutes * 60_000);
}

/** A box of the run page's stage-graph row and how far it is. */
export interface GraphBox {
  id: string;
  kind: "stage" | "gate" | "fanout";
  title: string;
  status: "done" | "running" | "needs-you" | "waiting" | "changes" | "failed" | "skipped" | "pending";
  /** Short text after the id: "v2" for a looped stage, "9/11" for a fan-out. */
  detail?: string;
}

/** The track's boxes in order with the run's state of each (pending until the run gets there). */
export function graphBoxes(run: Run, track: Track): GraphBox[] {
  return order(track).map((node): GraphBox => {
    if (node.kind === "gate") {
      const g = run.gates.find((x) => x.id === node.id);
      const map = { approved: "done", waiting: "waiting", changes: "changes", rejected: "failed" } as const;
      return { ...node, status: g && g.status !== "closed" ? map[g.status] : "pending" };
    }
    const stages =
      node.kind === "fanout"
        ? run.stages.filter((s) => s.id.startsWith(`${node.id}:`))
        : run.stages.filter((s) => s.id === node.id);
    if (stages.length === 0) return { ...node, status: "pending" };
    const has = (st: string) => stages.some((s) => s.status === st);
    const status: GraphBox["status"] = has("needs-you")
      ? "needs-you"
      : has("failed")
        ? "failed"
        : has("running")
          ? "running"
          : stages.every((s) => s.status === "skipped")
            ? "skipped"
            : stages.every((s) => s.status === "done" || s.status === "skipped")
              ? "done"
              : has("done")
                ? "running"
                : "pending";
    const done = stages.filter((s) => s.status === "done").length;
    const version = stages[0]?.version;
    const detail =
      node.kind === "fanout"
        ? `${done}/${stages.filter((s) => s.status !== "skipped").length}`
        : version && version > 1
          ? `v${version}`
          : undefined;
    return { ...node, status, ...(detail ? { detail } : {}) };
  });
}
