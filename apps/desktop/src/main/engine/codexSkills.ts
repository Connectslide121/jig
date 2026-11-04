import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Claude Code's skills in Codex chats (D-315). Codex finds its own skills itself (`.agents/skills` in
 * the repository, `~/.agents/skills`, `~/.codex/skills`) and reads AGENTS.md natively. With
 * `engine.codexSkills` on, a Codex chat also gets the skills a Claude chat in the same folder would
 * have: `.claude/skills` from the folder up to its repository's root, `~/.claude/skills` and Jig's
 * built-in skills (the chat's skill plugins). They are passed to Codex as extra skill roots
 * (`skills/extraRoots/set`), one per skill folder, so nothing is copied and a skill Codex already
 * has under the same name isn't listed twice.
 */
export interface SkillFolder {
  name: string;
  dir: string;
}

/** A skill's name: its SKILL.md front matter `name:`, else its folder's name. */
export function skillName(skillMd: string, folder: string): string {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(skillMd)?.[1] ?? "";
  const name = /^name:\s*["']?([^"'\r\n]+?)["']?\s*$/m.exec(front)?.[1]?.trim();
  return name || folder;
}

interface Fs {
  exists: (path: string) => boolean;
  list: (dir: string) => string[];
  read: (path: string) => string;
}

const realFs: Fs = {
  exists: existsSync,
  list: (dir) => {
    try {
      return readdirSync(dir);
    } catch {
      return [];
    }
  },
  read: (path) => readFileSync(path, "utf8"),
};

/** The skill folders (with a SKILL.md) directly in `root`. */
function skillsIn(root: string, fs: Fs): SkillFolder[] {
  return fs.list(root).flatMap((folder) => {
    const md = join(root, folder, "SKILL.md");
    if (!fs.exists(md)) return [];
    try {
      return [{ name: skillName(fs.read(md), folder), dir: join(root, folder) }];
    } catch {
      return [];
    }
  });
}

/** The folders whose `.claude/skills` Claude Code reads for `cwd`: it and its parents up to the repository root. */
export function projectFolders(cwd: string, fs: Pick<Fs, "exists"> = realFs): string[] {
  const folders: string[] = [];
  for (let dir = cwd; ; dir = dirname(dir)) {
    folders.push(dir);
    if (fs.exists(join(dir, ".git")) || dirname(dir) === dir) break;
  }
  // No repository above: only the folder itself.
  return fs.exists(join(folders[folders.length - 1]!, ".git")) ? folders : [cwd];
}

/** Claude Code's skills for a chat in `cwd`, nearest first (a name found twice keeps the nearest). */
export function claudeSkillFolders(
  options: { cwd: string; home: string; plugins?: Array<{ path: string }> },
  fs: Fs = realFs,
): SkillFolder[] {
  const roots = [
    ...projectFolders(options.cwd, fs).map((dir) => join(dir, ".claude", "skills")),
    join(options.home, ".claude", "skills"),
    ...(options.plugins ?? []).map((p) => join(p.path, "skills")),
  ];
  const seen = new Set<string>();
  return roots
    .flatMap((root) => skillsIn(root, fs))
    .filter((s) => {
      if (seen.has(s.name)) return false;
      seen.add(s.name);
      return true;
    });
}

/** The skill folders to add to Codex: the ones whose name Codex doesn't have already. */
export function missingSkills(folders: SkillFolder[], codexNames: Iterable<string>): string[] {
  const have = new Set(codexNames);
  return folders.filter((s) => !have.has(s.name)).map((s) => s.dir);
}
