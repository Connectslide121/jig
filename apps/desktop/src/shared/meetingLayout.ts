/**
 * Where the live meeting room's panels sit (D-221). The call is always the main area; People,
 * Transcript and Notes go in the left, right or bottom slot; panels in one slot share it with splits. Pure, so the
 * host validates it and the room tests it.
 */

export const MEETING_PANELS = ["people", "transcript", "notes"] as const;
export type MeetingPanelId = (typeof MEETING_PANELS)[number];
export const MEETING_SLOTS = ["left", "right", "bottom"] as const;
export type MeetingSlot = (typeof MEETING_SLOTS)[number];
/** Remembered sizes in px: a slot's width/height, `<slot>.split`/`.split2` the first/second panel's share of a shared slot, `review.notes`. */
export const MEETING_SIZES = [
  "left",
  "right",
  "bottom",
  "left.split",
  "right.split",
  "bottom.split",
  "left.split2",
  "right.split2",
  "bottom.split2",
  "review.notes",
] as const;
export type MeetingSizeKey = (typeof MEETING_SIZES)[number];

export interface MeetingLayout {
  panels: Record<MeetingPanelId, { slot: MeetingSlot; hidden?: boolean }>;
  sizes: Partial<Record<MeetingSizeKey, number>>;
}

export const DEFAULT_SIZES: Record<MeetingSizeKey, number> = {
  left: 380,
  right: 460,
  bottom: 260,
  "left.split": 360,
  "right.split": 420,
  "bottom.split": 600,
  "left.split2": 300,
  "right.split2": 300,
  "bottom.split2": 500,
  "review.notes": 420,
};

export const DEFAULT_MEETING_LAYOUT: MeetingLayout = {
  panels: {
    people: { slot: "right", hidden: true },
    transcript: { slot: "right" },
    notes: { slot: "right" },
  },
  sizes: {},
};

export const PANEL_TITLES: Record<MeetingPanelId, string> = {
  people: "People",
  transcript: "Transcript",
  notes: "Notes",
};
export const SLOT_TITLES: Record<MeetingSlot, string> = { left: "Left", right: "Right", bottom: "Bottom" };

/** A stored layout that is missing panels or has stray values falls back per field to the defaults. */
export function normalizeMeetingLayout(value: unknown): MeetingLayout {
  const input = (value ?? {}) as Partial<MeetingLayout>;
  const panels = {} as MeetingLayout["panels"];
  for (const id of MEETING_PANELS) {
    const p = input.panels?.[id];
    const slot = p && MEETING_SLOTS.includes(p.slot) ? p.slot : DEFAULT_MEETING_LAYOUT.panels[id].slot;
    const hidden = p ? p.hidden : DEFAULT_MEETING_LAYOUT.panels[id].hidden;
    panels[id] = hidden ? { slot, hidden: true } : { slot };
  }
  const sizes: MeetingLayout["sizes"] = {};
  for (const key of MEETING_SIZES) {
    const size = input.sizes?.[key];
    if (typeof size === "number" && Number.isFinite(size) && size > 0) sizes[key] = Math.round(size);
  }
  return { panels, sizes };
}

/** The visible panels in a slot, in their fixed order. */
export function panelsIn(layout: MeetingLayout, slot: MeetingSlot): MeetingPanelId[] {
  return MEETING_PANELS.filter((id) => !layout.panels[id].hidden && layout.panels[id].slot === slot);
}

export function movePanel(layout: MeetingLayout, id: MeetingPanelId, slot: MeetingSlot): MeetingLayout {
  return { ...layout, panels: { ...layout.panels, [id]: { slot } } };
}

export function setPanelHidden(layout: MeetingLayout, id: MeetingPanelId, hidden: boolean): MeetingLayout {
  const { slot } = layout.panels[id];
  return { ...layout, panels: { ...layout.panels, [id]: hidden ? { slot, hidden: true } : { slot } } };
}

export function resizeSlot(layout: MeetingLayout, key: MeetingSizeKey, size: number): MeetingLayout {
  return { ...layout, sizes: { ...layout.sizes, [key]: Math.round(size) } };
}

export function sizeOf(layout: MeetingLayout, key: MeetingSizeKey): number {
  return layout.sizes[key] ?? DEFAULT_SIZES[key];
}
