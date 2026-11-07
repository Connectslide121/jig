import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../../shared/config";
import type { LibrarySkill } from "../../shared/skills";
import { SkillLibrary } from "./library";

const skill: LibrarySkill = {
  id: "design",
  title: "Design",
  category: "UI",
  description: "UI guidance",
  skillName: "design",
  author: "Jig",
  source: "https://example.com",
  revision: "1",
  license: "Jig",
};
describe("native skill library", () => {
  it("selects separate plugin paths by caller project and refuses arbitrary detail paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "jig-skills-"));
    const folder = join(root, "design", "skills", "design");
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, "SKILL.md"), "---\nname: design\n---\n# Design");
    const library = new SkillLibrary(root, [skill]);
    const config = defaultConfig();
    expect(library.plugins(config, "shop")).toEqual([{ type: "local", path: join(root, "design") }]);
    config.skills.overrides.design = { enabled: true, excludedProjects: ["shop"] };
    expect(library.plugins(config, "shop")).toEqual([]);
    expect(library.plugins(config, "blog")).toHaveLength(1);
    expect(library.context(config, "shop")).toContain("none");
    expect(library.context(config, "blog")).toContain("jig-design:design");
    expect((await library.details("design")).instructions).toContain("# Design");
    await expect(library.details("../config.json")).rejects.toThrow("Unknown library skill");
  });
  it("ships all fourteen self-contained entrypoints, manifests, pins and upstream licences, without hooks", async () => {
    const root = join(process.cwd(), "skills");
    const catalog = JSON.parse(await readFile(join(root, "catalog.json"), "utf8")) as LibrarySkill[];
    expect(catalog).toHaveLength(15);
    const library = new SkillLibrary(root, catalog);
    for (const s of catalog) {
      expect((await library.details(s.id)).instructions).toContain(`name: ${s.skillName}`);
      const plugin = JSON.parse(await readFile(join(root, s.id, ".claude-plugin", "plugin.json"), "utf8"));
      expect(plugin.name).toBe(`jig-${s.id}`);
      expect(Object.keys(plugin).sort()).toEqual(["author", "description", "name", "version"]);
      expect((await readdir(join(root, s.id))).sort()).toEqual(
        s.author === "Jig" ? [".claude-plugin", "skills"] : [".claude-plugin", "LICENSE.txt", "skills"],
      );
      if (s.author !== "Jig") {
        expect(s.revision).toMatch(/^[0-9a-f]{40}$/);
        expect(await readFile(join(root, s.id, "LICENSE.txt"), "utf8")).toMatch(/Permission|Apache/);
      }
    }
    // Factory's skills start off (D-443); the rest stay on.
    expect(catalog.filter((s) => s.defaultEnabled === false).map((s) => s.id)).toEqual([
      "web-artifacts",
      "theme-factory",
      "webapp-testing",
      "web-design-guidelines",
      "impeccable",
      "demo-quality",
    ]);
    expect(library.plugins(defaultConfig()).map((p) => p.path)).not.toContain(join(root, "demo-quality"));
  });
});
