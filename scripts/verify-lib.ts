/**
 * When a TypeScript project can skip its type-check in `npm run verify` (D-421): its inputs are every file
 * the last passing run's program read (listed in the project's .tsbuildinfo, node_modules typings and
 * TypeScript's own lib files included) plus `extra` (the tsconfig text and the repository's file list, so
 * a new or removed file anywhere runs it again). Same inputs as the last pass means the same result.
 */
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface InputsStamp {
  stamp: string;
  /** The newest modification time among the inputs (ms), to tell a file changed during the run. */
  newest: number;
}

/** Null when there's no build info yet or one of its files is gone: the project must run. */
export function inputsStamp(buildInfoFile: string, extra: string): InputsStamp | null {
  let fileNames: string[];
  try {
    const info = JSON.parse(readFileSync(buildInfoFile, "utf8")) as { fileNames?: unknown };
    if (!Array.isArray(info.fileNames) || info.fileNames.length === 0) return null;
    fileNames = info.fileNames.filter((f): f is string => typeof f === "string");
  } catch {
    return null;
  }
  const base = dirname(buildInfoFile);
  const hash = createHash("sha256").update(extra).update("\0");
  let newest = 0;
  for (const name of fileNames) {
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(resolve(base, name));
    } catch {
      return null;
    }
    newest = Math.max(newest, stat.mtimeMs);
    hash.update(`${name}\0${stat.size}\0${stat.mtimeMs}\0`);
  }
  return { stamp: hash.digest("hex"), newest };
}
