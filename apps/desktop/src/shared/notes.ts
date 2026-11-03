/**
 * Project notes (D-202, part of the project's knowledge since D-289): short facts every chat in a
 * project gets in full with each message, kept by you and Claude. Stored with the project's
 * knowledge in `knowledge/<projectId>/notes.json`.
 */
export type NoteKind = "wait" | "note" | "link";

export interface Note {
  /** Short and unique in its project (`1`, `2`…): what Claude names it by. */
  id: string;
  kind: NoteKind;
  /** The words; for `link` an optional label. */
  text: string;
  /** `link`: the address. */
  url?: string;
  /** `wait`: the dependency has cleared. */
  done?: boolean;
  /** Who wrote it last. */
  by: "you" | "claude";
  createdAt: number;
}

/** Each kind's name and icon (Lucide), in the order the add row offers them. */
export const KINDS: Record<NoteKind, { label: string; icon: string; placeholder: string }> = {
  wait: { label: "Waiting on", icon: "hourglass", placeholder: "A project dependency or blocker" },
  note: { label: "Note", icon: "sticky-note", placeholder: "A decision or fact to keep in mind" },
  link: { label: "Link", icon: "link", placeholder: "Label https://…" },
};
export const KIND_ORDER: NoteKind[] = ["wait", "note", "link"];

/** A cleared dependency: it sinks to the bottom. */
export const isDone = (note: Note) => note.kind === "wait" && !!note.done;

/** The order notes are shown and listed in: open dependencies, notes, links, then cleared dependencies. */
export function sorted(list: readonly Note[]): Note[] {
  const rank = (note: Note) => (isDone(note) ? 10 : KIND_ORDER.indexOf(note.kind));
  return list
    .map((note, i) => ({ note, i }))
    .sort((a, b) => rank(a.note) - rank(b.note) || a.i - b.i)
    .map(({ note }) => note);
}

/** The next free id: one past the highest. */
export function nextId(list: readonly Note[]): string {
  return String(list.reduce((max, note) => Math.max(max, Number(note.id) || 0), 0) + 1);
}

/** A link typed as `label https://…` (or just the address): the address and the words around it. */
export function parseLink(typed: string): { url: string; text: string } | null {
  const match = typed.match(/https?:\/\/\S+/);
  if (!match) return null;
  return { url: match[0], text: typed.replace(match[0], "").replace(/\s+/g, " ").trim() };
}

/** A note on one line, with the address for links. */
export function noteText(note: Note): string {
  if (note.kind === "link") return note.text ? `${note.text} (${note.url ?? ""})` : (note.url ?? "");
  return note.text;
}

/** What Claude's note tools answer: the project's notes as they now stand, with their ids. */
export function listing(list: readonly Note[], said: string): string {
  const lines = sorted(list).map(
    (note) => `[${note.id}] ${KINDS[note.kind].label}: ${noteText(note)}${isDone(note) ? " [cleared]" : ""}`,
  );
  return [said, ...(lines.length ? lines : ["(no notes)"])].join("\n");
}

/** Adds a note (the next id) to a project's list. */
export function addNote(list: Note[], fields: Omit<Note, "id" | "createdAt">, now = Date.now()): Note[] {
  return [...list, { ...fields, id: nextId(list), createdAt: now }];
}

/**
 * The notes part of what Claude gets with every message of a chat (D-151, D-289): the notes as they
 * stand and how to keep them, short enough to repeat each turn.
 */
export function turnContext(list: readonly Note[]): string {
  const rule =
    "Notes describe the PROJECT and are shared with every chat in it. Save only important context that another chat needs to understand the project beyond this task or chat: lasting decisions, constraints, facts, useful project links, and dependencies or blockers affecting future project work. Example (wait): 'Pipeline improvements are deferred until the Jenkins-to-Azure-DevOps migration is complete.' This is not a to-do list, task reminder, plan, progress log or handoff: do not record current work, files changed, commits, temporary branches, routine next steps, or things relevant only to this task or chat. Do not add notes merely because a turn ended. Use jig_notes_add only when meaningful project knowledge emerges; read existing notes first, update rather than duplicate with jig_notes_update, and remove obsolete notes with jig_notes_remove. Mark a dependency cleared (done: true) only when confirmed. Keep a small set of concise, accurate notes; do not infer project facts from guesses. The user sees and edits the same notes in the project's Knowledge.";
  return [
    listing(list, "Notes:"),
    ...(list.some((n) => n.kind === "wait" && !isDone(n))
      ? ["Open dependencies constrain only the work they describe; unrelated project work can continue."]
      : []),
    rule,
  ].join("\n");
}
