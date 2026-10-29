import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { z } from "zod";
import type { BuildJob } from "../../shared/builds";
import {
  type DevRequestContext,
  type DevRequestInfo,
  type MailMethod,
  requestEmail,
  requestPrompt,
  requestReadme,
  requestSpec,
  requestTitle,
  requestZipName,
} from "../../shared/devRequest";
import { JigError } from "../../shared/ipc";
import { readJson, writeJson } from "../state/jsonStore";
import type { Mail } from "./mail";

export interface DevRequestDeps {
  /** `~/.jig/dev-requests` */
  dir: string;
  job(id: string): BuildJob;
  context(): DevRequestContext;
  /** Where requests go (`devRequests.email`). */
  recipient(): string;
  openMail(mail: Mail, attachment: string, draftsDir: string): Promise<MailMethod>;
}

const InfoSchema = z.object({ emailedAt: z.string().optional() }).passthrough();

/**
 * Development requests (D-119): the package for a build that needs a change in Jig's source, and the
 * email that carries it. A package is written again each time (the build's proposal is the source).
 */
export class DevRequestService {
  constructor(private readonly deps: DevRequestDeps) {}

  /** Writes the package for a build: `<dir>/<build id>/` with its files, and the zip beside them. */
  async create(buildId: string): Promise<DevRequestInfo> {
    const job = this.deps.job(buildId);
    const p = job.proposal;
    if (job.kind !== "app" || !p) throw new JigError("not_found", "This build doesn't need a change in Jig");
    const folder = join(this.deps.dir, buildId);
    const infoFile = join(folder, "request.json");
    const before = await readJson(infoFile, InfoSchema).catch(() => ({ emailedAt: undefined }));
    const ctx = this.deps.context();
    const title = requestTitle(job.goal, p);
    const spec = requestSpec(job, p, ctx);
    const files: Record<string, string> = {
      "README.md": requestReadme(title, Boolean(p.mockupHtml)),
      "SPEC.md": spec,
      "PROMPT.md": requestPrompt(spec, Boolean(p.mockupHtml)),
      "context.json": `${JSON.stringify({ ...ctx, goal: job.goal, buildId }, null, 2)}\n`,
      ...(p.mockupHtml ? { "mockup.html": p.mockupHtml } : {}),
    };
    await rm(join(folder, "files"), { recursive: true, force: true });
    await mkdir(join(folder, "files"), { recursive: true });
    for (const [name, text] of Object.entries(files))
      await writeFile(join(folder, "files", name), text, "utf8");
    const zipName = requestZipName(title, buildId);
    const top = zipName.replace(/\.zip$/, "");
    const zip = zipSync(
      Object.fromEntries(Object.entries(files).map(([n, t]) => [`${top}/${n}`, strToU8(t)])),
    );
    const zipPath = join(folder, zipName);
    // A zip of an earlier title of this request.
    for (const old of await readdir(folder))
      if (old.endsWith(".zip") && old !== zipName) await rm(join(folder, old), { force: true });
    await writeFile(zipPath, zip);
    const info: DevRequestInfo = {
      id: buildId,
      title,
      zipPath,
      folder: join(folder, "files"),
      hasMockup: Boolean(p.mockupHtml),
      createdAt: ctx.createdAt,
      emailedAt: before.emailedAt,
    };
    await writeJson(infoFile, info);
    return info;
  }

  /** Makes the package and opens a new email to the developers with it attached. */
  async email(buildId: string): Promise<{ info: DevRequestInfo; method: MailMethod; to: string }> {
    const info = await this.create(buildId);
    const to = this.deps.recipient();
    const zipName = info.zipPath.split(/[\\/]/).pop()!;
    const method = await this.deps.openMail(
      requestEmail(info.title, to, zipName),
      info.zipPath,
      join(this.deps.dir, buildId),
    );
    const next = { ...info, emailedAt: new Date().toISOString() };
    await writeJson(join(this.deps.dir, buildId, "request.json"), next);
    return { info: next, method, to };
  }

  /** The text of PROMPT.md, to copy. */
  async prompt(buildId: string): Promise<string> {
    const info = await this.create(buildId);
    return readFile(join(info.folder, "PROMPT.md"), "utf8");
  }
}
