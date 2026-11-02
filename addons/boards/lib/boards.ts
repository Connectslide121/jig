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
): string {
  const types = [...new Set(columns.flatMap((c) => Object.keys(c.stateMappings)))];
  const done = [
    ...new Set(
      columns.filter((c) => c.columnType === "outgoing").flatMap((c) => Object.values(c.stateMappings)),
    ),
  ];
  const where = ["[System.TeamProject] = @project", "[System.State] <> 'Removed'"];
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
