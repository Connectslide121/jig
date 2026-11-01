import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import {
  SPEECH_COMMON_FILES,
  SPEECH_MODEL_IDS,
  SPEECH_MODELS,
  SPEECH_VARIANTS,
  type SpeechModel,
  type SpeechModelStatus,
  type SpeechVariant,
  speechFiles,
} from "../../shared/speech";
import { renameWithRetry } from "../state/jsonStore";

const MODEL_OF_REPO = new Map<string, SpeechModel>(SPEECH_MODEL_IDS.map((m) => [SPEECH_MODELS[m].repo, m]));
const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

/**
 * `jig-speech://hf/<org>/<model>/<file>` → the model and file, or undefined for anything else
 * (other repos, `..`, deeper paths). Only Jig's speech models are served.
 */
export function parseModelUrl(url: string): { model: SpeechModel; repo: string; file: string } | undefined {
  let parsed: URL;
  let path: string;
  try {
    parsed = new URL(url);
    path = decodeURIComponent(parsed.pathname);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "jig-speech:" || parsed.host !== "hf") return undefined;
  const match = /^\/([^/]+\/[^/]+)\/(.+)$/.exec(path);
  const model = match && MODEL_OF_REPO.get(match[1]!);
  if (!match || !model) return undefined;
  const parts = match[2]!.split("/");
  if (parts.length > 2 || !parts.every((p) => SEGMENT.test(p) && !p.includes(".."))) return undefined;
  return { model, repo: match[1]!, file: parts.join("/") };
}

function contentType(file: string): string {
  return file.endsWith(".json") ? "application/json" : "application/octet-stream";
}

type Fetch = (url: string) => Promise<Response>;
export type DownloadProgress = (model: SpeechModel, loaded: number, total: number) => void;

class NotOnServer extends Error {}

/**
 * Speech models in `<root>/<org>/<model>/`. A file the worker asks for is served from disk, or first
 * downloaded from Hugging Face and kept (progress through `onProgress`). Once a model's description
 * files are there, a JSON file it lacks is an optional one the repo doesn't have: no going online.
 * Weight files are always fetched when missing (the other variant's weights, the first time).
 */
export class SpeechModels {
  private readonly downloads = new Map<string, Promise<void>>();
  private readonly progress = new Map<SpeechModel, Map<string, { loaded: number; total: number }>>();

  constructor(
    private readonly root: string,
    private readonly fetchUpstream: Fetch,
    private readonly onProgress: DownloadProgress = () => undefined,
    private readonly upstream = "https://huggingface.co",
  ) {}

  private dir(repo: string): string {
    return join(this.root, ...repo.split("/"));
  }

  async status(model: SpeechModel): Promise<SpeechModelStatus> {
    const repo = SPEECH_MODELS[model].repo;
    const variants: SpeechVariant[] = [];
    for (const variant of SPEECH_VARIANTS)
      if (await this.has(repo, speechFiles(variant))) variants.push(variant);
    return { model, downloaded: variants.length > 0, variants, bytes: await folderSize(this.dir(repo)) };
  }

  list(): Promise<SpeechModelStatus[]> {
    return Promise.all(SPEECH_MODEL_IDS.map((m) => this.status(m)));
  }

  async remove(model: SpeechModel): Promise<void> {
    await rm(this.dir(SPEECH_MODELS[model].repo), { recursive: true, force: true });
  }

  private async has(repo: string, files: readonly string[]): Promise<boolean> {
    const dir = this.dir(repo);
    const present = await Promise.all(
      files.map((f) =>
        stat(join(dir, f)).then(
          (s) => s.isFile(),
          () => false,
        ),
      ),
    );
    return present.every(Boolean);
  }

  /** Answers a `jig-speech:` request. */
  async serve(url: string): Promise<Response> {
    const target = parseModelUrl(url);
    if (!target) return new Response("Not found", { status: 404 });
    const file = join(this.dir(target.repo), ...target.file.split("/"));
    const headers = { "content-type": contentType(file), "access-control-allow-origin": "*" };
    let local = await stat(file).catch(() => undefined);
    if (!local?.isFile()) {
      if (!target.file.startsWith("onnx/") && (await this.has(target.repo, SPEECH_COMMON_FILES)))
        return new Response("Not found", { status: 404, headers });
      try {
        await this.download(target.model, target.repo, target.file, file);
      } catch (error) {
        if (error instanceof NotOnServer) return new Response("Not found", { status: 404, headers });
        return new Response(`Couldn't download the speech model: ${errorText(error)}`, {
          status: 502,
          headers,
        });
      }
      local = await stat(file).catch(() => undefined);
      if (!local?.isFile()) return new Response("Not found", { status: 404, headers });
    }
    const body = Readable.toWeb(createReadStream(file)) as unknown as ReadableStream<Uint8Array>;
    return new Response(body, { headers: { ...headers, "content-length": String(local.size) } });
  }

  /** One download per file, however many requests ask for it meanwhile. */
  private download(model: SpeechModel, repo: string, name: string, file: string): Promise<void> {
    let running = this.downloads.get(file);
    if (!running) {
      running = this.fetchToDisk(model, repo, name, file).finally(() => this.downloads.delete(file));
      this.downloads.set(file, running);
    }
    return running;
  }

  private async fetchToDisk(model: SpeechModel, repo: string, name: string, file: string): Promise<void> {
    const response = await this.fetchUpstream(`${this.upstream}/${repo}/resolve/main/${name}`);
    if (response.status === 404) throw new NotOnServer();
    if (!response.ok || !response.body) throw new Error(`${response.status} ${response.statusText}`.trim());
    const files = this.progress.get(model) ?? new Map();
    this.progress.set(model, files);
    const entry = { loaded: 0, total: Number(response.headers.get("content-length")) || 0 };
    files.set(name, entry);
    const report = () => {
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += Math.max(f.total, f.loaded);
      }
      this.onProgress(model, loaded, total);
    };
    const count = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        entry.loaded += chunk.length;
        report();
        done(null, chunk);
      },
    });
    await mkdir(dirname(file), { recursive: true });
    const part = `${file}.${process.pid}.${Date.now()}.part`;
    try {
      await pipeline(
        Readable.fromWeb(response.body as WebReadableStream<Uint8Array>),
        count,
        createWriteStream(part),
      );
      await renameWithRetry(part, file);
    } catch (error) {
      await rm(part, { force: true });
      throw error;
    } finally {
      if (this.downloads.size <= 1) this.progress.delete(model);
    }
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function folderSize(dir: string): Promise<number> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true }).catch(() => []);
  const sizes = await Promise.all(
    entries
      .filter((e) => e.isFile() && !e.name.endsWith(".part"))
      .map((e) =>
        stat(join(e.parentPath, e.name)).then(
          (s) => s.size,
          () => 0,
        ),
      ),
  );
  return sizes.reduce((a, b) => a + b, 0);
}
