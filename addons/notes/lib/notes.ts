/**
 * A chat's notes, like the notes plugin (pure, tested in notes.test.ts): short typed notes the chat
 * has to keep in mind, which you and Claude write.
 */

/**
 * `wait`: something the chat waits on; `where`: where its work is (repository and branch); `todo`:
 * a step left for later; `note`: a decision, constraint or fact; `link`: an address.
 */
export type NoteKind = "wait" | "where" | "todo" | "note" | "link";

export interface Note {
  /** Short and unique in its chat (`1`, `2`…): what Claude names it by. */
  id: string;
  kind: NoteKind;
  /** The words; for `where` and `link` an optional remark. */
  text: string;
  /** `where`: the repository and branch. */
  repo?: string;
  branch?: string;
  /** `link`: the address. */
  url?: string;
  /** `wait` and `todo`: cleared or done. */
  done?: boolean;
  /** Who wrote it last. */
  by: "you" | "claude";
  createdAt: number;
}

/** Each kind's name and icon (Lucide), in the order the add row offers them. */
export const KINDS: Record<NoteKind, { label: string; icon: string; placeholder: string }> = {
  wait: { label: "Waiting on", icon: "hourglass", placeholder: "What this chat waits on" },
  where: { label: "Where", icon: "map-pin", placeholder: "Branch" },
  todo: { label: "To-do", icon: "square", placeholder: "What is left to do" },
  note: { label: "Note", icon: "sticky-note", placeholder: "A decision or fact to keep in mind" },
  link: { label: "Link", icon: "link", placeholder: "Label https://…" },
};
export const KIND_ORDER: NoteKind[] = ["wait", "where", "todo", "note", "link"];

/** A cleared wait or a done to-do: it sinks to the bottom. */
export const isDone = (note: Note) => (note.kind === "wait" || note.kind === "todo") && !!note.done;

/** The order notes are shown and listed in: open waits, where, open to-dos, notes, links, then done. */
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

/** A note on one line: `shop · feature/x — remark`, `label (url)`. */
export function noteText(note: Note): string {
  if (note.kind === "where") {
    const place = [note.repo, note.branch].filter(Boolean).join(" · ");
    return [place, note.text].filter(Boolean).join(" — ");
  }
  if (note.kind === "link") return note.text ? `${note.text} (${note.url ?? ""})` : (note.url ?? "");
  return note.text;
}

/** What Claude's note tools answer: the chat's notes as they now stand, with their ids. */
export function listing(list: readonly Note[], said: string): string {
  const lines = sorted(list).map(
    (note) =>
      `[${note.id}] ${KINDS[note.kind].label}: ${noteText(note)}${isDone(note) ? (note.kind === "wait" ? " [cleared]" : " [done]") : ""}`,
  );
  return [said, ...(lines.length ? lines : ["(no notes)"])].join("\n");
}

/** Adds a note (the next id) to a chat's list. */
export function addNote(list: Note[], fields: Omit<Note, "id" | "createdAt">, now = Date.now()): Note[] {
  return [...list, { ...fields, id: nextId(list), createdAt: now }];
}
