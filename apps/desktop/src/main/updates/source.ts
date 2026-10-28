import { git } from "../addons/repo";
import { snapshotBuild } from "../selfmod/restart";
import { runCommand } from "../selfmod/run";
import { needsInstall } from "../selfmod/workspace";

/**
 * Updating Jig when it runs from a git clone: fetch, fast-forward pull, install when dependencies
 * changed, build. The running build is kept as "previous" so the launcher can fall back to it.
 */
async function run(repo: string, args: string[]): Promise<string> {
  const r = await git(repo, args);
  if (r.code !== 0) throw new Error(r.stderr.trim() || `git ${args[0]} failed`);
  return r.stdout.trim();
}

export async function sourceStatus(
  repo: string,
): Promise<{ behind: number; branch: string; upstream?: string }> {
  const branch = await run(repo, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const upstream = await git(repo, ["rev-parse", "--abbrev-ref", "@{u}"]);
  if (upstream.code !== 0) return { behind: 0, branch };
  await run(repo, ["fetch", "--quiet"]);
  const behind = Number(await run(repo, ["rev-list", "--count", "HEAD..@{u}"])) || 0;
  return { behind, branch, upstream: upstream.stdout.trim() };
}

export async function updateSource(
  repo: string,
  commands: { build: string; install: string },
  previousDir: string,
): Promise<{ from: string; to: string; installed: boolean; previous?: string }> {
  const dirty = (await run(repo, ["status", "--porcelain", "--untracked-files=no"])).trim();
  if (dirty) throw new Error(`${repo} has uncommitted changes. Commit or stash them first.`);
  const from = await run(repo, ["rev-parse", "HEAD"]);
  let previous: string | undefined;
  try {
    previous = await snapshotBuild(repo, previousDir);
  } catch {
    // No build to keep (first build).
  }
  await run(repo, ["pull", "--ff-only", "--quiet"]);
  const to = await run(repo, ["rev-parse", "HEAD"]);
  const changed =
    from === to ? [] : (await run(repo, ["diff", "--name-only", from, to])).split("\n").filter(Boolean);
  const installed = needsInstall(changed);
  if (installed) {
    const r = await runCommand(commands.install, repo);
    if (!r.ok) throw new Error(`npm install failed:\n${r.output.slice(-2000)}`);
  }
  const built = await runCommand(commands.build, repo);
  if (!built.ok) throw new Error(`The build failed:\n${built.output.slice(-2000)}`);
  return { from, to, installed, previous };
}
