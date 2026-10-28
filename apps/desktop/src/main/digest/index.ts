import { basename } from "node:path";
import { git } from "../addons/repo";
import { getConfig } from "../config";
import { getEngine, sessionEnv } from "../engine";
import { handle } from "../ipc/router";
import { projectStore } from "../projects";
import { sessionManager } from "../sessions";
import { jigHome } from "../state/paths";
import { type ChatFacts, periodStart, type RepoFacts, standupPrompt } from "./digest";

async function repoFacts(path: string, name: string, since: Date): Promise<RepoFacts> {
  const email = (await git(path, ["config", "user.email"])).stdout.trim();
  const log = await git(path, [
    "log",
    `--since=${since.toISOString()}`,
    "--no-merges",
    "-n",
    "30",
    "--pretty=format:%s",
    ...(email ? [`--author=${email}`] : []),
  ]);
  const branch = (await git(path, ["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim() || "?";
  const status = (await git(path, ["status", "--porcelain"])).stdout;
  return {
    name,
    branch,
    commits: log.code === 0 ? log.stdout.split("\n").filter(Boolean) : [],
    uncommitted: status.split("\n").filter(Boolean).length,
  };
}

export function registerDigestHandlers(): void {
  handle("digest.standup", async ({ period }) => {
    const since = periodStart(period);
    const { projects } = await projectStore().state();
    const repos = (
      await Promise.all(
        projects.flatMap((p) => {
          const list = p.repos?.length
            ? p.repos.map((r) => ({ path: r.path, name: `${p.name}/${r.name}` }))
            : p.isGitRepo
              ? [{ path: p.path, name: p.name }]
              : [];
          return list.map((r) => repoFacts(r.path, r.name || basename(r.path), since).catch(() => undefined));
        }),
      )
    ).filter((r): r is RepoFacts => Boolean(r));
    const names = new Map(projects.map((p) => [p.id, p.name]));
    const chats: ChatFacts[] = (await sessionManager().list())
      .filter((m) => m.kind !== "builder" && new Date(m.updatedAt) >= since && m.turns > 0)
      .slice(0, 40)
      .map((m) => ({
        project: (m.projectId && names.get(m.projectId)) || "no project",
        title: m.title,
        turns: m.turns,
        status: m.status,
      }));
    const { engine } = getConfig();
    const text = await getEngine().oneShot(standupPrompt(since, repos, chats), {
      cwd: jigHome(),
      model: engine.defaultModel,
      appendSystemPrompt: "You write short, factual standup updates. Reply with only the update.",
      env: sessionEnv(process.env, engine.allowApiKey),
      claudePath: engine.claudePath,
    });
    return { text: text.trim(), since: since.toISOString(), repos: repos.length, chats: chats.length };
  });
}
