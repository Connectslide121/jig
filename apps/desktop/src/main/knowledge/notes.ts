import { readFile, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { addNote, KINDS, type Note, type NoteKind, parseLink } from "../../shared/notes";
import { readJson, writeJson } from "../state/jsonStore";
import { jigHome, paths } from "../state/paths";

const note = z.object({
  id: z.string(),
  kind: z.enum(["wait", "note", "link"]),
  text: z.string(),
  url: z.string().optional(),
  done: z.boolean().optional(),
  by: z.enum(["you", "claude"]),
  createdAt: z.number(),
});
const file = z.object({ notes: z.array(note).default([]) });

export type NoteFields = { kind?: string; text?: string; url?: string };
export type NoteChange = { text?: string; url?: string; done?: boolean };

/**
 * A project's notes (D-289): `knowledge/<projectId>/notes.json`, beside its documents. Read-modify-
 * write is serialized per project, so chats and the UI editing at once never overwrite each other.
 */
export class NotesStore {
  private readonly pending = new Map<string, Promise<unknown>>();
  constructor(private readonly root = join(jigHome(), "knowledge")) {}
  private path(projectId: string): string {
    if (!/^[\w-]{1,100}$/.test(projectId)) throw new Error("Unknown project");
    return join(this.root, projectId, "notes.json");
  }
  async list(projectId: string): Promise<Note[]> {
    return (await readJson(this.path(projectId), file)).notes;
  }
  private async change(projectId: string, fn: (notes: Note[]) => Note[]): Promise<Note[]> {
    const previous = this.pending.get(projectId) ?? Promise.resolve();
    const job = previous
      .catch(() => {})
      .then(async () => {
        const next = fn(await this.list(projectId));
        await writeJson(this.path(projectId), { notes: next });
        return next;
      });
    this.pending.set(projectId, job);
    try {
      return await job;
    } finally {
      if (this.pending.get(projectId) === job) this.pending.delete(projectId);
    }
  }
  add(projectId: string, fields: NoteFields, by: Note["by"]): Promise<Note[]> {
    if (fields.kind && !Object.hasOwn(KINDS, fields.kind))
      throw new Error("Use wait, note or link for project notes.");
    const kind = (fields.kind as NoteKind | undefined) ?? "note";
    const link = kind === "link" && !fields.url ? parseLink(fields.text ?? "") : null;
    if (!fields.text?.trim() && !fields.url && !link)
      throw new Error("A note needs text (or a URL for a link).");
    return this.change(projectId, (list) =>
      addNote(list, {
        kind,
        text: link ? link.text : (fields.text ?? "").trim(),
        url: link?.url ?? (fields.url || undefined),
        by,
      }),
    );
  }
  update(projectId: string, id: string, fields: NoteChange, by: Note["by"]): Promise<Note[]> {
    return this.change(projectId, (list) => {
      if (!list.some((n) => n.id === id)) throw new Error(`There is no note ${id}.`);
      return list.map((n) => {
        if (n.id !== id) return n;
        const next: Note = { ...n, by };
        if (fields.text !== undefined) next.text = fields.text;
        if (fields.url !== undefined) next.url = fields.url || undefined;
        if (fields.done !== undefined) next.done = fields.done;
        return next;
      });
    });
  }
  remove(projectId: string, id: string): Promise<Note[]> {
    return this.change(projectId, (list) => {
      if (!list.some((n) => n.id === id)) throw new Error(`There is no note ${id}.`);
      return list.filter((n) => n.id !== id);
    });
  }

  /**
   * Moves the notes the Notes add-on kept (`addon-data/notes.json`, `@project(<id>) notes`) into
   * each project's knowledge, once (D-289). A project that already has notes keeps them; notes of
   * removed projects are left behind. The old file is renamed to `notes.json.migrated`, never
   * deleted, and only after every project's notes were written.
   */
  async migrateFromAddon(
    projectIds: readonly string[],
    old = join(paths.addonData(), "notes.json"),
  ): Promise<number> {
    let raw: string;
    try {
      raw = await readFile(old, "utf8");
    } catch {
      return 0;
    }
    const data = JSON.parse(raw) as Record<string, unknown>;
    let moved = 0;
    for (const projectId of projectIds) {
      const parsed = z.array(note).safeParse(data[`@project(${projectId}) notes`]);
      if (!parsed.success || !parsed.data.length) continue;
      const exists = await stat(this.path(projectId)).then(
        () => true,
        () => false,
      );
      if (exists) continue;
      await writeJson(this.path(projectId), { notes: parsed.data });
      moved += parsed.data.length;
    }
    await rename(old, `${old}.migrated`);
    return moved;
  }
}
