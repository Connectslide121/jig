import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
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

/** Writes JSON atomically (temp file + rename). Writes to the same file are serialised. */
export function writeJson(file: string, value: unknown): Promise<void> {
  const previous = queues.get(file) ?? Promise.resolve();
  const next = previous.then(async () => {
    await mkdir(dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(temp, file);
  });
  queues.set(
    file,
    next.catch(() => {}),
  );
  return next;
}

/** Appends one line to a log file (JSONL). Appends to the same file are serialised. */
export function appendLine(file: string, line: string): Promise<void> {
  const previous = queues.get(file) ?? Promise.resolve();
  const next = previous.then(async () => {
    await mkdir(dirname(file), { recursive: true });
    await appendFile(file, `${line.replace(/\n/g, " ")}\n`, "utf8");
  });
  queues.set(
    file,
    next.catch(() => {}),
  );
  return next;
}
