import { describe, expect, it } from "vitest";
import {
  DEFAULT_MEETING_LAYOUT,
  movePanel,
  normalizeMeetingLayout,
  panelsIn,
  resizeSlot,
  setPanelHidden,
  sizeOf,
} from "./meetingLayout";

describe("meeting layout", () => {
  it("falls back to the defaults for missing or invalid values", () => {
    expect(normalizeMeetingLayout(undefined)).toEqual(DEFAULT_MEETING_LAYOUT);
    expect(
      normalizeMeetingLayout({
        panels: { transcript: { slot: "top" }, notes: { slot: "left", hidden: true } },
        sizes: { left: 300.4, right: -1, bottom: Number.NaN, other: 5 },
      }),
    ).toEqual({
      panels: { transcript: { slot: "right" }, notes: { slot: "left", hidden: true } },
      sizes: { left: 300 },
    });
  });

  it("lists a slot's visible panels in a fixed order", () => {
    expect(panelsIn(DEFAULT_MEETING_LAYOUT, "right")).toEqual(["transcript", "notes"]);
    const moved = movePanel(DEFAULT_MEETING_LAYOUT, "transcript", "left");
    expect(panelsIn(moved, "left")).toEqual(["transcript"]);
    expect(panelsIn(moved, "right")).toEqual(["notes"]);
    expect(panelsIn(setPanelHidden(moved, "notes", true), "right")).toEqual([]);
  });

  it("moving shows a hidden panel; hiding keeps its slot", () => {
    const hidden = setPanelHidden(DEFAULT_MEETING_LAYOUT, "notes", true);
    expect(hidden.panels.notes).toEqual({ slot: "right", hidden: true });
    expect(setPanelHidden(hidden, "notes", false).panels.notes).toEqual({ slot: "right" });
    expect(movePanel(hidden, "notes", "bottom").panels.notes).toEqual({ slot: "bottom" });
  });

  it("remembers sizes and falls back to defaults", () => {
    expect(sizeOf(DEFAULT_MEETING_LAYOUT, "right")).toBe(460);
    expect(sizeOf(resizeSlot(DEFAULT_MEETING_LAYOUT, "right", 512.6), "right")).toBe(513);
  });
});
