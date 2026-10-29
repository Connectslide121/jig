import { jaccard, normalizeCommand, promptTokens } from "./normalize";
import { frictionPatterns, pastePatterns, unusedToolPatterns } from "./signals";

export type ActivityKind =
  | "prompt"
  | "session.tool"
  | "terminal.command"
  | "script.run"
  | "addon.action"
  | "git"
  | "project.switch"
  /** Friction without AI (`detail.signal`): interrupt, rewind, denied, correction, tool-errors, script-failed. */
  | "friction"
  /** A note Claude saved from a chat (`jig_note_evidence`), `detail.category`. */
  | "evidence"
  /** Lines Claude wrote with Edit/Write: `text` is the file, `detail.lines` comma-joined line hashes. */
  | "ai.lines";

export interface ActivityEvent {
  at: string; // ISO time
  kind: ActivityKind;
  text: string;
  projectId?: string;
  detail?: Record<string, string>;
}

export interface Evidence {
  at: string;
  text: string;
  projectId?: string;
}

export interface Pattern {
  /** Stable key: the same repetition gets the same key next week (used to block "Never" patterns). */
  key: string;
  kind: "command" | "sequence" | "prompt" | "friction" | "paste" | "unused-tool";
  /** The template, sequence ("a → b") or a representative prompt. */
  summary: string;
  count: number;
  days: number;
  projects: number;
  examples: Evidence[];
  /** Higher = more worth a tool. */
  score: number;
}

export interface MineOptions {
  /** Minimum repetitions and distinct days per kind. */
  minCommand?: { count: number; days: number };
  minSequence?: { count: number; days: number };
  minPrompts?: { count: number; days: number };
  /** Minutes between two commands for them to count as a sequence. */
  sequenceWindowMinutes?: number;
  promptSimilarity?: number;
  blocked?: string[];
  limit?: number;
}

const COMMAND_KINDS = new Set<ActivityKind>([
  "session.tool",
  "terminal.command",
  "script.run",
  "addon.action",
  "git",
]);

const day = (iso: string) => iso.slice(0, 10);

export function hashKey(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** Trivial commands that are never worth a tool. */
const TRIVIAL = /^(ls|dir|cd|pwd|clear|cls|exit|git status|git diff|git log)( |$)/;

function template(event: ActivityEvent): string | undefined {
  if (!COMMAND_KINDS.has(event.kind)) return undefined;
  const t = normalizeCommand(event.text);
  if (!t || TRIVIAL.test(t)) return undefined;
  return event.kind === "addon.action" ? `action: ${t}` : t;
}

export function summarizeGroup(events: ActivityEvent[]) {
  const days = new Set(events.map((e) => day(e.at)));
  const projects = new Set(events.map((e) => e.projectId ?? ""));
  const examples = events
    .slice(-5)
    .reverse()
    .map((e) => ({ at: e.at, text: e.text.slice(0, 300), projectId: e.projectId }));
  return { count: events.length, days: days.size, projects: projects.size, examples };
}

export function commandPatterns(events: ActivityEvent[], min = { count: 5, days: 2 }): Pattern[] {
  const groups = new Map<string, ActivityEvent[]>();
  for (const e of events) {
    const t = template(e);
    if (t) groups.set(t, [...(groups.get(t) ?? []), e]);
  }
  return [...groups.entries()]
    .map(([t, list]) => {
      const s = summarizeGroup(list);
      return {
        key: `c-${hashKey(t)}`,
        kind: "command" as const,
        summary: t,
        ...s,
        score: s.count * Math.sqrt(s.days),
      };
    })
    .filter((p) => p.count >= min.count && p.days >= min.days);
}

/** Repeated runs of 2–4 commands done close together in one project. */
export function sequencePatterns(
  events: ActivityEvent[],
  min = { count: 3, days: 2 },
  windowMinutes = 10,
): Pattern[] {
  const commands = events
    .map((e) => ({ e, t: template(e) }))
    .filter((x): x is { e: ActivityEvent; t: string } => x.t !== undefined)
    .sort((a, b) => a.e.at.localeCompare(b.e.at));
  const groups = new Map<string, ActivityEvent[][]>();
  for (let i = 0; i < commands.length; i++) {
    for (let n = 2; n <= 4 && i + n <= commands.length; n++) {
      const run = commands.slice(i, i + n);
      const sameProject = run.every((r) => r.e.projectId === run[0]!.e.projectId);
      const span = new Date(run[n - 1]!.e.at).getTime() - new Date(run[0]!.e.at).getTime();
      if (!sameProject || span > windowMinutes * 60_000) break;
      const templates = run.map((r) => r.t);
      if (new Set(templates).size < templates.length) continue; // "a → a" is just a repeat
      const key = templates.join(" → ");
      groups.set(key, [...(groups.get(key) ?? []), run.map((r) => r.e)]);
    }
  }
  const patterns: Pattern[] = [];
  for (const [summary, runs] of groups) {
    // Count runs that don't overlap.
    const starts: string[] = [];
    for (const run of runs) if (!starts.includes(run[0]!.at)) starts.push(run[0]!.at);
    const firsts = runs.map((r) => r[0]!);
    const s = summarizeGroup(firsts);
    if (starts.length < min.count || s.days < min.days) continue;
    const length = summary.split(" → ").length;
    patterns.push({
      key: `s-${hashKey(summary)}`,
      kind: "sequence",
      summary,
      ...s,
      count: starts.length,
      examples: runs.slice(-3).map((run) => ({
        at: run[0]!.at,
        text: run
          .map((e) => e.text)
          .join("  →  ")
          .slice(0, 400),
        projectId: run[0]!.projectId,
      })),
      score: starts.length * length * Math.sqrt(s.days),
    });
  }
  // Keep the longest sequence when a shorter one is only part of it with the same count.
  return patterns.filter(
    (p) =>
      !patterns.some(
        (q) =>
          q !== p &&
          q.summary.includes(p.summary) &&
          q.count >= p.count &&
          q.summary.length > p.summary.length,
      ),
  );
}

/** Groups of similar prompts (you ask Claude the same kind of thing again and again). */
export function promptPatterns(
  events: ActivityEvent[],
  min = { count: 3, days: 2 },
  similarity = 0.5,
): Pattern[] {
  const prompts = events
    .filter((e) => e.kind === "prompt")
    .map((e) => ({ e, tokens: promptTokens(e.text) }))
    .filter((p) => p.tokens.length >= 2);
  const clusters: Array<{ tokens: string[]; members: ActivityEvent[] }> = [];
  for (const p of prompts) {
    const cluster = clusters.find((c) => jaccard(c.tokens, p.tokens) >= similarity);
    if (cluster) cluster.members.push(p.e);
    else clusters.push({ tokens: p.tokens, members: [p.e] });
  }
  return clusters
    .map((c) => {
      const s = summarizeGroup(c.members);
      const summary = c.members[c.members.length - 1]!.text.slice(0, 200);
      return {
        key: `p-${hashKey(c.tokens.slice().sort().join(" "))}`,
        kind: "prompt" as const,
        summary,
        ...s,
        score: s.count * 1.5 * Math.sqrt(s.days),
      };
    })
    .filter((p) => p.count >= min.count && p.days >= min.days);
}

/** Every pattern above the thresholds, best first, minus the ones you said "Never" to. */
export function mine(events: ActivityEvent[], options: MineOptions = {}): Pattern[] {
  const blocked = new Set(options.blocked ?? []);
  return [
    ...commandPatterns(events, options.minCommand),
    ...sequencePatterns(events, options.minSequence, options.sequenceWindowMinutes),
    ...promptPatterns(events, options.minPrompts, options.promptSimilarity),
    ...frictionPatterns(events),
    ...pastePatterns(events),
    ...unusedToolPatterns(events),
  ]
    .filter((p) => !blocked.has(p.key))
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit ?? 20);
}
