import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

/**
 * Your personal instructions in Codex chats (D-312). Claude Code reads `~/.claude/CLAUDE.md`, which
 * may only import other files (`@~/.agents/AGENTS.md`); Codex has no imports and reads
 * `$CODEX_HOME/AGENTS.md`. So that one file stays the source, Jig reads CLAUDE.md with its imports
 * followed, the way Claude Code does, and gives the text to each Codex chat as developer
 * instructions. No copy is written anywhere.
 */

/** Claude Code follows imports this many hops deep. */
const MAX_DEPTH = 5;

/** An `@path` import: at the start of the text or after whitespace (so `name@example.com` isn't one). */
const IMPORT = /(^|\s)@((?:~[\\/]|\.{1,2}[\\/]|[\\/]|[A-Za-z]:[\\/])?[^\s`]+)/g;

/**
 * The text with each `@path` that names a readable file replaced by that file's text (imports in it
 * followed too, up to five hops, never in a cycle). Paths are relative to the importing file;
 * `~/` is the home folder. Imports inside code spans and fenced code blocks are left alone, like
 * anything that doesn't name a file.
 */
export function expandImports(
  text: string,
  file: string,
  read: (path: string) => string | undefined,
  home: string,
  depth = 0,
  seen: ReadonlySet<string> = new Set([resolve(file)]),
): string {
  let fenced = false;
  return text
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced;
        return line;
      }
      if (fenced || depth >= MAX_DEPTH) return line;
      // Odd parts are inside `code spans`.
      return line
        .split("`")
        .map((part, i) =>
          i % 2
            ? part
            : part.replace(IMPORT, (match, lead: string, target: string) => {
                const path = target.startsWith("~")
                  ? join(home, target.slice(2))
                  : isAbsolute(target)
                    ? target
                    : resolve(dirname(file), target);
                const full = resolve(path);
                if (seen.has(full)) return match;
                const content = read(full);
                if (content === undefined) return match;
                const expanded = expandImports(
                  content,
                  full,
                  read,
                  home,
                  depth + 1,
                  new Set([...seen, full]),
                );
                return `${lead}${expanded.trim()}`;
              }),
        )
        .join("`");
    })
    .join("\n");
}

const readText = (path: string): string | undefined => {
  try {
    const text = readFileSync(path, "utf8");
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  } catch {
    return undefined;
  }
};

export interface PersonalInstructionsOptions {
  env: Record<string, string | undefined>;
  home?: string;
  read?: (path: string) => string | undefined;
}

/**
 * Your personal Claude Code instructions for a Codex chat (`engine.codexInstructions` = `claude`):
 * `CLAUDE.md` in Claude Code's config folder (`CLAUDE_CONFIG_DIR`, else `~/.claude`) with its imports
 * followed. Undefined when there's none, or when Codex's own `AGENTS.md` (`CODEX_HOME`, else
 * `~/.codex`) already says the same, so nothing is said twice.
 */
export function personalInstructions(options: PersonalInstructionsOptions): string | undefined {
  const home = options.home ?? homedir();
  const read = options.read ?? readText;
  const claudeDir = options.env.CLAUDE_CONFIG_DIR || join(home, ".claude");
  const file = join(claudeDir, "CLAUDE.md");
  const source = read(file);
  if (source === undefined) return undefined;
  const text = expandImports(source, file, read, home).trim();
  if (!text) return undefined;
  const codexHome = options.env.CODEX_HOME || join(home, ".codex");
  const own = read(join(codexHome, "AGENTS.md"))?.trim();
  if (own && own.replace(/\r\n/g, "\n") === text.replace(/\r\n/g, "\n")) return undefined;
  return text;
}
