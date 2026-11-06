import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { JigConfig } from "../../shared/config";
import { type LibrarySkill, type SkillDetails, skillEnabled } from "../../shared/skills";

/** Only catalogued, packaged paths are exposed; no project files or global Claude setup are changed. */
export class SkillLibrary {
  constructor(
    readonly root: string,
    readonly catalog: LibrarySkill[],
  ) {}

  plugins(config: JigConfig, projectId?: string) {
    return this.catalog
      .filter((skill) => skillEnabled(config, skill.id, projectId, skill.defaultEnabled))
      .map((skill) => ({ type: "local" as const, path: join(this.root, skill.id) }));
  }

  context(config: JigConfig, projectId?: string): string {
    const enabled = this.catalog.filter((skill) =>
      skillEnabled(config, skill.id, projectId, skill.defaultEnabled),
    );
    return `Jig's bundled skills currently enabled for this chat: ${enabled.map((s) => `jig-${s.id}:${s.skillName}`).join(", ") || "none"}. Use relevant skills through Claude Code's Skill tool, respecting the project's actual stack/version, existing conventions and the user's instructions. Do not apply every skill to every task. Disabled Jig skills are not active guidance, even if they appeared earlier in this conversation. Your personal and project skills remain independent.`;
  }

  async details(id: string): Promise<SkillDetails> {
    const skill = this.catalog.find((s) => s.id === id);
    if (!skill) throw new Error("Unknown library skill");
    const instructions = await readFile(
      join(this.root, skill.id, "skills", skill.skillName, "SKILL.md"),
      "utf8",
    );
    return { ...skill, instructions };
  }
}
