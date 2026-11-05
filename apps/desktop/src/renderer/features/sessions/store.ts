import { create } from "zustand";
import { applyUpdate } from "../../../shared/chat";
import type { ChatItem, ChatUpdate, QueuedMessage, SessionMeta } from "../../../shared/engine";
import { call } from "../../lib/host";

interface Transcript {
  items: ChatItem[];
  queue: QueuedMessage[];
  /** Messages you parked (D-365). */
  parked: QueuedMessage[];
}

interface SessionsState {
  metas: Record<string, SessionMeta>;
  transcripts: Record<string, Transcript>;
  loaded: boolean;
}

/** Sessions in the renderer: every session's metadata, and transcripts of the open ones. */
export const useSessions = create<SessionsState>(() => ({ metas: {}, transcripts: {}, loaded: false }));

/** How many turns of each chat you have seen (its tab was showing): newer ones are "unread". */
export const useSeenTurns = create<Record<string, number>>(() => ({}));
export const markSeen = (id: string, turns: number) =>
  useSeenTurns.setState((s) => (s[id] === turns ? s : { ...s, [id]: turns }));

export async function loadSessions(): Promise<void> {
  const list = await call("sessions.list");
  useSessions.setState({ metas: Object.fromEntries(list.map((m) => [m.id, m])), loaded: true });
}

const loading = new Map<string, Promise<void>>();

/**
 * Transcripts in memory (D-366): a chat's items stay loaded while something holds it (its open tab,
 * a voice conversation) or Claude works in it, and the last few you let go of stay for a quick
 * return. The rest are dropped and load again from the host when needed (`ensureTranscript`), so a
 * day of chats doesn't pile up in the window.
 */
export const KEEP_RECENT = 5;
const holds = new Map<string, number>();
/** When each loaded transcript was last held or loaded: the newest unheld ones are kept. */
const lastUsed = new Map<string, number>();
let clock = 0;
const BUSY = new Set(["starting", "working", "needs_you"]);

/**
 * Keeps a chat's transcript loaded (and loads it) until the returned function is called. Holds
 * stack: the transcript can go once the last one is let go.
 */
export function holdTranscript(id: string): () => void {
  holds.set(id, (holds.get(id) ?? 0) + 1);
  lastUsed.set(id, ++clock);
  void ensureTranscript(id).catch(() => {});
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    const left = (holds.get(id) ?? 1) - 1;
    if (left > 0) holds.set(id, left);
    else holds.delete(id);
    lastUsed.set(id, ++clock);
    trimTranscripts();
  };
}

/** Drops loaded transcripts nothing holds and no turn runs in, beyond the `KEEP_RECENT` newest. */
export function trimTranscripts(): void {
  const { metas, transcripts } = useSessions.getState();
  const loose = Object.keys(transcripts)
    .filter((id) => !holds.has(id) && !BUSY.has(metas[id]?.status ?? "idle"))
    .sort((a, b) => (lastUsed.get(b) ?? 0) - (lastUsed.get(a) ?? 0));
  const drop = loose.slice(KEEP_RECENT);
  if (!drop.length) return;
  for (const id of drop) {
    lastUsed.delete(id);
    waiting.delete(id);
  }
  useSessions.setState((s) => {
    const next = { ...s.transcripts };
    for (const id of drop) delete next[id];
    return { transcripts: next };
  });
}

/** Loads a session's transcript once; later changes arrive as updates. */
export function ensureTranscript(id: string): Promise<void> {
  if (useSessions.getState().transcripts[id]) return Promise.resolve();
  let pending = loading.get(id);
  if (!pending) {
    pending = call("sessions.get", { id })
      .then((snap) => {
        // Updates that arrived before the snapshot are in it already (the host sends them in order).
        waiting.delete(id);
        if (deleted.has(id)) return;
        useSessions.setState((s) => ({
          metas: { ...s.metas, [id]: snap.meta },
          transcripts: {
            ...s.transcripts,
            [id]: { items: snap.items, queue: snap.queue, parked: snap.parked },
          },
        }));
        if (!lastUsed.has(id)) lastUsed.set(id, ++clock);
        trimTranscripts();
      })
      .finally(() => loading.delete(id));
    loading.set(id, pending);
  }
  return pending;
}

/** Sessions deleted here: a late update from the host must not bring them back to the list. */
const deleted = new Set<string>();

/**
 * Item updates from the host wait for the next frame and are applied together: a streaming answer
 * sends dozens a second, and each application copies the chat's item list once, not once per update.
 */
const waiting = new Map<string, ChatUpdate[]>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;
const FLUSH_MS = 16;

export function applySessionUpdates(sessionId: string, updates: ChatUpdate[]): void {
  if (deleted.has(sessionId)) return;
  const queued = waiting.get(sessionId);
  // Status, queue and parked messages show at once (code reads them right after a host call): this
  // chat's waiting updates go with them, in order.
  if (!updates.every(touchesItems)) {
    waiting.delete(sessionId);
    applyNow(sessionId, queued ? [...queued, ...updates] : updates);
    return;
  }
  if (queued) queued.push(...updates);
  else waiting.set(sessionId, [...updates]);
  flushTimer ??= setTimeout(flushSessionUpdates, FLUSH_MS);
}

/** Applies the updates waiting for the next frame now (tests; before reading the store right away). */
export function flushSessionUpdates(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = undefined;
  const batch = [...waiting];
  waiting.clear();
  for (const [id, updates] of batch) applyNow(id, updates);
}

function applyNow(sessionId: string, updates: ChatUpdate[]): void {
  if (deleted.has(sessionId)) return;
  let settled = false;
  useSessions.setState((s) => {
    let metas = s.metas;
    let transcripts = s.transcripts;
    const current = s.transcripts[sessionId];
    const items = current && updates.some(touchesItems) ? [...current.items] : current?.items;
    let queue = current?.queue;
    let parked = current?.parked;
    for (const update of updates) {
      if (update.op === "meta") {
        if (BUSY.has(metas[sessionId]?.status ?? "idle") && !BUSY.has(update.meta.status)) settled = true;
        metas = { ...metas, [sessionId]: update.meta };
      } else if (update.op === "queue") queue = update.queue;
      else if (update.op === "parked") parked = update.parked;
      else if (items) applyUpdate(items, update);
    }
    if (current && items && queue)
      transcripts = { ...transcripts, [sessionId]: { items, queue, parked: parked ?? [] } };
    return { metas, transcripts };
  });
  // A turn that ended in a chat nobody holds lets its transcript go like the others.
  if (settled && !holds.has(sessionId)) trimTranscripts();
}

const touchesItems = (u: ChatUpdate) => u.op === "upsert" || u.op === "append" || u.op === "reset";

export function forgetSession(id: string): void {
  deleted.add(id);
  waiting.delete(id);
  lastUsed.delete(id);
  useSessions.setState((s) => {
    const metas = { ...s.metas };
    const transcripts = { ...s.transcripts };
    delete metas[id];
    delete transcripts[id];
    return { metas, transcripts };
  });
}
