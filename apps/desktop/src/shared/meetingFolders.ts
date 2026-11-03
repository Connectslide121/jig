/**
 * Folders in the meeting history (D-295): folders you make and fill by dragging, and a folder of its
 * own for each recurring meeting. Pure, so the host, the view and their tests share it.
 *
 * A recurring Teams meeting keeps one meeting thread for all its occurrences, so meetings whose join
 * links name the same thread are one series. That needs nothing from the calendar and works for
 * meetings kept before folders existed.
 */
import { meetingChatId } from "./meetingChat";
import type { MeetingRecord } from "./meetings";

export interface MeetingFolder {
  id: string;
  name: string;
}

/**
 * Where a meeting goes when you move it: one of your folders, out of every folder (`none`), or back
 * to its series' folder, if it has one (`auto`).
 */
export type MeetingPlace = string | "none" | "auto";

/** A folder as the history shows it: yours, or the one a recurring meeting gets by itself. */
export interface HistoryGroup {
  /** `folder:<id>` or `series:<thread>`. */
  key: string;
  kind: "folder" | "series";
  name: string;
  /** Your folder's id (kind `folder`). */
  folderId?: string;
  /** The series' meeting thread (kind `series`). */
  series?: string;
  /** Newest first. */
  records: MeetingRecord[];
}

/** The recurring meeting a meeting belongs to: its Teams meeting thread (calls have none). */
export const seriesOf = (record: Pick<MeetingRecord, "joinUrl">): string | undefined =>
  record.joinUrl ? meetingChatId(record.joinUrl) : undefined;

/** Fewest meetings that make a series its own folder. */
const SERIES_MIN = 2;

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });

/**
 * The history in folders: your folders (also empty ones, so you can drop into a new folder) and the
 * series folders, together by name, then the meetings in no folder. A meeting you put in a folder
 * stays there; one you took out of every folder (`folder: null`) stays out; the rest go to their
 * series' folder when at least two meetings of the series are left there. `records` come newest
 * first and keep that order inside each folder.
 */
export function groupHistory(
  records: MeetingRecord[],
  folders: MeetingFolder[],
  options: { keepEmpty?: boolean } = {},
): { groups: HistoryGroup[]; loose: MeetingRecord[] } {
  const keepEmpty = options.keepEmpty ?? true;
  const yours = new Map(
    folders.map((f) => [
      f.id,
      { key: `folder:${f.id}`, kind: "folder", name: f.name, folderId: f.id, records: [] } as HistoryGroup,
    ]),
  );
  const series = new Map<string, MeetingRecord[]>();
  const loose: MeetingRecord[] = [];
  const auto: MeetingRecord[] = [];
  for (const r of records) {
    if (typeof r.folder === "string" && yours.has(r.folder)) yours.get(r.folder)!.records.push(r);
    else if (r.folder === null) loose.push(r);
    else auto.push(r);
  }
  for (const r of auto) {
    const s = seriesOf(r);
    if (s) series.set(s, [...(series.get(s) ?? []), r]);
  }
  const seriesGroups: HistoryGroup[] = [];
  for (const r of auto) {
    const s = seriesOf(r);
    const members = s ? series.get(s)! : [];
    if (!s || members.length < SERIES_MIN) loose.push(r);
    else if (members[0] === r)
      // Named after its newest meeting, so a renamed series shows its current name.
      seriesGroups.push({ key: `series:${s}`, kind: "series", name: r.title, series: s, records: members });
  }
  const order = new Map(records.map((r, i) => [r.id, i]));
  loose.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  const groups = [...[...yours.values()].filter((g) => keepEmpty || g.records.length), ...seriesGroups];
  return { groups: groups.sort(byName), loose };
}

/**
 * Whether a meeting may be dropped on a folder: any of your folders takes any meeting; a series
 * folder takes only its own meetings (dropping one there puts it back to `auto`).
 */
export function canDrop(group: HistoryGroup, record: MeetingRecord): boolean {
  if (group.kind === "folder") return record.folder !== group.folderId;
  return seriesOf(record) === group.series && record.folder !== undefined;
}

/** The record's `folder` after moving it to `place` (undefined: back to its series, if any). */
export function placeFolder(place: MeetingPlace): string | null | undefined {
  return place === "auto" ? undefined : place === "none" ? null : place;
}

/** A folder name as kept: trimmed, one line, at most 120 characters. */
export function folderName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, 120);
}
