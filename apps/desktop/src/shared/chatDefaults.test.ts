import { describe, expect, it } from "vitest";
import { chatDefaults } from "./chatDefaults";
import { defaultConfig } from "./config";

const engine = { ...defaultConfig().engine, defaultModel: "opus", codexModel: "sol" };

describe("chatDefaults (D-390)", () => {
  it("gives a Claude chat the project's effort, then engine.effort, then none", () => {
    expect(chatDefaults({ ...engine, effort: "high" }, { effort: "low" }, undefined)).toEqual({
      provider: "claude",
      model: "opus",
      effort: "low",
    });
    expect(chatDefaults({ ...engine, effort: "high" }, {}, undefined).effort).toBe("high");
    expect(chatDefaults({ ...engine, effort: "high" }, undefined, undefined).effort).toBe("high");
    expect(chatDefaults({ ...engine, effort: "" }, {}, undefined).effort).toBeUndefined();
  });

  it("falls back to Jig's effort when the project sets only a model", () => {
    expect(chatDefaults({ ...engine, effort: "xhigh" }, { model: "sonnet" }, undefined)).toEqual({
      provider: "claude",
      model: "sonnet",
      effort: "xhigh",
    });
    expect(
      chatDefaults({ ...engine, codexEffort: "ultra" }, { provider: "codex", model: "terra" }, undefined),
    ).toEqual({ provider: "codex", model: "terra", effort: "ultra" });
  });

  it("falls back to codexEffort in a ChatGPT project without an effort of its own", () => {
    expect(chatDefaults({ ...engine, codexEffort: "medium" }, { provider: "codex" }, undefined)).toEqual({
      provider: "codex",
      model: "sol",
      effort: "medium",
    });
    expect(chatDefaults({ ...engine, provider: "codex", codexEffort: "medium" }, {}, undefined).effort).toBe(
      "medium",
    );
  });

  it("keeps the project's model and effort for its own provider only", () => {
    const project = { provider: "codex" as const, model: "terra", effort: "ultra" as const };
    expect(chatDefaults({ ...engine, effort: "low" }, project, "claude")).toEqual({
      provider: "claude",
      model: "opus",
      effort: "low",
    });
    expect(chatDefaults({ ...engine, codexEffort: "" }, { effort: "max" }, "codex")).toEqual({
      provider: "codex",
      model: "sol",
      effort: undefined,
    });
  });
});
