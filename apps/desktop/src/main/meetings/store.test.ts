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
});
