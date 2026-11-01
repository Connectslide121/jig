import { describe, expect, it } from "vitest";
import { ConfigSchema, defaultConfig, inversePatch, patchPaths, protectedIn } from "./config";

describe("patch helpers", () => {
  it("lists paths, finds protected settings and builds an undo patch", () => {
    const patch = {
      appearance: { themeId: "dracula", fontSize: 14 },
      learning: { exclusions: ["secret"] },
    };
    expect(patchPaths(patch)).toEqual(["appearance.themeId", "appearance.fontSize", "learning.exclusions"]);
    expect(protectedIn(patch)).toEqual([]);
    expect(
      protectedIn({
        engine: { allowApiKey: true, defaultModel: "opus" },
        updates: { buildCommand: "x" },
      }),
    ).toEqual(["engine.allowApiKey", "updates.buildCommand"]);
    const before = defaultConfig();
    expect(inversePatch(before, patch)).toEqual({
      appearance: { themeId: "jig-dark", fontSize: 13 },
      learning: { exclusions: [] },
    });
  });
});

it("starts new chats on Opus with smaller helper, tester and search models, preserving explicit choices", () => {
  expect(defaultConfig().engine).toMatchObject({
    defaultModel: "opus",
    defaultPermissionMode: "plan",
    subagentModel: "sonnet",
    helperModel: "sonnet",
    quickModel: "haiku",
    testerModel: "haiku",
    searchModel: "haiku",
  });
  expect(
    ConfigSchema.parse({
      engine: { defaultModel: "", defaultPermissionMode: "default" },
    }).engine,
  ).toMatchObject({ defaultModel: "", defaultPermissionMode: "default" });
});
