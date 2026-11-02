import { join } from "node:path";
import type { AddonHostApi, AddonProcess } from "@jig/sdk";
import { parseResults, plainText, runStatus } from "./lib/results";
import { dotnetSuite, npmSuites, type Suite, sortSuites } from "./lib/suites";

/**
 * Tests (D-244): the test suites in your projects' repositories, run with one click, their results
 * read from the runner's output and kept (the last runs per suite), so a failure, a slow suite or a
 * test that started failing shows. Runs are started by you or by Claude (its `run` tool), never on a
 * schedule.
 */

export interface RepoSuites {
  /** Absolute path of the repository. */
  path: string;
  name: string;
  suites: Suite[];
}

export interface TestRun {
  id: string;
  repo: string;
  suiteId: string;
  label: string;
  startedAt: string;
  endedAt?: string;
  status: "running" | "passed" | "failed" | "stopped";
  exitCode?: number;
  passed: number;
  failed: number;
  skipped: number;
  failures: string[];
  /** Whether the runner's summary was found (else only the exit code tells). */
  parsed: boolean;
  /** Who started it. */
  by: "you" | "claude";
}

/** Runs kept per repository (newest first). */
const KEEP = 30;
/** Output kept per run while it runs and after (the tail). */
const OUTPUT_LIMIT = 200_000;
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "bin",
  "obj",
  "dist",
  "build",
  "out",
  ".angular",
  "coverage",
]);

const runsKey = (repo: string) => `runs:${repo.replaceAll("\\", "/").toLowerCase()}`;

async function readText(api: AddonHostApi, path: string): Promise<string | undefined> {
  try {
    return await api.fs.readFile(path);
  } catch {
    return undefined;
  }
}

/** package.json at the root and one folder down (client/, api/…), and .NET test projects 3 deep. */
async function findSuites(api: AddonHostApi, repo: string): Promise<Suite[]> {
  const suites: Suite[] = [];
  const root = await readText(api, join(repo, "package.json"));
  if (root) suites.push(...npmSuites(root));
  const walk = async (dir: string, rel: string, depth: number) => {
    let entries: string[] = [];
    try {
      entries = await api.fs.readdir(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
      const path = join(dir, name);
      const relPath = rel ? `${rel}/${name}` : name;
      if (name.endsWith(".csproj")) {
        const suite = dotnetSuite(relPath, (await readText(api, path)) ?? "");
        if (suite) suites.push(suite);
        continue;
      }
      if (name.includes(".")) continue;
      if (depth === 0) {
        const pkg = await readText(api, join(path, "package.json"));
        if (pkg) suites.push(...npmSuites(pkg, relPath));
      }
      if (depth < 3) await walk(path, relPath, depth + 1);
    }
  };
  await walk(repo, "", 0);
  return sortSuites(suites);
}

/** Every repository of the project (or the given folder), with its suites. */
export async function suites(
  { projectId }: { projectId?: string },
  api: AddonHostApi,
): Promise<RepoSuites[]> {
  const projects = await api.projects();
  const project = projects.find((p) => p.id === projectId);
  if (!project?.exists) return [];
  const repos = project.repos.length
    ? project.repos
    : project.isGitRepo
      ? [{ path: project.path, name: project.name }]
      : [];
  return Promise.all(
    repos.map(async (r) => ({ path: r.path, name: r.name, suites: await findSuites(api, r.path) })),
  );
}

export async function history({ repo }: { repo: string }, api: AddonHostApi): Promise<TestRun[]> {
  return (await api.storage.get<TestRun[]>(runsKey(repo))) ?? [];
}

async function saveRun(api: AddonHostApi, run: TestRun) {
  const runs = (await history({ repo: run.repo }, api)).filter((r) => r.id !== run.id);
  await api.storage.set(runsKey(run.repo), [run, ...runs].slice(0, KEEP));
  api.emit("runs", { repo: run.repo });
}

interface Live {
  run: TestRun;
  process: AddonProcess;
  output: string;
  stopping: boolean;
  finished: Promise<TestRun>;
}
const live = new Map<string, Live>();
/** Finished runs' output, kept while Jig runs (the newest 20). */
const finishedOutput = new Map<string, string>();

/** Runs in progress, with their output so far (the view shows it in a modal). */
export async function running(): Promise<Array<TestRun & { output: string }>> {
  return [...live.values()].map((l) => ({ ...l.run, output: l.output }));
}

export async function output({ id }: { id: string }): Promise<string> {
  return live.get(id)?.output ?? finishedOutput.get(id) ?? "";
}

async function start(
  { repo, suiteId, by = "you" }: { repo: string; suiteId: string; by?: TestRun["by"] },
  api: AddonHostApi,
): Promise<Live> {
  const already = [...live.values()].find((l) => l.run.repo === repo && l.run.suiteId === suiteId);
  if (already) return already;
  const suite = (await findSuites(api, repo)).find((s) => s.id === suiteId);
  if (!suite) throw new Error(`No test suite ${suiteId} in ${repo}`);
  const run: TestRun = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    repo,
    suiteId,
    label: suite.label,
    startedAt: new Date().toISOString(),
    status: "running",
    passed: 0,
    failed: 0,
    skipped: 0,
    failures: [],
    parsed: false,
    by,
  };
  const entry = { run, output: "", stopping: false } as Live;
  entry.process = api.spawn(suite.command, suite.args, {
    cwd: join(repo, suite.cwd),
    // Runners print plain summaries without a TTY; CI=1 keeps watchers (ng test, jest) from waiting.
    env: { CI: "1", FORCE_COLOR: "0" },
    onOutput: (text) => {
      entry.output = (entry.output + text).slice(-OUTPUT_LIMIT);
      api.emit("output", { id: run.id, text });
    },
  });
  live.set(run.id, entry);
  api.emit("runs", { repo });
  entry.finished = entry.process.done.then(async ({ code }) => {
    finishedOutput.set(run.id, entry.output);
    for (const old of [...finishedOutput.keys()].slice(0, -20)) finishedOutput.delete(old);
    live.delete(run.id);
    const result = parseResults(entry.output);
    const done: TestRun = {
      ...run,
      ...result,
      exitCode: code,
      endedAt: new Date().toISOString(),
      status: entry.stopping ? "stopped" : runStatus(code, result),
    };
    await saveRun(api, done);
    if (done.status !== "stopped") {
      const counts = done.parsed
        ? `${done.passed} passed${done.failed ? `, ${done.failed} failed` : ""}`
        : "";
      api.notify({
        title: done.status === "passed" ? `${done.label}: passed` : `${done.label}: failed`,
        message: counts || (done.status === "passed" ? "Exit code 0" : `Exit code ${code}`),
        tone: done.status === "passed" ? "success" : "danger",
        actions: [{ label: "Show", view: "tests" }],
      });
    }
    return done;
  });
  return entry;
}

/** Starts a suite from the view; its output and result arrive as events. */
export async function run(args: { repo: string; suiteId: string }, api: AddonHostApi): Promise<TestRun> {
  return (await start(args, api)).run;
}

/** Stops a run, with the processes it started (Playwright's browsers, a dotnet host). */
export async function stop({ id }: { id: string }, api: AddonHostApi): Promise<void> {
  const entry = live.get(id);
  if (!entry) return;
  entry.stopping = true;
  if (process.platform === "win32" && entry.process.pid)
    await api
      .exec("taskkill", ["/pid", String(entry.process.pid), "/T", "/F"])
      .catch(() => entry.process.kill());
  else entry.process.kill();
}

// Claude's tools.

type ChatArgs = { chat?: { cwd?: string; projectId?: string } };

export async function toolList(args: ChatArgs, api: AddonHostApi): Promise<string> {
  const repos = await suites({ projectId: args.chat?.projectId }, api);
  if (!repos.some((r) => r.suites.length)) return "No test suites found in this project's repositories.";
  const lines: string[] = [];
  for (const repo of repos) {
    if (!repo.suites.length) continue;
    const last = await history({ repo: repo.path }, api);
    lines.push(`${repo.name} (${repo.path})`);
    for (const s of repo.suites) {
      const prev = last.find((r) => r.suiteId === s.id);
      const was = prev
        ? ` — last: ${prev.status}${prev.parsed ? ` (${prev.passed} passed, ${prev.failed} failed)` : ""}`
        : "";
      lines.push(`- ${s.id} [${s.kind}]: ${s.detail}${was}`);
    }
  }
  return lines.join("\n");
}

export async function toolRun(
  args: ChatArgs & { repo?: string; suite: string },
  api: AddonHostApi,
): Promise<string> {
  const repos = await suites({ projectId: args.chat?.projectId }, api);
  const repo =
    repos.find((r) => r.path === args.repo || r.name === args.repo) ??
    repos.find((r) => r.suites.some((s) => s.id === args.suite));
  if (!repo) throw new Error("Name the repository (its path or name from the list tool).");
  const entry = await start({ repo: repo.path, suiteId: args.suite, by: "claude" }, api);
  const done = await entry.finished;
  const tail = plainText(entry.output).split("\n").slice(-60).join("\n");
  return [
    `${done.label}: ${done.status} (exit ${done.exitCode})`,
    done.parsed ? `${done.passed} passed, ${done.failed} failed, ${done.skipped} skipped` : "",
    done.failures.length ? `Failing:\n${done.failures.map((f) => `- ${f}`).join("\n")}` : "",
    `Output (last lines):\n${tail}`,
  ]
    .filter(Boolean)
    .join("\n");
}
