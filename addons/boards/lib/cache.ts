import { type Board, type BoardColumn, type BoardData, boardTenant, type WorkItem } from "./boards";

/**
 * Stale-while-revalidate for boards (D-302): the host keeps every followed board's last answer, keyed
 * by tenant + board, shows it at once and refreshes it in the background. Pure, so it can be tested.
 */

/** A board's last answer from Azure DevOps and when it came (ms since the epoch). */
export interface CachedBoard {
  at: number;
  data: BoardData;
}

/** What the view gets from the host: the cached answer (if any) and, after a refresh, why it failed. */
export interface BoardState {
  data?: BoardData;
  at?: number;
  error?: string;
  /** The error is az saying you're signed out or your sign-in expired. */
  signIn?: boolean;
}

/**
 * The cache key of a board: its tenant and its Azure DevOps identity (organisation, project, team,
 * board), so two Jig projects following the same board share one entry and another tenant's cards
 * are never found under it.
 */
export function cacheKey(b: Pick<Board, "tenant" | "org" | "project" | "team" | "boardId">): string {
  return [boardTenant(b), b.org, b.project, b.team, b.boardId].map((s) => s.toLowerCase()).join("|");
}

/** The tenant part of a cache key. */
export const keyTenant = (key: string): string => key.split("|", 1)[0] ?? "";

export function isFresh(entry: Pick<CachedBoard, "at"> | undefined, now: number, maxAgeMs: number): boolean {
  return !!entry && now - entry.at < maxAgeMs;
}

/** Only the entries whose key is still followed (in any project), so removed boards don't linger. */
export function pruneCache(
  cache: Record<string, CachedBoard>,
  keep: Iterable<string>,
): Record<string, CachedBoard> {
  const wanted = new Set(keep);
  return Object.fromEntries(Object.entries(cache).filter(([k]) => wanted.has(k)));
}

/** A stored cache read back: entries that look like a board's answer (an old or hand-edited file is skipped). */
export function readCache(value: unknown): Record<string, CachedBoard> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, CachedBoard> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const e = v as Partial<CachedBoard> | undefined;
    if (
      typeof e?.at === "number" &&
      Array.isArray(e.data?.columns) &&
      Array.isArray(e.data?.items) &&
      !e.data.elsewhere
    )
      out[k] = { at: e.at, data: e.data };
  }
  return out;
}

function sameRecord(a: Record<string, string>, b: Record<string, string>): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

function sameColumn(a: BoardColumn, b: BoardColumn): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.columnType === b.columnType &&
    a.itemLimit === b.itemLimit &&
    sameRecord(a.stateMappings, b.stateMappings)
  );
}

const ITEM_FIELDS = [
  "id",
  "title",
  "type",
  "state",
  "column",
  "assignedTo",
  "assignedEmail",
  "changed",
  "url",
] as const satisfies ReadonlyArray<keyof WorkItem>;

function sameItem(a: WorkItem, b: WorkItem): boolean {
  return ITEM_FIELDS.every((f) => a[f] === b[f]);
}

/** `next`, but reusing `prev`'s objects where nothing changed; `prev` itself when the arrays match. */
function reuse<T>(prev: T[], next: T[], key: (t: T) => string | number, same: (a: T, b: T) => boolean): T[] {
  const old = new Map(prev.map((t) => [key(t), t]));
  let changed = prev.length !== next.length;
  const out = next.map((t, i) => {
    const o = old.get(key(t));
    const kept = o && same(o, t) ? o : t;
    if (kept !== prev[i]) changed = true;
    return kept;
  });
  return changed ? out : prev;
}

/**
 * A refreshed board laid over the one on screen: unchanged columns and cards keep their objects (so
 * React keeps them as they are: no flicker, no lost hover or focus), and when nothing changed at all
 * the very same `prev` comes back (nothing renders again).
 */
export function mergeBoard(prev: BoardData | undefined, next: BoardData): BoardData {
  if (!prev) return next;
  const columns = reuse(prev.columns, next.columns, (c) => c.id, sameColumn);
  const items = reuse(prev.items, next.items, (i) => i.id, sameItem);
  if (
    columns === prev.columns &&
    items === prev.items &&
    prev.columnField === next.columnField &&
    prev.area === next.area &&
    !prev.elsewhere === !next.elsewhere &&
    prev.elsewhere?.tenant === next.elsewhere?.tenant
  )
    return prev;
  return { ...next, columns, items };
}

/** "updated just now", "updated 4 min ago", "updated 2 h ago", "updated 3 d ago". */
export function updatedAgo(at: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - at) / 60_000);
  if (minutes < 1) return "updated just now";
  if (minutes < 60) return `updated ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `updated ${hours} h ago`;
  return `updated ${Math.floor(hours / 24)} d ago`;
}

/** az's "you're signed out" / "your sign-in expired" (`AzError.problem`): background refreshes wait then. */
export function isSignInProblem(error: unknown): boolean {
  const problem = (error as { problem?: unknown } | undefined)?.problem;
  return problem === "signedOut" || problem === "expired";
}

/**
 * One request per key at a time. A caller gets the request already running; a caller that needs an
 * answer from after now (`fresh`, e.g. after a change) gets one follow-up request that starts when the
 * running one ends, shared with every later caller until it starts.
 */
export class Flights<T> {
  private running = new Map<string, Promise<T>>();
  private waiting = new Map<string, Promise<T>>();

  has(key: string): boolean {
    return this.running.has(key) || this.waiting.has(key);
  }

  /** A follow-up request waits for the running one (so the board is still refreshing after it). */
  queued(key: string): boolean {
    return this.waiting.has(key);
  }

  run(key: string, load: () => Promise<T>, fresh = false): Promise<T> {
    const queued = this.waiting.get(key);
    if (queued) return queued;
    const running = this.running.get(key);
    if (running && !fresh) return running;
    if (running) {
      const next = running
        .catch(() => undefined)
        .then(() => {
          this.waiting.delete(key);
          return this.start(key, load);
        });
      this.waiting.set(key, next);
      return next;
    }
    return this.start(key, load);
  }

  private start(key: string, load: () => Promise<T>): Promise<T> {
    const p = load().finally(() => {
      if (this.running.get(key) === p) this.running.delete(key);
    });
    this.running.set(key, p);
    return p;
  }
}
