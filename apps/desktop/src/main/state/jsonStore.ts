import { appendFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { z } from "zod";

/**
 * Reads a JSON state file and validates it. A missing file yields the schema's defaults (parse of
 * `{}` or the given fallback); an invalid file is kept aside as `<file>.invalid-<time>` and defaults are
 * used, so a hand-edit mistake never stops Jig from starting.
 */
export async function readJson<S extends z.ZodType>(
  file: string,
  schema: S,
  fallback: unknown = {},
): Promise<z.infer<S>> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return schema.parse(fallback);
    throw error;
  }
  try {
    return schema.parse(JSON.parse(raw));
  } catch {
    await rename(file, `${file}.invalid-${Date.now()}`).catch(() => {});
    return schema.parse(fallback);
  }
}

const queues = new Map<string, Promise<void>>();

/**
 * Windows: an antivirus scanner or the search indexer can hold a file for a moment, so replacing it
 * fails with EPERM/EBUSY/EACCES. Try again a few times before giving up.
 */
export async function renameWithRetry(from: string, to: string, attempts = 6): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (i >= attempts || !["EPERM", "EBUSY", "EACCES"].includes(code ?? "")) throw error;
      await new Promise((r) => setTimeout(r, 20 * 2 ** i));
    }
  }
}

/** Writes JSON atomically (temp file + rename). Writes to the same file are serialised. */
export function writeJson(file: string, value: unknown): Promise<void> {
  return writeText(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** Writes a text state file (e.g. `profile.md`) atomically. Writes to the same file are serialised. */
export function writeText(file: string, text: string): Promise<void> {
  return enqueue(file, async () => {
    await mkdir(dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    try {
      await writeFile(temp, text, "utf8");
      await renameWithRetry(temp, file);
    } catch (error) {
      await rm(temp, { force: true }).catch(() => {});
      throw error;
    }
  });
}

/** Runs `work` after the earlier writes to `file`; the queue entry goes once nothing waits on it. */
function enqueue(file: string, work: () => Promise<void>): Promise<void> {
  const next = (queues.get(file) ?? Promise.resolve()).then(work);
  const settled = next.catch(() => {});
  queues.set(file, settled);
  void settled.then(() => {
    if (queues.get(file) === settled) queues.delete(file);
  });
  return next;
}

/** Appends one line to a log file (JSONL). Appends to the same file are serialised. */
export function appendLine(file: string, line: string): Promise<void> {
  return enqueue(file, async () => {
    await mkdir(dirname(file), { recursive: true });
    await appendFile(file, `${line.replace(/\n/g, " ")}\n`, "utf8");
  });
}
