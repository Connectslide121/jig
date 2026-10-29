import { describe, expect, it } from "vitest";
import {
  mailtoUrl,
  requestEmail,
  requestPrompt,
  requestSpec,
  requestTitle,
  requestZipName,
} from "./devRequest";

const ctx = {
  jigVersion: "0.1.0",
  os: "win32 10 (x64)",
  addons: ["git", "releases"],
  createdAt: "2026-10-29T10:00:00Z",
};
const proposal = {
  title: "Title bar items from add-ons",
  reason: "No slot draws in the title bar.",
  proposal: "Add a `titlebar.item` slot.",
  userStory: "As a user, I want my build status in the title bar so that I see it everywhere.",
  acceptance: ["An add-on can contribute a title bar item", " ", "It follows the theme"],
  addonPlan: "A Builds add-on contributes the item.",
  mockupHtml: "<!doctype html><p>mock</p>",
};

describe("development requests", () => {
  it("writes a spec with every part the builder gave", () => {
    const spec = requestSpec({ goal: "Show my build status\nin the title bar" }, proposal, ctx);
    expect(spec).toContain("# Title bar items from add-ons");
    expect(spec).toContain("> Show my build status\n> in the title bar");
    expect(spec).toContain("## User story");
    expect(spec).toContain("## Proposed change to Jig\n\nAdd a `titlebar.item` slot.");
    expect(spec).toContain("## Then, as an add-on");
    expect(spec).toContain("- An add-on can contribute a title bar item\n- It follows the theme\n");
    expect(spec).toContain("mockup.html");
    expect(spec).toContain("Add-ons switched on: git, releases");
    const bare = requestSpec({ goal: "x" }, { reason: "r", proposal: "p" }, { ...ctx, addons: [] });
    expect(bare).not.toContain("## User story");
    expect(bare).not.toContain("mockup.html");
    expect(bare).toContain("Add-ons switched on: none");
  });

  it("makes a prompt for Claude Code that carries the spec", () => {
    const prompt = requestPrompt("# Spec", true);
    expect(prompt).toContain("Read AGENTS.md");
    expect(prompt).toContain("extension point");
    expect(prompt).toContain("mockup.html");
    expect(prompt.endsWith("# Spec")).toBe(true);
    expect(requestPrompt("# Spec", false)).not.toContain("mockup.html");
  });

  it("names the request, the zip and the email", () => {
    expect(requestTitle("Make it so\nmore", { reason: "", proposal: "" })).toBe("Make it so");
    expect(requestTitle("x", proposal)).toBe("Title bar items from add-ons");
    expect(requestTitle("a".repeat(200), { reason: "", proposal: "" })).toHaveLength(90);
    expect(requestZipName("Title bar items från add-ons!", "abcdef123")).toBe(
      "jig-request-title-bar-items-fran-add-ons-abcdef.zip",
    );
    const mail = requestEmail("Title bar", "support@sprinta.se", "jig-request-x.zip");
    expect(mail.subject).toBe("Jig development request: Title bar");
    expect(mail.body).toContain("jig-request-x.zip");
    expect(mailtoUrl(mail)).toMatch(/^mailto:support@sprinta\.se\?subject=Jig%20development/);
  });
});
