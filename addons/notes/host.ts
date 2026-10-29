import type { AddonHostApi } from "@jig/sdk";
import { addNote, KINDS, listing, type Note, type NoteKind, parseLink, turnContext } from "./lib/notes";

/**
 * Each chat's notes, kept in the add-on's storage under `chat:<session id>` (global, so a chat keeps
 * its notes whatever project is active). The view and Claude's tools read and write the same list;
 * every change is announced (`changed`) so the view follows.
 */
type ChatArgs = { chat?: { sessionId?: string } };

const key = (sessionId: string) => `chat:${sessionId}`;

export async function list({ sessionId }: { sessionId: string }, api: AddonHostApi): Promise<Note[]> {
  return (await api.storage.get<Note[]>(key(sessionId))) ?? [];
}

/** The view saves the whole list after you add, tick, edit or remove a note. */
export async function save({ sessionId, notes }: { sessionId: string; notes: Note[] }, api: AddonHostApi) {
  await api.storage.set(key(sessionId), notes.length ? notes : undefined);
  api.emit("changed", { sessionId });
}

function chatOf(args: ChatArgs): string {
  const id = args.chat?.sessionId;
  if (!id) throw new Error("Notes belong to a chat, and this call came from none.");
  return id;
}

async function change(api: AddonHostApi, sessionId: string, fn: (notes: Note[]) => Note[]) {
  const next = fn(await list({ sessionId }, api));
  await save({ sessionId, notes: next }, api);
  return next;
}

// Claude's tools (contributes.tools): it reads the notes before working and writes what the chat
// must keep in mind. They answer with every note as it now stands.

export async function toolList(args: ChatArgs, api: AddonHostApi): Promise<string> {
  return listing(await list({ sessionId: chatOf(args) }, api), "This chat's notes:");
}

export async function toolAdd(
  args: ChatArgs & { kind?: string; text?: string; repo?: string; branch?: string; url?: string },
  api: AddonHostApi,
): Promise<string> {
  const sessionId = chatOf(args);
  const kind: NoteKind = args.kind && args.kind in KINDS ? (args.kind as NoteKind) : "note";
  const link = kind === "link" && !args.url ? parseLink(args.text ?? "") : null;
  if (!args.text?.trim() && !args.repo && !args.branch && !args.url && !link)
    throw new Error("A note needs text (or repo/branch for where, or url for a link).");
  const notes = await change(api, sessionId, (list) =>
    addNote(list, {
      kind,
      text: link ? link.text : (args.text ?? "").trim(),
      repo: args.repo || undefined,
      branch: args.branch || undefined,
      url: link?.url ?? (args.url || undefined),
      by: "claude",
    }),
  );
  return listing(notes, `Added note ${notes.at(-1)!.id}. The notes now:`);
}

export async function toolUpdate(
  args: ChatArgs & {
    id?: string;
    text?: string;
    repo?: string;
    branch?: string;
    url?: string;
    done?: boolean;
  },
  api: AddonHostApi,
): Promise<string> {
  const sessionId = chatOf(args);
  const id = String(args.id ?? "");
  if (!(await list({ sessionId }, api)).some((n) => n.id === id)) throw new Error(`There is no note ${id}.`);
  const notes = await change(api, sessionId, (list) =>
    list.map((n) => {
      if (n.id !== id) return n;
      const next: Note = { ...n, by: "claude" };
      if (args.text !== undefined) next.text = args.text;
      if (args.repo !== undefined) next.repo = args.repo || undefined;
      if (args.branch !== undefined) next.branch = args.branch || undefined;
      if (args.url !== undefined) next.url = args.url || undefined;
      if (args.done !== undefined) next.done = args.done;
      return next;
    }),
  );
  return listing(notes, `Updated note ${id}. The notes now:`);
}

export async function toolRemove(args: ChatArgs & { id?: string }, api: AddonHostApi): Promise<string> {
  const sessionId = chatOf(args);
  const id = String(args.id ?? "");
  if (!(await list({ sessionId }, api)).some((n) => n.id === id)) throw new Error(`There is no note ${id}.`);
  const notes = await change(api, sessionId, (list) => list.filter((n) => n.id !== id));
  return listing(notes, `Removed note ${id}. The notes now:`);
}

/** contributes.context: the chat's notes and how to keep them, with every message to Claude (D-151). */
export async function context(args: ChatArgs, api: AddonHostApi): Promise<string> {
  const sessionId = args.chat?.sessionId;
  return sessionId ? turnContext(await list({ sessionId }, api)) : "";
}
