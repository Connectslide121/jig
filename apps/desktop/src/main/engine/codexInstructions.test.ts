import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { expandImports, personalInstructions } from "./codexInstructions";

const home = resolve("/home/user");
const BOM = String.fromCharCode(0xfeff);
const files = (map: Record<string, string>) => {
  const byPath = new Map(Object.entries(map).map(([p, text]) => [resolve(p), text]));
  return (path: string) => byPath.get(resolve(path));
};

describe("expandImports", () => {
  const claudeMd = join(home, ".claude", "CLAUDE.md");

  it("replaces an import with the file it names, home-relative or relative to the importing file", () => {
    const read = files({
      [join(home, ".agents", "AGENTS.md")]: "# Rules\nUse Contoso boards.\n",
      [join(home, ".claude", "extra.md")]: "Extra rule.",
    });
    expect(expandImports("@~/.agents/AGENTS.md\n\nAlso @./extra.md", claudeMd, read, home)).toBe(
      "# Rules\nUse Contoso boards.\n\nAlso Extra rule.",
    );
  });

  it("follows imports inside imported files, but never in a circle", () => {
    const read = files({
      [join(home, "a.md")]: "A then @./b.md",
      [join(home, "b.md")]: "B then @./a.md",
    });
    expect(expandImports("@~/a.md", claudeMd, read, home)).toBe("A then B then @./a.md");
  });

  it("stops after five hops, like Claude Code", () => {
    const map: Record<string, string> = {};
    for (let i = 0; i < 8; i++) map[join(home, `${i}.md`)] = `${i} @./${i + 1}.md`;
    expect(expandImports("@~/0.md", claudeMd, files(map), home)).toBe("0 1 2 3 4 @./5.md");
  });

  it("leaves e-mail addresses, code, and paths that aren't files alone", () => {
    const read = files({ [join(home, "x.md")]: "X" });
    const text = [
      "Mail admin@contoso.com or @nobody/here.",
      "Run `@~/x.md` literally.",
      "```",
      "@~/x.md",
      "```",
      "@~/x.md",
    ].join("\n");
    expect(expandImports(text, claudeMd, read, home)).toBe(
      [
        "Mail admin@contoso.com or @nobody/here.",
        "Run `@~/x.md` literally.",
        "```",
        "@~/x.md",
        "```",
        "X",
      ].join("\n"),
    );
  });
});

describe("personalInstructions", () => {
  it("reads CLAUDE.md from Claude Code's config folder with its imports followed", () => {
    const read = files({
      [join(home, ".claude", "CLAUDE.md")]: "@~/.agents/AGENTS.md\n",
      [join(home, ".agents", "AGENTS.md")]: `${BOM}# Personal\nKeep the Fabrikam board current.\n`,
    });
    expect(personalInstructions({ env: {}, home, read })).toBe(
      "# Personal\nKeep the Fabrikam board current.",
    );
    const custom = files({ [join("/cfg", "CLAUDE.md")]: "Custom" });
    expect(personalInstructions({ env: { CLAUDE_CONFIG_DIR: "/cfg" }, home, read: custom })).toBe("Custom");
  });

  it("gives nothing when there's no CLAUDE.md, or Codex's own AGENTS.md already says the same", () => {
    expect(personalInstructions({ env: {}, home, read: files({}) })).toBeUndefined();
    const read = files({
      [join(home, ".claude", "CLAUDE.md")]: "Same rules.\n",
      [join("/codex", "AGENTS.md")]: "Same rules.\r\n",
    });
    expect(personalInstructions({ env: { CODEX_HOME: "/codex" }, home, read })).toBeUndefined();
    expect(personalInstructions({ env: {}, home, read })).toBe("Same rules.");
  });
});
