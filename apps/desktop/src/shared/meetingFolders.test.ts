import { describe, expect, it } from "vitest";
import { canDrop, folderName, groupHistory, placeFolder, seriesOf } from "./meetingFolders";
import type { MeetingRecord } from "./meetings";

const link = (thread: string) =>
  `https://teams.microsoft.com/l/meetup-join/19%3ameeting_${thread}%40thread.v2/0?context=%7b%7d`;
let n = 0;
const meeting = (title: string, joinUrl: string, over: Partial<MeetingRecord> = {}): MeetingRecord => ({
  id: `m${++n}`,
  title,
  joinUrl,
  startedAt: new Date(Date.UTC(2026, 10, 3, 12, 0) - n * 60_000).toISOString(),
  status: "ended",
  capture: "",
  captions: [],
  gaps: [],
  notes: "",
  actions: [],
  ...over,
});

describe("meeting history folders", () => {
  it("finds a recurring meeting by its Teams meeting thread", () => {
    expect(seriesOf({ joinUrl: link("Abc") })).toBe("19:meeting_Abc@thread.v2");
    expect(seriesOf({ joinUrl: "" })).toBeUndefined();
    expect(seriesOf({ joinUrl: "https://example.com/x" })).toBeUndefined();
  });

  it("gives a series of two or more meetings its own folder, named after the newest", () => {
    const daily3 = meeting("Shop daily", link("daily"));
    const daily2 = meeting("Shop Daily", link("daily"));
    const once = meeting("Contoso kick-off", link("once"));
    const call = meeting("Call with Ana", "");
    const { groups, loose } = groupHistory([daily3, daily2, once, call], []);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      kind: "series",
      name: "Shop daily",
      key: "series:19:meeting_daily@thread.v2",
    });
    expect(groups[0]!.records.map((r) => r.id)).toEqual([daily3.id, daily2.id]);
    expect(loose.map((r) => r.id)).toEqual([once.id, call.id]);
  });

  it("puts meetings you moved where you put them, before their series, and sorts folders by name", () => {
    const a = meeting("Daily", link("d"), { folder: "f1" });
    const b = meeting("Daily", link("d"));
    const c = meeting("Daily", link("d"), { folder: null });
    const d = meeting("Daily", link("d"));
    const e = meeting("Review", link("r"), { folder: "gone" });
    const { groups, loose } = groupHistory(
      [a, b, c, d, e],
      [
        { id: "f1", name: "zeta" },
        { id: "f2", name: "Alpha" },
      ],
    );
    expect(groups.map((g) => g.name)).toEqual(["Alpha", "Daily", "zeta"]);
    expect(groups.find((g) => g.kind === "series")!.records.map((r) => r.id)).toEqual([b.id, d.id]);
    expect(groups.find((g) => g.folderId === "f1")!.records.map((r) => r.id)).toEqual([a.id]);
    // A meeting in a folder that no longer exists goes back to its own place.
    expect(loose.map((r) => r.id)).toEqual([c.id, e.id]);
    expect(groupHistory([a], [{ id: "f2", name: "Alpha" }], { keepEmpty: false }).groups).toEqual([]);
  });

  it("lets any folder take a meeting, but a series folder only its own", () => {
    const own = meeting("Daily", link("d"), { folder: null });
    const other = meeting("Other", link("o"), { folder: null });
    const daily = groupHistory([meeting("Daily", link("d")), meeting("Daily", link("d")), own], [])
      .groups[0]!;
    expect(canDrop(daily, own)).toBe(true);
    expect(canDrop(daily, other)).toBe(false);
    expect(canDrop(daily, daily.records[0]!)).toBe(false);
    const folder = { key: "folder:f", kind: "folder" as const, name: "F", folderId: "f", records: [] };
    expect(canDrop(folder, other)).toBe(true);
    expect(canDrop(folder, { ...other, folder: "f" })).toBe(false);
  });

  it("maps where a meeting goes to what is stored, and cleans folder names", () => {
    expect(placeFolder("auto")).toBeUndefined();
    expect(placeFolder("none")).toBeNull();
    expect(placeFolder("f1")).toBe("f1");
    expect(folderName("  a \n b  ")).toBe("a b");
    expect(folderName("x".repeat(200))).toHaveLength(120);
  });
});
