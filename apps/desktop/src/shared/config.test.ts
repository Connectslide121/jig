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

describe("editor completion provider (D-401)", () => {
  it("defaults to Copilot, with Luna as ChatGPT's model", () => {
    expect(defaultConfig().editor).toMatchObject({
      completionProvider: "copilot",
      claudeCompletionModel: "haiku",
      chatgptCompletionModel: "luna",
    });
  });

  it("turns an older claudeCompletion: true into the claude provider and drops the old key", () => {
    const editor = ConfigSchema.parse({ editor: { claudeCompletion: true } }).editor;
    expect(editor.completionProvider).toBe("claude");
    expect(editor).not.toHaveProperty("claudeCompletion");
  });

  it("leaves claudeCompletion: false on Copilot, and an explicit provider wins", () => {
    expect(ConfigSchema.parse({ editor: { claudeCompletion: false } }).editor.completionProvider).toBe(
      "copilot",
    );
    expect(
      ConfigSchema.parse({ editor: { claudeCompletion: true, completionProvider: "chatgpt" } }).editor
        .completionProvider,
    ).toBe("chatgpt");
  });

  it("protects the provider and both models (they spend plan usage)", () => {
    expect(
      protectedIn({
        editor: {
          completionProvider: "chatgpt",
          claudeCompletionModel: "opus",
          chatgptCompletionModel: "sol",
        },
      }),
    ).toEqual(["editor.completionProvider", "editor.claudeCompletionModel", "editor.chatgptCompletionModel"]);
  });

  it("has Jig factory's demo kit path unset by default, and only the Settings page changes it", () => {
    expect(defaultConfig().factory.demoKitPath).toBe("");
    expect(protectedIn({ factory: { demoKitPath: "/tmp/kit" } })).toEqual(["factory.demoKitPath"]);
  });
});
