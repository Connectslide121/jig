import { describe, expect, it } from "vitest";
import { cleanMessage, commitMessagePrompt } from "./message";

describe("commit message with Claude", () => {
  it("asks with the diff and the repository's recent subjects", () => {
    const p = commitMessagePrompt({
      staged: true,
      diff: "+a",
      recent: "Fix login\nAdd cart",
      truncated: false,
    });
    expect(p).toContain("Staged changes:\n+a");
    expect(p).toContain("recent commit subjects:\nFix login");
    expect(commitMessagePrompt({ staged: false, diff: "+b", recent: "", truncated: true })).toContain(
      "All changes (cut short):\n+b",
    );
  });

  it("strips code fences and quotes from the answer", () => {
    expect(cleanMessage("```\nFix the cart\n\nBody\n```")).toBe("Fix the cart\n\nBody");
    expect(cleanMessage('"Fix the cart"')).toBe("Fix the cart");
    expect(cleanMessage("  Fix the cart  ")).toBe("Fix the cart");
  });
});

describe("commitMessagePrompt with a convention", () => {
  it("asks for conventional commits when the release policy does", () => {
    const base = { staged: true, diff: "+x", recent: "", truncated: false };
    expect(commitMessagePrompt({ ...base, convention: "conventional" })).toContain("Conventional Commits");
    expect(commitMessagePrompt(base)).not.toContain("Conventional Commits");
  });
});
