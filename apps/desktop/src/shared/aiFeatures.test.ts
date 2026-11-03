import { describe, expect, it } from "vitest";
import { ADDON_AI_FEATURES, AI_FEATURE_IDS, AI_FEATURES, aiChoice, providerName } from "./aiFeatures";
import { ConfigSchema, defaultConfig, protectedIn } from "./config";

describe("aiChoice", () => {
  it("keeps today's Claude models until the user picks one", () => {
    const c = defaultConfig();
    expect(aiChoice(c, "commitMessage")).toEqual({ provider: "claude", model: "haiku" });
    expect(aiChoice(c, "commitCheck")).toEqual({ provider: "claude", model: "sonnet" });
    expect(aiChoice(c, "tour")).toEqual({ provider: "claude", model: "opus" });
    expect(aiChoice(c, "learning")).toEqual({ provider: "claude", model: "haiku" });
    expect(aiChoice(c, "meetingTranslation")).toEqual({ provider: "claude", model: "haiku" });
  });

  it("follows the old settings a user changed before", () => {
    const c = ConfigSchema.parse({
      engine: { quickModel: "sonnet", defaultModel: "fable" },
      learning: { model: "opus" },
      meetings: { translationModel: "sonnet" },
    });
    expect(aiChoice(c, "chatTitles").model).toBe("sonnet");
    expect(aiChoice(c, "addonQuick").model).toBe("sonnet");
    expect(aiChoice(c, "standup").model).toBe("fable");
    expect(aiChoice(c, "learning").model).toBe("opus");
    expect(aiChoice(c, "meetingTranslation").model).toBe("sonnet");
  });

  it("uses the picked provider and model; ChatGPT without a model gets Codex's default", () => {
    const c = ConfigSchema.parse({
      ai: {
        tour: { provider: "chatgpt", model: "gpt-6.1-terra" },
        standup: { provider: "chatgpt" },
        commitMessage: { model: "sonnet" },
      },
    });
    expect(aiChoice(c, "tour")).toEqual({ provider: "chatgpt", model: "gpt-6.1-terra" });
    expect(aiChoice(c, "standup")).toEqual({ provider: "chatgpt", model: "" });
    expect(aiChoice(c, "commitMessage")).toEqual({ provider: "claude", model: "sonnet" });
  });

  it("rejects unknown providers", () => {
    expect(() => ConfigSchema.parse({ ai: { tour: { provider: "gemini" } } })).toThrow();
  });
});

describe("AI features", () => {
  it("lists every id once, in the order Settings shows them", () => {
    expect(AI_FEATURES.map((f) => f.id)).toEqual([...AI_FEATURE_IDS]);
    for (const id of ADDON_AI_FEATURES) expect(AI_FEATURE_IDS).toContain(id);
  });

  it("protects every choice from chats (it decides which plan pays)", () => {
    expect(protectedIn({ ai: { tour: { provider: "chatgpt" } } })).toEqual(["ai.tour.provider"]);
  });

  it("names providers for messages", () => {
    expect(providerName("claude")).toBe("Claude");
    expect(providerName("chatgpt")).toBe("ChatGPT");
  });
});
