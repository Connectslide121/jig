import type {
  MeetingAction,
  MeetingNotesDoc,
  MeetingRecord,
} from "../../../apps/desktop/src/shared/meetings";

/**
 * Generated meeting notes (D-424) that both main and the meeting views use: who took part, how stale
 * notes are, and the Markdown copy kept in `record.notes`.
 */

/** "09:01:05": the second a caption starts, in UTC. Notes cite captions this way in the prompt. */
export const captionStamp = (iso: string): string => new Date(iso).toISOString().slice(11, 19);

/** Who spoke, in the order they first spoke, once each: from the captions, never from the AI. */
export function participants(record: Pick<MeetingRecord, "captions">): string[] {
  const out: string[] = [];
  for (const c of record.captions) {
    const name = c.speaker.trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/** Finished captions said after the notes' transcript ends: "N new lines since these notes". */
export function linesSince(record: Pick<MeetingRecord, "captions">, through: string): number {
  return record.captions.filter((c) => c.final && c.timestamp > through).length;
}

/** Where the notes' transcript really ends: its last finished caption up to the cutoff (else the cutoff). */
export function transcriptEnd(record: Pick<MeetingRecord, "captions">, through: string): string {
  return record.captions.filter((c) => c.final && c.timestamp <= through).at(-1)?.timestamp ?? through;
}

/** "Claude Sonnet", "ChatGPT Terra": a model alias capitalised; an exact id stays as it is. */
export function notesModelLabel(doc: Pick<MeetingNotesDoc, "provider" | "model">): string {
  const who = doc.provider === "chatgpt" ? "ChatGPT" : "Claude";
  const model = /^[a-z]+$/.test(doc.model) ? doc.model[0]!.toUpperCase() + doc.model.slice(1) : doc.model;
  return model ? `${who} ${model}` : who;
}

/** The actions the notes list: everything but dismissed ones (handled and queued ones stay listed). */
export const notesActions = (actions: MeetingAction[]): MeetingAction[] =>
  actions.filter((a) => a.status !== "dismissed");

const hhmm = (iso: string) => new Date(iso).toISOString().slice(11, 16);
const cite = (at: string[]) => (at.length ? ` (${at.map(hhmm).join(", ")} UTC)` : "");

/**
 * The notes as Markdown, for copying and for anything that reads `record.notes` (D-424). Section
 * names are Jig's (English); what's in them is in the meeting's own language.
 */
export function notesMarkdown(doc: MeetingNotesDoc, actions: MeetingAction[]): string {
  const out: string[] = [];
  if (doc.tldr) out.push(`**TL;DR** ${doc.tldr}`, "");
  if (doc.decisions.length) {
    out.push("**Decisions**", "");
    for (const d of doc.decisions) out.push(`- ${d.what} — ${d.by || "Unknown"}${cite(d.at)}`);
    out.push("");
  }
  const listed = notesActions(actions);
  if (listed.length) {
    out.push("**Action items**", "");
    for (const a of listed)
      out.push(
        `- [${a.status === "done" ? "x" : " "}] ${a.owner || "Unknown"}: ${a.title}${a.due ? ` (due ${a.due})` : ""}${cite(a.at ?? [])}`,
      );
    out.push("");
  }
  if (doc.questions.length) {
    out.push("**Open questions and risks**", "");
    for (const q of doc.questions)
      out.push(`- ${q.kind === "risk" ? "Risk: " : ""}${q.text} — ${q.raisedBy || "Unknown"}${cite(q.at)}`);
    out.push("");
  }
  if (doc.topics.length) {
    out.push("**Discussion**", "");
    for (const t of doc.topics) {
      out.push(`*${t.title}*`, "");
      for (const p of t.points) out.push(`- ${p}`);
      out.push("");
    }
  }
  if (doc.participants.length) out.push(`**Participants:** ${doc.participants.join(", ")}`, "");
  return `${out.join("\n").trim()}\n`;
}
