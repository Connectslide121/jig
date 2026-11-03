/**
 * Project knowledge (D-256): documents kept with a Jig project, as text. Every chat in the project
 * is told which there are and reads them with `jig_knowledge_read`.
 */
export interface KnowledgeDoc {
  id: string;
  name: string;
  /** Length of its text, in characters. */
  chars: number;
  addedAt: string;
  /** Where it came from: a file you added, or a claude.ai project you imported. */
  source: "file" | "claude.ai";
}

/** A claude.ai project in a data export, as the import dialog lists it. */
export interface ClaudeExportProject {
  uuid: string;
  name: string;
  description: string;
  instructions: string;
  docs: Array<{ name: string; chars: number }>;
}

export interface ClaudeExportSummary {
  /** Names the parsed export on the host until you import or close the dialog. */
  token: string;
  file: string;
  projects: ClaudeExportProject[];
}

/** One project as read from `projects.json`, with its documents' text. */
export interface ClaudeProject {
  uuid: string;
  name: string;
  description: string;
  instructions: string;
  docs: Array<{ name: string; content: string }>;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * The projects in claude.ai's `projects.json`. Read leniently: the export's shape isn't documented,
 * so known field names are tried and anything else is ignored. Claude's own starter project is skipped.
 */
export function parseClaudeProjects(json: unknown): ClaudeProject[] {
  const list = Array.isArray(json)
    ? json
    : Array.isArray((json as { projects?: unknown })?.projects)
      ? (json as { projects: unknown[] }).projects
      : [];
  const out: ClaudeProject[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    if (p.is_starter_project === true) continue;
    const name = str(p.name).trim();
    if (!name) continue;
    const docs = (Array.isArray(p.docs) ? p.docs : Array.isArray(p.documents) ? p.documents : [])
      .map((d) => {
        const doc = (d ?? {}) as Record<string, unknown>;
        return {
          name: str(doc.filename || doc.file_name || doc.name).trim() || "Document",
          content: str(doc.content || doc.text),
        };
      })
      .filter((d) => d.content.trim());
    out.push({
      uuid: str(p.uuid || p.id) || name,
      name,
      description: str(p.description),
      instructions: str(p.prompt_template || p.instructions || p.custom_instructions),
      docs,
    });
  }
  return out;
}

/** A document name that is safe as a file name and unique among `taken`. */
export function uniqueDocName(name: string, taken: string[]): string {
  const clean =
    [...name]
      .map((c) => (c.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(c) ? " " : c))
      .join("")
      .replace(/ {2,}/g, " ")
      .trim()
      .slice(0, 120) || "Document";
  if (!taken.includes(clean)) return clean;
  const dot = clean.lastIndexOf(".");
  const [base, ext] = dot > 0 ? [clean.slice(0, dot), clean.slice(dot)] : [clean, ""];
  for (let n = 2; ; n++) if (!taken.includes(`${base} (${n})${ext}`)) return `${base} (${n})${ext}`;
}
