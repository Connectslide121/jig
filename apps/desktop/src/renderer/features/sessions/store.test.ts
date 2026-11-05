import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatItem, SessionMeta } from "../../../shared/engine";

const snapshots = new Map<string, { meta: SessionMeta; items: ChatItem[] }>();
const meta = (id: string, status: SessionMeta["status"] = "idle") => ({ id, status }) as SessionMeta;
const item = (id: string, text = ""): ChatItem => ({ kind: "assistant", id, text, at: "" });

vi.mock("../../lib/host", () => ({
  call: vi.fn(async (_method: string, { id }: { id: string }) => {
    const snap = snapshots.get(id) ?? { meta: meta(id), items: [item(`${id}-a`)] };
    return { ...snap, queue: [], parked: [] };
  }),
}));

const store = await import("./store");
const {
  useSessions,
  holdTranscript,
  ensureTranscript,
  applySessionUpdates,
  flushSessionUpdates,
  KEEP_RECENT,
} = store;
const loaded = () => Object.keys(useSessions.getState().transcripts).sort();

beforeEach(() => {
  flushSessionUpdates();
  snapshots.clear();
  useSessions.setState({ metas: {}, transcripts: {}, loaded: true });
});

describe("transcripts in memory", () => {
  it("keeps held chats and the newest let-go ones, and drops the rest", async () => {
    const ids = Array.from({ length: KEEP_RECENT + 3 }, (_, i) => `c${i}`);
    const letGo = ids.map((id) => holdTranscript(id));
    await Promise.all(ids.map((id) => ensureTranscript(id)));
    expect(loaded()).toHaveLength(ids.length);
    for (const release of letGo) release();
    // The first ones let go are dropped; the newest KEEP_RECENT stay.
    expect(loaded()).toEqual(ids.slice(3).sort());
    // A held one stays whatever its age.
    const hold = holdTranscript("c0");
    await ensureTranscript("c0");
    for (const id of ["x1", "x2", "x3", "x4", "x5", "x6"]) await ensureTranscript(id);
    expect(loaded()).toContain("c0");
    hold();
  });

  it("never drops a chat Claude works in, and drops it once the turn ends", async () => {
    snapshots.set("busy", { meta: meta("busy", "working"), items: [item("b")] });
    holdTranscript("busy")();
    await ensureTranscript("busy");
    for (const id of ["y1", "y2", "y3", "y4", "y5", "y6"]) await ensureTranscript(id);
    expect(loaded()).toContain("busy");
    applySessionUpdates("busy", [{ op: "meta", meta: meta("busy", "idle") }]);
    flushSessionUpdates();
    expect(loaded()).not.toContain("busy");
  });

  it("loads a dropped transcript again when asked", async () => {
    snapshots.set("z", { meta: meta("z"), items: [item("z1", "hello")] });
    await ensureTranscript("z");
    useSessions.setState({ transcripts: {} });
    await ensureTranscript("z");
    expect(useSessions.getState().transcripts.z?.items[0]).toMatchObject({ text: "hello" });
  });
});

describe("live updates", () => {
  it("applies a burst of updates together, in order", async () => {
    await ensureTranscript("s");
    const before = useSessions.getState().transcripts.s!.items;
    applySessionUpdates("s", [{ op: "upsert", item: item("m", "a") }]);
    applySessionUpdates("s", [{ op: "append", id: "m", text: "b" }]);
    applySessionUpdates("s", [{ op: "append", id: "m", text: "c" }]);
    // Nothing changes until the next frame.
    expect(useSessions.getState().transcripts.s!.items).toBe(before);
    flushSessionUpdates();
    const after = useSessions.getState().transcripts.s!.items;
    expect(after).not.toBe(before);
    expect(after.at(-1)).toMatchObject({ id: "m", text: "abc" });
  });

  it("shows a status change at once, after the item updates before it", async () => {
    await ensureTranscript("o");
    applySessionUpdates("o", [{ op: "upsert", item: item("o2", "first") }]);
    applySessionUpdates("o", [{ op: "meta", meta: meta("o", "working") }]);
    const state = useSessions.getState();
    expect(state.metas.o?.status).toBe("working");
    expect(state.transcripts.o?.items.at(-1)).toMatchObject({ id: "o2" });
  });

  it("keeps the item list when only the meta changes", async () => {
    await ensureTranscript("q");
    const before = useSessions.getState().transcripts.q!.items;
    applySessionUpdates("q", [{ op: "meta", meta: meta("q", "working") }]);
    flushSessionUpdates();
    expect(useSessions.getState().transcripts.q!.items).toBe(before);
    expect(useSessions.getState().metas.q?.status).toBe("working");
  });

  it("drops updates that arrived before the snapshot, which has them already", async () => {
    snapshots.set("p", { meta: meta("p"), items: [item("p1", "done")] });
    applySessionUpdates("p", [{ op: "append", id: "p1", text: " twice" }]);
    await ensureTranscript("p");
    flushSessionUpdates();
    expect(useSessions.getState().transcripts.p?.items[0]).toMatchObject({ text: "done" });
  });
});
