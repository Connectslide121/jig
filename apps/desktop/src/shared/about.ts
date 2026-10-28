/** A Claude Code skill found on this machine (the "What Jig can do" page). */
export interface SkillInfo {
  name: string;
  description: string;
  /** `user`: ~/.claude/skills; `project`: the active project's .claude/skills. */
  scope: "user" | "project";
}
