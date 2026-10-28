import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listSkills, parseSkillFrontMatter } from "./skills";

describe("skills", () => {
  it("reads name and description from front matter", () => {
    expect(
      parseSkillFrontMatter('---\nname: review\ndescription: "Review a PR"\nother: x\n---\nBody'),
    ).toEqual({
      name: "review",
      description: "Review a PR",
    });
    expect(parseSkillFrontMatter("No front matter")).toEqual({});
  });

  it("lists user and project skills", async () => {
    const root = await mkdtemp(join(tmpdir(), "jig-skills-"));
    const home = join(root, "home");
    const project = join(root, "shop");
    await mkdir(join(home, ".claude", "skills", "deploy"), { recursive: true });
    await writeFile(
      join(home, ".claude", "skills", "deploy", "SKILL.md"),
      "---\nname: deploy\ndescription: Deploy to Azure\n---\n",
    );
    await mkdir(join(home, ".claude", "skills", "notes"), { recursive: true }); // no SKILL.md
    await mkdir(join(project, ".claude", "skills", "seed"), { recursive: true });
    await writeFile(
      join(project, ".claude", "skills", "seed", "SKILL.md"),
      "---\ndescription: Seed the database\n---\n",
    );
    expect(await listSkills(project, home)).toEqual([
      { name: "deploy", description: "Deploy to Azure", scope: "user" },
      { name: "seed", description: "Seed the database", scope: "project" },
    ]);
  });
});
