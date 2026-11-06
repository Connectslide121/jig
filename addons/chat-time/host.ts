import type { AddonChatListItem, AddonChatTimelineEntry, AddonHostApi } from "@jig/sdk";
import {
  addOverlap,
  addTotals,
  analyze,
  CATEGORIES,
  CATEGORY_LABEL,
  type Call,
  type Category,
  type ChatAnalysis,
  concurrency,
  crowd,
  emptyOverlap,
  emptyTotals,
  type Interval,
  type Item,
  type Overlap,
  shortName,
  type Totals,
} from "./lib/analyze";

/**
 * Reads the chats through Jig's read API (`api.chats.list` / `api.chats.timeline`, the `chat:read`
 * permission, D-423): every tool call has its start and, since D-423, the time its result came back.
 * Read-only; results are cached per chat until it changes.
 */

const SLOWEST = 15;

const cache = new Map<string, { updatedAt: string; analysis: ChatAnalysis }>();

/** A timeline as the items `analyze` reads. */
export function timelineItems(timeline: AddonChatTimelineEntry[]): {
  items: Item[];
  ends: Map<string, number>;
} {
  const items: Item[] = [];
  const ends = new Map<string, number>();
  for (const e of timeline) {
    if (e.kind === "turn") items.push({ kind: "result", id: e.id, at: e.at, durationMs: e.durationMs });
    else if (e.kind === "step") items.push({ kind: e.what, id: e.id, at: e.at, parentId: e.parentId });
    else {
      if (e.askedPermission)
        items.push({ kind: "permission", id: `permission:${e.id}`, at: e.at, request: { requestId: e.id } });
      items.push({
        kind: "tool",
        id: e.id,
        at: e.at,
        name: e.name,
        input: e.input,
        output: e.outputStart,
        parentId: e.parentId,
        status: e.status,
      });
      const end = e.endedAt ? Date.parse(e.endedAt) : Number.NaN;
      if (Number.isFinite(end)) ends.set(e.id, end);
    }
  }
  return { items, ends };
}

async function load(api: AddonHostApi, chat: AddonChatListItem): Promise<ChatAnalysis | undefined> {
  const hit = cache.get(chat.sessionId);
  if (hit && hit.updatedAt === chat.updatedAt) return hit.analysis;
  try {
    const { items, ends } = timelineItems(await api.chats.timeline(chat.sessionId));
    const meta = {
      id: chat.sessionId,
      title: chat.title,
      projectId: chat.projectId,
      provider: chat.provider,
      updatedAt: chat.updatedAt,
    };
    const analysis = analyze({ meta, items }, ends);
    cache.set(chat.sessionId, { updatedAt: chat.updatedAt, analysis });
    return analysis;
  } catch {
    return undefined;
  }
}

async function loadOne(api: AddonHostApi, sessionId: string): Promise<ChatAnalysis | undefined> {
  const chat = (await api.chats.list()).find((c) => c.sessionId === sessionId);
  return chat ? load(api, chat) : undefined;
}

/** Every chat changed since `since` (older ones can't have turns after it). */
async function loadSince(api: AddonHostApi, since: number): Promise<ChatAnalysis[]> {
  const out: ChatAnalysis[] = [];
  for (const chat of await api.chats.list({ since })) {
    const a = await load(api, chat);
    if (a) out.push(a);
  }
  return out;
}

export function sinceFor(days: number, now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - Math.max(0, days - 1));
  return d.getTime();
}

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Local midnights from `since` up to now. */
function dayStarts(since: number, now = Date.now()): number[] {
  const out: number[] = [];
  const d = new Date(since);
  while (d.getTime() <= now) {
    out.push(d.getTime());
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function counts(calls: Call[]): Record<Category, number> {
  const c = emptyTotals();
  for (const call of calls) c[call.category]++;
  return c;
}

function intervals(a: ChatAnalysis, since: number): Interval[] {
  return a.turns
    .filter((t) => Date.parse(t.at) >= since)
    .map((t) => ({ start: Math.max(t.start, since), end: Date.parse(t.at) }));
}

type SlowCall = Call & { sessionId: string; chat: string };

export interface Breakdown {
  workingMs: number;
  totals: Totals;
  counts: Record<Category, number>;
  /** Some ends were estimated (calls from before Jig recorded their end, D-423). */
  estimated: boolean;
  slowest: SlowCall[];
  /** Other chats working at the same time. */
  overlap: Overlap;
}

export interface ChatBreakdown extends Breakdown {
  sessionId: string;
  title: string;
  provider: string;
  projectId?: string;
  turns: number;
}

/** One chat's numbers over all its turns, without the overlap with other chats. */
function ownBreakdown(a: ChatAnalysis, slowest: number): Omit<ChatBreakdown, "overlap"> {
  const totals = emptyTotals();
  let workingMs = 0;
  for (const t of a.turns) {
    addTotals(totals, t.totals);
    workingMs += t.workingMs;
  }
  return {
    sessionId: a.sessionId,
    title: a.title,
    provider: a.provider,
    projectId: a.projectId,
    turns: a.turns.length,
    workingMs,
    totals,
    counts: counts(a.calls),
    estimated: a.calls.some((c) => c.estimated),
    slowest: [...a.calls]
      .sort((x, y) => y.ms - x.ms)
      .slice(0, slowest)
      .map((c) => ({ ...c, sessionId: a.sessionId, chat: a.title })),
  };
}

/** One chat's breakdown over all its turns. */
export async function chat(args: { sessionId: string }, api: AddonHostApi): Promise<ChatBreakdown | null> {
  const a = await loadOne(api, String(args?.sessionId ?? ""));
  if (!a) return null;
  const first = a.turns.length ? Math.min(...a.turns.map((t) => t.start)) : Date.now();
  const others = (await loadSince(api, first)).filter((o) => o.sessionId !== a.sessionId);
  const { perChat } = concurrency([
    { id: a.sessionId, intervals: intervals(a, first), inScope: true },
    ...others.map((o) => ({ id: o.sessionId, intervals: intervals(o, first), inScope: false })),
  ]);
  return { ...ownBreakdown(a, SLOWEST), overlap: perChat.get(a.sessionId) ?? emptyOverlap() };
}

/** The chat overview's section (D-423): one chat's breakdown and its 3 slowest calls, nothing else read. */
export async function overview(
  args: { sessionId: string },
  api: AddonHostApi,
): Promise<Omit<ChatBreakdown, "overlap"> | null> {
  const a = await loadOne(api, String(args?.sessionId ?? ""));
  return a ? ownBreakdown(a, 3) : null;
}

export interface ChatRow {
  sessionId: string;
  title: string;
  provider: string;
  projectId?: string;
  lastAt: string;
  workingMs: number;
  totals: Totals;
  overlap: Overlap;
}

export interface DayRow {
  date: string;
  workingMs: number;
  totals: Totals;
  overlap: Overlap;
}

export interface Summary extends Breakdown {
  chats: ChatRow[];
  days: DayRow[];
}

/**
 * The chats of one project (`projectId`), or of every project (none), summed over the last `days`
 * days (1 = today), with a per-day series and how many other chats worked at the same time.
 */
export async function summary(
  args: { projectId?: string | null; days: number },
  api: AddonHostApi,
): Promise<Summary> {
  const days = Math.min(365, Math.max(1, Number(args?.days) || 7));
  const projectId = args?.projectId || undefined;
  const now = Date.now();
  const since = sinceFor(days, now);
  const cuts = dayStarts(since, now);
  const totals = emptyTotals();
  const perDay = new Map<string, DayRow>();
  for (const t of cuts)
    perDay.set(dayKey(t), { date: dayKey(t), workingMs: 0, totals: emptyTotals(), overlap: emptyOverlap() });
  const chats: ChatRow[] = [];
  const calls: SlowCall[] = [];
  let workingMs = 0;

  const all = await loadSince(api, since);
  const inScope = (a: ChatAnalysis) => !projectId || a.projectId === projectId;
  for (const a of all) {
    if (!inScope(a)) continue;
    const row: ChatRow = {
      sessionId: a.sessionId,
      title: a.title,
      provider: a.provider,
      projectId: a.projectId,
      lastAt: a.updatedAt,
      workingMs: 0,
      totals: emptyTotals(),
      overlap: emptyOverlap(),
    };
    for (const t of a.turns) {
      const at = Date.parse(t.at);
      if (at < since) continue;
      row.workingMs += t.workingMs;
      addTotals(row.totals, t.totals);
      const day = perDay.get(dayKey(at));
      if (day) {
        day.workingMs += t.workingMs;
        addTotals(day.totals, t.totals);
      }
    }
    if (!row.workingMs) continue;
    workingMs += row.workingMs;
    addTotals(totals, row.totals);
    chats.push(row);
    for (const c of a.calls)
      if (Date.parse(c.at) >= since) calls.push({ ...c, sessionId: a.sessionId, chat: a.title });
  }

  const { perChat, perBucket } = concurrency(
    all.map((a) => ({ id: a.sessionId, intervals: intervals(a, since), inScope: inScope(a) })),
    cuts,
    dayKey,
  );
  const overlap = emptyOverlap();
  for (const row of chats) row.overlap = perChat.get(row.sessionId) ?? emptyOverlap();
  for (const [key, o] of perBucket) {
    const day = perDay.get(key);
    if (day) day.overlap = o;
    addOverlap(overlap, o);
  }

  chats.sort((x, y) => y.workingMs - x.workingMs);
  return {
    workingMs,
    totals,
    counts: counts(calls),
    estimated: calls.some((c) => c.estimated),
    slowest: calls.sort((x, y) => y.ms - x.ms).slice(0, SLOWEST),
    overlap,
    chats,
    days: [...perDay.values()],
  };
}

/* ---------- Tools for chats (addon_chat_time_*) ---------- */

type ToolArgs = {
  chat?: { sessionId?: string; projectId?: string };
  scope?: string;
  id?: string;
  days?: number;
  top?: number;
};

export function hours(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}m`;
}

function pct(part: number, whole: number): string {
  return whole ? `${Math.round((100 * part) / whole)}%` : "0%";
}

function crowdText(o: Overlap): string {
  if (!o.ownMs) return "no working time";
  return `${crowd(o).toFixed(1)} other chats working at the same time on average (at most ${o.peak}); ${pct(o.sharedMs, o.ownMs)} of the time shared with another chat`;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Which chats a tool call means: one chat, a project's chats, or every project's. */
async function resolveScope(
  args: ToolArgs,
  api: AddonHostApi,
): Promise<
  | { kind: "chat"; sessionId: string }
  | { kind: "project"; projectId: string; name: string }
  | { kind: "all" }
  | string
> {
  const scope = args.scope ?? "project";
  if (scope === "chat") {
    const sessionId = args.id || args.chat?.sessionId;
    return sessionId ? { kind: "chat", sessionId } : "No chat id given, and this isn't called from a chat.";
  }
  if (scope === "all") return { kind: "all" };
  if (scope !== "project") return `Unknown scope "${scope}": use chat, project or all.`;
  const projectId = args.id || args.chat?.projectId;
  if (!projectId) return "No project id given, and the calling chat has no project. Use scope all.";
  const project = (await api.projects()).find((p) => p.id === projectId || p.name === projectId);
  return project
    ? { kind: "project", projectId: project.id, name: project.name }
    : `No project "${projectId}".`;
}

function breakdownLines(b: Breakdown, top: number): string[] {
  const lines = ["category | time | share | calls"];
  for (const c of CATEGORIES) {
    lines.push(
      `${CATEGORY_LABEL[c]} | ${hours(b.totals[c])} | ${pct(b.totals[c], b.workingMs)} | ${c === "model" ? "-" : b.counts[c]}`,
    );
  }
  if (top > 0 && b.slowest.length) {
    lines.push(
      "",
      `Slowest ${Math.min(top, b.slowest.length)} calls (time | category | tool | chat id | what):`,
    );
    for (const c of b.slowest.slice(0, top)) {
      lines.push(
        `${c.estimated ? "~" : ""}${hours(c.ms)} | ${c.category} | ${shortName(c.name)} | ${c.sessionId} | ${clip(c.label, 80)}${c.failed ? " (failed/stopped)" : ""}`,
      );
    }
  }
  if (b.estimated) lines.push("", "~ = estimated end (a call from before Jig recorded when tool calls end).");
  return lines;
}

/** addon_chat_time_breakdown: where a chat's, a project's or every project's working time went. */
export async function toolBreakdown(args: ToolArgs, api: AddonHostApi): Promise<string> {
  const scope = await resolveScope(args ?? {}, api);
  if (typeof scope === "string") return scope;
  const top = clampInt(args.top, 0, 15, 5);
  if (scope.kind === "chat") {
    const b = await chat({ sessionId: scope.sessionId }, api);
    if (!b) return `No chat "${scope.sessionId}".`;
    return [
      `Chat "${b.title}" (${b.sessionId}), all ${b.turns} turns: ${hours(b.workingMs)} working (wall-clock).`,
      `Overlap: ${crowdText(b.overlap)}.`,
      "",
      ...breakdownLines(b, top),
    ].join("\n");
  }
  const days = clampInt(args.days, 1, 365, 7);
  const s = await summary({ projectId: scope.kind === "project" ? scope.projectId : undefined, days }, api);
  const what = scope.kind === "project" ? `Project "${scope.name}"` : "All projects";
  const lines = [
    `${what}, ${days === 1 ? "today" : `last ${days} days`}: ${hours(s.workingMs)} working in ${s.chats.length} chats (wall-clock, summed over chats); ${hours(s.overlap.wallMs)} of wall-clock time with any of them working.`,
    `Overlap: ${crowdText(s.overlap)}.`,
    "",
    ...breakdownLines(s, top),
    "",
    "Per day (date | working | wall-clock | avg other chats at once | top category):",
  ];
  for (const d of s.days) {
    if (!d.workingMs) continue;
    const topCat = CATEGORIES.reduce((x, c) => (d.totals[c] > d.totals[x] ? c : x), "model" as Category);
    lines.push(
      `${d.date} | ${hours(d.workingMs)} | ${hours(d.overlap.wallMs)} | ${crowd(d.overlap).toFixed(1)} | ${CATEGORY_LABEL[topCat]} ${pct(d.totals[topCat], d.workingMs)}`,
    );
  }
  return lines.join("\n");
}

/** addon_chat_time_chats: the chats ranked by working time. */
export async function toolChats(args: ToolArgs, api: AddonHostApi): Promise<string> {
  const a = args ?? {};
  const scope = await resolveScope({ ...a, scope: a.scope === "chat" ? "project" : a.scope }, api);
  if (typeof scope === "string") return scope;
  if (scope.kind === "chat") return "Use scope project or all.";
  const days = clampInt(a.days, 1, 365, 7);
  const top = clampInt(a.top, 1, 50, 10);
  const s = await summary({ projectId: scope.kind === "project" ? scope.projectId : undefined, days }, api);
  if (!s.chats.length) return "No chat worked in this period.";
  const names = scope.kind === "all" ? new Map((await api.projects()).map((p) => [p.id, p.name])) : undefined;
  const lines = [
    `${scope.kind === "project" ? `Project "${scope.name}"` : "All projects"}, ${days === 1 ? "today" : `last ${days} days`}: top ${Math.min(top, s.chats.length)} of ${s.chats.length} chats by working time.`,
    `working | share | avg other chats at once | biggest category | chat id | ${names ? "project | " : ""}title`,
  ];
  for (const c of s.chats.slice(0, top)) {
    const big = CATEGORIES.reduce((x, k) => (c.totals[k] > c.totals[x] ? k : x), "model" as Category);
    lines.push(
      `${hours(c.workingMs)} | ${pct(c.workingMs, s.workingMs)} | ${crowd(c.overlap).toFixed(1)} | ${CATEGORY_LABEL[big]} ${pct(c.totals[big], c.workingMs)} | ${c.sessionId} | ${names ? `${names.get(c.projectId ?? "") ?? "no project"} | ` : ""}${c.title}`,
    );
  }
  return lines.join("\n");
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
