import { join } from "node:path";
import type { AddonHostApi } from "@jig/sdk";
import {
  areaClause,
  attachmentId,
  attachmentName,
  type Board,
  type BoardData,
  backlogType,
  boardQuery,
  boardTenant,
  boardTypes,
  buildInfo,
  cardDone,
  columnField,
  commitInfo,
  createArgs,
  type DevelopmentLink,
  defaultArea,
  type FoundBoard,
  findBoard,
  itemLine,
  linkedIds,
  type NewCard,
  orgName,
  orgUrl,
  parseRelations,
  pickIdentity,
  pullRequestInfo,
  sniffImageMime,
  stateForColumn,
  type TeamPaths,
  type TypeForm,
  tabName,
  teamApi,
  teamPaths,
  toColumns,
  toDetail,
  toolDetail,
  toWorkItem,
  typeFieldNames,
  typeForm as typeForm_,
  updateArgs,
  type WorkItem,
  type WorkItemDetail,
  type WorkItemLink,
  type WorkItemPatch,
  withLinkedItems,
} from "./lib/boards";
import {
  type BoardState,
  type CachedBoard,
  cacheKey,
  Flights,
  isFresh,
  isSignInProblem,
  pruneCache,
  readCache,
} from "./lib/cache";

export type {
  Board,
  BoardData,
  BoardState,
  FoundBoard,
  NewCard,
  TeamPaths,
  TypeForm,
  WorkItem,
  WorkItemDetail,
  WorkItemPatch,
};

/**
 * Azure DevOps team boards through the user's `az` CLI (az login + the azure-devops extension), like
 * the Pipelines add-on, with the tenant picked in Jig's top bar (D-282). Jig stores no tokens (D-018);
 * the boards a project follows are in its storage, each with the tenant it was followed in.
 */
const DEVOPS = "499b84ac-1321-427f-aa17-267ca6975798";
const HOUR = 60 * 60_000;
const PARALLEL = 4;

/** Jig's shared `az` (D-284): the active tenant, JSON out, errors that name the tenant. */
const az = <T>(api: AddonHostApi, args: string[], timeoutMs = 60_000): Promise<T> =>
  api.azure.az<T>(args, { timeoutMs });

/** `az rest` on Azure DevOps with your az login (GET unless `method` says otherwise). */
function rest<T>(
  api: AddonHostApi,
  uri: string,
  params: string[] = [],
  version = "7.1",
  method: "get" | "delete" = "get",
): Promise<T> {
  return az<T>(api, [
    "rest",
    "--method",
    method,
    "--resource",
    DEVOPS,
    "--uri",
    uri,
    "--uri-parameters",
    `api-version=${version}`,
    ...params,
  ]);
}

/**
 * Remembers an answer for a while (in this process only), per tenant: another sign-in sees other
 * organisations. A failed answer is asked again.
 */
function remembered<T>(ms: number) {
  const values = new Map<string, { at: number; value: Promise<T> }>();
  return (api: AddonHostApi, k: string, load: () => Promise<T>): Promise<T> => {
    const key = `${api.azure.tenant().key}|${k}`;
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
  return orgsCache(api, "me", async () => {
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
  return projectsCache(api, org.toLowerCase(), async () => {
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
  return force ? load() : boardsCache(api, key, load);
}

/** A board as Azure DevOps shows it now: its columns, and its cards with the column each is in. */
async function fetchBoard(b: Board, api: AddonHostApi): Promise<BoardData> {
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
    boardQuery(columns, areaClause(areas), field, b.project),
    "--org",
    orgUrl(b.org),
  ]);
  const items = (Array.isArray(rows) ? rows : [])
    .map((r) => toWorkItem(r, b, field))
    .filter((i): i is WorkItem => !!i);
  const area = defaultArea(areas);
  return { columns, items, ...(field ? { columnField: field } : {}), ...(area ? { area } : {}) };
}

// ── Stale-while-revalidate (D-302): every followed board's last answer, refreshed in the background ──

/** Claude's tools (and changes) use a board's cached answer while it is younger than this. */
const FRESH_FOR_TOOLS = 60_000;
/** The start-up and tenant-switch refresh skips boards refreshed this recently. */
const WARM_SKIP = 2 * 60_000;
/** Background refreshes at a time (each is three az runs). */
const WARM_PARALLEL = 2;
/** After az said signed out or expired, background refreshes in that tenant wait this long. */
const SIGNED_OUT_WAIT = 5 * 60_000;

/** Tenant + board → its last answer; read once from storage (`cache`, global), so a restart shows it at once. */
let entries: Promise<Record<string, CachedBoard>> | undefined;
const flights = new Flights<CachedBoard>();
/** Tenants az said you're signed out of (or whose sign-in expired), and when. */
const signedOut = new Map<string, number>();
let persistTimer: ReturnType<typeof setTimeout> | undefined;

function cache(api: AddonHostApi): Promise<Record<string, CachedBoard>> {
  entries ??= api.storage
    .get("cache", { scope: "global" })
    .then(readCache)
    .catch(() => ({}));
  return entries;
}

/** Writes the cache to storage a moment after the last change (a batch of refreshes writes once). */
function persist(api: AddonHostApi): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = undefined;
    void cache(api).then((c) =>
      api.storage
        .set("cache", c, { scope: "global" })
        .catch((e: Error) => api.log("Couldn't keep the boards' cache", e.message)),
    );
  }, 1_000);
}

const elsewhere = (b: Board): BoardData => ({
  columns: [],
  items: [],
  elsewhere: { tenant: boardTenant(b) },
});
const inOtherTenant = (b: Board, api: AddonHostApi) => boardTenant(b) !== api.azure.tenant().key;

/** Background refreshes in this tenant wait: az said you're signed out a moment ago. */
function blocked(tenant: string): boolean {
  const at = signedOut.get(tenant);
  if (at !== undefined && Date.now() - at < SIGNED_OUT_WAIT) return true;
  signedOut.delete(tenant);
  return false;
}

/**
 * Fetches a board into the cache, one request per board at a time (`fresh`: an answer that starts
 * after now, e.g. after a change). The view hears `board` events: refreshing, then the data or the error.
 */
function refresh(b: Board, api: AddonHostApi, fresh = false): Promise<CachedBoard> {
  const key = cacheKey(b);
  return flights.run(
    key,
    async () => {
      const tenant = api.azure.tenant().key;
      const at = Date.now();
      api.emit("board", { key, refreshing: true });
      try {
        const data = await fetchBoard(b, api);
        // Switched tenants meanwhile: some of it may come from the other sign-in, so it isn't kept.
        if (api.azure.tenant().key !== tenant)
          throw new Error("The Azure tenant changed while the board loaded.");
        signedOut.delete(tenant);
        const entry = { at, data };
        (await cache(api))[key] = entry;
        persist(api);
        api.emit("board", { key, refreshing: flights.queued(key), ...entry });
        return entry;
      } catch (error) {
        const signIn = isSignInProblem(error);
        if (signIn) signedOut.set(tenant, Date.now());
        api.emit("board", { key, refreshing: flights.queued(key), error: (error as Error).message, signIn });
        throw error;
      }
    },
    fresh,
  );
}

/** A board's data no older than `maxAgeMs`: from the cache, or fetched now. */
async function boardData(b: Board, api: AddonHostApi, maxAgeMs: number): Promise<BoardData> {
  // Another tenant's board: the view shows where it is (and a Switch) instead of an az error.
  if (inOtherTenant(b, api)) return elsewhere(b);
  const hit = (await cache(api))[cacheKey(b)];
  if (hit && isFresh(hit, Date.now(), maxAgeMs)) return hit.data;
  return (await refresh(b, api)).data;
}

/** A board as Azure DevOps shows it now (fetched, and kept in the cache). */
export async function board({ board: b }: { board: Board }, api: AddonHostApi): Promise<BoardData> {
  return boardData(b, api, 0);
}

/** The board's cached answer, at once (nothing when it was never loaded in this tenant). */
export async function cachedBoard({ board: b }: { board: Board }, api: AddonHostApi): Promise<BoardState> {
  if (inOtherTenant(b, api)) return { data: elsewhere(b) };
  const hit = (await cache(api))[cacheKey(b)];
  return hit ? { data: hit.data, at: hit.at } : {};
}

/**
 * Refreshes a board (joining a refresh already running) and answers with the newest data, or with the
 * cached data and why it failed. Opening a board is your own doing, so it asks az even while
 * background refreshes wait for a sign-in.
 */
export async function refreshBoard({ board: b }: { board: Board }, api: AddonHostApi): Promise<BoardState> {
  if (inOtherTenant(b, api)) return { data: elsewhere(b) };
  const known = await cachedBoard({ board: b }, api);
  try {
    const entry = await refresh(b, api);
    return { data: entry.data, at: entry.at };
  } catch (error) {
    return { ...known, error: (error as Error).message, signIn: isSignInProblem(error) };
  }
}

/** Every followed board of every Jig project. */
async function followedEverywhere(api: AddonHostApi): Promise<Board[]> {
  const projects = await api.projects();
  const lists = await Promise.all(
    projects.map((p) =>
      api.storage.get<Board[]>("boards", { scope: "project", id: p.id }).catch(() => undefined),
    ),
  );
  return lists.flatMap((l) => (Array.isArray(l) ? l : []));
}

/**
 * The background refresh (a watcher: a few seconds after Jig starts, then now and then): every
 * followed board of the active tenant that isn't fresh, a few at a time. Boards no project follows
 * any more leave the cache.
 */
export async function refreshAll(_: unknown, api: AddonHostApi): Promise<void> {
  const tenant = api.azure.tenant().key;
  const all = await followedEverywhere(api);
  const c = await cache(api);
  const keep = pruneCache(c, all.map(cacheKey));
  if (Object.keys(keep).length !== Object.keys(c).length) {
    for (const k of Object.keys(c)) if (!(k in keep)) delete c[k];
    persist(api);
  }
  const due = new Map<string, Board>();
  for (const b of all) {
    const key = cacheKey(b);
    if (boardTenant(b) === tenant && !isFresh(c[key], Date.now(), WARM_SKIP) && !flights.has(key))
      due.set(key, b);
  }
  await inBatches([...due.values()], WARM_PARALLEL, async (b) => {
    if (blocked(tenant) || api.azure.tenant().key !== tenant) return;
    await refresh(b, api).catch(() => undefined);
  });
}

/** Another tenant (the `azure.tenant` event): its boards refresh in the background. */
export async function tenantChanged(t: { key: string }, api: AddonHostApi): Promise<void> {
  signedOut.delete(t.key);
  void (async () => {
    // The host hears the new tenant's az environment on its own: wait for it (briefly).
    for (let i = 0; i < 20 && api.azure.tenant().key !== t.key; i++)
      await new Promise((r) => setTimeout(r, 100));
    if (api.azure.tenant().key === t.key) await refreshAll(undefined, api);
  })().catch(() => undefined);
}

/** After a change: the board refreshes (with an answer from after it) and the view hears `changed`. */
function changed(b: Board, api: AddonHostApi): void {
  void refresh(b, api, true).catch(() => undefined);
  api.emit("changed", { boardId: b.id });
}

// ── Managing cards (D-262): the UI and Claude's tools use the same functions ────────────────────────

const projectUrl = (b: Board) => `${orgUrl(b.org)}/${encodeURIComponent(b.project)}`;

const typeFieldsCache = remembered<Record<string, string>>(HOUR);
const repoNames = remembered<string | undefined>(HOUR);

/** The names a work item type gives its fields (labels, and which rich-text fields it has), cached. */
function typeFields(b: Board, type: string, api: AddonHostApi): Promise<Record<string, string>> {
  return typeFieldsCache(api, `${b.org}/${b.project}/${type}`.toLowerCase(), async () =>
    typeFieldNames(
      await rest<unknown>(api, `${projectUrl(b)}/_apis/wit/workitemtypes/${encodeURIComponent(type)}/fields`),
    ),
  ).catch(() => ({}));
}

/** The type, title and state of the work items a card links to: one batch request. */
async function linkedItems(b: Board, links: WorkItemLink[], api: AddonHostApi): Promise<WorkItemLink[]> {
  const ids = linkedIds(links);
  if (!ids.length) return links;
  const raw = await rest<unknown>(api, `${orgUrl(b.org)}/_apis/wit/workitems`, [
    `ids=${ids.join(",")}`,
    "fields=System.Id,System.Title,System.State,System.WorkItemType",
    "errorPolicy=omit",
  ]).catch(() => undefined);
  return withLinkedItems(links, raw);
}

/** At most this many pull requests, commits and builds get their title read (each is one az run). */
const DEVELOPMENT_DETAILS = 8;

/** Best effort: each pull request's title and status, commit's message, build's result, repository's name. */
async function developmentDetails(
  b: Board,
  links: DevelopmentLink[],
  api: AddonHostApi,
): Promise<DevelopmentLink[]> {
  const org = orgUrl(b.org);
  const repoName = (l: DevelopmentLink) =>
    l.projectId && l.repoId
      ? repoNames(api, `${b.org}/${l.repoId}`.toLowerCase(), async () => {
          const r = await rest<{ name?: unknown }>(
            api,
            `${org}/${encodeURIComponent(l.projectId ?? "")}/_apis/git/repositories/${encodeURIComponent(l.repoId ?? "")}`,
          );
          return typeof r?.name === "string" ? r.name : undefined;
        }).catch(() => undefined)
      : Promise.resolve(undefined);
  const one = async (l: DevelopmentLink): Promise<DevelopmentLink> => {
    try {
      if (l.kind === "pullRequest")
        return { ...l, ...pullRequestInfo(await rest(api, `${org}/_apis/git/pullrequests/${l.ref}`)) };
      if (l.kind === "commit" && l.projectId && l.repoId) {
        const sha = l.uri.split("%2F").pop() ?? l.ref;
        return {
          ...l,
          ...commitInfo(
            await rest(
              api,
              `${org}/${encodeURIComponent(l.projectId)}/_apis/git/repositories/${encodeURIComponent(l.repoId)}/commits/${encodeURIComponent(sha)}`,
            ),
          ),
        };
      }
      if (l.kind === "branch") {
        const repo = await repoName(l);
        return repo ? { ...l, repo } : l;
      }
      if (l.kind === "build")
        return {
          ...l,
          ...buildInfo(await rest(api, `${projectUrl(b)}/_apis/build/builds/${encodeURIComponent(l.ref)}`)),
        };
    } catch {
      // Best effort: the link still shows, without its title.
    }
    return l;
  };
  const known = links.slice(0, DEVELOPMENT_DETAILS);
  return [...(await inBatches(known, PARALLEL, one)), ...links.slice(DEVELOPMENT_DETAILS)];
}

/**
 * A card with everything Azure DevOps' form shows: rich text, fields, comments, links (with the
 * linked items' titles), attachments, development links, and the states its type can be in.
 */
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
  const relations = parseRelations((raw as { relations?: unknown } | undefined)?.relations, b);
  const [comments, states, fieldNames, links, development] = await Promise.all([
    rest<unknown>(api, `${projectUrl(b)}/_apis/wit/workItems/${id}/comments`, [], "7.1-preview.4").catch(
      () => undefined,
    ),
    type
      ? rest<unknown>(
          api,
          `${projectUrl(b)}/_apis/wit/workitemtypes/${encodeURIComponent(type)}/states`,
        ).catch(() => undefined)
      : undefined,
    type ? typeFields(b, type, api) : {},
    linkedItems(b, relations.links, api),
    developmentDetails(b, relations.development, api),
  ]);
  const detail = toDetail(raw, b, { comments, states, columnField: field, fieldNames });
  if (!detail) throw new Error(`Work item #${id} wasn't found.`);
  return { ...detail, links, development };
}

/** Attachments bigger than this aren't shown in Jig (they open in the browser). */
const MAX_ATTACHMENT = 20 * 1024 * 1024;
const attachmentFlights = new Map<string, Promise<{ dataUrl: string; bytes: number }>>();

/**
 * An image attached to a card (in its description, a comment or its attachments) as a data URL,
 * downloaded once with your az login (`az rest --output-file`) and kept in the add-on's data folder.
 * Only the board's own organisation's attachment URLs are fetched; Jig never handles the token (D-018).
 */
export async function attachment(
  { board: b, url, name }: { board: Board; url: string; name?: string },
  api: AddonHostApi,
): Promise<{ dataUrl: string; bytes: number }> {
  const guid = attachmentId(url, b.org);
  if (!guid) throw new Error("That isn't an attachment of this board's organisation.");
  const file = join(api.addon.dataDir, `attachment-${guid}`);
  let flight = attachmentFlights.get(guid);
  if (!flight) {
    flight = (async () => {
      if (!(await api.fs.exists(file)))
        await rest(
          api,
          `${orgUrl(b.org)}/_apis/wit/attachments/${guid}`,
          ["--output-file", file],
          "7.1",
          "get",
        );
      const base64 = await api.fs.readFile(file, "base64");
      const bytes = Math.floor((base64.length * 3) / 4);
      if (bytes > MAX_ATTACHMENT) throw new Error("This attachment is too big to show in Jig.");
      const mime = sniffImageMime(base64, name ?? attachmentName(url));
      if (!mime) throw new Error("This attachment isn't an image.");
      return { dataUrl: `data:${mime};base64,${base64}`, bytes };
    })();
    attachmentFlights.set(guid, flight);
    // A failure is asked again next time; a success stays (the file is on disk anyway).
    flight.catch(() => attachmentFlights.delete(guid));
    // Keep memory small: the data URL is read from disk again after a while.
    void flight
      .then(() => setTimeout(() => attachmentFlights.delete(guid), 5 * 60_000))
      .catch(() => undefined);
  }
  return flight;
}

/**
 * Changes a card: fields, state, column (with the column's state for its type), a comment. `type` is
 * the card's type when the board doesn't have it yet (a card just created).
 */
export async function update(
  { board: b, id, patch, type: known }: { board: Board; id: number; patch: WorkItemPatch; type?: string },
  api: AddonHostApi,
): Promise<{ savedAt: number }> {
  let field: string | undefined;
  let columnState: string | undefined;
  let next = patch;
  if (patch.column) {
    const data = await boardData(b, api, FRESH_FOR_TOOLS);
    const wanted = patch.column.toLowerCase();
    const column = data.columns.find((c) => c.name.toLowerCase() === wanted);
    if (!column)
      throw new Error(
        `The board has no column "${patch.column}". Columns: ${data.columns.map((c) => c.name).join(", ")}`,
      );
    const type = known ?? data.items.find((i) => i.id === id)?.type;
    field = data.columnField;
    columnState = type ? stateForColumn(column, type) : undefined;
    next = { ...patch, column: column.name };
  }
  const args = updateArgs(next, field, columnState);
  if (!args.length) return { savedAt: Date.now() };
  await az(api, ["boards", "work-item", "update", "--id", String(id), "--org", orgUrl(b.org), ...args]);
  // Refreshes that start from now on include the change (the view stops showing a moved card as moving).
  const savedAt = Date.now();
  changed(b, api);
  return { savedAt };
}

/** What a work item type's form has: states, rich-text fields, number fields (D-372), cached by `typeFields`. */
export async function typeForm(
  { board: b, type }: { board: Board; type: string },
  api: AddonHostApi,
): Promise<TypeForm> {
  const [names, states] = await Promise.all([
    typeFields(b, type, api),
    rest<unknown>(api, `${projectUrl(b)}/_apis/wit/workitemtypes/${encodeURIComponent(type)}/states`).catch(
      () => undefined,
    ),
  ]);
  return typeForm_(names, states);
}

const pathsCache = remembered<TeamPaths>(HOUR);

/** The team's areas and iterations (for the card form's pickers) and the iteration new cards get. */
export function paths({ board: b }: { board: Board }, api: AddonHostApi): Promise<TeamPaths> {
  const base = `${teamApi(b)}/teamsettings`;
  return pathsCache(api, cacheKey(b), async () => {
    const [areas, settings, iterations] = await Promise.all([
      rest<unknown>(api, `${base}/teamfieldvalues`).catch(() => undefined),
      rest<unknown>(api, base).catch(() => undefined),
      rest<unknown>(api, `${base}/iterations`).catch(() => undefined),
    ]);
    return teamPaths(areas, settings, iterations);
  });
}

/**
 * A new card on the board with every field filled in at once (D-372): one `az boards work-item create`
 * (in the team's area and default iteration unless others are given), then its column and state, then
 * its parent.
 */
export async function create(input: NewCard & { board: Board }, api: AddonHostApi): Promise<WorkItem> {
  const { board: b, ...card } = input;
  if (!card.title?.trim()) throw new Error("A card needs a title.");
  const [data, team] = await Promise.all([
    boardData(b, api, FRESH_FOR_TOOLS),
    card.iteration ? undefined : paths({ board: b }, api).catch(() => undefined),
  ]);
  const iteration = card.iteration || team?.defaultIteration;
  const created = await az<unknown>(api, [
    "boards",
    "work-item",
    "create",
    "--org",
    orgUrl(b.org),
    "--project",
    b.project,
    ...createArgs({ ...card, ...(iteration ? { iteration } : {}) }, data.area),
  ]);
  const made = toWorkItem(created, b, data.columnField);
  if (!made) throw new Error("Azure DevOps didn't return the new card.");
  if (card.column || card.state)
    await update(
      {
        board: b,
        id: made.id,
        type: card.type,
        patch: {
          ...(card.column ? { column: card.column } : {}),
          ...(card.state ? { state: card.state } : {}),
        },
      },
      api,
    );
  if (card.parentId)
    await az(api, [
      "boards",
      "work-item",
      "relation",
      "add",
      "--id",
      String(made.id),
      "--relation-type",
      "parent",
      "--target-id",
      String(card.parentId),
      "--org",
      orgUrl(b.org),
    ]);
  changed(b, api);
  return made;
}

/**
 * Moves a card to Azure DevOps' recycle bin (it can be restored there). Through the REST API: `az
 * boards work-item delete` prints plain text, not JSON.
 */
export async function remove(
  { board: b, id }: { board: Board; id: number },
  api: AddonHostApi,
): Promise<void> {
  await rest(api, `${projectUrl(b)}/_apis/wit/workitems/${id}`, [], "7.1", "delete");
  changed(b, api);
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
      `No board named ${JSON.stringify(args.board)}. Boards: ${boards.map(tabName).join(", ")}`,
    );
  const active = api.azure.tenant();
  if (boardTenant(found) !== active.key)
    throw new Error(
      `${tabName(found)} is in Azure tenant ${found.tenantLabel ?? boardTenant(found)}, but Jig is using ${active.label}. Switch tenants in Jig's top bar (or with jig_azure_switch_tenant, if the user agrees), then try again.`,
    );
  return found;
}

export async function toolBoards(args: ChatArgs, api: AddonHostApi): Promise<string> {
  const boards = await followed(args, api);
  if (!boards.length) return "This project follows no Azure DevOps boards yet (Code → Boards → +).";
  return boards
    .map(
      (b) =>
        `- ${tabName(b)} (team ${b.team}, ${b.org}/${b.project}${b.tenant && b.tenant !== "default" ? `, tenant ${b.tenantLabel ?? b.tenant}` : ""})`,
    )
    .join("\n");
}

export async function toolCards(
  args: ChatArgs & { column?: string; query?: string },
  api: AddonHostApi,
): Promise<string> {
  const b = await chatBoard(args, api);
  // From the cache while it's under a minute old (the view and the background keep it), else fetched.
  const data = await boardData(b, api, FRESH_FOR_TOOLS);
  const q = args.query?.trim().toLowerCase();
  const out = [`Board ${tabName(b)} (${b.org}/${b.project}, team ${b.team}).`];
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
  return JSON.stringify(toolDetail(await item({ board: b, id: Number(args.id) }, api)), null, 1);
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

export async function toolCreate(args: ChatArgs & NewCard, api: AddonHostApi): Promise<string> {
  const b = await chatBoard(args, api);
  const { chat: _chat, board: _board, ...input } = args;
  const card = await create({ ...input, board: b }, api);
  return `Created ${itemLine(card)} on ${tabName(b)}: ${card.url}`;
}

export async function toolDelete(args: ChatArgs & { id: number }, api: AddonHostApi): Promise<string> {
  const b = await chatBoard(args, api);
  await remove({ board: b, id: Number(args.id) }, api);
  return `Deleted #${args.id}: it's in Azure DevOps' recycle bin, where it can be restored.`;
}

// ── Shared with Jig (addon.json "exports"): cards made elsewhere, such as from a meeting's action ────

/** A board a project follows, as a place for a new card: its types and the one a card gets by default. */
export interface CardTarget {
  id: string;
  name: string;
  org: string;
  project: string;
  types: string[];
  type?: string;
  /** Why a card can't go there now (another tenant's board, az signed out…). */
  problem?: string;
}

/** The boards a Jig project follows, each with the card types it shows (from the cache when it has them). */
export async function cardTargets(
  { projectId }: { projectId: string },
  api: AddonHostApi,
): Promise<CardTarget[]> {
  const boards = await followed({ chat: { projectId } }, api);
  return Promise.all(
    boards.map(async (b): Promise<CardTarget> => {
      const base = { id: b.id, name: tabName(b), org: b.org, project: b.project };
      if (inOtherTenant(b, api))
        return {
          ...base,
          types: [],
          problem: `It's in Azure tenant ${b.tenantLabel ?? boardTenant(b)}: switch tenants in Jig's top bar.`,
        };
      try {
        const types = boardTypes((await boardData(b, api, HOUR)).columns);
        return { ...base, types, ...(backlogType(types) ? { type: backlogType(types) } : {}) };
      } catch (error) {
        return { ...base, types: [], problem: error instanceof Error ? error.message : String(error) };
      }
    }),
  );
}

const meCache = remembered<{ displayName?: string; emailAddress?: string }>(HOUR);
const identityCache = remembered<{ name: string; email: string } | undefined>(HOUR);

/**
 * Who a card for `owner` goes to on a board: you (`mine`, the signed-in Azure DevOps user), or the one
 * person in the board's organisation with that name. Nobody when it's unclear or az can't say.
 */
export async function cardAssignee(
  { projectId, boardId, owner, mine }: { projectId: string; boardId: string; owner?: string; mine?: boolean },
  api: AddonHostApi,
): Promise<{ assignedTo?: string; name?: string }> {
  const b = findBoard(await followed({ chat: { projectId } }, api), boardId);
  if (!b || inOtherTenant(b, api)) return {};
  try {
    if (mine) {
      const me = await meCache(api, "me", () =>
        rest(api, "https://app.vssps.visualstudio.com/_apis/profile/profiles/me"),
      );
      return me?.emailAddress ? { assignedTo: me.emailAddress, name: me.displayName ?? me.emailAddress } : {};
    }
    const name = owner?.trim() ?? "";
    if (!name || /^(unknown|someone|everyone|all)$/i.test(name)) return {};
    const found = await identityCache(api, `${b.org.toLowerCase()}|${name.toLowerCase()}`, async () =>
      pickIdentity(
        await rest<unknown>(
          api,
          `https://vssps.dev.azure.com/${encodeURIComponent(b.org)}/_apis/identities`,
          ["searchFilter=General", `filterValue=${name}`, "queryMembership=None"],
        ),
        name,
      ),
    );
    return found ? { assignedTo: found.email, name: found.name } : {};
  } catch {
    return {};
  }
}

/** A new card on a board a Jig project follows (its id, or name); the card's number, link and board. */
export async function createCard(
  input: {
    projectId: string;
    boardId: string;
    type: string;
    title: string;
    description?: string;
    assignedTo?: string;
  },
  api: AddonHostApi,
): Promise<{ id: number; url: string; board: string }> {
  const b = await chatBoard({ chat: { projectId: input.projectId }, board: input.boardId }, api);
  const made = await create(
    {
      board: b,
      type: input.type,
      title: input.title,
      ...(input.description?.trim() ? { description: input.description } : {}),
      ...(input.assignedTo?.trim() ? { assignedTo: input.assignedTo.trim() } : {}),
    },
    api,
  );
  return { id: made.id, url: made.url, board: tabName(b) };
}

/**
 * Where a card made elsewhere stands (D-469, Factory's approvals by others): its state and column,
 * whether it's done on its board (`cardDone`), and its comments, oldest first.
 */
export async function cardStatus(
  input: { projectId: string; boardId: string; id: number },
  api: AddonHostApi,
): Promise<{
  state: string;
  column?: string;
  done: boolean;
  url: string;
  comments: Array<{ by: string; at: string; text: string }>;
}> {
  const b = await chatBoard({ chat: { projectId: input.projectId }, board: input.boardId }, api);
  const data = await boardData(b, api, HOUR);
  const d = await item(
    { board: b, id: Number(input.id), ...(data.columnField ? { columnField: data.columnField } : {}) },
    api,
  );
  const comments = d.comments
    .map(({ by, at, text }) => ({ by, at, text }))
    .sort((x, y) => x.at.localeCompare(y.at));
  return {
    state: d.state,
    ...(d.column ? { column: d.column } : {}),
    done: cardDone(data.columns, d),
    url: d.url,
    comments,
  };
}

/** A comment on a card made elsewhere (D-469): "Version 3 is ready", "Approved in Jig". */
export async function commentCard(
  input: { projectId: string; boardId: string; id: number; text: string },
  api: AddonHostApi,
): Promise<void> {
  if (!input.text?.trim()) throw new Error("A comment needs text.");
  const b = await chatBoard({ chat: { projectId: input.projectId }, board: input.boardId }, api);
  await update({ board: b, id: Number(input.id), patch: { comment: input.text.trim() } }, api);
}
