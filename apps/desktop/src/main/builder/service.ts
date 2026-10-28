import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { z } from "zod";
import type { AddonInfo } from "../../shared/addons";
import type { BuildJob, BuildKind, BuildRequestInput } from "../../shared/builds";
import { type DeepPartial, type JigConfig, protectedIn } from "../../shared/config";
import type { ChatItem, SessionMeta } from "../../shared/engine";
import { JigError } from "../../shared/ipc";
import type { Layout } from "../../shared/layout";
import { logger } from "../log";
import { readJson, writeJson } from "../state/jsonStore";
import { builderFirstMessage } from "./prompt";
import { allViews, applyLayoutOps, type BuilderTool, builderTools, folderExists } from "./tools";
import { validateAddon } from "./validate";
import {
  changedFiles,
  commitWorktree,
  copyInto,
  createWorktree,
  fileDiff,
  mergeBuild,
  removeWorktree,
} from "./workspace";

const log = logger("builder");
const MAX_ROUNDS = 3;

export interface BuildServiceOptions {
  file: string;
  workDir: string;
  addonsRepo: string;
  nodePaths: string[];
  addons: {
    list(): AddonInfo[];
    catalog(): string;
    repoReady: boolean;
    setPreview(id: string, preview: { dir: string; buildId: string } | undefined): Promise<void>;
    reloadAll(): Promise<void>;
  };
  sessions: {
    create(input: { cwd: string; title: string; buildId: string }): Promise<SessionMeta>;
    send(id: string, text: string): Promise<void>;
    addItem(id: string, item: ChatItem): Promise<void>;
    stop(id: string): Promise<void>;
  };
  layout: { get(): Promise<Layout>; set(layout: Layout): Promise<unknown> };
  config: { get(): JigConfig; update(patch: DeepPartial<JigConfig>): Promise<unknown> };
  onChange: (jobs: BuildJob[]) => void;
  notify?: (input: {
    title: string;
    message?: string;
    tone?: "info" | "success" | "warning" | "danger";
  }) => void;
}

const FileSchema = z.object({ jobs: z.array(z.custom<BuildJob>()).default([]) });

/** Build jobs: start a builder session, stage/validate, preview, accept (merge) or discard. */
export class BuildService {
  private jobs: BuildJob[] = [];
  private loaded = false;
  /** Tools per job, kept so the session's tool calls reach the right job. */
  private tools = new Map<string, BuilderTool[]>();

  constructor(private readonly options: BuildServiceOptions) {}

  async load(): Promise<void> {
    if (this.loaded) return;
    this.jobs = (await readJson(this.options.file, FileSchema)).jobs;
    // A builder can't survive a restart: jobs that were working wait for you now.
    for (const job of this.jobs) if (job.status === "working") job.status = "needs_you";
    this.loaded = true;
  }

  list(): BuildJob[] {
    return [...this.jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string): BuildJob {
    const job = this.jobs.find((j) => j.id === id);
    if (!job) throw new JigError("not_found", "Build not found");
    return job;
  }

  private save() {
    void writeJson(this.options.file, { jobs: this.jobs.slice(-200) }).catch((e) =>
      log.error("Saving builds failed", e),
    );
    this.options.onChange(this.list());
  }

  private update(
    id: string,
    patch: Partial<BuildJob>,
    logText?: string,
    tone?: BuildJob["log"][number]["tone"],
  ) {
    const job = this.get(id);
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
    if (logText) job.log.push({ at: job.updatedAt, text: logText, tone });
    this.save();
    return job;
  }

  /** Tools for the builder session of a job (MCP server and fake engine). */
  toolsFor(jobId: string): BuilderTool[] {
    let tools = this.tools.get(jobId);
    if (!tools) {
      tools = builderTools({
        job: () => this.get(jobId),
        update: (patch) => this.update(jobId, patch),
        addons: () => this.options.addons.list(),
        catalogText: () => this.options.addons.catalog(),
        layout: () => this.options.layout.get(),
        config: () => this.options.config.get(),
        startAddon: (id, mode) => this.startAddon(jobId, id, mode),
        validate: async (id) => {
          const job = this.get(jobId);
          const folder = this.addonFolder(job, id);
          return validateAddon(folder, this.options.nodePaths);
        },
        finish: (input) => this.finish(jobId, input),
      });
      this.tools.set(jobId, tools);
    }
    return tools;
  }

  async start(request: BuildRequestInput): Promise<BuildJob> {
    await this.load();
    const id = randomUUID().slice(0, 8);
    const at = new Date().toISOString();
    const job: BuildJob = {
      id,
      goal: request.goal.trim(),
      origin: request.origin,
      originSessionId: request.originSessionId,
      targetAddonId: request.targetAddonId,
      status: "working",
      createdAt: at,
      updatedAt: at,
      validationRounds: 0,
      log: [{ at, text: "Build started" }],
    };
    this.jobs.push(job);
    const dir = join(this.options.workDir, id);
    try {
      if (this.options.addons.repoReady) {
        job.branch = `build/${id}`;
        await createWorktree(this.options.addonsRepo, dir, job.branch);
        job.worktree = dir;
      } else {
        await mkdir(dir, { recursive: true });
        job.log.push({
          at,
          text: "git isn't available: only layout and settings changes are possible.",
          tone: "warning",
        });
      }
      const session = await this.options.sessions.create({
        cwd: dir,
        title: `Build: ${job.goal.slice(0, 50) || "…"}`,
        buildId: id,
      });
      job.sessionId = session.id;
      this.save();
      if (job.originSessionId)
        await this.options.sessions
          .addItem(job.originSessionId, { kind: "build", id: `build:${id}`, at, buildId: id })
          .catch(() => {});
      await this.options.sessions.send(session.id, builderFirstMessage(job.goal, job.targetAddonId));
    } catch (error) {
      this.update(
        id,
        { status: "failed", error: (error as Error).message },
        `Could not start: ${(error as Error).message}`,
        "danger",
      );
    }
    return this.get(id);
  }

  /** The builder session finished a turn; if the job isn't done, it waits for you. */
  sessionTurnEnded(meta: SessionMeta): void {
    const job = this.jobs.find((j) => j.sessionId === meta.id);
    if (job?.status === "working")
      this.update(
        job.id,
        { status: "needs_you" },
        "The builder stopped before finishing. Open its chat to answer or continue.",
        "warning",
      );
  }

  /** You answered in the builder's chat: it's working again. */
  sessionResumed(meta: SessionMeta): void {
    const job = this.jobs.find((j) => j.sessionId === meta.id);
    if (job?.status === "needs_you") this.update(job.id, { status: "working" });
  }

  private addonFolder(job: BuildJob, id: string): string {
    if (!job.worktree)
      throw new JigError(
        "no_git",
        "Add-ons need git (the add-ons folder is a git repository). Install git and try again.",
      );
    return join(job.worktree, job.addonId === id && job.kind === "change-addon" ? this.folderName(id) : id);
  }

  private folderName(id: string): string {
    const addon = this.options.addons.list().find((a) => a.id === id && !a.preview);
    if (addon?.source === "user") return relative(this.options.addonsRepo, addon.dir).split(sep)[0] ?? id;
    return id;
  }

  private async startAddon(jobId: string, id: string, mode: "change" | "new"): Promise<string> {
    const job = this.get(jobId);
    if (!job.worktree)
      throw new JigError(
        "no_git",
        "Add-ons need git (the add-ons folder is a git repository). Install git and try again.",
      );
    const existing = this.options.addons.list().find((a) => a.id === id && !a.preview);
    if (mode === "new") {
      if (existing)
        throw new Error(`An add-on "${id}" already exists. Change it (mode "change") or pick another id.`);
      const folder = join(job.worktree, id);
      await mkdir(folder, { recursive: true });
      this.update(jobId, { kind: "new-addon", addonId: id, level: 2 }, `Creating a new add-on "${id}"`);
      return folder;
    }
    if (!existing) throw new Error(`No add-on "${id}". Use an id from the catalog, or mode "new".`);
    const name = this.folderName(id);
    const folder = join(job.worktree, name);
    if (!(await folderExists(folder))) await copyInto(existing.dir, job.worktree, name);
    this.update(
      jobId,
      { kind: "change-addon", addonId: id, level: 2 },
      existing.source === "builtin"
        ? `Changing the built-in add-on "${id}" (as your own copy)`
        : `Changing your add-on "${id}"`,
    );
    return folder;
  }

  private async finish(
    jobId: string,
    input: { summary: string; kind: BuildKind; addonId?: string; reason?: string; proposal?: string },
  ): Promise<string> {
    const job = this.get(jobId);
    if (input.kind === "app") {
      // Jig doesn't change its own code (D-074): the job ends with the extension point it is missing.
      if (job.worktree && job.branch)
        await removeWorktree(this.options.addonsRepo, job.worktree, job.branch).catch(() => {});
      this.update(
        jobId,
        {
          kind: "app",
          summary: input.summary,
          status: "needs_you",
          worktree: undefined,
          branch: undefined,
          files: [],
          proposal: { reason: input.reason ?? "", proposal: input.proposal ?? "" },
        },
        "No slot can do this yet: the builder proposes a new extension point for Jig.",
        "warning",
      );
      this.options.notify?.({
        title: "A build needs a new extension point in Jig",
        message: job.goal,
        tone: "warning",
      });
      return "Recorded. The user will see your proposal and may add the extension point to Jig themselves. Stop here.";
    }
    if (input.kind === "nothing") {
      this.update(
        jobId,
        { kind: "nothing", summary: input.summary, status: "failed" },
        input.summary,
        "warning",
      );
      return "Recorded: nothing to build.";
    }
    if (input.kind === "layout" || input.kind === "settings") {
      const staged = job.staged ?? {};
      if (!staged.layoutOps?.length && !staged.settings)
        return "Nothing is staged yet. Call stage_layout or stage_settings first.";
      this.update(
        jobId,
        { kind: input.kind, level: 1, summary: input.summary, status: "preview" },
        "Ready to review",
        "success",
      );
      this.options.notify?.({ title: "A build is ready to review", message: input.summary, tone: "success" });
      return "Done. The user will review and accept or discard the change.";
    }
    const addonId = input.addonId ?? job.addonId;
    if (!addonId) return "Which add-on? Call start_addon first, then finish with its addonId.";
    const folder = this.addonFolder(job, addonId);
    const result = await validateAddon(folder, this.options.nodePaths);
    if (!result.ok) {
      const rounds = job.validationRounds + 1;
      if (rounds >= MAX_ROUNDS) {
        this.update(
          jobId,
          { validationRounds: rounds, problems: result.problems, status: "failed" },
          `Still invalid after ${rounds} tries`,
          "danger",
        );
        return `Validation failed ${rounds} times; the build has stopped. Problems:\n- ${result.problems.join("\n- ")}`;
      }
      this.update(
        jobId,
        { validationRounds: rounds, problems: result.problems },
        `Validation found ${result.problems.length} problem(s)`,
        "warning",
      );
      return `Not valid yet (try ${rounds} of ${MAX_ROUNDS}). Fix these, validate, then finish again:\n- ${result.problems.join("\n- ")}`;
    }
    const files = await commitWorktree(job.worktree!, `Build: ${job.goal.slice(0, 70)}`);
    this.update(jobId, {
      kind: input.kind,
      level: 2,
      addonId,
      summary: input.summary,
      files,
      permissions: result.permissions,
      problems: [],
      status: "preview",
    });
    await this.options.addons.setPreview(addonId, { dir: folder, buildId: jobId });
    this.update(jobId, {}, "Ready to review: the add-on is loaded as a preview", "success");
    this.options.notify?.({ title: "A build is ready to review", message: input.summary, tone: "success" });
    return "Done. The add-on is loaded as a preview; the user will accept or discard it.";
  }

  async diff(jobId: string, path: string): Promise<string> {
    const job = this.get(jobId);
    if (!job.worktree) return "";
    return fileDiff(job.worktree, path);
  }

  async accept(jobId: string): Promise<BuildJob> {
    const job = this.get(jobId);
    if (job.status !== "preview") throw new JigError("not_ready", "This build isn't ready to accept");
    try {
      if (job.kind === "layout" && job.staged?.layoutOps?.length) {
        const views = allViews(this.options.addons.list()).map((v) => v.id);
        await this.options.layout.set(
          applyLayoutOps(await this.options.layout.get(), job.staged.layoutOps, views),
        );
      } else if (job.kind === "settings" && job.staged?.settings) {
        const blocked = protectedIn(job.staged.settings);
        if (blocked.length)
          throw new JigError("invalid_args", `Change these in Settings yourself: ${blocked.join(", ")}`);
        await this.options.config.update(job.staged.settings);
      } else if (
        (job.kind === "new-addon" || job.kind === "change-addon") &&
        job.worktree &&
        job.branch &&
        job.addonId
      ) {
        await this.options.addons.setPreview(job.addonId, undefined);
        await mergeBuild(this.options.addonsRepo, job.branch, `Accept build: ${job.goal.slice(0, 70)}`);
        await removeWorktree(this.options.addonsRepo, job.worktree, job.branch);
        await this.options.addons.reloadAll();
      }
      if (job.worktree && job.branch && (job.kind === "layout" || job.kind === "settings"))
        await removeWorktree(this.options.addonsRepo, job.worktree, job.branch).catch(() => {});
    } catch (error) {
      this.update(jobId, {}, `Accept failed: ${(error as Error).message}`, "danger");
      throw new JigError("accept_failed", (error as Error).message);
    }
    if (job.sessionId) await this.options.sessions.stop(job.sessionId).catch(() => {});
    return this.update(jobId, { status: "accepted" }, "Accepted", "success");
  }

  async discard(jobId: string): Promise<BuildJob> {
    const job = this.get(jobId);
    if (job.status === "accepted" || job.status === "discarded") return job;
    if (job.addonId && job.status === "preview")
      await this.options.addons.setPreview(job.addonId, undefined).catch(() => {});
    if (job.worktree && job.branch)
      await removeWorktree(this.options.addonsRepo, job.worktree, job.branch).catch((e) =>
        log.warn("Removing worktree failed", e),
      );
    if (job.sessionId) await this.options.sessions.stop(job.sessionId).catch(() => {});
    return this.update(jobId, { status: "discarded" }, "Discarded");
  }

  /** Files of a build (refreshed from git). */
  async files(jobId: string) {
    const job = this.get(jobId);
    return job.worktree ? changedFiles(job.worktree) : [];
  }
}
