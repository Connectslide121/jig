import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SkillInfo } from "../../shared/about";

/** `name` and `description` from a SKILL.md's YAML front matter (simple `key: value` lines). */
export function parseSkillFrontMatter(text: string): { name?: string; description?: string } {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
  if (!block) return {};
  const out: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const m = /^(name|description):\s*(.*)$/.exec(line);
    if (m) out[m[1]!] = m[2]!.trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

async function skillsIn(dir: string, scope: SkillInfo["scope"]): Promise<SkillInfo[]> {
  let folders: string[];
  try {
    folders = await readdir(dir);
  } catch {
    return [];
  }
  const out: SkillInfo[] = [];
  for (const folder of folders.sort()) {
    try {
      const meta = parseSkillFrontMatter(await readFile(join(dir, folder, "SKILL.md"), "utf8"));
      out.push({ name: meta.name || folder, description: meta.description ?? "", scope });
    } catch {
      // Not a skill folder.
    }
  }
  return out;
}

/**
 * Claude Code skills Jig's chats can use: yours (`~/.claude/skills`) and the active project's
 * (`.claude/skills`). Only SKILL.md front matter is read.
 */
export async function listSkills(projectPath: string | undefined, home = homedir()): Promise<SkillInfo[]> {
  return [
    ...(await skillsIn(join(home, ".claude", "skills"), "user")),
    ...(projectPath ? await skillsIn(join(projectPath, ".claude", "skills"), "project") : []),
  ];
}
