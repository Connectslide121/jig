import { create } from "zustand";
import { applyUpdate } from "../../../shared/chat";
import type { ChatItem, ChatUpdate, QueuedMessage, SessionMeta } from "../../../shared/engine";
import { call } from "../../lib/host";

interface Transcript {
  items: ChatItem[];
  queue: QueuedMessage[];
}

interface SessionsState {
  metas: Record<string, SessionMeta>;
  transcripts: Record<string, Transcript>;
  loaded: boolean;
}

/** Sessions in the renderer: every session's metadata, and transcripts of the open ones. */
export const useSessions = create<SessionsState>(() => ({ metas: {}, transcripts: {}, loaded: false }));

export async function loadSessions(): Promise<void> {
  const list = await call("sessions.list");
  useSessions.setState({ metas: Object.fromEntries(list.map((m) => [m.id, m])), loaded: true });
}

const loading = new Map<string, Promise<void>>();

/** Loads a session's transcript once; later changes arrive as updates. */
export function ensureTranscript(id: string): Promise<void> {
  if (useSessions.getState().transcripts[id]) return Promise.resolve();
  let pending = loading.get(id);
  if (!pending) {
    pending = call("sessions.get", { id })
      .then((snap) =>
        useSessions.setState((s) => ({
          metas: { ...s.metas, [id]: snap.meta },
          transcripts: { ...s.transcripts, [id]: { items: snap.items, queue: snap.queue } },
        })),
      )
      .finally(() => loading.delete(id));
    loading.set(id, pending);
  }
  return pending;
}

/** Sessions deleted here: a late update from the host must not bring them back to the list. */
const deleted = new Set<string>();

export function applySessionUpdates(sessionId: string, updates: ChatUpdate[]): void {
  if (deleted.has(sessionId)) return;
  useSessions.setState((s) => {
    let metas = s.metas;
    let transcripts = s.transcripts;
    const current = s.transcripts[sessionId];
    let items = current ? [...current.items] : undefined;
    let queue = current?.queue;
    for (const update of updates) {
      if (update.op === "meta") metas = { ...metas, [sessionId]: update.meta };
      else if (update.op === "queue") queue = update.queue;
      else if (items) applyUpdate(items, update);
    }
    if (current && items && queue) transcripts = { ...transcripts, [sessionId]: { items, queue } };
    items = undefined;
    return { metas, transcripts };
  });
}

export function forgetSession(id: string): void {
  deleted.add(id);
  useSessions.setState((s) => {
    const metas = { ...s.metas };
    const transcripts = { ...s.transcripts };
    delete metas[id];
    delete transcripts[id];
    return { metas, transcripts };
  });
}
