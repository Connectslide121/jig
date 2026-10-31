import { describe, expect, it } from "vitest";
import { defaultConfig } from "./config";
import { aiTransparencyGuidance, skillEnabled } from "./skills";

describe("library skill controls", () => {
  it("defaults to enabled in projects, new projects and projectless chats", () => {
    const config = defaultConfig();
    for (const project of [undefined, "shop", "new-project"])
      expect(skillEnabled(config, "frontend-design", project)).toBe(true);
  });
  it("global off wins, exclusions persist, and re-enabling keeps project choices", () => {
    const config = defaultConfig();
    config.skills.overrides.design = { enabled: false, excludedProjects: ["shop"] };
    expect(skillEnabled(config, "design", "shop")).toBe(false);
    expect(skillEnabled(config, "design", "blog")).toBe(false);
    config.skills.overrides.design.enabled = true;
    expect(skillEnabled(config, "design", "shop")).toBe(false);
    expect(skillEnabled(config, "design", "blog")).toBe(true);
    expect(skillEnabled(config, "design")).toBe(true);
  });
  it("ties the default AI product notice to AI UX selection, without chat boilerplate", () => {
    const config = defaultConfig();
    expect(aiTransparencyGuidance(config, "shop")).toContain("user-facing AI feature");
    expect(aiTransparencyGuidance(config, "shop")).toContain("not as boilerplate on your chat replies");
    config.skills.overrides["ai-feature-ux"] = { enabled: true, excludedProjects: ["shop"] };
    expect(aiTransparencyGuidance(config, "shop")).toBe("");
    expect(aiTransparencyGuidance(config, "blog")).not.toBe("");
    config.skills.overrides["ai-feature-ux"].enabled = false;
    expect(aiTransparencyGuidance(config, "blog")).toBe("");
  });
});
