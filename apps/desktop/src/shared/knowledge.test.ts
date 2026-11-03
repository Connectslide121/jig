import { describe, expect, it } from "vitest";
import { parseClaudeProjects, uniqueDocName } from "./knowledge";

describe("claude.ai export", () => {
  it("reads projects with instructions and documents, skipping the starter project", () => {
    const projects = parseClaudeProjects([
      {
        uuid: "p1",
        name: "Shop",
        description: "The web shop",
        prompt_template: "Answer in Swedish.",
        docs: [
          { uuid: "d1", filename: "style.md", content: "# Style" },
          { uuid: "d2", filename: "empty.txt", content: "  " },
        ],
      },
      { uuid: "p2", name: "How to use Claude", is_starter_project: true, docs: [] },
      { uuid: "p3", name: "  ", docs: [] },
      "not a project",
    ]);
    expect(projects).toEqual([
      {
        uuid: "p1",
        name: "Shop",
        description: "The web shop",
        instructions: "Answer in Swedish.",
        docs: [{ name: "style.md", content: "# Style" }],
      },
    ]);
    expect(
      parseClaudeProjects({
        projects: [{ id: "x", name: "Contoso", documents: [{ name: "a", text: "t" }] }],
      }),
    ).toEqual([
      { uuid: "x", name: "Contoso", description: "", instructions: "", docs: [{ name: "a", content: "t" }] },
    ]);
    expect(parseClaudeProjects(null)).toEqual([]);
  });
  it("makes document names safe and unique", () => {
    expect(uniqueDocName("a/b:c.md", [])).toBe("a b c.md");
    expect(uniqueDocName("notes.md", ["notes.md", "notes (2).md"])).toBe("notes (3).md");
    expect(uniqueDocName("", [])).toBe("Document");
  });
});
