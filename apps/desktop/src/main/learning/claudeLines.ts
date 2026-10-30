import { isAbsolute, join } from "node:path";
import { aiLineHashes, lineHash } from "@jig/learning";
import type { Engine } from "../engine/types";
import { ANYWHERE, pathKey } from "./worked";

/**
 * The lines Claude wrote anywhere, not only in Jig's chats (D-162): the Write, Edit and MultiEdit
 * calls, and the commands (`python`, heredocs, `sed`), in the conversations Claude Code saved on
 * this computer (its terminal, the desktop app, IDEs), whole transcripts and subagents' included
 * (`savedToolUses`). Each chat is read once and kept until it changes.
 */
const WRITERS = new Set(["Write", "Edit", "MultiEdit"]);
/** Commands Claude wrote text into files with (`python`, heredocs, `sed`): their long lines count anywhere. */
const SHELLS = new Set(["Bash", "PowerShell"]);
/** Shorter lines are common to everyone's code (`});`, `return;`): not taken from commands. */
const MIN_COMMAND_LINE = 20;
/** Chats read at the same time. */
const PARALLEL = 3;

interface Cached {
  /** The chat's last change when it was read. */
  modified: number;
  files: Map<string, Set<string>>;
}
const cache = new Map<string, Cached>();

type Reader = Pick<Engine, "savedSessions" | "savedToolUses">;

async function linesOf(engine: Reader, sessionId: string, cwd: string | undefined) {
  const files = new Map<string, Set<string>>();
  for (const { name, input } of await engine.savedToolUses(sessionId)) {
    if (SHELLS.has(name) && typeof input.command === "string") {
      const set = files.get(ANYWHERE) ?? new Set<string>();
      for (const line of input.command.split("\n")) {
        const hash = line.trim().length >= MIN_COMMAND_LINE ? lineHash(line) : undefined;
        if (hash) set.add(hash);
      }
      if (set.size) files.set(ANYWHERE, set);
      continue;
    }
    if (!WRITERS.has(name)) continue;
    const file = typeof input.file_path === "string" ? input.file_path : undefined;
    if (!file || (!isAbsolute(file) && !cwd)) continue;
    const key = pathKey(isAbsolute(file) ? file : join(cwd as string, file));
    const set = files.get(key) ?? new Set<string>();
    const anywhere = files.get(ANYWHERE) ?? new Set<string>();
    const texts = [
      input.content,
      input.new_string,
      ...(Array.isArray(input.edits)
        ? input.edits.map((e) => (e as { new_string?: unknown }).new_string)
        : []),
    ];
    for (const hash of aiLineHashes(name, input)) set.add(hash);
    // A script Claude wrote often carries the real code in its strings: its long lines count in
    // every file, not only in the script.
    for (const text of texts)
      if (typeof text === "string")
        for (const line of text.split("\n")) {
          const hash = line.trim().length >= MIN_COMMAND_LINE ? lineHash(line) : undefined;
          if (hash) anywhere.add(hash);
        }
    files.set(key, set);
    if (anywhere.size) files.set(ANYWHERE, anywhere);
  }
  return files;
}

/** File (as `pathKey` makes it) → hashes of the lines Claude wrote there, from chats changed since `since`. */
export async function claudeWrittenLines(engine: Reader, since: Date): Promise<Map<string, Set<string>>> {
  const sessions = (await engine.savedSessions({ limit: 500 })).filter(
    (s) => s.lastModified >= since.getTime(),
  );
  const out = new Map<string, Set<string>>();
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, sessions.length) }, async () => {
      while (next < sessions.length) {
        const session = sessions[next++]!;
        let entry = cache.get(session.sessionId);
        if (!entry || entry.modified !== session.lastModified) {
          // A chat that can't be read is left out; the next run tries it again.
          const files = await linesOf(engine, session.sessionId, session.cwd).catch(() => undefined);
          if (!files) continue;
          entry = { modified: session.lastModified, files };
          cache.set(session.sessionId, entry);
        }
        for (const [file, hashes] of entry.files) {
          const set = out.get(file) ?? new Set<string>();
          for (const h of hashes) set.add(h);
          out.set(file, set);
        }
      }
    }),
  );
  return out;
}

/** For tests: forget what was read. */
export function forgetClaudeLines(): void {
  cache.clear();
}
