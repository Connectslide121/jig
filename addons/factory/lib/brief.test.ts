import { describe, expect, it } from "vitest";
import { BRIEF_SECTIONS, groupOf, languagesOf, PLAN_OUTPUTS, parseBrief, planLanguages } from "./brief";

const BRIEF = `---
status: draft
level: L2
levelWhy: The product has bookings already
languages: docs: en, sales: sv
---
# Shift swap

## Problem
Staff swap shifts by phone.

## Value
Swaps in two taps.

## Users
- Staff
- Managers

## Main flow

## Open points
- Who approves a swap?
- None
`;

describe("parseBrief", () => {
  it("reads the title, sections, gaps, level and languages", () => {
    const b = parseBrief(BRIEF);
    expect(b.title).toBe("Shift swap");
    expect(b.sections.Problem).toBe("Staff swap shifts by phone.");
    expect(b.sections.Users).toContain("Managers");
    expect(b.sections["Main flow"]).toBe("");
    expect(b.gaps).toEqual(["Who approves a swap?"]);
    expect(b.level).toBe("L2");
    expect(b.levelWhy).toContain("bookings");
    expect(b.languages).toEqual({ docs: "en", sales: "sv" });
    expect(b.coverage).toEqual({ covered: 3, total: BRIEF_SECTIONS.length });
  });

  it("matches section names whatever their case, and prefers the front-matter title", () => {
    const b = parseBrief("---\ntitle: Given\n---\n# Other\n\n## out of scope\nPayroll\n");
    expect(b.title).toBe("Given");
    expect(b.sections["Out of scope"]).toBe("Payroll");
  });

  it("is empty for an empty file", () => {
    const b = parseBrief("");
    expect(b.coverage.covered).toBe(0);
    expect(b.gaps).toEqual([]);
    expect(b.level).toBeUndefined();
  });
});

describe("languagesOf", () => {
  it("takes one code for every group", () => {
    expect(languagesOf("sv")).toEqual({ docs: "sv", sales: "sv", learning: "sv", marketing: "sv" });
  });
  it("takes a list: the first for docs, the second for the rest", () => {
    expect(languagesOf(["en", "de"])).toEqual({ docs: "en", sales: "de", learning: "de", marketing: "de" });
    expect(languagesOf(["fi"])).toEqual({ docs: "fi", sales: "fi", learning: "fi", marketing: "fi" });
  });
  it("ignores unknown groups and other values", () => {
    expect(languagesOf("docs: en, nonsense: xx")).toEqual({ docs: "en" });
    expect(languagesOf(3)).toEqual({});
  });
});

describe("planLanguages", () => {
  it("fills every group, from the brief or the fallback", () => {
    expect(planLanguages({ sales: "sv" }, "en")).toEqual({
      docs: "en",
      sales: "sv",
      learning: "en",
      marketing: "en",
    });
  });
});

describe("groupOf", () => {
  it("puts outputs in their language group", () => {
    expect(groupOf("spec")).toBe("docs");
    expect(groupOf("course-sales")).toBe("learning");
    expect(groupOf("pitch")).toBe("sales");
    expect(groupOf("marketing")).toBe("marketing");
  });
});

describe("PLAN_OUTPUTS", () => {
  it("puts every output in the group groupOf gives it", () => {
    for (const o of PLAN_OUTPUTS) expect(groupOf(o.id)).toBe(o.group);
  });
});
