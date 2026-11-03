import type { AddonHostApi } from "@jig/sdk";
import {
  areaClause,
  type Board,
  type BoardData,
  boardQuery,
  columnField,
  defaultArea,
  type FoundBoard,
  findBoard,
  itemLine,
  orgName,
  orgUrl,
  stateForColumn,
  teamApi,
  textToHtml,
  toColumns,
  toDetail,
  toWorkItem,
  updateArgs,
  type WorkItem,
  type WorkItemDetail,
  type WorkItemPatch,
} from "./lib/boards";

export type { Board, BoardData, FoundBoard, WorkItem, WorkItemDetail, WorkItemPatch };

/**
 * Azure DevOps team boards through the user's `az` CLI (az login + the azure-devops extension), like
 * the Pipelines add-on. Jig stores no tokens (D-018); the boards a project follows are in its storage.
 */
const DEVOPS = "499b84ac-1321-427f-aa17-267ca6975798";
const HOUR = 60 * 60_000;
const PARALLEL = 4;

async function az<T>(api: AddonHostApi, args: string[], timeoutMs = 60_000): Promise<T> {
  const r = await api.exec("az", [...args, "-o", "json", "--only-show-errors"], {
    timeoutMs,
    env: { AZURE_CORE_NO_COLOR: "1", PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
  });
  if (r.code === 127) throw new Error("The Azure CLI (az) is not installed or not on PATH.");
  if (r.code !== 0) {
    const err = r.stderr.trim();
    if (/az login/i.test(err))
      throw new Error("You're not signed in to the Azure CLI. Run `az login` in a terminal.");
    if (/extension.*azure-devops|is misspelled or not recognized/i.test(err))
      throw new Error("The azure-devops extension is missing. Run `az extension add --name azure-devops`.");
    throw new Error(err.split("\n").slice(-4).join("\n") || `az ${args.slice(0, 2).join(" ")} failed`);
  }
  return (r.stdout.trim() ? JSON.parse(r.stdout) : undefined) as T;
}

/** `az rest` GET on Azure DevOps with your az login. */
function rest<T>(api: AddonHostApi, uri: string, params: string[] = [], version = "7.1"): Promise<T> {
  return az<T>(api, [
    "rest",
    "--method",
    "get",
    "--resource",
    DEVOPS,
    "--uri",
    uri,
    "--uri-parameters",
    `api-version=${version}`,
    ...params,
  ]);
}

/** Remembers an answer for a while (in this process only); a failed answer is asked again. */
function remembered<T>(ms: number) {
  const values = new Map<string, { at: number; value: Promise<T> }>();
  return (key: string, load: () => Promise<T>): Promise<T> => {
    const hit = values.get(key);
    if (hit && Date.now() - hit.at < ms) return hit.value;
    const value = load();
    values.set(key, { at: Date.now(), value });
    value.catch(() => values.delete(key));
    return value;
  };
}
const orgsCache = remembered<string[]>(HOUR);
const projectsCache = remembered<string[]>(HOUR);
const boardsCache = remembered<FoundBoard[]>(HOUR);

async function inBatches<T, R>(list: T[], size: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < list.length; i += size)
    out.push(...(await Promise.all(list.slice(i, i + size).map(run))));
  return out;
}

/** The organisations your az login belongs to (names, sorted). */
export async function orgs(_: unknown, api: AddonHostApi): Promise<string[]> {
  return orgsCache("me", async () => {
    const me = await rest<{ id?: string }>(
      api,
      "https://app.vssps.visualstudio.com/_apis/profile/profiles/me",
    );
    if (!me?.id) return [];
    const accounts = await rest<{ value?: Array<{ accountName: string }> }>(
      api,
      "https://app.vssps.visualstudio.com/_apis/accounts",
      [`memberId=${me.id}`],
    );
    return (accounts?.value ?? []).map((a) => orgName(a.accountName)).sort((a, b) => a.localeCompare(b));
  });
}

/** An organisation's projects (sorted). */
export async function projects({ org }: { org: string }, api: AddonHostApi): Promise<string[]> {
  return projectsCache(org.toLowerCase(), async () => {
    const r = await az<{ value?: Array<{ name: string }> }>(api, [
      "devops",
      "project",
      "list",
      "--org",
      orgUrl(org),
    ]);
    return (r?.value ?? []).map((p) => p.name).sort((a, b) => a.localeCompare(b));
  });
}

/** Every team board of a project: each team's boards (Stories, Features…), teams sorted by name. */
export async function boards(
  { org, project, force }: { org: string; project: string; force?: boolean },
  api: AddonHostApi,
): Promise<FoundBoard[]> {
  const key = `${org}/${project}`.toLowerCase();
  const load = async () => {
    const teams = await az<Array<{ name?: string }>>(api, [
      "devops",
      "team",
      "list",
      "--org",
      orgUrl(org),
      "--project",
      project,
      "--top",
      "500",
    ]);
    const names = (teams ?? [])
      .map((t) => t.name)
      .filter((n): n is string => !!n)
      .sort((a, b) => a.localeCompare(b));
    const perTeam = await inBatches(names, PARALLEL, async (team) => {
      const r = await rest<{ value?: Array<{ id: string; name: string }> }>(
        api,
        `${teamApi({ org, project, team })}/boards`,
      ).catch(() => undefined);
      return (r?.value ?? []).map((b) => ({ team, boardId: b.id, boardName: b.name }));
    });
    return perTeam.flat();
  };
  return force ? load() : boardsCache(key, load);
}

/** A board as Azure DevOps shows it: its columns, and its cards with the column each is in. */
export async function board({ board: b }: { board: Board }, api: AddonHostApi): Promise<BoardData> {
  const base = teamApi(b);
  const [raw, areas] = await Promise.all([
    rest<unknown>(api, `${base}/boards/${encodeURIComponent(b.boardId)}`),
    rest<unknown>(api, `${base}/teamsettings/teamfieldvalues`).catch(() => undefined),
  ]);
  const columns = toColumns(raw);
  const field = columnField(raw);
  const rows = await az<unknown[]>(api, [
    "boards",
    "query",
    "--wiql",
    boardQuery(columns, areaClause(areas), field),
    "--org",
    orgUrl(b.org),
    "--project",
    b.project,
  ]);
  const items = (Array.isArray(rows) ? rows : [])
    .map((r) => toWorkItem(r, b, field))
    .filter((i): i is WorkItem => !!i);
  const area = defaultArea(areas);
  return { columns, items, ...(field ? { columnField: field } : {}), ...(area ? { area } : {}) };
}

// ── Managing cards (D-262): the UI and Claude's tools use the same functions ────────────────────────

const projectUrl = (b: Board) => `${orgUrl(b.org)}/${encodeURIComponent(b.project)}`;

/** A card with its description, tags, comments and the states its type can be in. */
export async function item(
  { board: b, id, columnField: field }: { board: Board; id: number; columnField?: string },
  api: AddonHostApi,
): Promise<WorkItemDetail> {
  const raw = await az<{ fields?: Record<string, unknown> }>(api, [
    "boards",
    "work-item",
    "show",
    "--id",
    String(id),
    "--expand",
    "all",
    "--org",
    orgUrl(b.org),
  ]);
  const type = String(raw?.fields?.["System.WorkItemType"] ?? "");
  const [comments, states] = await Promise.all([
    rest<unknown>(api, `${projectUrl(b)}/_apis/wit/workItems/${id}/comments`, [], "7.1-preview.4").catch(
      () => undefined,
    ),
    type
      ? rest<unknown>(
          api,
          `${projectUrl(b)}/_apis/wit/workitemtypes/${encodeURIComponent(type)}/states`,
        ).catch(() => undefined)
      : undefined,
  ]);
  const detail = toDetail(raw, b, { comments, states, columnField: field });
  if (!detail) throw new Error(`Work item #${id} wasn't found.`);
  return detail;
}

/** Changes a card: fields, state, column (with the column's state for its type), a comment. */
export async function update(
  { board: b, id, patch }: { board: Board; id: number; patch: WorkItemPatch },
  api: AddonHostApi,
): Promise<void> {
  let field: string | undefined;
  let columnState: string | undefined;
  let next = patch;
  if (patch.column) {
    const data = await board({ board: b }, api);
    const wanted = patch.column.toLowerCase();
    const column = data.columns.find((c) => c.name.toLowerCase() === wanted);
    if (!column)
      throw new Error(
        `The board has no column "${patch.column}". Columns: ${data.columns.map((c) => c.name).join(", ")}`,
      );
    const type = data.items.find((i) => i.id === id)?.type;
    field = data.columnField;
    columnState = type ? stateForColumn(column, type) : undefined;
    next = { ...patch, column: column.name };
  }
  const args = updateArgs(next, field, columnState);
  if (!args.length) return;
  await az(api, ["boards", "work-item", "update", "--id", String(id), "--org", orgUrl(b.org), ...args]);
  api.emit("changed", { boardId: b.id });
}

export interface NewCard {
  board: Board;
  type: string;
  title: string;
  description?: string;
  column?: string;
  assignedTo?: string;
  parentId?: number;
}

/** A new card on the board (in the team's area, so it shows there), optionally in a column. */
export async function create(input: NewCard, api: AddonHostApi): Promise<WorkItem> {
  const b = input.board;
  if (!input.title.trim()) throw new Error("A card needs a title.");
  const data = await board({ board: b }, api);
  const created = await az<unknown>(api, [
    "boards",
    "work-item",
    "create",
    "--type",
    input.type,
    "--title",
    input.title.trim(),
    "--org",
    orgUrl(b.org),
    "--project",
    b.project,
    ...(data.area ? ["--area", data.area] : []),
    ...(input.description?.trim() ? ["--description", textToHtml(input.description)] : []),
    ...(input.assignedTo ? ["--assigned-to", input.assignedTo] : []),
  ]);
  const card = toWorkItem(created, b, data.columnField);
  if (!card) throw new Error("Azure DevOps didn't return the new card.");
  if (input.column) await update({ board: b, id: card.id, patch: { column: input.column } }, api);
  if (input.parentId)
    await az(api, [
      "boards",
      "work-item",
      "relation",
      "add",
      "--id",
      String(card.id),
      "--relation-type",
      "parent",
      "--target-id",
      String(input.parentId),
      "--org",
      orgUrl(b.org),
    ]);
  api.emit("changed", { boardId: b.id });
  return card;
}

/** Moves a card to Azure DevOps' recycle bin (it can be restored there). */
export async function remove(
  { board: b, id }: { board: Board; id: number },
  api: AddonHostApi,
): Promise<void> {
  await az(api, [
    "boards",
    "work-item",
    "delete",
    "--id",
    String(id),
    "--org",
    orgUrl(b.org),
    "--project",
    b.project,
    "--yes",
  ]);
  api.emit("changed", { boardId: b.id });
}

// ── Claude's tools: the boards of the chat's project ────────────────────────────────────────────────

type ChatArgs = { chat?: { projectId?: string }; board?: string };

async function followed(args: ChatArgs, api: AddonHostApi): Promise<Board[]> {
  const projectId = args.chat?.projectId;
  if (!projectId) throw new Error("Boards belong to a Jig project, and this chat isn't in one.");
  return (await api.storage.get<Board[]>("boards", { scope: "project", id: projectId })) ?? [];
}

async function chatBoard(args: ChatArgs, api: AddonHostApi): Promise<Board> {
  const boards = await followed(args, api);
  if (!boards.length)
    throw new Error("This project follows no Azure DevOps boards yet. Add one in Code → Boards (+).");
  const found = findBoard(boards, args.board);
  if (!found)
    throw new Error(
      `No board named ${JSON.stringify(args.board)}. Boards: ${boards.map((b) => b.name).join(", ")}`,
    );
  return found;
}

export async function toolBoards(args: ChatArgs, api: AddonHostApi): Promise<string> {
  const boards = await followed(args, api);
  if (!boards.length) return "This project follows no Azure DevOps boards yet (Code → Boards → +).";
  return boards.map((b) => `- ${b.name} (team ${b.team}, ${b.org}/${b.project})`).join("\n");
}

export async function toolCards(
  args: ChatArgs & { column?: string; query?: string },
  api: AddonHostApi,
): Promise<string> {
  const b = await chatBoard(args, api);
  const data = await board({ board: b }, api);
  const q = args.query?.trim().toLowerCase();
  const out = [`Board ${b.name} (${b.org}/${b.project}, team ${b.team}).`];
  for (const column of data.columns) {
    if (args.column && column.name.toLowerCase() !== args.column.toLowerCase()) continue;
    const cards = data.items.filter(
      (i) =>
        (i.column ? i.column === column.name : column.stateMappings[i.type] === i.state) &&
        (!q || `${i.id} ${i.title} ${i.assignedTo ?? ""}`.toLowerCase().includes(q)),
    );
    out.push(`\n## ${column.name} (${cards.length}${column.itemLimit ? `/${column.itemLimit}` : ""})`);
    out.push(...cards.map((c) => `- ${itemLine(c)}`));
  }
  return out.join("\n");
}

export async function toolShow(args: ChatArgs & { id: number }, api: AddonHostApi): Promise<string> {
  const b = await chatBoard(args, api);
  return JSON.stringify(await item({ board: b, id: Number(args.id) }, api), null, 1);
}

export async function toolUpdate(
  args: ChatArgs & WorkItemPatch & { id: number },
  api: AddonHostApi,
): Promise<string> {
  const b = await chatBoard(args, api);
  const { chat: _chat, board: _board, id, ...patch } = args;
  await update({ board: b, id: Number(id), patch }, api);
  const d = await item({ board: b, id: Number(id) }, api);
  return `Updated: ${itemLine(d)}${d.column ? ` · column ${d.column}` : ""}`;
}

export async function toolCreate(
  args: ChatArgs & Omit<NewCard, "board">,
  api: AddonHostApi,
): Promise<string> {
  const b = await chatBoard(args, api);
  const { chat: _chat, board: _board, ...input } = args;
  const card = await create({ ...input, board: b }, api);
  return `Created ${itemLine(card)} on ${b.name}: ${card.url}`;
}

export async function toolDelete(args: ChatArgs & { id: number }, api: AddonHostApi): Promise<string> {
  const b = await chatBoard(args, api);
  await remove({ board: b, id: Number(args.id) }, api);
  return `Deleted #${args.id}: it's in Azure DevOps' recycle bin, where it can be restored.`;
}
