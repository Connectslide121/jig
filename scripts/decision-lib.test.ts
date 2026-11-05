import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  appendEntry,
  decisionEntry,
  decisionId,
  decisionNumbers,
  duplicateDecisions,
  nextDecision,
} from "./decision-lib";

const log = [
  "# Decisions",
  "",
  "Mark the old one `Superseded by D-999`.",
  "",
  "### D-001 — Name: Shop",
  "Refers to D-500 in the text.",
  "",
  "## D-002: Second",
  "",
  "#### D-700 too deep to be a heading",
  "",
].join("\n");

describe("decisionNumbers", () => {
  it("reads both heading styles and ignores mentions in the text", () => {
    expect(decisionNumbers(log)).toEqual([1, 2]);
  });
});

describe("nextDecision", () => {
  it("is one above the highest heading", () => {
    expect(nextDecision([log])).toBe(3);
  });

  it("counts a number another worktree or branch reserved but hasn't committed here", () => {
    const other = `${log}\n## D-003: Reserved by another chat\n`;
    expect(nextDecision([log, other, ""])).toBe(4);
  });

  it("starts at 1 for an empty log", () => {
    expect(nextDecision([""])).toBe(1);
  });
});

describe("duplicateDecisions", () => {
  it("finds a number used twice", () => {
    expect(duplicateDecisions(`${log}\n## D-002: Clash\n`, [])).toEqual([2]);
  });

  it("lets the legacy duplicates through", () => {
    expect(duplicateDecisions(`${log}\n## D-002: Clash\n`, [2])).toEqual([]);
  });

  it("passes on the real log", () => {
    const real = readFileSync(new URL("../docs/decisions.md", import.meta.url), "utf8");
    expect(duplicateDecisions(real)).toEqual([]);
  });
});

describe("decisionEntry", () => {
  it("pads to three digits", () => {
    expect(decisionId(7)).toBe("D-007");
    expect(decisionId(1234)).toBe("D-1234");
    expect(decisionEntry(42, "  Shop decides  ")).toBe(
      "## D-042: Shop decides\n\n- Status: accepted.\n- **Who:**\n",
    );
  });

  it("refuses an empty or multi-line title", () => {
    expect(() => decisionEntry(1, " ")).toThrow();
    expect(() => decisionEntry(1, "a\nb")).toThrow();
  });
});

describe("appendEntry", () => {
  it("adds the entry after one blank line, whatever the file ended with", () => {
    expect(appendEntry("a\n", "## D-002: b\n")).toBe("a\n\n## D-002: b\n");
    expect(appendEntry("a\n\n\n", "## D-002: b\n")).toBe("a\n\n## D-002: b\n");
    expect(appendEntry("a", "## D-002: b\n")).toBe("a\n\n## D-002: b\n");
  });

  it("keeps CRLF line endings", () => {
    expect(appendEntry("a\r\n", "## D-002: b\n")).toBe("a\r\n\r\n## D-002: b\r\n");
  });

  it("reserves the next number when appended", () => {
    const after = appendEntry(log, decisionEntry(nextDecision([log]), "Next"));
    expect(nextDecision([after])).toBe(4);
  });
});
