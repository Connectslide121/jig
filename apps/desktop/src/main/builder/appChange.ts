import { type ChildProcess, spawn } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { AppChange, BuildJob } from "../../shared/builds";
import type { SessionMeta } from "../../shared/engine";
import { JigError } from "../../shared/ipc";
import { logger } from "../log";
import { protectedFiles } from "../selfmod/protected";
import { snapshotBuild } from "../selfmod/restart";
import { runCommand } from "../selfmod/run";
import {
  changedPaths,
  commitAll,
  copyHome,
  createAppWorktree,
  fileDiff,
  headCommit,
  isJigRepo,
  linkNodeModules,
  mergeIntoRepo,
  needsInstall,
  removeAppWorktree,
  revertMerge,
  unlinkNodeModules,
} from "../selfmod/workspace";
import type { BuilderTool } from "./tools";

const log = logger("selfmod");
const MAX_ROUNDS = 3;
const TAIL = 6000;

export interface AppChangeOptions {
  get: (id: string) => BuildJob;
  update: (
    id: string,
    patch: Partial<BuildJob>,
    logText?: string,
    tone?: BuildJob["log"][number]["tone"],
  ) => BuildJob;
  sourceRepo: () => Promise<string | undefined>;
  commands: () => { check: string; build: string; install: string };
  home: string;
  workDir: string;
  appBuildsDir: string;
  sessions: {
    create(input: { cwd: string; title: string; buildId: string }): Promise<SessionMeta>;
    send(id: string, text: string): Promise<void>;
    stop(id: string): Promise<void>;
  };
  electron: string;
  /** Restarts Jig through the launcher; undefined = don't restart (tests: JIG_NO_RESTART). */
  restart?: (app: string, previous: string | undefined) => void;
  notify?: (input: {
    title: string;
    message?: string;
    tone?: "info" | "success" | "warning" | "danger";
  }) => void;
}

export const APP_BUILDER_PROMPT = `You are Jig's builder, now changing Jig's OWN SOURCE CODE (level 3, the last resort) in a git worktree of its repository.
AGENTS.md in this folder has the rules for this codebase — follow them exactly: tokens only, menus not commands, tests next to the code, and keep the docs, the plan and docs/decisions.md true in the same change (decisions you make are marked "Claude, on my own").
- When it makes sense, add a NEW SLOT (an extension point in packages/sdk and the renderer) so the next similar request can be an add-on instead of another source change.
- Don't change the launcher (apps/launcher) or the builder core (apps/desktop/src/main/builder, main/selfmod) unless the request really needs it: the user must confirm such changes explicitly.
- Call run_checks (it runs the repository's checks) and fix everything until it passes. Then call finish_app_change with a plain-language summary of what changed and how to try it.`;

const LastSchema = z.object({ repo: z.string(), mergeCommit: z.string(), goal: z.string(), at: z.string() });

/** Level 3: Jig changes its own source, in a worktree, checked, previewed, and accepted with a restart. */
export class AppChanges {
  private previews = new Map<string, ChildProcess>();

  constructor(private readonly o: AppChangeOptions) {}

  private app(job: BuildJob): AppChange {
    if (!job.app) throw new JigError("not_level3", "This build isn't a change to Jig itself");
    return job.app;
  }

  private patch(
    id: string,
    patch: Partial<AppChange>,
    logText?: string,
    tone?: BuildJob["log"][number]["tone"],
  ) {
    const job = this.o.get(id);
    return this.o.update(id, { app: { ...this.app(job), ...patch } }, logText, tone);
  }

  /** You agreed: create the worktree and start a builder session there. */
  async start(id: string): Promise<BuildJob> {
    const job = this.o.get(id);
    const app = this.app(job);
    if (app.stage !== "proposed") throw new JigError("not_ready", "This change is already under way");
    const repo = app.repo || (await this.o.sourceRepo());
    if (!repo || !(await isJigRepo(repo)))
      throw new JigError(
        "no_source",
        "Jig's source repository isn't set. Choose it in Settings → Builder (a clone of Jig with AGENTS.md).",
      );
    const worktree = join(this.o.workDir, `${id}-app`);
    const branch = `jig-build/${id}`;
    await createAppWorktree(repo, worktree, branch);
    const base = await headCommit(worktree);
    this.patch(id, { stage: "working", repo, worktree, branch, base }, `Working in a worktree of ${repo}`);
    this.o.update(id, { status: "working", validationRounds: 0 });
    const session = await this.o.sessions.create({
      cwd: worktree,
      title: `Change Jig: ${job.goal.slice(0, 40)}`,
      buildId: id,
    });
    this.o.update(id, { sessionId: session.id });
    await this.o.sessions.send(
      session.id,
      `Change Jig's source code for this request: ${job.goal}\n\nWhy no slot can do it: ${app.reason ?? ""}\nPlan: ${app.plan ?? ""}\n\nWork only in this repository worktree. Run run_checks until it passes, then finish_app_change.`,
    );
    return this.o.get(id);
  }

  private async checks(id: string): Promise<{ ok: boolean; output: string }> {
    const app = this.app(this.o.get(id));
    const cmds = this.o.commands();
    const changed = app.base ? await changedPaths(app.worktree!, app.base).catch(() => []) : [];
    const install = needsInstall(changed);
    if (install && !app.needsInstall) {
      // Dependencies changed: the worktree gets its own node_modules.
      await unlinkNodeModules(app.worktree!);
      const r = await runCommand(cmds.install, app.worktree!);
      this.patch(
        id,
        { needsInstall: true },
        r.ok ? "Installed the changed dependencies" : "npm install failed",
        r.ok ? undefined : "danger",
      );
      if (!r.ok) return { ok: false, output: r.output.slice(-TAIL) };
    }
    const r = await runCommand(cmds.check, app.worktree!);
    const checks = { ok: r.ok, output: r.output.slice(-TAIL), at: new Date().toISOString() };
    this.patch(id, { checks }, r.ok ? "Checks passed" : "Checks failed", r.ok ? "success" : "warning");
    return checks;
  }

  /** Tools of a level-3 builder session. */
  tools(id: string): BuilderTool[] {
    return [
      {
        name: "run_checks",
        description: "Run the repository's checks (typecheck, lint, tests, design tokens) in the worktree.",
        shape: {},
        handler: async () => {
          const r = await this.checks(id);
          return r.ok
            ? `Checks pass.\n${r.output.slice(-1500)}`
            : `Checks FAIL — fix and run again:\n${r.output}`;
        },
      },
      {
        name: "finish_app_change",
        description:
          "Done: Jig commits the change, runs the checks and builds it; the user then tries a preview instance and accepts or discards.",
        shape: { summary: z.string() },
        handler: async (args) => this.finish(id, String(args.summary ?? "")),
      },
    ];
  }

  private async finish(id: string, summary: string): Promise<string> {
    const job = this.o.get(id);
    const app = this.app(job);
    const files = await commitAll(app.worktree!, app.base!, `Jig builder: ${job.goal.slice(0, 70)}`);
    if (files.length === 0)
      return "Nothing changed yet. Make the change, run_checks, then finish_app_change.";
    this.patch(id, { files, protectedFiles: protectedFiles(files) });
    const checks = await this.checks(id);
    if (!checks.ok) {
      const rounds = job.validationRounds + 1;
      if (rounds >= MAX_ROUNDS) {
        this.o.update(
          id,
          { validationRounds: rounds, status: "failed" },
          `Checks still fail after ${rounds} tries`,
          "danger",
        );
        return `The checks failed ${rounds} times; the build has stopped.\n${checks.output}`;
      }
      this.o.update(id, { validationRounds: rounds });
      return `The checks fail (try ${rounds} of ${MAX_ROUNDS}). Fix and call finish_app_change again:\n${checks.output}`;
    }
    const built = await runCommand(this.o.commands().build, app.worktree!);
    if (!built.ok)
      return `The build fails; fix it and call finish_app_change again:\n${built.output.slice(-TAIL)}`;
    this.patch(id, { stage: "preview" });
    this.o.update(
      id,
      { status: "preview", summary },
      "Ready: open the preview instance to try it",
      "success",
    );
    this.o.notify?.({ title: "A change to Jig is ready to try", message: summary, tone: "success" });
    return "Done. The user will try the preview instance and accept or discard the change.";
  }

  async diff(id: string, path: string): Promise<string> {
    const app = this.app(this.o.get(id));
    return app.worktree && app.base ? fileDiff(app.worktree, app.base, path) : "";
  }

  /** Starts the changed Jig as a separate window, with a copy of your Jig home. */
  async openPreview(id: string): Promise<void> {
    const app = this.app(this.o.get(id));
    if (app.stage !== "preview" || !app.worktree)
      throw new JigError("not_ready", "The change isn't built yet");
    this.previews.get(id)?.kill();
    const home = join(this.o.workDir, `${id}-home`);
    await copyHome(this.o.home, home);
    const extra = process.platform === "linux" && process.getuid?.() === 0 ? ["--no-sandbox"] : [];
    const env: Record<string, string | undefined> = { ...process.env, JIG_HOME: home, JIG_PREVIEW: id };
    delete env.JIG_RENDERER_URL;
    delete env.JIG_DEV;
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(this.o.electron, [join(app.worktree, "apps", "desktop"), ...extra], {
      env,
      detached: true,
      stdio: "ignore",
    });
    child.on("exit", () => {
      this.previews.delete(id);
      this.patch(id, { previewRunning: false });
    });
    child.unref();
    this.previews.set(id, child);
    this.patch(id, { home, previewRunning: true }, "Preview instance started");
  }

  async accept(id: string, confirmProtected: boolean): Promise<BuildJob> {
    const job = this.o.get(id);
    const app = this.app(job);
    if (app.stage !== "preview" || !app.worktree || !app.branch)
      throw new JigError("not_ready", "This change isn't ready to accept");
    if (app.protectedFiles?.length && !confirmProtected)
      throw new JigError(
        "needs_confirmation",
        `This changes protected files (${app.protectedFiles.join(", ")}). Confirm explicitly to accept.`,
      );
    this.previews.get(id)?.kill();
    const cmds = this.o.commands();
    // Keep the running build as "previous" so the launcher can fall back to it.
    let previous: string | undefined;
    try {
      previous = await snapshotBuild(app.repo, join(this.o.appBuildsDir, "previous"));
    } catch (error) {
      log.warn("No previous build to keep", error);
    }
    const mergeCommit = await mergeIntoRepo(app.repo, app.branch, `Jig builder: ${job.goal.slice(0, 70)}`);
    if (app.needsInstall) {
      const r = await runCommand(cmds.install, app.repo);
      if (!r.ok) this.o.update(id, {}, "npm install in the repository failed; run it yourself", "danger");
    }
    const built = await runCommand(cmds.build, app.repo);
    if (!built.ok) {
      this.patch(id, { mergeCommit }, "The merged change doesn't build in your repository", "danger");
      throw new JigError(
        "build_failed",
        `Merged, but the build failed in ${app.repo}:\n${built.output.slice(-2000)}`,
      );
    }
    await writeFile(
      join(this.o.appBuildsDir, "last.json"),
      JSON.stringify({ repo: app.repo, mergeCommit, goal: job.goal, at: new Date().toISOString() }),
    );
    await removeAppWorktree(app.repo, app.worktree, app.branch).catch((e) =>
      log.warn("Removing the worktree failed", e),
    );
    if (app.home) await rm(app.home, { recursive: true, force: true }).catch(() => {});
    if (job.sessionId) await this.o.sessions.stop(job.sessionId).catch(() => {});
    const restart = this.o.restart;
    this.patch(id, { stage: "accepted", mergeCommit, restartPending: !restart });
    const done = this.o.update(
      id,
      { status: "accepted" },
      restart ? "Accepted — restarting Jig" : "Accepted — restart Jig to use it",
      "success",
    );
    if (restart) setTimeout(() => restart(join(app.repo, "apps", "desktop"), previous), 300);
    return done;
  }

  async discard(id: string): Promise<void> {
    const app = this.o.get(id).app;
    if (!app) return;
    this.previews.get(id)?.kill();
    if (app.worktree && app.branch)
      await removeAppWorktree(app.repo, app.worktree, app.branch).catch(() => {});
    if (app.home) await rm(app.home, { recursive: true, force: true }).catch(() => {});
  }

  /** Undo the last accepted change to Jig: revert its merge, rebuild, restart. */
  async undoLast(): Promise<{ goal: string }> {
    let last: z.infer<typeof LastSchema>;
    try {
      last = LastSchema.parse(JSON.parse(await readFile(join(this.o.appBuildsDir, "last.json"), "utf8")));
    } catch {
      throw new JigError("nothing_to_undo", "No change to Jig to undo");
    }
    await revertMerge(last.repo, last.mergeCommit);
    const built = await runCommand(this.o.commands().build, last.repo);
    if (!built.ok)
      throw new JigError("build_failed", `Reverted, but the build failed:\n${built.output.slice(-2000)}`);
    await rm(join(this.o.appBuildsDir, "last.json"), { force: true });
    this.o.restart?.(join(last.repo, "apps", "desktop"), undefined);
    return { goal: last.goal };
  }

  stopPreviews(): void {
    for (const child of this.previews.values()) child.kill();
  }

  /** Re-link node_modules (after a restart the worktree keeps working). */
  async relink(id: string): Promise<void> {
    const app = this.o.get(id).app;
    if (app?.worktree && !app.needsInstall) await linkNodeModules(app.repo, app.worktree);
  }
}
