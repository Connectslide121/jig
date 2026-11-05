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
  /**
   * The Azure tenant it was followed in (D-282): its key (`default` or missing: your own az login) and
   * its label then. Another tenant's sign-in may not see the organisation, so the board shows only
   * while that tenant is active.
   */
  tenant?: string;
  tenantLabel?: string;
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
  /** Who has it, by e-mail / user principal name (`uniqueName`): their picture is found by it. */
  assignedEmail?: string;
  changed?: string;
  /** Its tags (`System.Tags`, "a; b"), iteration and area paths: what the board's filters offer. */
  tags?: string[];
  iteration?: string;
  area?: string;
  url: string;
}

export interface BoardData {
  columns: BoardColumn[];
  items: WorkItem[];
  /** The field that holds a card's column on this board (moving a card sets it). */
  columnField?: string;
  /** The team's default area: new cards go there, so they show on this board. */
  area?: string;
  /** Set instead of columns and cards when the board belongs to another tenant than the active one. */
  elsewhere?: { tenant: string };
}

/** The tenant a followed board belongs to (`default` for boards followed before tenants). */
export const boardTenant = (b: Pick<Board, "tenant">): string => b.tenant || "default";

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

/** The default tab name: the team and the board ("Shop Team · Stories"), as Jon reads them (D-265). */
export function boardTitle(b: Pick<Board, "team" | "boardName">): string {
  return `${b.team} · ${b.boardName}`;
}

/** The tab's name: the one you gave it, else the team and board (old tabs named just "Stories" too). */
export function tabName(b: Pick<Board, "name" | "team" | "boardName">): string {
  return b.name && b.name !== b.boardName ? b.name : boardTitle(b);
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
    "System.Tags",
    "System.IterationPath",
    "System.AreaPath",
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

/** A person field's e-mail / user principal name: `uniqueName`, or the `<…>` of "Name <email>". */
export function personEmail(value: unknown): string | undefined {
  const raw =
    typeof value === "string"
      ? /<([^>]+)>\s*$/.exec(value)?.[1]
      : value && typeof value === "object" && "uniqueName" in value
        ? (value as { uniqueName: unknown }).uniqueName
        : undefined;
  return typeof raw === "string" && raw.includes("@") ? raw.trim() : undefined;
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
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const tags = splitTags(f["System.Tags"]);
  const iteration = text(f["System.IterationPath"]);
  const area = text(f["System.AreaPath"]);
  return {
    id,
    title: String(f["System.Title"] ?? `#${id}`),
    type: String(f["System.WorkItemType"] ?? "Item"),
    state: String(f["System.State"] ?? "New"),
    column: typeof column === "string" && column ? column : undefined,
    assignedTo: person(f["System.AssignedTo"]),
    assignedEmail: personEmail(f["System.AssignedTo"]),
    changed: typeof f["System.ChangedDate"] === "string" ? f["System.ChangedDate"] : undefined,
    ...(tags.length ? { tags } : {}),
    ...(iteration ? { iteration } : {}),
    ...(area ? { area } : {}),
    url: `${orgUrl(b.org)}/${encodeURIComponent(b.project)}/_workitems/edit/${id}`,
  };
}

/** `System.Tags` ("checkout; payments") as a list. */
export function splitTags(value: unknown): string[] {
  return typeof value === "string"
    ? value
        .split(";")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
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

/** A rich-text (HTML) field of a card: Repro steps, System info, a custom HTML field. */
export interface RichField {
  /** The field's reference name (`Microsoft.VSTS.TCM.ReproSteps`). */
  ref: string;
  label: string;
  /** As Azure DevOps keeps it: HTML, images pointing at its attachments. */
  html: string;
  /** The same as plain text, images as `[image: name]` (for Claude). */
  text: string;
}

/** Another field of a card, shown read-only in the side column (Reason, Severity, dates, Custom.*). */
export interface DetailField {
  ref: string;
  label: string;
  value: string;
  /** How to show `value`: an ISO date, a number, or text. */
  kind: "date" | "number" | "text";
}

/** A link from a card to another work item (Parent, Child, Related…) or to a web page (Hyperlink). */
export interface WorkItemLink {
  /** Azure DevOps' relation type (`System.LinkTypes.Related`, `Hyperlink`). */
  rel: string;
  /** How Azure DevOps names it (`Parent`, `Related`, `Tested By`, `Hyperlink`). */
  name: string;
  /** The linked work item's id; missing for a hyperlink. */
  id?: number;
  /** The linked item's REST URL, or the hyperlink's address. */
  url: string;
  comment?: string;
  /** The linked work item's type, title and state (one batch request; missing when it couldn't be read). */
  type?: string;
  title?: string;
  state?: string;
}

/** A file attached to a card (`AttachedFile`). */
export interface Attachment {
  name: string;
  /** Its attachment URL (needs your sign-in: Jig fetches it through az). */
  url: string;
  size?: number;
  comment?: string;
  added?: string;
}

/** Code and builds linked to a card (`ArtifactLink`): a branch, commit, pull request or build. */
export interface DevelopmentLink {
  kind: "branch" | "commit" | "pullRequest" | "build" | "other";
  /** How Azure DevOps names the link (`Branch`, `Fixed in Commit`, `Pull Request`, `Build`). */
  name: string;
  /** The `vstfs:///…` artifact URI. */
  uri: string;
  /** The page in Azure DevOps, when the URI is one Jig knows. */
  webUrl?: string;
  /** Short reference: the branch name, the commit's first 8 characters, the PR or build number. */
  ref: string;
  projectId?: string;
  repoId?: string;
  /** Read best-effort: the repository's name, the PR's title or the commit's message, its status. */
  repo?: string;
  title?: string;
  status?: string;
}

/** A card with everything the detail view and Claude need. */
export interface WorkItemDetail extends WorkItem {
  /** The description as plain text (Azure DevOps keeps HTML; see `htmlToText`). */
  description: string;
  /** The description as Azure DevOps keeps it (HTML, with images). */
  descriptionHtml: string;
  acceptance?: string;
  acceptanceHtml?: string;
  /** Other rich-text fields with a value: Repro steps, System info, custom HTML fields. */
  rich: RichField[];
  /** Rich-text fields this type has that are empty now (the dialog shows them as empty editors). */
  emptyRich: Array<{ ref: string; label: string }>;
  /** Other fields with a value (Reason, Severity, Effort, dates, Custom.*), in a fixed order. */
  fields: DetailField[];
  tags: string[];
  priority?: number;
  storyPoints?: number;
  areaPath?: string;
  iteration?: string;
  createdBy?: string;
  created?: string;
  parentId?: number;
  childIds: number[];
  /** Every link to another work item and every hyperlink, in Azure DevOps' order. */
  links: WorkItemLink[];
  attachments: Attachment[];
  development: DevelopmentLink[];
  comments: Array<{ by: string; at: string; text: string; html: string }>;
  /** The states this type of work item can be in, in order. */
  states: string[];
}

/** What can change on a card; `column` moves it on the board (and sets the column's state). */
export interface WorkItemPatch {
  title?: string;
  /** Plain text; replaces the description (its images and formatting too). */
  description?: string;
  /** HTML; replaces the description as it is (images keep their attachment URLs). */
  descriptionHtml?: string;
  /** Plain text; replaces the acceptance criteria. */
  acceptance?: string;
  acceptanceHtml?: string;
  /** Other rich-text fields by reference name → their new HTML. */
  html?: Record<string, string>;
  state?: string;
  column?: string;
  assignedTo?: string;
  tags?: string[];
  priority?: number;
  storyPoints?: number;
  /** An area path (`Shop\Web`). */
  area?: string;
  /** An iteration path (`Shop\Sprint 4`). */
  iteration?: string;
  /** A comment added to the card's discussion. */
  comment?: string;
}

/** A new card: its type and title, and any of the fields the card's form edits (state and column too). */
export interface NewCard extends Omit<WorkItemPatch, "title" | "comment"> {
  type: string;
  title: string;
  parentId?: number;
}

/** What the form of a work item type has (D-372): its states, rich-text fields and number fields. */
export interface TypeForm {
  states: string[];
  /** Description first, then acceptance criteria and the type's other rich-text fields. */
  rich: Array<{ ref: string; label: string }>;
  priority: boolean;
  storyPoints: boolean;
}

const PRIORITY = "Microsoft.VSTS.Common.Priority";
const STORY_POINTS = "Microsoft.VSTS.Scheduling.StoryPoints";

/** `workitemtypes/{type}/states` → the state names, in order. */
export function parseStates(raw: unknown): string[] {
  return (((raw as { value?: unknown[] })?.value ?? []) as Array<{ name?: string }>)
    .map((s) => s.name)
    .filter((s): s is string => !!s);
}

/**
 * A type's form from its fields (`typeFieldNames`) and states. Fields that couldn't be read (an empty
 * list) leave every field on, as the card dialog shows them.
 */
export function typeForm(names: Record<string, string>, states: unknown): TypeForm {
  const known = Object.keys(names).length > 0;
  return {
    states: parseStates(states),
    rich: [
      { ref: DESCRIPTION, label: "Description" },
      ...(!known || names[ACCEPTANCE] ? [{ ref: ACCEPTANCE, label: "Acceptance criteria" }] : []),
      ...Object.entries(RICH_FIELDS)
        .filter(([ref]) => names[ref])
        .map(([ref, label]) => ({ ref, label })),
    ],
    priority: !known || !!names[PRIORITY],
    storyPoints: !known || !!names[STORY_POINTS],
  };
}

/** The team's areas and iterations, for the card form's pickers, and the iteration a new card gets. */
export interface TeamPaths {
  areas: string[];
  iterations: string[];
  defaultIteration?: string;
}

/**
 * `teamfieldvalues`, `teamsettings` and `teamsettings/iterations` → the team's paths. The backlog
 * iteration (the project's root when its path is empty) comes first; a new card gets the team's
 * default iteration, the current one when that is `@currentIteration`, else the backlog iteration.
 */
export function teamPaths(areasRaw: unknown, settingsRaw: unknown, iterationsRaw: unknown): TeamPaths {
  const a = areasRaw as { defaultValue?: unknown; values?: Array<{ value?: unknown }> } | undefined;
  const areas = [a?.defaultValue, ...(Array.isArray(a?.values) ? a.values.map((v) => v?.value) : [])].filter(
    (v): v is string => typeof v === "string" && !!v,
  );
  type Node = { name?: unknown; path?: unknown; attributes?: { timeFrame?: unknown } } | null | undefined;
  const pathOf = (n: Node) =>
    typeof n?.path === "string" && n.path ? n.path : typeof n?.name === "string" ? n.name : undefined;
  const s = settingsRaw as
    | { backlogIteration?: Node; defaultIteration?: Node; defaultIterationMacro?: unknown }
    | undefined;
  const list = ((iterationsRaw as { value?: unknown })?.value ?? []) as Node[];
  const team = (Array.isArray(list) ? list : []).map(pathOf).filter((p): p is string => !!p);
  const backlog = pathOf(s?.backlogIteration);
  const current = (Array.isArray(list) ? list : []).find((n) => n?.attributes?.timeFrame === "current");
  const defaultIteration =
    pathOf(s?.defaultIteration) ??
    (s?.defaultIterationMacro === "@currentIteration" ? pathOf(current) : undefined) ??
    backlog;
  return {
    areas: [...new Set(areas)],
    iterations: [...new Set([...(backlog ? [backlog] : []), ...team])],
    ...(defaultIteration ? { defaultIteration } : {}),
  };
}

/**
 * The `az boards work-item create` arguments for a new card (no org/project): every field at once.
 * State and column aren't set on create (Azure DevOps starts a card in its first state); `create`
 * moves it there right after. The team's area unless another is picked.
 */
export function createArgs(card: NewCard, teamArea?: string): string[] {
  const { type, title, state: _state, column: _column, parentId: _parent, area, ...fields } = card;
  const assignedTo = fields.assignedTo?.trim();
  return [
    "--type",
    type,
    ...updateArgs({
      ...fields,
      title: title.trim(),
      assignedTo: assignedTo || undefined,
      tags: fields.tags?.some((t) => t.trim()) ? fields.tags : undefined,
    }),
    ...((area ?? teamArea) ? ["--area", (area ?? teamArea) as string] : []),
  ];
}

/** Azure DevOps rich text as plain text: paragraphs and line breaks kept, tags and entities gone. */
export function htmlToText(html: string): string {
  return html
    .replace(/<img\b[^>]*>/gi, (tag) => `[image: ${imageName(tag)}]`)
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
  if (patch.area) args.push("--area", patch.area);
  if (patch.iteration) args.push("--iteration", patch.iteration);
  if (patch.descriptionHtml !== undefined) args.push("--description", patch.descriptionHtml);
  else if (patch.description !== undefined) args.push("--description", textToHtml(patch.description));
  if (patch.comment?.trim()) args.push("--discussion", textToHtml(patch.comment));
  if (patch.acceptanceHtml !== undefined) fields.push(`${ACCEPTANCE}=${patch.acceptanceHtml}`);
  else if (patch.acceptance !== undefined) fields.push(`${ACCEPTANCE}=${textToHtml(patch.acceptance)}`);
  for (const [ref, html] of Object.entries(patch.html ?? {}))
    if (/^[\w.]+$/.test(ref) && ref !== DESCRIPTION && ref !== ACCEPTANCE) fields.push(`${ref}=${html}`);
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
    boards.find((b) => b.name.toLowerCase() === r || tabName(b).toLowerCase() === r) ??
    boards.find((b) => b.boardName.toLowerCase() === r || `${b.team} ${b.boardName}`.toLowerCase() === r)
  );
}

/** `az boards work-item show` (+ comments and the type's states) → the card's details. */
export function toDetail(
  raw: unknown,
  b: Pick<Board, "org" | "project">,
  extra: { comments?: unknown; states?: unknown; columnField?: string; fieldNames?: Record<string, string> },
): WorkItemDetail | undefined {
  const item = toWorkItem(raw, b, extra.columnField);
  if (!item) return undefined;
  const f = (raw as { fields: Record<string, unknown> }).fields;
  const names = extra.fieldNames ?? {};
  const { links, attachments, development } = parseRelations((raw as { relations?: unknown }).relations, b);
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
      html: c.text ?? "",
    }))
    .filter((c) => c.text);
  const states = parseStates(extra.states);
  const html = (k: string) => (typeof f[k] === "string" ? (f[k] as string) : "");
  const num = (k: string) => (typeof f[k] === "number" ? (f[k] as number) : undefined);
  const { rich, empty } = richFields(f, names);
  const acceptanceHtml = html(ACCEPTANCE);
  return {
    ...item,
    description: htmlToText(html(DESCRIPTION)),
    descriptionHtml: html(DESCRIPTION),
    acceptance: htmlToText(acceptanceHtml) || undefined,
    // The type has acceptance criteria (an empty editor) or the card has some.
    ...(acceptanceHtml || names[ACCEPTANCE] ? { acceptanceHtml } : {}),
    rich,
    emptyRich: empty,
    fields: moreFields(f, names),
    tags: splitTags(f["System.Tags"]),
    priority: num("Microsoft.VSTS.Common.Priority"),
    storyPoints: num("Microsoft.VSTS.Scheduling.StoryPoints"),
    areaPath: typeof f["System.AreaPath"] === "string" ? (f["System.AreaPath"] as string) : undefined,
    iteration:
      typeof f["System.IterationPath"] === "string" ? (f["System.IterationPath"] as string) : undefined,
    createdBy: person(f["System.CreatedBy"]),
    created: typeof f["System.CreatedDate"] === "string" ? (f["System.CreatedDate"] as string) : undefined,
    parentId: links.find((l) => l.rel === "System.LinkTypes.Hierarchy-Reverse")?.id,
    childIds: links
      .filter((l) => l.rel === "System.LinkTypes.Hierarchy-Forward")
      .map((l) => l.id)
      .filter((id): id is number => id !== undefined),
    links,
    attachments,
    development,
    comments,
    states: states.length ? states : [item.state],
  };
}

// ── A card's details like Azure DevOps' form (D-342): rich text, fields, links, attachments, code ────

export const DESCRIPTION = "System.Description";
export const ACCEPTANCE = "Microsoft.VSTS.Common.AcceptanceCriteria";

/** Rich-text fields of Azure DevOps' own processes, besides the description and acceptance criteria. */
const RICH_FIELDS: Record<string, string> = {
  "Microsoft.VSTS.TCM.ReproSteps": "Repro steps",
  "Microsoft.VSTS.TCM.SystemInfo": "System info",
  "Microsoft.VSTS.Common.Resolution": "Resolution",
  "Microsoft.VSTS.CMMI.Justification": "Justification",
};

/** The other fields the side column shows when they have a value, in this order (like Azure DevOps' form). */
const MORE_FIELDS: Array<[ref: string, label: string, kind?: DetailField["kind"]]> = [
  ["System.Reason", "Reason"],
  ["Microsoft.VSTS.Common.Severity", "Severity"],
  ["Microsoft.VSTS.Common.ValueArea", "Value area"],
  ["Microsoft.VSTS.Common.Risk", "Risk"],
  ["Microsoft.VSTS.Common.BusinessValue", "Business value", "number"],
  ["Microsoft.VSTS.Common.TimeCriticality", "Time criticality", "number"],
  ["Microsoft.VSTS.Common.Activity", "Activity"],
  ["Microsoft.VSTS.Scheduling.Effort", "Effort", "number"],
  ["Microsoft.VSTS.Scheduling.Size", "Size", "number"],
  ["Microsoft.VSTS.Scheduling.OriginalEstimate", "Original estimate", "number"],
  ["Microsoft.VSTS.Scheduling.RemainingWork", "Remaining work", "number"],
  ["Microsoft.VSTS.Scheduling.CompletedWork", "Completed work", "number"],
  ["Microsoft.VSTS.Scheduling.StartDate", "Start date", "date"],
  ["Microsoft.VSTS.Scheduling.TargetDate", "Target date", "date"],
  ["Microsoft.VSTS.Scheduling.FinishDate", "Finish date", "date"],
  ["Microsoft.VSTS.Scheduling.DueDate", "Due date", "date"],
  ["Microsoft.VSTS.Build.FoundIn", "Found in"],
  ["Microsoft.VSTS.Build.IntegrationBuild", "Integration build"],
  ["Microsoft.VSTS.Common.ResolvedReason", "Resolved reason"],
];

/**
 * A field's label from its reference name, when the type's fields didn't name it:
 * `Custom.CustomerImpact` → "Customer impact", `Custom.Customer_ID` → "Customer ID".
 */
export function fieldLabel(ref: string): string {
  const last = ref.split(".").pop() || ref;
  const words = last
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim()
    .split(/\s+/);
  return words
    .map((w, i) =>
      /^[A-Z0-9]{2,}$/.test(w) ? w : i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w.toLowerCase(),
    )
    .join(" ");
}

/** `workitemtypes/{type}/fields` → reference name → the name this process gives it. */
export function typeFieldNames(raw: unknown): Record<string, string> {
  const list = (raw as { value?: unknown })?.value;
  const out: Record<string, string> = {};
  for (const f of Array.isArray(list) ? list : []) {
    const r = f as { referenceName?: unknown; name?: unknown };
    if (typeof r.referenceName === "string" && typeof r.name === "string") out[r.referenceName] = r.name;
  }
  return out;
}

/** Text that holds HTML markup (a custom rich-text field), not plain words. */
export function looksLikeHtml(v: string): boolean {
  return /<\/?(div|p|br|span|img|ul|ol|li|b|i|u|strong|em|a|h[1-6]|table)\b/i.test(v);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** A field value as text: a person's name, a number, yes/no, a string; undefined when empty. */
function fieldText(v: unknown): string | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v.trim() || undefined;
  return person(v);
}

/** The side column's other fields: the known ones in order, then every Custom.* field that isn't rich text. */
export function moreFields(
  fields: Record<string, unknown>,
  names: Record<string, string> = {},
): DetailField[] {
  const out: DetailField[] = [];
  for (const [ref, label, kind] of MORE_FIELDS) {
    const value = fieldText(fields[ref]);
    if (value === undefined) continue;
    out.push({ ref, label, value, kind: kind ?? (ISO_DATE.test(value) ? "date" : "text") });
  }
  const custom = Object.keys(fields)
    .filter((k) => k.startsWith("Custom."))
    .map((ref) => ({ ref, label: names[ref] ?? fieldLabel(ref) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  for (const { ref, label } of custom) {
    const raw = fields[ref];
    const value = fieldText(raw);
    if (value === undefined || (typeof raw === "string" && looksLikeHtml(raw))) continue;
    out.push({
      ref,
      label,
      value,
      kind: typeof raw === "number" ? "number" : ISO_DATE.test(value) ? "date" : "text",
    });
  }
  return out;
}

/** The rich-text fields besides description and acceptance: those with a value, and the type's empty ones. */
export function richFields(
  fields: Record<string, unknown>,
  names: Record<string, string> = {},
): { rich: RichField[]; empty: Array<{ ref: string; label: string }> } {
  const rich: RichField[] = [];
  const empty: Array<{ ref: string; label: string }> = [];
  for (const [ref, label] of Object.entries(RICH_FIELDS)) {
    const v = fields[ref];
    if (typeof v === "string" && v.trim()) rich.push({ ref, label, html: v, text: htmlToText(v) });
    else if (names[ref]) empty.push({ ref, label });
  }
  for (const ref of Object.keys(fields).filter((k) => k.startsWith("Custom."))) {
    const v = fields[ref];
    if (typeof v === "string" && looksLikeHtml(v))
      rich.push({ ref, label: names[ref] ?? fieldLabel(ref), html: v, text: htmlToText(v) });
  }
  return { rich, empty };
}

const ATTACHMENT =
  /^https:\/\/(?:dev\.azure\.com\/([^/?#]+)|([^./?#]+)\.visualstudio\.com)\/(?:[^/?#]+\/)?_apis\/wit\/attachments\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?=[?#]|$)/i;

/**
 * The attachment id in an Azure DevOps attachment URL of organisation `org`; undefined for any other
 * URL, so the host only ever downloads that organisation's attachments.
 */
export function attachmentId(url: string, org: string): string | undefined {
  const m = ATTACHMENT.exec(url.trim());
  if (!m) return undefined;
  let from = m[1] ?? m[2] ?? "";
  try {
    from = decodeURIComponent(from);
  } catch {
    return undefined;
  }
  return from.toLowerCase() === org.toLowerCase() ? m[3]?.toLowerCase() : undefined;
}

/** An attachment URL's file name (`?fileName=shot.png`), else its last segment. */
export function attachmentName(url: string): string {
  const named = /[?&]fileName=([^&#]+)/i.exec(url)?.[1];
  if (named) {
    try {
      return decodeURIComponent(named.replace(/\+/g, " "));
    } catch {
      return named;
    }
  }
  return url.split(/[?#]/)[0]?.split("/").pop() || "attachment";
}

/** An `<img>` tag's name for plain text: its attachment's file name, else its alt text, else "image". */
function imageName(tag: string): string {
  const src = /\ssrc\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? "";
  const alt = /\salt\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1]?.trim();
  if (src && !/^data:/i.test(src)) return attachmentName(src.replace(/&amp;/g, "&"));
  return alt || "image";
}

/** An attachment in the browser, as a download (Azure DevOps' own sign-in there). */
export function downloadUrl(a: Pick<Attachment, "url" | "name">): string {
  const named = /[?&]fileName=/i.test(a.url)
    ? a.url
    : `${a.url}${a.url.includes("?") ? "&" : "?"}fileName=${encodeURIComponent(a.name)}`;
  return `${named}&download=true`;
}

/** An image's type from its first bytes (base64), else an SVG by its name; undefined when it isn't an image. */
export function sniffImageMime(base64: string, name = ""): string | undefined {
  if (base64.startsWith("iVBORw0KGgo")) return "image/png";
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("R0lGOD")) return "image/gif";
  if (base64.startsWith("UklGR")) return "image/webp";
  if (base64.startsWith("Qk")) return "image/bmp";
  if (/\.svg$/i.test(name)) return "image/svg+xml";
  return undefined;
}

/**
 * An `ArtifactLink` (`vstfs:///Git/Commit/…`, `/Git/PullRequestId/…`, `/Git/Ref/…GB{branch}`,
 * `/Build/Build/{id}`) as a development link with its page in Azure DevOps.
 */
export function parseArtifact(uri: string, name: string, b: Pick<Board, "org" | "project">): DevelopmentLink {
  const base = orgUrl(b.org);
  const other: DevelopmentLink = { kind: "other", name, uri, ref: uri.split("/").pop() || uri };
  const m = /^vstfs:\/\/\/([^/]+)\/([^/]+)\/(.+)$/i.exec(uri.trim());
  if (!m) return other;
  const tool = (m[1] ?? "").toLowerCase();
  const type = (m[2] ?? "").toLowerCase();
  let id: string;
  try {
    id = decodeURIComponent(m[3] ?? "");
  } catch {
    return other;
  }
  if (tool === "build" && type === "build")
    return {
      kind: "build",
      name,
      uri,
      ref: id,
      webUrl: `${base}/${encodeURIComponent(b.project)}/_build/results?buildId=${encodeURIComponent(id)}`,
    };
  const parts = id.split("/");
  if (tool !== "git" || parts.length < 3) return other;
  const [projectId = "", repoId = ""] = parts;
  const rest = parts.slice(2).join("/");
  const repoUrl = `${base}/${encodeURIComponent(projectId)}/_git/${encodeURIComponent(repoId)}`;
  const where = { projectId, repoId };
  if (type === "commit")
    return {
      kind: "commit",
      name,
      uri,
      ref: rest.slice(0, 8),
      webUrl: `${repoUrl}/commit/${rest}`,
      ...where,
    };
  if (type === "pullrequestid")
    return { kind: "pullRequest", name, uri, ref: rest, webUrl: `${repoUrl}/pullrequest/${rest}`, ...where };
  if (type === "ref") {
    // Some links encode the branch's slashes twice (`GBfeature%252Fx`).
    let branch = rest.replace(/^GB/, "");
    try {
      if (/%[0-9a-f]{2}/i.test(branch)) branch = decodeURIComponent(branch);
    } catch {
      // Keep it as it is.
    }
    const webUrl = `${repoUrl}?version=GB${encodeURIComponent(branch)}`;
    return { kind: "branch", name, uri, ref: branch, webUrl, ...where };
  }
  return other;
}

type RawRelation = { rel?: string; url?: string; attributes?: Record<string, unknown> };

/** A card's relations as its links (work items and hyperlinks), attachments and development links. */
export function parseRelations(
  raw: unknown,
  b: Pick<Board, "org" | "project">,
): { links: WorkItemLink[]; attachments: Attachment[]; development: DevelopmentLink[] } {
  const links: WorkItemLink[] = [];
  const attachments: Attachment[] = [];
  const development: DevelopmentLink[] = [];
  for (const r of (Array.isArray(raw) ? raw : []) as RawRelation[]) {
    if (!r?.rel || typeof r.url !== "string") continue;
    const a = r.attributes ?? {};
    const name = typeof a.name === "string" && a.name ? a.name : r.rel;
    const comment = typeof a.comment === "string" && a.comment.trim() ? a.comment.trim() : undefined;
    if (r.rel === "AttachedFile") {
      attachments.push({
        name: typeof a.name === "string" && a.name ? a.name : attachmentName(r.url),
        url: r.url,
        ...(typeof a.resourceSize === "number" ? { size: a.resourceSize } : {}),
        ...(comment ? { comment } : {}),
        ...(typeof a.authorizedDate === "string" ? { added: a.authorizedDate } : {}),
      });
    } else if (r.rel === "ArtifactLink") {
      development.push(parseArtifact(r.url, name, b));
    } else if (r.rel === "Hyperlink") {
      links.push({ rel: r.rel, name: "Hyperlink", url: r.url, ...(comment ? { comment } : {}) });
    } else {
      const id = Number(/\/workItems\/(\d+)$/i.exec(r.url)?.[1]);
      if (Number.isFinite(id))
        links.push({ rel: r.rel, name, id, url: r.url, ...(comment ? { comment } : {}) });
    }
  }
  return { links, attachments, development };
}

/** The work item ids a card links to (each once, at most 200: one batch request). */
export function linkedIds(links: WorkItemLink[]): number[] {
  return [...new Set(links.map((l) => l.id).filter((id): id is number => id !== undefined))].slice(0, 200);
}

/** `_apis/wit/workitems?ids=…` → each linked work item's type, title and state filled in. */
export function withLinkedItems(links: WorkItemLink[], raw: unknown): WorkItemLink[] {
  const list = (raw as { value?: unknown })?.value;
  const byId = new Map<number, Record<string, unknown>>();
  for (const w of Array.isArray(list) ? list : []) {
    const r = w as { id?: unknown; fields?: Record<string, unknown> } | null;
    if (r && typeof r.id === "number" && r.fields) byId.set(r.id, r.fields);
  }
  return links.map((l) => {
    const f = l.id !== undefined ? byId.get(l.id) : undefined;
    if (!f) return l;
    return {
      ...l,
      type: String(f["System.WorkItemType"] ?? ""),
      title: String(f["System.Title"] ?? ""),
      state: String(f["System.State"] ?? ""),
    };
  });
}

/** Links grouped by their name: Parent, Child, then the others as they come, Hyperlinks last. */
export function groupLinks(links: WorkItemLink[]): Array<{ name: string; links: WorkItemLink[] }> {
  const groups = new Map<string, WorkItemLink[]>();
  for (const l of links) groups.set(l.name, [...(groups.get(l.name) ?? []), l]);
  const order = (n: string) => (n === "Parent" ? 0 : n === "Child" ? 1 : n === "Hyperlink" ? 3 : 2);
  return [...groups]
    .map(([name, list]) => ({ name, links: list }))
    .sort((a, b) => order(a.name) - order(b.name));
}

/** A pull request's title, status and repository (`_apis/git/pullrequests/{id}`). */
export function pullRequestInfo(raw: unknown): Pick<DevelopmentLink, "title" | "status" | "repo"> {
  const r = raw as { title?: unknown; status?: unknown; isDraft?: unknown; repository?: { name?: unknown } };
  const status =
    typeof r?.status === "string"
      ? r.isDraft === true && r.status === "active"
        ? "draft"
        : r.status
      : undefined;
  return {
    ...(typeof r?.title === "string" ? { title: r.title } : {}),
    ...(status ? { status } : {}),
    ...(typeof r?.repository?.name === "string" ? { repo: r.repository.name } : {}),
  };
}

/** A commit's first message line and repository (`repositories/{repo}/commits/{sha}`). */
export function commitInfo(raw: unknown): Pick<DevelopmentLink, "title" | "repo"> {
  const r = raw as { comment?: unknown; remoteUrl?: unknown };
  const title = typeof r?.comment === "string" ? r.comment.split(/\r?\n/)[0]?.trim() : undefined;
  const repo = typeof r?.remoteUrl === "string" ? /\/_git\/([^/?#]+)/.exec(r.remoteUrl)?.[1] : undefined;
  return { ...(title ? { title } : {}), ...(repo ? { repo: decodeURIComponent(repo) } : {}) };
}

/** A build's pipeline and number, and its result (`_apis/build/builds/{id}`). */
export function buildInfo(raw: unknown): Pick<DevelopmentLink, "title" | "status"> {
  const r = raw as {
    buildNumber?: unknown;
    definition?: { name?: unknown };
    status?: unknown;
    result?: unknown;
  };
  const title = [r?.definition?.name, r?.buildNumber].filter((s) => typeof s === "string" && s).join(" ");
  const status =
    typeof r?.result === "string" && r.result !== "none"
      ? r.result
      : typeof r?.status === "string"
        ? r.status
        : undefined;
  return { ...(title ? { title } : {}), ...(status ? { status } : {}) };
}

/**
 * The card for Claude's `card` tool: plain text everywhere (images as `[image: name]`), the HTML of
 * the description and acceptance criteria only when they hold images (so an edit can keep them).
 */
export function toolDetail(d: WorkItemDetail): Record<string, unknown> {
  const { descriptionHtml, acceptanceHtml, rich, emptyRich: _empty, comments, ...rest } = d;
  const hasImage = (h?: string) => !!h && /<img\b/i.test(h);
  return {
    ...rest,
    ...(hasImage(descriptionHtml) ? { descriptionHtml } : {}),
    ...(hasImage(acceptanceHtml) ? { acceptanceHtml } : {}),
    ...(rich.length ? { richFields: rich.map((r) => ({ field: r.ref, label: r.label, text: r.text })) } : {}),
    comments: comments.map(({ html: _html, ...c }) => c),
  };
}

/** A card as one line for Claude: `#101 Bug "Checkout fails" · Active · Ann Demo`. */
export function itemLine(item: WorkItem): string {
  return `#${item.id} ${item.type} ${JSON.stringify(item.title)} · ${item.state}${item.assignedTo ? ` · ${item.assignedTo}` : " · unassigned"}`;
}
