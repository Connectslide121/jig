import { describe, expect, it } from "vitest";
import type { ModelInfo } from "./engine";
import {
  CHATGPT_FALLBACK_MODELS,
  chatGptHelperChoice,
  chatGptModelChoices,
  compareVersions,
  newestOfFamily,
  parseChatGptSlug,
  resolveChatGptModel,
} from "./providers";

const model = (value: string, displayName = value): ModelInfo => ({ value, displayName, description: "" });

/** What `codex debug models` lists (visible ones, Codex's order): families on different versions. */
const codex = [
  model("gpt-6.1-sol", "GPT-6.1-Sol"),
  model("gpt-6-astra", "GPT-6-Astra"),
  model("gpt-6.1-terra", "GPT-6.1 Terra"),
  model("gpt-6-sol", "GPT-6-Sol"),
  model("gpt-6-luna", "GPT-6-Luna"),
  model("gpt-5.6-sol", "GPT-5.6-Sol"),
  model("gpt-5.6-luna", "GPT-5.6-Luna"),
];

describe("parseChatGptSlug", () => {
  it("reads the version and family of a versioned slug", () => {
    expect(parseChatGptSlug("gpt-6.1-sol")).toEqual({ version: [6, 1], family: "sol" });
    expect(parseChatGptSlug("GPT-6-Luna")).toEqual({ version: [6], family: "luna" });
    expect(parseChatGptSlug("gpt-6.10-terra")).toEqual({ version: [6, 10], family: "terra" });
  });

  it("leaves other models out", () => {
    expect(parseChatGptSlug("codex-auto-review")).toBeUndefined();
    expect(parseChatGptSlug("gpt-reserve")).toBeUndefined();
    expect(parseChatGptSlug("gpt-6.1-sol-mini")).toBeUndefined();
  });
});

describe("compareVersions", () => {
  it("compares part by part as numbers", () => {
    expect(compareVersions([6, 1], [6])).toBeGreaterThan(0);
    expect(compareVersions([6, 10], [6, 9])).toBeGreaterThan(0);
    expect(compareVersions([5, 6], [6])).toBeLessThan(0);
    expect(compareVersions([6, 0], [6])).toBe(0);
  });
});

describe("newestOfFamily", () => {
  it("finds each family's newest version, wherever it is in the list", () => {
    expect(newestOfFamily("sol", codex)?.value).toBe("gpt-6.1-sol");
    expect(newestOfFamily("luna", codex)?.value).toBe("gpt-6-luna");
    expect(newestOfFamily("Terra", codex)?.value).toBe("gpt-6.1-terra");
    expect(newestOfFamily("nova", codex)).toBeUndefined();
  });

  it("orders 6.10 after 6.9, not as text", () => {
    expect(
      newestOfFamily("sol", [model("gpt-6.9-sol"), model("gpt-6.10-sol"), model("gpt-6.2-sol")])?.value,
    ).toBe("gpt-6.10-sol");
  });
});

describe("resolveChatGptModel", () => {
  it("turns a family into its newest model in Codex's list", () => {
    expect(resolveChatGptModel("sol", codex)).toEqual({ model: "gpt-6.1-sol", family: "sol" });
    expect(resolveChatGptModel("luna", codex)).toEqual({ model: "gpt-6-luna", family: "luna" });
    expect(resolveChatGptModel(" Terra ", codex)).toEqual({ model: "gpt-6.1-terra", family: "terra" });
  });

  it("picks up a new release as soon as Codex lists it", () => {
    expect(resolveChatGptModel("sol", [model("gpt-6.2-sol"), ...codex]).model).toBe("gpt-6.2-sol");
  });

  it("falls back to the built-in list when Codex lists nothing or not that family", () => {
    expect(resolveChatGptModel("terra", []).model).toBe("gpt-6.1-terra");
    expect(resolveChatGptModel("luna", [model("gpt-6.1-sol")]).model).toBe(
      newestOfFamily("luna", CHATGPT_FALLBACK_MODELS)?.value,
    );
  });

  it("resolves any family Codex lists, not only the three in the pickers", () => {
    expect(resolveChatGptModel("astra", codex).model).toBe("gpt-6-astra");
  });

  it("passes exact slugs and the empty default through unchanged", () => {
    expect(resolveChatGptModel("gpt-6-sol", codex)).toEqual({ model: "gpt-6-sol" });
    expect(resolveChatGptModel("gpt-9-unknown", codex)).toEqual({ model: "gpt-9-unknown" });
    expect(resolveChatGptModel("", codex)).toEqual({ model: "" });
  });

  it("uses Codex's default model for an unknown family, and says so", () => {
    const resolved = resolveChatGptModel("nova", codex);
    expect(resolved.model).toBe("");
    expect(resolved.notice).toContain('"nova"');
  });
});

describe("chatGptModelChoices", () => {
  it("lists the families with what they are now, then every exact version", () => {
    const { families, versions } = chatGptModelChoices(codex);
    expect(families).toEqual([
      { value: "sol", label: "Sol (latest) · now GPT-6.1-Sol" },
      { value: "terra", label: "Terra (latest) · now GPT-6.1 Terra" },
      { value: "luna", label: "Luna (latest) · now GPT-6-Luna" },
    ]);
    expect(versions.map((v) => v.value)).toEqual(codex.map((m) => m.value));
  });
});

describe("chatGptHelperChoice (D-337)", () => {
  const engine = { codexSearchModel: "luna", codexTesterModel: "", codexHelperFallbackModel: "terra" };

  it("uses the role's own model, else the helper fallback", () => {
    expect(chatGptHelperChoice("search", engine)).toBe("luna");
    expect(chatGptHelperChoice("tester", engine)).toBe("terra");
    expect(chatGptHelperChoice("tester", { ...engine, codexTesterModel: " gpt-6-sol " })).toBe("gpt-6-sol");
  });

  it("leaves it to Codex when neither is set, and resolves a family to its newest version", () => {
    expect(chatGptHelperChoice("tester", { ...engine, codexHelperFallbackModel: "" })).toBe("");
    const models: ModelInfo[] = [
      { value: "gpt-5.6-luna", displayName: "GPT-5.6-Luna", description: "" },
      { value: "gpt-6-luna", displayName: "GPT-6-Luna", description: "" },
      { value: "gpt-6.1-terra", displayName: "GPT-6.1 Terra", description: "" },
    ];
    expect(resolveChatGptModel(chatGptHelperChoice("search", engine), models).model).toBe("gpt-6-luna");
    expect(resolveChatGptModel(chatGptHelperChoice("tester", engine), models).model).toBe("gpt-6.1-terra");
  });
});
