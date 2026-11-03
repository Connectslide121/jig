import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MeetingStore } from "./store";

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "jig-meeting-"));
  dirs.push(dir);
  const file = join(dir, "meetings.json");
  const store = new MeetingStore(file);
  await store.load();
  return { store, file };
}
describe("global meeting persistence", () => {
  it("serializes caption and note updates and marks an active call interrupted on restart", async () => {
    const { store, file } = await setup();
    const record = await store.create("https://teams.microsoft.com/l/meetup-join/test", "Weekly products");
    await Promise.all([
      store.caption(record.id, {
        id: "one",
        speaker: "Alex",
        speakerId: "alex",
        timestamp: new Date().toISOString(),
        text: "Review the API",
        final: true,
      }),
      store.update(record.id, (r) => {
        r.notes = "Review agreed";
      }),
    ]);
    await expect(store.create(record.joinUrl, "Duplicate")).rejects.toThrow("Leave");
    const next = new MeetingStore(file);
    await next.load();
    const saved = next.get(record.id);
    expect(saved.captions).toHaveLength(1);
    expect(saved.notes).toBe("Review agreed");
    expect(saved.status).toBe("interrupted");
    expect(saved.gaps).toHaveLength(1);
    expect(saved).not.toHaveProperty("projectId");
  });
  it("freezes the words seen by a question even if captions are revised afterwards", async () => {
    const { store } = await setup();
    const record = await store.create("https://teams.microsoft.com/l/meetup-join/test", "Weekly products");
    const caption = {
      id: "one",
      speaker: "Alex",
      speakerId: "alex",
      timestamp: "2026-01-01T12:00:00.000Z",
      text: "Ship Tuesday",
      final: false,
    };
    await store.caption(record.id, caption);
    await store.snapshot(record.id, "2026-01-01T12:01:00.000Z");
    await store.caption(record.id, { ...caption, text: "Ship Thursday", final: true });
    expect((await store.readSnapshot(record.id, "2026-01-01T12:01:00.000Z")).captions[0]?.text).toBe(
      "Ship Tuesday",
    );
    expect(store.get(record.id).captions[0]?.text).toBe("Ship Thursday");
  });
  it("deletes a saved meeting with its frozen snapshots, but never a live one", async () => {
    const { store } = await setup();
    const record = await store.create("https://teams.microsoft.com/l/meetup-join/test", "Weekly products");
    await store.snapshot(record.id, "2026-01-01T12:01:00.000Z");
    await expect(store.remove(record.id)).rejects.toThrow("Leave");
    await store.update(record.id, (r) => {
      r.status = "ended";
    });
    const other = await store.create("https://teams.microsoft.com/l/meetup-join/other", "Shop sync");
    await store.update(other.id, (r) => {
      r.status = "ended";
    });
    await store.snapshot(other.id, "2026-01-01T12:01:00.000Z");
    await store.remove(record.id);
    expect(store.records().map((r) => r.id)).toEqual([other.id]);
    await expect(store.readSnapshot(record.id, "2026-01-01T12:01:00.000Z")).rejects.toThrow();
    expect((await store.readSnapshot(other.id, "2026-01-01T12:01:00.000Z")).id).toBe(other.id);
  });
  it("accepts regional Azure endpoints and rejects off-resource credential destinations", async () => {
    const { store } = await setup();
    await store.configure({
      tenantId: "tenant",
      clientId: "client",
      endpoint: "https://example.europe.communication.azure.com/",
    });
    expect(store.settings().endpoint).toBe("https://example.europe.communication.azure.com");
    for (const endpoint of [
      "https://example.com",
      "https://example.communication.azure.com.evil.test",
      "https://example.communication.azure.com/path",
      "https://user@example.communication.azure.com",
    ]) {
      expect(() => store.configure({ tenantId: "tenant", clientId: "client", endpoint })).toThrow();
    }
    expect(() => store.get("missing")).toThrow("not found");
  });
  it("keeps one-to-one calls like meetings, with who they were with, and remembers ringing", async () => {
    const { store, file } = await setup();
    expect(store.ringing()).toBe(true);
    const call = {
      peerId: "00000000-0000-4000-8000-000000000001",
      peerName: "Alex",
      direction: "outgoing" as const,
    };
    const record = await store.createCall(call);
    expect(record).toMatchObject({ title: "Call with Alex", joinUrl: "", status: "joining", call });
    await expect(store.createCall(call)).rejects.toThrow("Leave the current meeting first");
    await store.setRinging(false);
    const again = new MeetingStore(file);
    await again.load();
    expect(again.ringing()).toBe(false);
    expect(again.get(record.id).call).toEqual(call);
  });
  it("keeps history folders: unique names, moving meetings, and deleting a folder frees its meetings", async () => {
    const { store, file } = await setup();
    const a = await store.create("https://teams.microsoft.com/l/meetup-join/one", "Standup");
    await store.update(a.id, (r) => {
      r.status = "ended";
    });
    const folder = await store.saveFolder("  Customer   calls ");
    expect(folder.name).toBe("Customer calls");
    await expect(store.saveFolder("customer CALLS")).rejects.toThrow("already a folder");
    await expect(store.saveFolder("   ")).rejects.toThrow("name");
    await store.moveToFolder([a.id], folder.id);
    expect(store.get(a.id).folder).toBe(folder.id);
    await store.moveToFolder([a.id], "none");
    expect(store.get(a.id).folder).toBeNull();
    await store.moveToFolder([a.id], "auto");
    expect(store.get(a.id)).not.toHaveProperty("folder");
    await expect(store.moveToFolder([a.id], "00000000-0000-4000-8000-000000000000")).rejects.toThrow(
      "Folder",
    );
    await store.saveFolder("Customers", folder.id);
    await store.moveToFolder([a.id], folder.id);
    const next = new MeetingStore(file);
    await next.load();
    expect(next.folders()).toEqual([{ id: folder.id, name: "Customers" }]);
    expect(next.get(a.id).folder).toBe(folder.id);
    await next.deleteFolder(folder.id);
    expect(next.folders()).toEqual([]);
    expect(next.get(a.id)).not.toHaveProperty("folder");
  });
});
