import type { AddonHostApi } from "@jig/sdk";
import {
  areaClause,
  type Board,
  type BoardData,
  boardQuery,
  columnField,
  type FoundBoard,
  orgName,
  orgUrl,
  teamApi,
  toColumns,
  toWorkItem,
  type WorkItem,
} from "./lib/boards";

export type { Board, BoardData, FoundBoard, WorkItem };

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
function rest<T>(api: AddonHostApi, uri: string, params: string[] = []): Promise<T> {
  return az<T>(api, [
    "rest",
    "--method",
    "get",
    "--resource",
    DEVOPS,
    "--uri",
    uri,
    "--uri-parameters",
    "api-version=7.1",
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
  return { columns, items };
}
