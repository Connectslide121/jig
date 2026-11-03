/** Azure DevOps team boards a project follows, their columns and cards (pure: no az, no I/O). */

/** One board a project follows: a team's board for one backlog level (Stories, Features, Epics…). */
export interface Board {
  id: string;
  /** The tab's name (the team and board by default). */
  name: string;
  /** Organisation name (`contoso`, from dev.azure.com/contoso). */
  org: string;
  /** Azure DevOps project. */
  project: string;
  team: string;
  /** The board's id in Azure DevOps and its name ("Stories"). */
  boardId: string;
  boardName: string;
}

/** A board found in Azure DevOps, for the Add boards dialog. */
export interface FoundBoard {
  team: string;
  boardId: string;
  boardName: string;
}

export interface BoardColumn {
  id: string;
  name: string;
  /** incoming (the first), inProgress, outgoing (the last, done). */
  columnType: string;
  /** WIP limit; 0 = none. */
  itemLimit: number;
  /** Work item type → its state in this column. */
  stateMappings: Record<string, string>;
}

export interface WorkItem {
  id: number;
  title: string;
  type: string;
  state: string;
  /** The board column it's in, when Azure DevOps said. */
  column?: string;
  assignedTo?: string;
  changed?: string;
  url: string;
}

export interface BoardData {
  columns: BoardColumn[];
  items: WorkItem[];
  /** The field that holds a card's column on this board (moving a card sets it). */
  columnField?: string;
  /** The team's default area: new cards go there, so they show on this board. */
  area?: string;
}

/** The organisation's URL for `--org`. */
export function orgUrl(org: string): string {
  return `https://dev.azure.com/${encodeURIComponent(org)}`;
}

/** The organisation's name from its URL (`https://dev.azure.com/contoso` → `contoso`). */
export function orgName(url: string): string {
  const s = url.trim().replace(/\/+$/, "");
  const dev = /^https?:\/\/dev\.azure\.com\/([^/]+)/i.exec(s);
  if (dev?.[1]) return decodeURIComponent(dev[1]);
  const vs = /^https?:\/\/([^./]+)\.visualstudio\.com/i.exec(s);
  return vs?.[1] ?? s;
}

/** A team's REST base: `https://dev.azure.com/contoso/Shop/Shop%20Team/_apis/work`. */
export function teamApi(b: Pick<Board, "org" | "project" | "team">): string {
  return `${orgUrl(b.org)}/${encodeURIComponent(b.project)}/${encodeURIComponent(b.team)}/_apis/work`;
}

/** A board in the browser. */
export function boardUrl(b: Pick<Board, "org" | "project" | "team" | "boardName">): string {
  return `${orgUrl(b.org)}/${encodeURIComponent(b.project)}/_boards/board/t/${encodeURIComponent(b.team)}/${encodeURIComponent(b.boardName)}`;
}

/** The default tab name: the board's name, with the team when a project follows several teams. */
export function boardTitle(b: Pick<Board, "team" | "boardName">, teams: number): string {
  return teams > 1 ? `${b.team} · ${b.boardName}` : b.boardName;
}

/** `GET …/work/boards/{id}` → its columns, in order. */
export function toColumns(raw: unknown): BoardColumn[] {
  const cols = (raw as { columns?: unknown })?.columns;
  if (!Array.isArray(cols)) return [];
  return cols
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object" && typeof c.name === "string")
    .map((c) => ({
      id: String(c.id ?? c.name),
      name: String(c.name),
      columnType: String(c.columnType ?? "inProgress"),
      itemLimit: Number(c.itemLimit) || 0,
      stateMappings:
        c.stateMappings && typeof c.stateMappings === "object"
          ? (c.stateMappings as Record<string, string>)
          : {},
    }));
}

/** The field that holds a card's column on this team's board (`WEF_…_Kanban.Column`). */
export function columnField(raw: unknown): string | undefined {
  const ref = (raw as { fields?: { columnField?: { referenceName?: unknown } } })?.fields?.columnField
    ?.referenceName;
  return typeof ref === "string" && ref ? ref : undefined;
}

/** WIQL strings are single-quoted; a quote inside is doubled. */
function quote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** `GET …/teamsettings/teamfieldvalues` → the team's area paths as a WIQL condition. */
export function areaClause(raw: unknown): string | undefined {
  const values = (raw as { values?: Array<{ value?: unknown; includeChildren?: unknown }> })?.values;
  const field = (raw as { field?: { referenceName?: unknown } })?.field?.referenceName;
  const name = typeof field === "string" && field ? field : "System.AreaPath";
  const parts = (Array.isArray(values) ? values : [])
    .filter((v) => typeof v?.value === "string" && v.value)
    .map((v) => `[${name}] ${v.includeChildren ? "UNDER" : "="} ${quote(String(v.value))}`);
  return parts.length ? `(${parts.join(" OR ")})` : undefined;
}

/**
 * The WIQL query for a board's cards: its work item types in the team's areas; the last column (done)
 * only for what changed in the last 30 days, as Azure DevOps keeps old ones off the board, too.
 */
export function boardQuery(
  columns: BoardColumn[],
  area: string | undefined,
  field: string | undefined,
  project?: string,
): string {
  const types = [...new Set(columns.flatMap((c) => Object.keys(c.stateMappings)))];
  const done = [
    ...new Set(
      columns.filter((c) => c.columnType === "outgoing").flatMap((c) => Object.values(c.stateMappings)),
    ),
  ];
  // The project by name: `az boards query --project "Name with spaces"` returns nothing for @project.
  const where = [
    project ? `[System.TeamProject] = ${quote(project)}` : "[System.TeamProject] = @project",
    "[System.State] <> 'Removed'",
  ];
  if (types.length) where.push(`[System.WorkItemType] IN (${types.map(quote).join(", ")})`);
  if (area) where.push(area);
  if (done.length)
    where.push(
      `([System.State] NOT IN (${done.map(quote).join(", ")}) OR [System.ChangedDate] >= @today - 30)`,
    );
  const select = [
    "System.Id",
    "System.Title",
    "System.State",
    "System.WorkItemType",
    "System.AssignedTo",
    "System.ChangedDate",
    "System.BoardColumn",
    ...(field ? [field] : []),
  ];
  return `SELECT ${select.map((f) => `[${f}]`).join(", ")} FROM WorkItems WHERE ${where.join(" AND ")} ORDER BY [Microsoft.VSTS.Common.StackRank] ASC, [System.ChangedDate] DESC`;
}

function person(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value.replace(/\s*<[^>]*>$/, "");
  if (typeof value === "object" && "displayName" in value)
    return String((value as { displayName: unknown }).displayName);
  return undefined;
}

/** One row of `az boards query` → a card; undefined for something that isn't a work item. */
export function toWorkItem(
  raw: unknown,
  b: Pick<Board, "org" | "project">,
  field?: string,
): WorkItem | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as { id?: unknown; fields?: Record<string, unknown> };
  const id = Number(r.id ?? r.fields?.["System.Id"]);
  if (!Number.isFinite(id) || !r.fields) return undefined;
  const f = r.fields;
  const column = (field && f[field]) ?? f["System.BoardColumn"];
  return {
    id,
    title: String(f["System.Title"] ?? `#${id}`),
    type: String(f["System.WorkItemType"] ?? "Item"),
    state: String(f["System.State"] ?? "New"),
    column: typeof column === "string" && column ? column : undefined,
    assignedTo: person(f["System.AssignedTo"]),
    changed: typeof f["System.ChangedDate"] === "string" ? f["System.ChangedDate"] : undefined,
    url: `${orgUrl(b.org)}/${encodeURIComponent(b.project)}/_workitems/edit/${id}`,
  };
}

/**
 * The board as columns of cards, in the board's order. A card goes to the column Azure DevOps put it
 * in, else to the first column whose state mapping fits its type and state.
 */
export function placeCards(data: BoardData): Array<{ column: BoardColumn; items: WorkItem[] }> {
  const lanes = data.columns.map((column) => ({ column, items: [] as WorkItem[] }));
  for (const item of data.items) {
    const lane =
      (item.column && lanes.find((l) => l.column.name === item.column)) ||
      lanes.find((l) => l.column.stateMappings[item.type] === item.state);
    lane?.items.push(item);
  }
  return lanes;
}

/** Initials for an assignee chip ("Ann Demo" → "AD"). */
export function initials(name: string): string {
  const words = name.split(/[\s.@_-]+/).filter(Boolean);
  return (
    (words[0]?.[0] ?? "") + (words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "")
  ).toUpperCase();
}

/** The chat draft for "Start a chat about it". */
export function chatDraft(item: WorkItem): string {
  return `Azure DevOps ${item.type} #${item.id}: ${item.title}\n${item.url}\n\n`;
}

// ── Managing cards (D-262): details, edits, moves, new and deleted cards ─────────────────────────────

/** A card with everything the detail view and Claude need. */
export interface WorkItemDetail extends WorkItem {
  /** The description as plain text (Azure DevOps keeps HTML; see `htmlToText`). */
  description: string;
  acceptance?: string;
  tags: string[];
  priority?: number;
  storyPoints?: number;
  areaPath?: string;
  iteration?: string;
  createdBy?: string;
  created?: string;
  parentId?: number;
  childIds: number[];
  comments: Array<{ by: string; at: string; text: string }>;
  /** The states this type of work item can be in, in order. */
  states: string[];
}

/** What can change on a card; `column` moves it on the board (and sets the column's state). */
export interface WorkItemPatch {
  title?: string;
  description?: string;
  state?: string;
  column?: string;
  assignedTo?: string;
  tags?: string[];
  priority?: number;
  storyPoints?: number;
  /** A comment added to the card's discussion. */
  comment?: string;
}

/** Azure DevOps rich text as plain text: paragraphs and line breaks kept, tags and entities gone. */
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Plain text as Azure DevOps rich text: escaped, one paragraph per block, line breaks kept. */
export function textToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .trim()
    .split(/\n{2,}/)
    .map((block) => `<div>${esc(block).replace(/\n/g, "<br>")}</div>`)
    .join("");
}

/** The state a card of `type` gets in `column`, from the board's state mappings. */
export function stateForColumn(column: BoardColumn | undefined, type: string): string | undefined {
  return column?.stateMappings[type];
}

/** The `az boards work-item update` arguments for a patch (no id/org; `columnField` from the board). */
export function updateArgs(patch: WorkItemPatch, columnField?: string, columnState?: string): string[] {
  const args: string[] = [];
  const fields: string[] = [];
  if (patch.title !== undefined) args.push("--title", patch.title);
  const state = patch.state ?? columnState;
  if (state) args.push("--state", state);
  if (patch.assignedTo !== undefined) args.push("--assigned-to", patch.assignedTo);
  if (patch.description !== undefined) args.push("--description", textToHtml(patch.description));
  if (patch.comment?.trim()) args.push("--discussion", textToHtml(patch.comment));
  if (patch.tags)
    fields.push(
      `System.Tags=${patch.tags
        .map((t) => t.trim())
        .filter(Boolean)
        .join("; ")}`,
    );
  if (patch.priority !== undefined) fields.push(`Microsoft.VSTS.Common.Priority=${patch.priority}`);
  if (patch.storyPoints !== undefined)
    fields.push(`Microsoft.VSTS.Scheduling.StoryPoints=${patch.storyPoints}`);
  if (patch.column && columnField) fields.push(`${columnField}=${patch.column}`);
  if (fields.length) args.push("--fields", ...fields);
  return args;
}

/** `teamsettings/teamfieldvalues` → the team's default area path, for new cards. */
export function defaultArea(raw: unknown): string | undefined {
  const v = (raw as { defaultValue?: unknown })?.defaultValue;
  return typeof v === "string" && v ? v : undefined;
}

/** A followed board by its id or name (any case), or the first one. */
export function findBoard(boards: Board[], ref?: string): Board | undefined {
  if (!ref?.trim()) return boards[0];
  const r = ref.trim().toLowerCase();
  return (
    boards.find((b) => b.id === ref) ??
    boards.find((b) => b.name.toLowerCase() === r) ??
    boards.find((b) => b.boardName.toLowerCase() === r || `${b.team} ${b.boardName}`.toLowerCase() === r)
  );
}

/** `az boards work-item show` (+ comments and the type's states) → the card's details. */
export function toDetail(
  raw: unknown,
  b: Pick<Board, "org" | "project">,
  extra: { comments?: unknown; states?: unknown; columnField?: string },
): WorkItemDetail | undefined {
  const item = toWorkItem(raw, b, extra.columnField);
  if (!item) return undefined;
  const f = (raw as { fields: Record<string, unknown> }).fields;
  const relations = ((raw as { relations?: unknown }).relations ?? []) as Array<{
    rel?: string;
    url?: string;
  }>;
  const idOf = (url?: string) => Number(/\/(\d+)$/.exec(url ?? "")?.[1]);
  const comments = (
    ((extra.comments as { comments?: unknown[] })?.comments ?? []) as Array<{
      text?: string;
      createdBy?: { displayName?: string };
      createdDate?: string;
    }>
  )
    .map((c) => ({
      by: c.createdBy?.displayName ?? "",
      at: c.createdDate ?? "",
      text: htmlToText(c.text ?? ""),
    }))
    .filter((c) => c.text);
  const states = (((extra.states as { value?: unknown[] })?.value ?? []) as Array<{ name?: string }>)
    .map((s) => s.name)
    .filter((s): s is string => !!s);
  const text = (k: string) => (typeof f[k] === "string" ? htmlToText(f[k] as string) : "");
  const num = (k: string) => (typeof f[k] === "number" ? (f[k] as number) : undefined);
  return {
    ...item,
    description: text("System.Description"),
    acceptance: text("Microsoft.VSTS.Common.AcceptanceCriteria") || undefined,
    tags:
      typeof f["System.Tags"] === "string"
        ? (f["System.Tags"] as string)
            .split(";")
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
    priority: num("Microsoft.VSTS.Common.Priority"),
    storyPoints: num("Microsoft.VSTS.Scheduling.StoryPoints"),
    areaPath: typeof f["System.AreaPath"] === "string" ? (f["System.AreaPath"] as string) : undefined,
    iteration:
      typeof f["System.IterationPath"] === "string" ? (f["System.IterationPath"] as string) : undefined,
    createdBy: person(f["System.CreatedBy"]),
    created: typeof f["System.CreatedDate"] === "string" ? (f["System.CreatedDate"] as string) : undefined,
    parentId: relations
      .filter((r) => r.rel === "System.LinkTypes.Hierarchy-Reverse")
      .map((r) => idOf(r.url))
      .find(Number.isFinite),
    childIds: relations
      .filter((r) => r.rel === "System.LinkTypes.Hierarchy-Forward")
      .map((r) => idOf(r.url))
      .filter(Number.isFinite),
    comments,
    states: states.length ? states : [item.state],
  };
}

/** A card as one line for Claude: `#101 Bug "Checkout fails" · Active · Ann Demo`. */
export function itemLine(item: WorkItem): string {
  return `#${item.id} ${item.type} ${JSON.stringify(item.title)} · ${item.state}${item.assignedTo ? ` · ${item.assignedTo}` : " · unassigned"}`;
}
