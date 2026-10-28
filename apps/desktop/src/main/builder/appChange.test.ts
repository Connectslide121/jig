import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../../shared/config";
import type { SessionMeta } from "../../shared/engine";
import { defaultLayout } from "../../shared/layout";
import { git } from "../addons/repo";
import { runFakeAppBuilder, runFakeBuilder } from "../engine/fakeBuilder";
import { BuildService } from "./service";

const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false,
  );

/** A tiny stand-in for Jig's repository: AGENTS.md, apps/desktop, a check and a build script. */
async function fakeRepo(root: string): Promise<string> {
  const repo = join(root, "jig");
  await mkdir(join(repo, "apps", "desktop"), { recursive: true });
  await mkdir(join(repo, "apps", "launcher"), { recursive: true });
  await writeFile(join(repo, "AGENTS.md"), "# Rules\n");
  await writeFile(join(repo, ".gitignore"), "dist/\nnode_modules/\n");
  await writeFile(join(repo, "apps", "desktop", "package.json"), '{"name":"jig-desktop"}\n');
  await writeFile(join(repo, "apps", "launcher", "launcher.mjs"), "// launcher\n");
  // The check fails while a file called FAIL exists; the build writes apps/desktop/dist/built.txt.
  await writeFile(
    join(repo, "check.mjs"),
    'import { existsSync } from "node:fs";\nprocess.exit(existsSync("FAIL") ? 1 : 0);\n',
  );
  await writeFile(
    join(repo, "build.mjs"),
    'import { mkdirSync, writeFileSync } from "node:fs";\nmkdirSync("apps/desktop/dist", { recursive: true });\nwriteFileSync("apps/desktop/dist/built.txt", "ok");\n',
  );
  const g = (args: string[]) => git(repo, args);
  await g(["init", "-q", "-b", "main"]);
  await g(["add", "-A"]);
  await g(["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "init"]);
  await mkdir(join(repo, "apps", "desktop", "dist"), { recursive: true });
  await writeFile(join(repo, "apps", "desktop", "dist", "built.txt"), "old");
  return repo;
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "jig-selfmod-"));
  const home = join(root, "home");
  process.env.JIG_HOME = home;
  await mkdir(join(home, "addons"), { recursive: true });
  await writeFile(join(home, "config.json"), "{}");
  const repo = await fakeRepo(root);
  const restarts: Array<{ app: string; previous?: string }> = [];
  let n = 0;
  const service: BuildService = new BuildService({
    file: join(home, "builds.json"),
    workDir: join(home, "work"),
    addonsRepo: join(home, "addons"),
    nodePaths: [],
    addons: {
      list: () => [],
      catalog: () => "",
      repoReady: false,
      setPreview: async () => {},
      reloadAll: async () => {},
    },
    sessions: {
      create: async ({ cwd, buildId }) => ({ id: `s${++n}`, cwd, buildId }) as unknown as SessionMeta,
      send: async (id, text) => {
        const job = service.list().find((j) => j.sessionId === id) ?? service.list()[0]!;
        const handlers = Object.fromEntries(service.toolsFor(job.id).map((t) => [t.name, t.handler]));
        if (handlers.run_checks) await runFakeAppBuilder(text, handlers, () => {}, job.app!.worktree!);
        else await runFakeBuilder(text, handlers, () => {});
      },
      addItem: async () => {},
      stop: async () => {},
    },
    layout: { get: async () => defaultLayout(), set: async () => {} },
    config: { get: () => defaultConfig(), update: async () => {} },
    onChange: () => {},
    app: {
      sourceRepo: async () => repo,
      commands: () => ({ check: "node check.mjs", build: "node build.mjs", install: "node -e 0" }),
      home,
      workDir: join(home, "work"),
      appBuildsDir: join(home, "app-builds"),
      electron: process.execPath,
      restart: (app, previous) => restarts.push({ app, previous }),
    },
  });
  return { service, repo, home, restarts };
}

describe("level 3: changing Jig's own source", () => {
  it("proposes, works in a worktree, checks, merges on Accept, restarts and can be undone", async () => {
    const { service, repo, home, restarts } = await setup();
    const proposed = await service.start({ goal: "change jig itself: a notes page", origin: "tools" });
    expect(proposed).toMatchObject({
      status: "needs_you",
      kind: "app",
      level: 3,
      app: { stage: "proposed", repo },
    });
    expect(proposed.app?.reason).toBe("No slot can change the window frame.");

    const job = await service.startAppChange(proposed.id);
    expect(job.status).toBe("preview");
    expect(job.app).toMatchObject({ stage: "preview", files: ["docs/builder-notes.md"], protectedFiles: [] });
    expect(job.app?.checks?.ok).toBe(true);
    expect(await exists(join(job.app!.worktree!, "apps", "desktop", "dist", "built.txt"))).toBe(true);
    expect(await service.diff(job.id, "docs/builder-notes.md")).toContain(
      "+- change jig itself: a notes page",
    );
    // Nothing reached the repository yet.
    expect(await exists(join(repo, "docs", "builder-notes.md"))).toBe(false);

    const accepted = await service.accept(job.id);
    expect(accepted).toMatchObject({ status: "accepted", app: { stage: "accepted" } });
    expect(await readFile(join(repo, "docs", "builder-notes.md"), "utf8")).toContain("a notes page");
    expect(await readFile(join(repo, "apps", "desktop", "dist", "built.txt"), "utf8")).toBe("ok");
    // The running build was kept for the launcher's fallback.
    const previous = join(home, "app-builds", "previous", "apps", "desktop");
    expect(await readFile(join(previous, "dist", "built.txt"), "utf8")).toBe("old");
    expect(await exists(job.app!.worktree!)).toBe(false);
    await new Promise((r) => setTimeout(r, 400));
    expect(restarts).toEqual([{ app: join(repo, "apps", "desktop"), previous }]);

    expect(await service.undoLastAppChange()).toEqual({ goal: "change jig itself: a notes page" });
    expect(await exists(join(repo, "docs", "builder-notes.md"))).toBe(false);
    expect((await git(repo, ["log", "-1", "--format=%s"])).stdout).toMatch(/^Revert/);
    await expect(service.undoLastAppChange()).rejects.toMatchObject({ code: "nothing_to_undo" });
  });

  it("changes to protected files need your explicit confirmation", async () => {
    const { service, repo } = await setup();
    const proposed = await service.start({ goal: "change jig itself: the launcher", origin: "tools" });
    const job = await service.startAppChange(proposed.id);
    expect(job.app?.protectedFiles).toEqual(["apps/launcher/launcher.mjs"]);
    await expect(service.accept(job.id)).rejects.toMatchObject({ code: "needs_confirmation" });
    expect(await exists(join(repo, "docs", "builder-notes.md"))).toBe(false);
    await service.accept(job.id, { confirmProtected: true });
    expect(await readFile(join(repo, "apps", "launcher", "launcher.mjs"), "utf8")).toContain(
      "Changed by the builder",
    );
  });

  it("failing checks go back to the builder, and Discard removes the worktree", async () => {
    const { service, repo } = await setup();
    const proposed = await service.start({ goal: "change jig itself: fail", origin: "tools" });
    await writeFile(join(repo, "FAIL"), "");
    await git(repo, ["add", "FAIL"]);
    await git(repo, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "fail"]);
    const job = await service.startAppChange(proposed.id);
    expect(job.status).toBe("working");
    expect(job.app?.checks?.ok).toBe(false);
    expect(job.validationRounds).toBe(1);
    const discarded = await service.discard(job.id);
    expect(discarded.status).toBe("discarded");
    expect(await exists(job.app!.worktree!)).toBe(false);
    expect((await git(repo, ["branch", "--list", "jig-build/*"])).stdout.trim()).toBe("");
  });

  it("refuses to start without Jig's source repository", async () => {
    const { service } = await setup();
    const proposed = await service.start({ goal: "change jig itself", origin: "tools" });
    service.get(proposed.id).app!.repo = "/nowhere";
    await expect(service.startAppChange(proposed.id)).rejects.toMatchObject({ code: "no_source" });
  });
});
