import { describe, expect, it } from "vitest";
import { modelName, modelOptions } from "./models";

describe("model aliases", () => {
  const models = [
    { value: "opus", displayName: "Opus 5.5", description: "Current Opus" },
    { value: "sonnet", displayName: "Sonnet 5.5", description: "Current Sonnet" },
    { value: "claude-custom-version", displayName: "Explicit version", description: "Pinned" },
  ];
  it("keeps family labels and values stable, including opusplan", () => {
    expect(
      modelOptions(models)
        .slice(0, 5)
        .map((m) => [m.id, m.label]),
    ).toEqual([
      ["", "Default model"],
      ["opus", "Opus"],
      ["sonnet", "Sonnet"],
      ["haiku", "Haiku"],
      ["opusplan", "Opus Plan Mode"],
    ]);
    expect(modelName("opus", models)).toBe("Opus");
    expect(modelName("opusplan", models)).toBe("Opus Plan Mode");
  });
  it("retains explicit versions and custom saved values", () => {
    expect(modelOptions(models).at(-1)?.id).toBe("claude-custom-version");
    expect(modelName("claude-custom-version", models)).toBe("Explicit version");
    expect(modelName("my-model", models)).toBe("my-model");
  });
  it("offers aliases before discovery, omits hybrid for helpers and does not duplicate default", () => {
    expect(modelOptions()).toHaveLength(5);
    expect(modelOptions([{ value: "default", displayName: "Default Opus", description: "" }])).toHaveLength(
      5,
    );
    expect(modelOptions(models, false).some((m) => m.id === "opusplan")).toBe(false);
  });
});
