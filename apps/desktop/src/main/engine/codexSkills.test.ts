import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { claudeSkillFolders, missingSkills, projectFolders, skillName } from "./codexSkills";

/** A fake file system: paths that exist (SKILL.md files with their text, and folders). */
function fakeFs(files: Record<string, string>, dirs: string[]) {
  const all = [...Object.keys(files), ...dirs];
  return {
    exists: (p: string) => all.includes(p),
    list: (dir: string) => [
      ...new Set(
        all
          .map((p) => relative(dir, p))
          .filter((r) => r && !r.startsWith("..") && !r.includes(":"))
          .map((r) => r.split(sep)[0]!),
      ),
    ],
    read: (p: string) => files[p] ?? "",
  };
}

const md = (dir: string, name: string) => ({ [join(dir, name, "SKILL.md")]: `---\nname: ${name}\n---` });

describe("Claude Code's skills in Codex chats (D-315)", () => {
  it("names a skill from its front matter, else its folder", () => {
    expect(skillName("---\nname: release\ndescription: x\n---\nBody", "folder")).toBe("release");
    expect(skillName('---\nname: "quoted"\n---', "folder")).toBe("quoted");
    expect(skillName("No front matter", "folder")).toBe("folder");
  });

  it("reads .claude/skills from the folder up to the repository root", () => {
    const repo = join("/w", "shop");
    expect(projectFolders(join(repo, "web"), fakeFs({}, [join(repo, ".git")]))).toEqual([
      join(repo, "web"),
      repo,
    ]);
    expect(projectFolders(join("/x", "y"), fakeFs({}, []))).toEqual([join("/x", "y")]);
  });

  it("collects project, personal and built-in skills, nearest first, and skips what Codex has", () => {
    const repo = join("/w", "shop");
    const home = join("/h");
    const fs = fakeFs(
      {
        ...md(join(repo, ".claude", "skills"), "release"),
        ...md(join(home, ".claude", "skills"), "release"),
        ...md(join(home, ".claude", "skills"), "notes"),
        ...md(join("/p", "skills"), "frontend-design"),
      },
      [join(repo, ".git")],
    );
    const folders = claudeSkillFolders({ cwd: repo, home, plugins: [{ path: join("/p") }] }, fs);
    expect(folders.map((f) => f.name)).toEqual(["release", "notes", "frontend-design"]);
    expect(folders[0]!.dir).toBe(join(repo, ".claude", "skills", "release"));
    expect(missingSkills(folders, ["notes"])).toEqual([
      join(repo, ".claude", "skills", "release"),
      join("/p", "skills", "frontend-design"),
    ]);
  });
});
