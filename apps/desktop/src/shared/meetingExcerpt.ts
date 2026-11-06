/**
 * A meeting as source material for an add-on (D-460): its notes, then the end of its transcript,
 * cut to a size a chat can take. Pure, so main and tests share it.
 */
import type { MeetingRecord } from "./meetings";

/** What `api.meetings.recent()` gives an add-on for one meeting. */
export interface MeetingSource {
  id: string;
  title: string;
  startedAt: string;
  endedAt?: string;
  excerpt: string;
}

export const EXCERPT_MAX = 12_000;

/** The meeting's notes, then as much of the end of its transcript as fits in `max` characters. */
export function meetingExcerpt(
  record: Pick<MeetingRecord, "title" | "notes" | "captions">,
  max = EXCERPT_MAX,
): string {
  const head = [`# ${record.title}`, record.notes.trim() ? `\n## Notes\n\n${record.notes.trim()}` : ""]
    .join("\n")
    .slice(0, max);
  const lines = record.captions
    .filter((c) => c.final && c.text.trim())
    .map((c) => `${c.speaker || "Someone"}: ${c.text.trim()}`);
  const room = max - head.length - "\n\n## Transcript (the end)\n\n".length;
  const kept: string[] = [];
  let size = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? "";
    if (size + line.length + 1 > room) break;
    kept.unshift(line);
    size += line.length + 1;
  }
  return kept.length ? `${head}\n\n## Transcript (the end)\n\n${kept.join("\n")}` : head;
}

/** Ended meetings (not calls in progress), newest first, as add-ons see them. */
export function meetingSources(records: MeetingRecord[], limit = 20): MeetingSource[] {
  return records
    .filter((r) => r.status === "ended" || r.status === "interrupted")
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, Math.max(1, Math.min(limit, 50)))
    .map((r) => ({
      id: r.id,
      title: r.title,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      excerpt: meetingExcerpt(r),
    }));
}
