import type { AddonHostApi, StorageOptions } from "@jig/sdk";
import { describe, expect, it } from "vitest";
import { add, context, list, remove, toolAdd, toolList, toolRemove, toolUpdate, update } from "./host";

function fixture() {
  const data = new Map<string, unknown>();
  const events: unknown[] = [];
  const key = (k: string, o?: StorageOptions) => `${o?.scope ?? "global"}:${o?.id ?? ""}:${k}`;
  const api = {
    storage: {
      get: async (k: string, o?: StorageOptions) => structuredClone(data.get(key(k, o))),
      set: async (k: string, v: unknown, o?: StorageOptions) => {
        data.set(key(k, o), structuredClone(v));
      },
    },
    emit: (topic: string, payload: unknown) => events.push({ topic, payload }),
  } as unknown as AddonHostApi;
  return { api, data, events };
}
const chat = (projectId = "p1", sessionId = "s1") => ({ projectId, sessionId });

describe("shared project notes", () => {
  it("shares human and AI edits across chats, isolates projects, and ignores legacy chat notes", async () => {
    const { api, data, events } = fixture();
    data.set("global::chat:s1", [{ kind: "todo", text: "Old task" }]);
    expect(await list({ projectId: "p1" }, api)).toEqual([]);
    await add({ projectId: "p1", kind: "note", text: "Totals include VAT" }, api);
    expect(await toolList({ chat: chat("p1", "s2") }, api)).toContain("Totals include VAT");
    await toolAdd({ chat: chat(), kind: "wait", text: "Pipeline improvements await the migration" }, api);
    const text = await context({ chat: chat("p1", "s3") }, api);
    expect(text).toContain("Totals include VAT");
    expect(text).toContain("Pipeline improvements await the migration");
    expect(text).not.toContain("Old task");
    expect(await list({ projectId: "p2" }, api)).toEqual([]);
    expect(await context({ chat: chat("p2") }, api)).not.toContain("Totals include VAT");
    await toolUpdate({ chat: chat("p1", "s2"), id: "2", done: true }, api);
    await update({ projectId: "p1", id: "1", text: "Prices include VAT" }, api);
    expect(await list({ projectId: "p1" }, api)).toMatchObject([
      { by: "you", text: "Prices include VAT" },
      { by: "claude", done: true },
    ]);
    await remove({ projectId: "p1", id: "1" }, api);
    await toolRemove({ chat: chat(), id: "2" }, api);
    expect(await list({ projectId: "p1" }, api)).toEqual([]);
    expect(events).toContainEqual({ topic: "changed", payload: { projectId: "p1" } });
  });
  it("rejects projectless tools and task categories without leaking notes", async () => {
    const { api } = fixture();
    expect(await context({}, api)).toBe("");
    await expect(toolAdd({ text: "Secret" }, api)).rejects.toThrow("project");
    await expect(toolList({}, api)).rejects.toThrow("project");
    await expect(toolAdd({ chat: chat(), kind: "todo", text: "Commit" }, api)).rejects.toThrow(
      "wait, note or link",
    );
    await expect(list({ projectId: "" }, api)).rejects.toThrow("project");
  });
  it("preserves simultaneous human and AI mutations and recovers from a rejected mutation", async () => {
    const { api } = fixture();
    await Promise.all([
      toolAdd({ chat: chat(), text: "Prices include VAT" }, api),
      add({ projectId: "p1", text: "Currency is EUR" }, api),
      toolAdd({ chat: chat("p1", "s2"), text: "Inventory is authoritative" }, api),
    ]);
    expect((await list({ projectId: "p1" }, api)).map((n) => n.id)).toEqual(["1", "2", "3"]);
    await expect(toolUpdate({ chat: chat(), id: "missing" }, api)).rejects.toThrow("no note");
    await toolAdd({ chat: chat(), kind: "link", text: "Docs https://docs.example" }, api);
    expect((await list({ projectId: "p1" }, api)).at(-1)).toMatchObject({
      id: "4",
      text: "Docs",
      url: "https://docs.example",
    });
  });
});
