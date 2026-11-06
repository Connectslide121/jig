import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import track from "../tracks/new-idea.json";
import { parseFrontMatter } from "./frontmatter";
import { recipeFor, type Track } from "./graph";
import {
  insideFolder,
  marker,
  outputPaths,
  parseRecipe,
  resolveRecipes,
  stagePrompt,
  validateRecipe,
} from "./recipes";

const DIR = join(__dirname, "..", "recipes");
const builtIns = readdirSync(DIR)
  .filter((f) => f.endsWith(".md"))
  .map((f) => parseRecipe(readFileSync(join(DIR, f), "utf8"), f));
const kinds = builtIns.map((r) => r.kind);

const PITCH = `---
id: pitch
role: Sales enablement
inputs: [brief, demo.approved, kit.glossary]
outputs: [sales/pitch.md]
provider: chatgpt
model: default
reviewer: G4
checks: [frontmatter, words<=600]
languageGroup: sales
---
Write the pitch.
`;

describe("the built-in recipes", () => {
  it("are all valid, one file per id", () => {
    expect(builtIns.flatMap((r) => validateRecipe(r, kinds))).toEqual([]);
    expect(new Set(builtIns.map((r) => r.id)).size).toBe(builtIns.length);
    for (const r of builtIns) expect(`${r.id}.md`).toBe(r.file);
  });

  it("cover every stage of the new-idea track and every output the plan offers", () => {
    const ids = new Set(builtIns.map((r) => r.id));
    for (const item of (track as Track).stages)
      if (item.recipe && !item.person)
        for (const level of ["L1", "L2", "L3"] as const) expect(ids).toContain(recipeFor(item.recipe, level));
    for (const out of ["spec", "stories", "tests", "pitch", "deck", "course-sales", "marketing"])
      expect(ids).toContain(out);
  });

  it("each write a draft and say how", () => {
    for (const r of builtIns) {
      expect(r.outputs.length).toBeGreaterThan(0);
      expect(r.body.length).toBeGreaterThan(100);
    }
  });
});

describe("the golden briefs", () => {
  const dir = join(__dirname, "..", "fixtures", "briefs");
  it("have a title, a level and the plan's outputs", () => {
    const files = readdirSync(dir);
    expect(files.length).toBe(3);
    for (const f of files) {
      const { data, body } = parseFrontMatter(readFileSync(join(dir, f), "utf8"));
      expect(data.title).toBeTruthy();
      expect(["L1", "L2", "L3"]).toContain(data.level);
      expect(Array.isArray(data.outputs)).toBe(true);
      expect(body).toContain("## Main flow");
    }
  });
});

describe("recipes", () => {
  it("parse their front-matter; a default model is no model", () => {
    const r = parseRecipe(PITCH, "pitch.md");
    expect(r).toMatchObject({
      id: "pitch",
      kind: "pitch",
      inputs: ["brief", "demo.approved", "kit.glossary"],
      outputs: ["sales/pitch.md"],
      provider: "chatgpt",
      reviewer: "G4",
      languageGroup: "sales",
      body: "Write the pitch.",
      source: "built-in",
    });
    expect(r.model).toBeUndefined();
    expect(() => parseRecipe("no front-matter", "x.md")).toThrow(/no id/);
  });

  it("are refused with unknown inputs, outputs outside the folder, a gate that doesn't exist or no prompt", () => {
    const bad = parseRecipe(
      "---\nid: x\ninputs: [nothing]\noutputs: [../escape.md, /abs.md]\nreviewer: G9\n---\n",
      "x.md",
    );
    expect(validateRecipe(bad, kinds)).toEqual([
      'x.md: unknown input "nothing"',
      'x.md: output "../escape.md" is outside the run\'s folder',
      'x.md: output "/abs.md" is outside the run\'s folder',
      'x.md: reviewer "G9" isn\'t a gate',
      "x.md: no prompt",
    ]);
    expect(insideFolder("sales/pitch.md")).toBe(true);
    expect(insideFolder("C:/x")).toBe(false);
  });

  it("are overridden by a valid repository recipe of the same id, never by an invalid one", () => {
    const good = parseRecipe(PITCH.replace("Write the pitch.", "Our pitch."), "pitch.md", "repository");
    const bad = parseRecipe("---\nid: spec\noutputs: [../x]\n---\nx", "spec.md", "repository");
    const { recipes, errors } = resolveRecipes(builtIns, [good, bad]);
    expect(recipes.get("pitch")?.body).toBe("Our pitch.");
    expect(recipes.get("spec")?.source).toBe("built-in");
    expect(errors).toEqual(['spec.md: output "../x" is outside the run\'s folder']);
  });

  it("fill in the version of their outputs", () => {
    // The skills they name are in Jig's bundled library.
    const library = new Set(
      (
        JSON.parse(
          readFileSync(join(__dirname, "..", "..", "..", "skills", "catalog.json"), "utf8"),
        ) as Array<{
          id: string;
        }>
      ).map((x) => x.id),
    );
    expect(builtIns.flatMap((r) => r.skills).filter((id) => !library.has(id))).toEqual([]);
    expect(builtIns.find((r) => r.id === "critique")?.skills).toContain("impeccable");
    const demo = builtIns.find((r) => r.id === "demo-l1");
    expect(demo && outputPaths(demo, 2)).toEqual(["demo/v2/index.html", "demo/v2/CHANGES.md"]);
  });

  it("make a stage's prompt: the marker first, inputs, outputs, the gate's notes, the rules, how to report", () => {
    const recipe = parseRecipe(PITCH, "pitch.md");
    const text = stagePrompt({
      recipe,
      run: { id: "fx-1", title: "Shift swap", slug: "shift-swap", languages: { all: "en" } },
      stage: { id: "S7:pitch", version: 2, attempt: 1, feedback: "Shorter" },
      folder: "/repo/docs/factory/shift-swap",
      inputs: [{ name: "brief", path: "brief.md" }],
    });
    expect(text.split("\n")[0]).toBe(marker("pitch", "fx-1"));
    expect(text).toContain("- brief: brief.md");
    expect(text).toContain("- sales/pitch.md");
    expect(text).toContain("## Changes asked at the gate\nShorter");
    expect(text).toContain("status: draft");
    expect(text).toContain("addon_factory_report");
    expect(text).not.toContain("## Skills");
    const withSkills = stagePrompt({
      recipe: { ...recipe, skills: ["impeccable", "demo-quality"] },
      run: { id: "fx-1", title: "Shift swap", slug: "shift-swap", languages: { all: "en" } },
      stage: { id: "S7:pitch", attempt: 1 },
      folder: "/repo/docs/factory/shift-swap",
      inputs: [],
    });
    expect(withSkills).toMatch(/## Skills\nUse these skills .*: impeccable, demo-quality\./);
  });
});
