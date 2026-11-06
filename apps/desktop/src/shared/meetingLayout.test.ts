import { describe, expect, it } from "vitest";
import {
  DEFAULT_MEETING_LAYOUT,
  movePanel,
  normalizeMeetingLayout,
  panelsIn,
  resizeSlot,
  setHistoryTranscript,
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
      panels: {
        people: { slot: "right", hidden: true },
        transcript: { slot: "right" },
        notes: { slot: "left", hidden: true },
        chat: { slot: "left" },
      },
      sizes: { left: 300 },
    });
  });

  it("lists a slot's visible panels in a fixed order", () => {
    expect(panelsIn(DEFAULT_MEETING_LAYOUT, "right")).toEqual(["transcript", "notes"]);
    expect(panelsIn(setPanelHidden(DEFAULT_MEETING_LAYOUT, "people", false), "right")).toEqual([
      "people",
      "transcript",
      "notes",
    ]);
    const moved = movePanel(DEFAULT_MEETING_LAYOUT, "transcript", "left");
    // Chat starts on the left, after Transcript in the fixed order (D-270).
    expect(panelsIn(DEFAULT_MEETING_LAYOUT, "left")).toEqual(["chat"]);
    expect(panelsIn(moved, "left")).toEqual(["transcript", "chat"]);
    expect(panelsIn(moved, "right")).toEqual(["notes"]);
    expect(panelsIn(setPanelHidden(moved, "notes", true), "right")).toEqual([]);
  });

  it("moving shows a hidden panel; hiding keeps its slot", () => {
    const hidden = setPanelHidden(DEFAULT_MEETING_LAYOUT, "notes", true);
    expect(hidden.panels.notes).toEqual({ slot: "right", hidden: true });
    expect(setPanelHidden(hidden, "notes", false).panels.notes).toEqual({ slot: "right" });
    expect(movePanel(hidden, "notes", "bottom").panels.notes).toEqual({ slot: "bottom" });
  });

  it("hides the history's transcript unless it was shown", () => {
    expect(normalizeMeetingLayout({ historyTranscript: "yes" }).historyTranscript).toBeUndefined();
    const shown = setHistoryTranscript(DEFAULT_MEETING_LAYOUT, true);
    expect(normalizeMeetingLayout(shown).historyTranscript).toBe(true);
    expect(setHistoryTranscript(shown, false)).toEqual(DEFAULT_MEETING_LAYOUT);
    expect(sizeOf(DEFAULT_MEETING_LAYOUT, "history.transcript")).toBe(420);
  });

  it("remembers sizes and falls back to defaults", () => {
    expect(sizeOf(DEFAULT_MEETING_LAYOUT, "right")).toBe(460);
    expect(sizeOf(resizeSlot(DEFAULT_MEETING_LAYOUT, "right", 512.6), "right")).toBe(513);
  });
});
