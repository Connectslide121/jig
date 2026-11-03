import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { attachmentType, extensionOf, officeToText } from "@jig/documents";
import { BrowserWindow, dialog } from "electron";
import { unzipSync } from "fflate";
import { z } from "zod";
import { JigError } from "../../shared/ipc";
import {
  type ClaudeExportSummary,
  type ClaudeProject,
  type KnowledgeDoc,
  parseClaudeProjects,
} from "../../shared/knowledge";
import { listing, type Note, turnContext as notesContext } from "../../shared/notes";
import { openExternal } from "../appWindows";
import { addMessageContext, registerJigTools } from "../engine/jigTools";
import { emit, handle } from "../ipc/router";
import { projectStore } from "../projects";
import { NotesStore } from "./notes";
import { pdfText } from "./pdf";
import { KnowledgeStore } from "./store";

const store = new KnowledgeStore();
const notes = new NotesStore();
const changed = (projectId: string) => emit("knowledge.changed", { projectId });
/** Parsed exports waiting for you to pick projects (only the projects are kept, never the chats). */
const exports = new Map<string, ClaudeProject[]>();
const MAX_FILE_BYTES = 30 * 1024 * 1024;
/** A data export holds every conversation too; Jig reads only `projects.json` from it. */
const MAX_EXPORT_BYTES = 2 * 1024 * 1024 * 1024;

async function project(projectId: string) {
  const found = (await projectStore().list()).find((p) => p.id === projectId);
  if (!found) throw new JigError("not_found", "That project doesn't exist");
  return found;
}

/** A file as knowledge text: text files as they are, PDF/Word/Excel/PowerPoint as their text. */
async function fileText(path: string): Promise<string> {
  const name = basename(path);
  const info = await stat(path).catch(() => undefined);
  if (!info?.isFile()) throw new Error(`${name} doesn't exist`);
  if (info.size > MAX_FILE_BYTES) throw new Error(`${name} is larger than 30 MB`);
  const type = attachmentType(name);
  const bytes = await readFile(path);
  if (type.kind === "office") return officeToText(extensionOf(name), bytes);
  if (type.kind === "text") return bytes.toString("utf8");
  if (type.kind === "pdf") return pdfText(bytes, name);
  throw new Error(`${name}: only text, Markdown, code, PDF, Word, Excel and PowerPoint files`);
}

/** Reads the projects of a claude.ai data export zip. */
async function readExport(path: string): Promise<ClaudeExportSummary> {
  if (!/\.zip$/i.test(path)) throw new JigError("invalid_args", "Pick the .zip file from claude.ai's export");
  const info = await stat(path).catch(() => undefined);
  if (!info?.isFile()) throw new JigError("not_found", "That file doesn't exist");
  if (info.size > MAX_EXPORT_BYTES) throw new JigError("too_large", "The export is larger than 2 GB");
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(await readFile(path)), {
      filter: (f) => /(^|\/)projects\.json$/i.test(f.name),
    });
  } catch {
    throw new JigError("unreadable", "That isn't a zip file Jig can read");
  }
  const entry = Object.values(files)[0];
  if (!entry)
    throw new JigError(
      "not_found",
      "This export has no projects.json. Check that it's the export from claude.ai (Settings → Privacy → Export data) and that you have projects there.",
    );
  let projects: ClaudeProject[];
  try {
    projects = parseClaudeProjects(JSON.parse(new TextDecoder().decode(entry)));
  } catch {
    throw new JigError("unreadable", "projects.json in the export couldn't be read");
  }
  const token = randomUUID();
  exports.clear();
  exports.set(token, projects);
  return {
    token,
    file: basename(path),
    projects: projects.map((p) => ({
      uuid: p.uuid,
      name: p.name,
      description: p.description,
      instructions: p.instructions,
      docs: p.docs.map((d) => ({ name: d.name, chars: d.content.length })),
    })),
  };
}

const describe = (docs: KnowledgeDoc[]) =>
  docs.map((d) => `- ${d.name} (${Math.max(1, Math.round(d.chars / 1000))}k characters)`).join("\n");

/** Claude's note tools answer with every note as it now stands, and the UI follows. */
function noted(projectId: string, list: Note[], said: string): string {
  changed(projectId);
  return listing(list, said);
}

function projectOf(meta: { projectId?: string }): string {
  if (!meta.projectId) throw new JigError("not_found", "Notes belong to a project. This chat isn't in one.");
  return meta.projectId;
}

/** Moves the Notes add-on's notes into the projects' knowledge (D-289); logs, never stops startup. */
async function migrateNotes(): Promise<void> {
  try {
    const ids = (await projectStore().list()).map((p) => p.id);
    const moved = await notes.migrateFromAddon(ids);
    if (moved) console.log(`[knowledge] moved ${moved} project notes from the Notes add-on`);
  } catch (error) {
    console.warn("[knowledge] couldn't move the Notes add-on's notes:", error);
  }
}

/**
 * Project knowledge (D-256, D-289): the project's notes, which every chat in it gets in full, and
 * documents it can read; plus the import of claude.ai projects (instructions and knowledge) from
 * claude.ai's own data export.
 */
export function startKnowledge(): void {
  void migrateNotes();
  handle("knowledge.list", async ({ projectId }) => store.list(projectId));
  handle("notes.list", async ({ projectId }) => notes.list(projectId));
  handle("notes.add", async ({ projectId, kind, text, url }) => {
    await project(projectId);
    const list = await notes.add(projectId, { kind, text, url }, "you");
    changed(projectId);
    return list;
  });
  handle("notes.update", async ({ projectId, id, ...fields }) => {
    const list = await notes.update(projectId, id, fields, "you");
    changed(projectId);
    return list;
  });
  handle("notes.remove", async ({ projectId, id }) => {
    const list = await notes.remove(projectId, id);
    changed(projectId);
    return list;
  });
  handle("knowledge.read", async ({ projectId, id }) => {
    const { doc, text } = await store.read(projectId, id);
    return { name: doc.name, text };
  });
  handle("knowledge.remove", async ({ projectId, id }) => {
    await store.remove(projectId, id);
    changed(projectId);
  });
  handle("knowledge.addFiles", async ({ projectId, paths }, ctx) => {
    await project(projectId);
    let list = paths;
    if (!list?.length) {
      const window = BrowserWindow.fromWebContents(ctx.sender);
      const options = {
        title: "Add knowledge",
        properties: ["openFile" as const, "multiSelections" as const],
        filters: [
          {
            name: "Documents",
            extensions: ["md", "txt", "pdf", "docx", "xlsx", "pptx", "csv", "json", "html"],
          },
          { name: "All files", extensions: ["*"] },
        ],
      };
      const picked = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);
      list = picked.canceled ? [] : picked.filePaths;
    }
    const added: KnowledgeDoc[] = [];
    const skipped: string[] = [];
    for (const path of list ?? []) {
      try {
        added.push(await store.add(projectId, basename(path), await fileText(path), "file"));
      } catch (error) {
        skipped.push((error as Error).message);
      }
    }
    if (added.length) changed(projectId);
    return { added, skipped };
  });
  handle("claudeImport.open", async ({ path }, ctx) => {
    let file = path;
    if (!file) {
      const window = BrowserWindow.fromWebContents(ctx.sender);
      const options = {
        title: "Open claude.ai's data export",
        properties: ["openFile" as const],
        filters: [{ name: "Zip", extensions: ["zip"] }],
      };
      const picked = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);
      if (picked.canceled || !picked.filePaths[0]) return undefined;
      file = picked.filePaths[0];
    }
    return readExport(file);
  });
  handle("claudeImport.apply", async ({ token, uuids, path }) => {
    const projects = exports.get(token);
    if (!projects) throw new JigError("expired", "Open the export again");
    const created: string[] = [];
    for (const p of projects.filter((x) => uuids.includes(x.uuid))) {
      const instructions = (p.instructions || p.description).slice(0, 20_000);
      const { project: made } = await projectStore().create({
        name: p.name.slice(0, 200),
        path,
        ...(instructions.trim() ? { instructions } : {}),
      });
      for (const doc of p.docs) await store.add(made.id, doc.name, doc.content, "claude.ai");
      changed(made.id);
      created.push(made.id);
    }
    exports.delete(token);
    return { projectIds: created };
  });
  handle("claudeImport.openSettings", async () => {
    // claude.ai opens in the system browser, never inside Jig.
    await openExternal("https://claude.ai/settings/data-privacy-controls");
  });

  // Each message gives Claude the project's notes in full and the names of its documents (both
  // change between turns).
  addMessageContext(async (_text, meta) => {
    if (!meta.projectId) return "";
    const [list, docs] = await Promise.all([
      notes.list(meta.projectId).catch(() => []),
      store.list(meta.projectId).catch(() => []),
    ]);
    return [
      "Project knowledge (shared by every chat in this project):",
      notesContext(list),
      ...(docs.length
        ? [
            `Documents the user keeps for this project's chats. Read one with jig_knowledge_read (by name) when it may help:\n${describe(docs)}`,
          ]
        : []),
    ].join("\n\n");
  });

  registerJigTools([
    {
      name: "jig_notes_list",
      description:
        "Read this chat's project notes, shared with every chat in the project, with ids. They also arrive with each message. Open dependencies constrain only their described work.",
      readOnly: true,
      alwaysLoad: true,
      shape: {},
      handler: async (_args, meta) => listing(await notes.list(projectOf(meta)), "This project's notes:"),
    },
    {
      name: "jig_notes_add",
      description:
        "Save important knowledge ABOUT THE PROJECT that remains useful to other chats beyond this task: lasting decisions, constraints, facts, project links, dependencies or blockers. Example wait: pipeline improvements deferred until the Jenkins-to-Azure-DevOps migration is complete. Not a to-do list, task reminder, progress log or handoff. Never save current work, routine next steps, temporary branches, changed files or commits. Keep notes concise; read first and update duplicates instead.",
      alwaysLoad: true,
      shape: {
        kind: z
          .enum(["wait", "note", "link"])
          .describe(
            "wait: project dependency/blocker; note: lasting project knowledge; link: project reference",
          ),
        text: z.string().optional().describe("Concise project context, useful beyond this task or chat"),
        url: z.string().optional().describe("link: the address"),
      },
      handler: async (args, meta) => {
        const projectId = projectOf(meta);
        const list = await notes.add(
          projectId,
          args as { kind?: string; text?: string; url?: string },
          "claude",
        );
        return noted(projectId, list, `Added note ${list.at(-1)!.id}. The notes now:`);
      },
    },
    {
      name: "jig_notes_update",
      description:
        "Update a project note by id when project facts change, or mark a dependency confirmed cleared (done: true). Update rather than duplicate. These notes are shared across the project's chats.",
      alwaysLoad: true,
      shape: {
        id: z.string().describe("The note's id, as the list shows it"),
        text: z.string().optional(),
        url: z.string().optional(),
        done: z.boolean().optional(),
      },
      handler: async (args, meta) => {
        const projectId = projectOf(meta);
        const { id, ...fields } = args as { id: string; text?: string; url?: string; done?: boolean };
        const list = await notes.update(projectId, String(id), fields, "claude");
        return noted(projectId, list, `Updated note ${id}. The notes now:`);
      },
    },
    {
      name: "jig_notes_remove",
      description: "Remove obsolete project knowledge by id from the shared project notes.",
      alwaysLoad: true,
      shape: { id: z.string().describe("The note's id") },
      handler: async (args, meta) => {
        const projectId = projectOf(meta);
        const list = await notes.remove(projectId, String(args.id));
        return noted(projectId, list, `Removed note ${args.id}. The notes now:`);
      },
    },
    {
      name: "jig_knowledge_read",
      description:
        "Read a knowledge document of this chat's Jig project by its name (the list is in Jig's context). Page with offset until nextOffset is null.",
      readOnly: true,
      shape: {
        name: z.string(),
        offset: z.number().int().min(0).optional(),
      },
      handler: async (args, meta) => {
        if (!meta.projectId) throw new JigError("not_found", "This chat isn't in a project");
        const docs = await store.list(meta.projectId);
        const wanted = String(args.name).trim().toLowerCase();
        const doc = docs.find((d) => d.name.toLowerCase() === wanted) ?? docs.find((d) => d.id === args.name);
        if (!doc)
          throw new JigError(
            "not_found",
            `No document named ${JSON.stringify(args.name)}. The project has: ${docs.map((d) => d.name).join(", ") || "none"}`,
          );
        const { text } = await store.read(meta.projectId, doc.id);
        const offset = Number(args.offset ?? 0);
        const part = text.slice(offset, offset + 40_000);
        return JSON.stringify({
          name: doc.name,
          text: part,
          nextOffset: offset + part.length < text.length ? offset + part.length : null,
        });
      },
    },
  ]);
}

/** Forgets a removed project's knowledge. */
export function removeProjectKnowledge(projectId: string): Promise<void> {
  return store.removeProject(projectId);
}
