import type { AddonHostApi } from "@jig/sdk";
import { addNote, KINDS, listing, type Note, type NoteKind, parseLink, turnContext } from "./lib/notes";

/** Project notes shared by every chat. Legacy global chat:* records are deliberately unused. */
type ChatArgs = { chat?: { projectId?: string } };

function scope(projectId: string) {
  if (!projectId) throw new Error("Notes belong to a project. Choose a project first.");
  return { scope: "project" as const, id: projectId };
}

export async function list({ projectId }: { projectId: string }, api: AddonHostApi): Promise<Note[]> {
  return (await api.storage.get<Note[]>("notes", scope(projectId))) ?? [];
}

/** Persist atomically through add-on storage. */
async function save({ projectId, notes }: { projectId: string; notes: Note[] }, api: AddonHostApi) {
  await api.storage.set("notes", notes.length ? notes : undefined, scope(projectId));
  api.emit("changed", { projectId });
}

function projectOf(args: ChatArgs): string {
  const id = args.chat?.projectId;
  if (!id) throw new Error("Notes belong to a project. Choose a project first.");
  return id;
}

// Serialize read-modify-write operations so simultaneous chats cannot overwrite each other.
const pending = new Map<string, Promise<unknown>>();
async function change(api: AddonHostApi, projectId: string, fn: (notes: Note[]) => Note[]) {
  const previous = pending.get(projectId) ?? Promise.resolve();
  const job = previous
    .catch(() => {})
    .then(async () => {
      const next = fn(await list({ projectId }, api));
      await save({ projectId, notes: next }, api);
      return next;
    });
  pending.set(projectId, job);
  try {
    return await job;
  } finally {
    if (pending.get(projectId) === job) pending.delete(projectId);
  }
}

// Claude's tools read and maintain lasting project context. They answer with every note as it now stands.

export async function toolList(args: ChatArgs, api: AddonHostApi): Promise<string> {
  return listing(await list({ projectId: projectOf(args) }, api), "This project's notes:");
}

export async function toolAdd(
  args: ChatArgs & { kind?: string; text?: string; url?: string },
  api: AddonHostApi,
  author: Note["by"] = "claude",
): Promise<string> {
  const projectId = projectOf(args);
  if (args.kind && !Object.hasOwn(KINDS, args.kind))
    throw new Error("Use wait, note or link for project notes.");
  const kind: NoteKind = (args.kind as NoteKind | undefined) ?? "note";
  const link = kind === "link" && !args.url ? parseLink(args.text ?? "") : null;
  if (!args.text?.trim() && !args.url && !link) throw new Error("A note needs text (or a URL for a link).");
  const notes = await change(api, projectId, (list) =>
    addNote(list, {
      kind,
      text: link ? link.text : (args.text ?? "").trim(),
      url: link?.url ?? (args.url || undefined),
      by: author,
    }),
  );
  return listing(notes, `Added note ${notes.at(-1)!.id}. The notes now:`);
}

export async function toolUpdate(
  args: ChatArgs & {
    id?: string;
    text?: string;
    url?: string;
    done?: boolean;
  },
  api: AddonHostApi,
  author: Note["by"] = "claude",
): Promise<string> {
  const projectId = projectOf(args);
  const id = String(args.id ?? "");
  const notes = await change(api, projectId, (list) => {
    if (!list.some((n) => n.id === id)) throw new Error(`There is no note ${id}.`);
    return list.map((n) => {
      if (n.id !== id) return n;
      const next: Note = { ...n, by: author };
      if (args.text !== undefined) next.text = args.text;
      if (args.url !== undefined) next.url = args.url || undefined;
      if (args.done !== undefined) next.done = args.done;
      return next;
    });
  });
  return listing(notes, `Updated note ${id}. The notes now:`);
}

export async function toolRemove(args: ChatArgs & { id?: string }, api: AddonHostApi): Promise<string> {
  const projectId = projectOf(args);
  const id = String(args.id ?? "");
  const notes = await change(api, projectId, (list) => {
    if (!list.some((n) => n.id === id)) throw new Error(`There is no note ${id}.`);
    return list.filter((n) => n.id !== id);
  });
  return listing(notes, `Removed note ${id}. The notes now:`);
}

/** contributes.context: the calling chat's project notes and how to keep them, with every message to Claude (D-151). */
export async function context(args: ChatArgs, api: AddonHostApi): Promise<string> {
  const projectId = args.chat?.projectId;
  return projectId ? turnContext(await list({ projectId }, api)) : "";
}

/** UI operations use the same serialized mutations as Claude, and retain the human author. */
export function add(args: { projectId: string } & Parameters<typeof toolAdd>[0], api: AddonHostApi) {
  return toolAdd({ ...args, chat: { projectId: args.projectId } }, api, "you");
}
export function update(args: { projectId: string } & Parameters<typeof toolUpdate>[0], api: AddonHostApi) {
  return toolUpdate({ ...args, chat: { projectId: args.projectId } }, api, "you");
}
export function remove(args: { projectId: string; id: string }, api: AddonHostApi) {
  return toolRemove({ ...args, chat: { projectId: args.projectId } }, api);
}
