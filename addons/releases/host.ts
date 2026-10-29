import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AddonHostApi, AddonWorkspace } from "@jig/sdk";
import {
  type Classified,
  classify,
  insertChangelog,
  type PullRequest,
  parsePullRequest,
} from "./lib/commits";
import { type Deploy, deployAction, shouldRemind, whatsLive } from "./lib/deploys";
import { type Detection, detect } from "./lib/detect";
import { readVersion, versionFileKind, writeVersion } from "./lib/files";
import { nextVersion } from "./lib/next";
import { type Environment, parsePolicy, type ReleasePolicy } from "./lib/policy";
import { bumpSemVer, compareVersions, nextCalVer, tagFor, versionFromTag } from "./lib/version";

/**
 * Releases (D-110): versions, changelogs and deploys per repository, following its release policy
 * (`.jig/release.json`). Everything here is plain git, files and `az`; Claude is only asked from the UI,
 * when you start something (the setup chat, "Draft with Claude").
 */
export const POLICY_FILE = join(".jig", "release.json");

const ENV = { GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" };

async function git(api: AddonHostApi, cwd: string, args: string[], options: { ok?: number[] } = {}) {
  const r = await api.exec("git", ["-c", "core.quotepath=off", ...args], {
    cwd,
    timeoutMs: 60_000,
    env: ENV,
  });
  if (!(options.ok ?? [0]).includes(r.code))
    throw new Error(
      (r.stderr || r.stdout).trim().split("\n").slice(-4).join("\n") || `git ${args[0]} failed`,
    );
  return r.stdout;
}

interface RepoItem {
  name: string;
  path: string;
}

/** Every repository of every workspace (added folder), each once. */
function repoItems(workspaces: AddonWorkspace[]): RepoItem[] {
  const seen = new Set<string>();
  return workspaces
    .filter((w) => w.exists)
    .flatMap((w): RepoItem[] =>
      w.isGitRepo
        ? [{ name: w.name, path: w.path }]
        : (w.repos ?? []).map((r) => ({ name: `${w.name}/${r.name}`, path: r.path })),
    )
    .filter((r) => !seen.has(r.path) && Boolean(seen.add(r.path)));
}

async function readText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

async function readPolicy(path: string): Promise<{ policy?: ReleasePolicy; text?: string }> {
  const text = await readText(join(path, POLICY_FILE));
  return { policy: text ? parsePolicy(text) : undefined, text };
}

export interface Release {
  tag: string;
  version: string;
  date: string;
  commit: string;
  /** The tag's message (the notes, for releases made here). */
  message: string;
}

/** Releases in the policy's tag format, newest first. */
async function releases(api: AddonHostApi, path: string, format: string): Promise<Release[]> {
  const out = await git(
    api,
    path,
    [
      "for-each-ref",
      "refs/tags",
      "--sort=-creatordate",
      "--format=%(refname:short)%1f%(creatordate:iso-strict)%1f%(*objectname)%(objectname)%1f%(contents)%1e",
    ],
    { ok: [0, 128] },
  );
  return out
    .split("\x1e")
    .map((r) => r.replace(/^\n/, ""))
    .filter(Boolean)
    .flatMap((r): Release[] => {
      const [tag = "", date = "", objects = "", message = ""] = r.split("\x1f");
      const version = versionFromTag(tag, format);
      // An annotated tag gives "<commit><tag object>", a lightweight one only the commit.
      return version ? [{ tag, version, date, commit: objects.slice(0, 40), message: message.trim() }] : [];
    });
}

/** The highest version (not the newest tag: a hotfix on an old line isn't the latest). */
function latestOf(list: Release[]): Release | undefined {
  return list.reduce<Release | undefined>(
    (best, r) => (!best || compareVersions(r.version, best.version) > 0 ? r : best),
    undefined,
  );
}

async function unreleasedCommits(api: AddonHostApi, path: string, since?: string): Promise<Classified[]> {
  const range = since ? [`${since}..HEAD`] : ["HEAD"];
  const out = await git(
    api,
    path,
    ["log", "-n", "500", "--no-merges", "--format=%H%x1f%s%x1f%b%x1f%cI%x1f%an%x1e", ...range],
    { ok: [0, 128] },
  );
  return out
    .split("\x1e")
    .map((r) => r.replace(/^\n/, ""))
    .filter(Boolean)
    .map((r) => {
      const [hash = "", subject = "", body = "", date = "", author = ""] = r.split("\x1f");
      return classify({ hash, subject, body, date, author });
    });
}

async function fileVersion(path: string, policy?: ReleasePolicy): Promise<string | undefined> {
  if (!policy?.versionFile) return undefined;
  const kind = versionFileKind(policy.versionFile);
  const text = await readText(join(path, policy.versionFile));
  return kind && text !== undefined ? readVersion(kind, text) : undefined;
}

export interface RepoSummary {
  name: string;
  path: string;
  policy?: ReleasePolicy;
  latest?: { tag: string; version: string; date: string };
  unreleased: number;
  oldest?: string;
  error?: string;
}

async function summarize(api: AddonHostApi, item: RepoItem): Promise<RepoSummary> {
  const { policy } = await readPolicy(item.path);
  if (!policy || policy.style === "none") return { ...item, policy, unreleased: 0 };
  try {
    const list = await releases(api, item.path, policy.tagFormat);
    const latest = latestOf(list);
    const dates = (
      await git(
        api,
        item.path,
        ["log", "--no-merges", "--format=%cI", latest ? `${latest.tag}..HEAD` : "HEAD"],
        {
          ok: [0, 128],
        },
      )
    )
      .trim()
      .split("\n")
      .filter(Boolean);
    return {
      ...item,
      policy,
      latest: latest && { tag: latest.tag, version: latest.version, date: latest.date },
      unreleased: dates.length,
      oldest: dates.at(-1),
    };
  } catch (error) {
    return { ...item, policy, unreleased: 0, error: (error as Error).message };
  }
}

/** Every repository with its release style, latest release and unreleased work. */
export async function overview(_: unknown, api: AddonHostApi): Promise<RepoSummary[]> {
  const items = repoItems(await api.workspaces());
  return Promise.all(items.map((item) => summarize(api, item)));
}

async function listFiles(path: string): Promise<string[]> {
  const files: string[] = [];
  const skip = new Set([".git", "node_modules", "bin", "obj", "dist", "out", ".vs"]);
  const walk = async (dir: string, rel: string, depth: number) => {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      if (skip.has(e)) continue;
      const full = join(dir, e);
      const relPath = rel ? `${rel}/${e}` : e;
      const s = await stat(full).catch(() => undefined);
      if (!s) continue;
      if (s.isDirectory()) {
        if (e === ".changeset") files.push(relPath);
        else if (depth < 2) await walk(full, relPath, depth + 1);
      } else files.push(relPath);
    }
  };
  await walk(path, "", 0);
  return files;
}

/** What the repository already does about versions (no AI). */
export async function detectRepo({ path }: { path: string }, api: AddonHostApi): Promise<Detection> {
  const files = await listFiles(path);
  const versions: Record<string, string | undefined> = {};
  for (const f of files) {
    const kind = versionFileKind(f);
    if (!kind) continue;
    const text = await readText(join(path, f));
    if (text !== undefined) versions[f] = readVersion(kind, text);
  }
  const tags = (await git(api, path, ["tag", "--list"], { ok: [0, 128] })).trim().split("\n").filter(Boolean);
  const subjects = (await git(api, path, ["log", "-50", "--format=%s"], { ok: [0, 128] }))
    .trim()
    .split("\n")
    .filter(Boolean);
  const pipelineFiles = files.filter((f) =>
    /(^|\/)(azure-pipelines[^/]*\.ya?ml|\.azure-pipelines\/.+\.ya?ml|\.github\/workflows\/.+\.ya?ml)$/i.test(
      f,
    ),
  );
  const pipelines = (await Promise.all(pipelineFiles.map((f) => readText(join(path, f))))).filter(
    (t): t is string => t !== undefined,
  );
  return detect({ files, versions, tags, subjects, pipelines });
}

export interface RepoDetail {
  path: string;
  policy?: ReleasePolicy;
  policyText?: string;
  policyFile: string;
  latest?: Release;
  releases: Release[];
  unreleased: Classified[];
  /** Pull requests merged since the last release (merge commits and Azure DevOps squash merges). */
  pullRequests: PullRequest[];
  fileVersion?: string;
  /** The version file and the latest tag disagree. */
  mismatch?: string;
  deploys: Deploy[];
  /** The release on HEAD, if any. */
  headVersion?: string;
  detection?: Detection;
  dirty: boolean;
}

export async function detail({ path }: { path: string }, api: AddonHostApi): Promise<RepoDetail> {
  const { policy, text } = await readPolicy(path);
  const format = policy?.tagFormat ?? "v{version}";
  const list = await releases(api, path, format);
  const latest = latestOf(list);
  const [unreleased, version, status, head] = await Promise.all([
    unreleasedCommits(api, path, latest?.tag),
    fileVersion(path, policy),
    git(api, path, ["status", "--porcelain"], { ok: [0, 128] }),
    git(api, path, ["rev-parse", "HEAD"], { ok: [0, 128] }),
  ]);
  const headSha = head.trim();
  const merges = await git(
    api,
    path,
    ["log", "-n", "200", "--merges", "--format=%s%x1f%b%x1e", latest ? `${latest.tag}..HEAD` : "HEAD"],
    { ok: [0, 128] },
  );
  const pullRequests: PullRequest[] = [];
  for (const r of merges.split("\x1e")) {
    const [subject = "", body = ""] = r.replace(/^\n/, "").split("\x1f");
    const pr = parsePullRequest(subject, body);
    if (pr) pullRequests.push(pr);
  }
  for (const c of unreleased)
    if (c.pr && !pullRequests.some((p) => p.number === c.pr))
      pullRequests.push({ number: c.pr, title: c.text });
  const mismatch =
    latest && version && !policy?.managedBy && version !== latest.version
      ? `${policy?.versionFile} says ${version}, the latest tag ${latest.tag}.`
      : undefined;
  return {
    path,
    policy,
    policyText: text,
    policyFile: join(path, POLICY_FILE),
    latest,
    releases: list.slice(0, 50),
    unreleased,
    pullRequests,
    fileVersion: version,
    mismatch,
    deploys: (await api.storage.get<Deploy[]>(`deploys:${path}`)) ?? [],
    headVersion: list.find((r) => r.commit === headSha)?.version,
    detection: policy ? undefined : await detectRepo({ path }, api),
    dirty: status.trim().length > 0,
  };
}

/** Writes `.jig/release.json` (the setup without a chat: the defaults, or what detection found). */
export async function savePolicy(
  { path, policy }: { path: string; policy: ReleasePolicy },
  api: AddonHostApi,
) {
  await mkdir(join(path, ".jig"), { recursive: true });
  await api.fs.writeFile(join(path, POLICY_FILE), `${JSON.stringify(policy, null, 2)}\n`);
  api.emit("changed", { path });
}

/** Bumps the version file, adds the changelog section, commits "Release x", tags, and pushes if asked. */
export async function release(
  {
    path,
    version,
    changelog,
    notes,
    push,
    runPipeline,
  }: {
    path: string;
    version: string;
    changelog?: string;
    notes?: string;
    push?: boolean;
    /** Start the policy's release pipeline on the new tag (after a successful push). */
    runPipeline?: boolean;
  },
  api: AddonHostApi,
): Promise<{ tag: string; committed: boolean; pushed: boolean; pushError?: string; pipeline?: string }> {
  const { policy } = await readPolicy(path);
  if (!policy || policy.style === "none") throw new Error("This repository has no release policy yet.");
  const tag = tagFor(version, policy.tagFormat);
  const existing = await git(api, path, ["tag", "--list", tag]);
  if (existing.trim()) throw new Error(`The tag ${tag} already exists.`);

  const changed: string[] = [];
  if (policy.versionFile && !policy.managedBy) {
    const kind = versionFileKind(policy.versionFile);
    const file = join(path, policy.versionFile);
    const text = (await readText(file)) ?? "";
    if (kind) {
      const next = writeVersion(kind, text, version);
      if (next !== text) {
        await api.fs.writeFile(file, next);
        changed.push(policy.versionFile);
      }
    }
  }
  if (policy.changelog?.path && changelog?.trim()) {
    const file = join(path, policy.changelog.path);
    await mkdir(dirname(file), { recursive: true });
    await api.fs.writeFile(file, insertChangelog(await readText(file), changelog.trim()));
    changed.push(policy.changelog.path);
  }
  if (changed.length) {
    await git(api, path, ["add", "--", ...changed]);
    await git(api, path, ["commit", "-m", `Release ${version}`, "--", ...changed]);
  }
  const message = `Release ${version}${notes?.trim() ? `\n\n${notes.trim()}` : changelog?.trim() ? `\n\n${changelog.trim()}` : ""}`;
  await git(api, path, ["tag", "-a", tag, "-m", message]);

  let pushed = false;
  let pushError: string | undefined;
  if (push) {
    try {
      if (changed.length) await git(api, path, ["push", "origin", "HEAD"]);
      await git(api, path, ["push", "origin", `refs/tags/${tag}`]);
      pushed = true;
    } catch (error) {
      pushError = (error as Error).message;
    }
  }
  let pipeline: string | undefined;
  if (runPipeline && pushed && policy.releasePipeline) {
    const p = policy.releasePipeline;
    const r = await api.exec(
      "az",
      [
        "pipelines",
        "run",
        "--id",
        String(p.id),
        "--org",
        p.org,
        "--project",
        p.project,
        "--branch",
        `refs/tags/${tag}`,
        "-o",
        "json",
        "--only-show-errors",
      ],
      { timeoutMs: 120_000, env: { AZURE_CORE_NO_COLOR: "1" } },
    );
    if (r.code === 0) {
      try {
        pipeline =
          `Started run ${(JSON.parse(r.stdout) as { buildNumber?: string }).buildNumber ?? ""}`.trim();
      } catch {
        pipeline = "Started.";
      }
    } else
      pipeline = `Not started: ${r.stderr.trim().split("\n").slice(-2).join(" ") || "az pipelines run failed"}`;
  }
  api.emit("changed", { path });
  return { tag, committed: changed.length > 0, pushed, pushError, pipeline };
}

async function logDeploy(api: AddonHostApi, path: string, deploy: Deploy) {
  const key = `deploys:${path}`;
  const list = (await api.storage.get<Deploy[]>(key)) ?? [];
  await api.storage.set(key, [deploy, ...list].slice(0, 200));
}

/** The next version for a deploy that is the release (continuous style). */
async function autoVersion(api: AddonHostApi, path: string, policy: ReleasePolicy): Promise<string> {
  const latest = latestOf(await releases(api, path, policy.tagFormat));
  return policy.scheme === "calver" ? nextCalVer(latest?.version) : bumpSemVer(latest?.version, "patch");
}

/** Tags a deployed commit as the release (continuous style), and pushes the tag (best effort). */
async function tagDeploy(
  api: AddonHostApi,
  path: string,
  policy: ReleasePolicy,
  commit: string,
  env: string,
) {
  const version = await autoVersion(api, path, policy);
  const tag = tagFor(version, policy.tagFormat);
  await git(api, path, ["tag", "-a", tag, commit, "-m", `Release ${version}\n\nDeployed to ${env}.`]);
  try {
    await git(api, path, ["push", "origin", `refs/tags/${tag}`]);
  } catch (error) {
    api.log(`Could not push ${tag}`, (error as Error).message);
  }
  return version;
}

/** "Deployed to <env>" (by hand): records it; on a continuous project's production, it is the release. */
export async function recordDeploy(
  { path, env }: { path: string; env: string },
  api: AddonHostApi,
): Promise<Deploy> {
  const { policy } = await readPolicy(path);
  if (!policy) throw new Error("This repository has no release policy yet.");
  const environment: Environment = policy.environments?.find((e) => e.name === env) ?? {
    name: env,
    deploy: "manual",
  };
  const commit = (await git(api, path, ["rev-parse", "HEAD"])).trim();
  const list = await releases(api, path, policy.tagFormat);
  let version = list.find((r) => r.commit === commit)?.version;
  if (deployAction(policy, environment, version) === "tag")
    version = await tagDeploy(api, path, policy, commit, env);
  const deploy: Deploy = { env, commit, version, at: new Date().toISOString(), source: "manual" };
  await logDeploy(api, path, deploy);
  api.emit("changed", { path });
  return deploy;
}

// biome-ignore lint/suspicious/noExplicitAny: az JSON.
type Json = any;

/**
 * Watcher: production pipelines. A run on a commit without a release warns (planned style) or becomes
 * the release (continuous style); every finished run is logged for "What's live". The first look at a
 * pipeline only remembers where it is, so old runs never notify.
 */
export async function checkDeploys(_: unknown, api: AddonHostApi) {
  for (const item of repoItems(await api.workspaces())) {
    const { policy } = await readPolicy(item.path);
    if (!policy || policy.style === "none") continue;
    for (const env of policy.environments ?? []) {
      if (!env.pipeline || env.deploy === "manual") continue;
      const key = `seen:${item.path}:${env.name}`;
      const seen = await api.storage.get<{ done: number; warned: number[] }>(key);
      const r = await api.exec(
        "az",
        [
          "pipelines",
          "runs",
          "list",
          "--pipeline-ids",
          String(env.pipeline.id),
          "--org",
          env.pipeline.org,
          "--project",
          env.pipeline.project,
          "--top",
          "5",
          "-o",
          "json",
          "--only-show-errors",
        ],
        { timeoutMs: 60_000, env: { AZURE_CORE_NO_COLOR: "1" } },
      );
      if (r.code !== 0) {
        api.log(`Could not list runs for ${item.name} ${env.name}`, r.stderr.trim());
        continue;
      }
      const runs = ((JSON.parse(r.stdout || "[]") as Json[]) ?? []).sort(
        (a, b) => Number(a.id) - Number(b.id),
      );
      const maxId = Math.max(0, ...runs.map((x) => Number(x.id)));
      if (!seen) {
        await api.storage.set(key, { done: maxId, warned: [] });
        continue;
      }
      const next = { done: seen.done, warned: [...seen.warned] };
      const list = await releases(api, item.path, policy.tagFormat);
      for (const run of runs) {
        const id = Number(run.id);
        if (id <= seen.done) continue;
        const commit = String(run.sourceVersion ?? "");
        const version = list.find((x) => x.commit === commit)?.version;
        const action = deployAction(policy, env, version);
        if (run.status !== "completed") {
          if (action === "warn" && !next.warned.includes(id)) {
            next.warned.push(id);
            api.notify({
              title: `${item.name}: ${env.name} deploy without a release`,
              message: `Run ${run.buildNumber ?? id} deploys ${commit.slice(0, 7)}, which has no version. Release first? (Releases panel)`,
              tone: "warning",
            });
          }
          continue;
        }
        next.done = Math.max(next.done, id);
        if (run.result !== "succeeded") continue;
        let deployed = version;
        if (action === "tag") {
          const known = await git(api, item.path, ["cat-file", "-e", `${commit}^{commit}`], {
            ok: [0, 1, 128],
          })
            .then(() => true)
            .catch(() => false);
          if (known)
            deployed = await tagDeploy(api, item.path, policy, commit, env.name).catch(() => undefined);
        } else if (action === "warn" && !next.warned.includes(id)) {
          api.notify({
            title: `${item.name}: deployed to ${env.name} without a release`,
            message: `${commit.slice(0, 7)} has no version. Make a release in the Releases panel.`,
            tone: "warning",
          });
        }
        await logDeploy(api, item.path, {
          env: env.name,
          commit,
          version: deployed,
          at: String(run.finishTime ?? new Date().toISOString()),
          source: "pipeline",
          runId: id,
        });
        api.emit("changed", { path: item.path });
      }
      next.warned = next.warned.filter((w) => w > next.done - 50);
      await api.storage.set(key, next);
    }
  }
}

/** Watcher: the weekly reminder for planned releases with `cadence: "weekly"`. */
export async function remind(_: unknown, api: AddonHostApi) {
  const reminded = (await api.storage.get<Record<string, string>>("reminded")) ?? {};
  const now = new Date();
  let changed = false;
  for (const s of await overview(undefined, api)) {
    if (!s.policy) continue;
    if (
      shouldRemind({
        policy: s.policy,
        unreleased: s.unreleased,
        lastRelease: s.latest?.date,
        lastReminded: reminded[s.path],
        now,
      })
    ) {
      api.notify({
        title: `${s.name} has unreleased work`,
        message: `${s.unreleased} commits since ${s.latest?.tag ?? "the start"}. Time for a release? (Releases panel)`,
        tone: "info",
      });
      reminded[s.path] = now.toISOString();
      changed = true;
    }
  }
  if (changed) await api.storage.set("reminded", reminded);
}

// ------------------------------------------------------------------------------------------------
// Tools for Claude (`contributes.tools`): the same data and actions as the panel, in any chat.

interface ToolArgs {
  repo?: string;
  chat?: { cwd?: string; projectId?: string };
}

/** The repository a tool is about: by name or path, else the one the chat works in. */
async function resolveRepo(args: ToolArgs, api: AddonHostApi): Promise<RepoItem> {
  const items = repoItems(await api.workspaces());
  const want = args.repo?.trim();
  if (want) {
    const norm = (p: string) => p.replaceAll("\\", "/").replace(/\/$/, "").toLowerCase();
    const hit =
      items.find((r) => norm(r.path) === norm(want)) ??
      items.find((r) => r.name.toLowerCase() === want.toLowerCase()) ??
      items.find((r) => r.name.toLowerCase().split("/").pop() === want.toLowerCase());
    if (hit) return hit;
    throw new Error(`No repository "${want}". Repositories: ${items.map((r) => r.name).join(", ")}`);
  }
  if (args.chat?.cwd) {
    const top = (await git(api, args.chat.cwd, ["rev-parse", "--show-toplevel"], { ok: [0, 128] })).trim();
    const norm = (p: string) => p.replaceAll("\\", "/").toLowerCase();
    const hit = top ? items.find((r) => norm(r.path) === norm(top)) : undefined;
    if (hit) return hit;
  }
  throw new Error(`Say which repository (repo). Repositories: ${items.map((r) => r.name).join(", ")}`);
}

const STYLE: Record<string, string> = {
  planned: "planned releases",
  continuous: "continuous",
  none: "not tracked",
};

export async function toolOverview(_: ToolArgs, api: AddonHostApi): Promise<string> {
  const list = await overview(undefined, api);
  if (!list.length) return "No git repositories in Jig's workspaces.";
  return list
    .map((r) =>
      r.policy
        ? `- ${r.name}: ${STYLE[r.policy.style]}, latest ${r.latest?.tag ?? "none"}${r.policy.style === "planned" ? `, ${r.unreleased} unreleased commit(s)${r.oldest ? ` since ${r.oldest.slice(0, 10)}` : ""}` : ""}`
        : `- ${r.name}: no release policy yet (set one up with releases_set_policy, or in the Releases panel)`,
    )
    .join("\n");
}

export async function toolChanges(args: ToolArgs, api: AddonHostApi): Promise<string> {
  const repo = await resolveRepo(args, api);
  const d = await detail({ path: repo.path }, api);
  const lines = [`${repo.name} (${repo.path})`];
  if (!d.policy) {
    lines.push("No release policy yet. What Jig found:", JSON.stringify(d.detection, null, 2));
  } else {
    const p = d.policy;
    lines.push(
      `Policy: ${STYLE[p.style]}, ${p.scheme}, tags ${p.tagFormat}${p.versionFile ? `, version in ${p.versionFile}` : ""}${p.managedBy ? `, managed by ${p.managedBy}` : ""}${p.changelog ? `, changelog ${p.changelog.path}` : ""}${p.notes?.length ? `, notes for ${p.notes.map((n) => `${n.audience} (${n.language})`).join(", ")}` : ""}`,
    );
    if (p.style === "planned") {
      const next = nextVersion({
        policy: p,
        latest: d.latest?.version,
        fileVersion: d.fileVersion,
        commits: d.unreleased,
      });
      lines.push(
        `Suggested next version: ${next.version}${next.baseline ? " (first release, the baseline)" : ` (${next.bump})`}`,
      );
    }
  }
  lines.push(`Latest release: ${d.latest ? `${d.latest.tag} on ${d.latest.date.slice(0, 10)}` : "none"}`);
  if (d.fileVersion) lines.push(`Version file says: ${d.fileVersion}`);
  if (d.mismatch) lines.push(`Mismatch: ${d.mismatch}`);
  lines.push(
    `Unreleased commits (${d.unreleased.length}):`,
    ...d.unreleased.map(
      (c) =>
        `- ${c.hash.slice(0, 7)} ${c.date.slice(0, 10)} ${c.author}: ${c.subject}${c.breaking ? " [breaking]" : ""}${c.workItems.length ? ` [AB#${c.workItems.join(", AB#")}]` : ""}`,
    ),
  );
  if (d.pullRequests.length)
    lines.push("Pull requests:", ...d.pullRequests.map((p) => `- #${p.number} ${p.title}`));
  const live = whatsLive(d.deploys);
  if (Object.keys(live).length)
    lines.push(
      "What's live:",
      ...Object.values(live).map(
        (x) => `- ${x.env}: ${x.version ?? x.commit.slice(0, 7)} (${x.at.slice(0, 10)})`,
      ),
    );
  return lines.join("\n");
}

export async function toolHistory(args: ToolArgs & { limit?: number }, api: AddonHostApi): Promise<string> {
  const repo = await resolveRepo(args, api);
  const { policy } = await readPolicy(repo.path);
  const list = (await releases(api, repo.path, policy?.tagFormat ?? "v{version}")).slice(0, args.limit ?? 10);
  if (!list.length) return `${repo.name} has no releases yet.`;
  return list.map((r) => `## ${r.tag} (${r.date.slice(0, 10)})\n${r.message || "(no notes)"}`).join("\n\n");
}

export async function toolRelease(
  args: ToolArgs & { version: string; changelog?: string; notes?: string; push?: boolean },
  api: AddonHostApi,
): Promise<string> {
  const repo = await resolveRepo(args, api);
  const r = await release(
    {
      path: repo.path,
      version: args.version,
      changelog: args.changelog,
      notes: args.notes,
      push: args.push ?? false,
    },
    api,
  );
  return `Released ${r.tag} in ${repo.name}${r.committed ? " (committed the version file and changelog)" : ""}. ${r.pushed ? "Pushed." : r.pushError ? `Not pushed: ${r.pushError}` : "Not pushed."}`;
}

export async function toolRecordDeploy(args: ToolArgs & { env: string }, api: AddonHostApi): Promise<string> {
  const repo = await resolveRepo(args, api);
  const d = await recordDeploy({ path: repo.path, env: args.env }, api);
  return `Recorded: ${repo.name} ${d.version ?? d.commit.slice(0, 7)} deployed to ${d.env}.`;
}

export async function toolSetPolicy(
  args: ToolArgs & { policy: Record<string, unknown> },
  api: AddonHostApi,
): Promise<string> {
  const repo = await resolveRepo(args, api);
  const policy = parsePolicy(JSON.stringify(args.policy));
  if (!policy) throw new Error("That isn't a release policy");
  await savePolicy({ path: repo.path, policy }, api);
  return `Saved ${repo.name}/.jig/release.json (${STYLE[policy.style]}, ${policy.scheme}, tags ${policy.tagFormat}). Commit it to share it with the team.`;
}
