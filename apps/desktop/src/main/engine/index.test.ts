import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("getEngine", () => {
  it("keeps one engine per provider; the fake engine stands in for Claude and Codex", async () => {
    vi.stubEnv("JIG_ENGINE", "fake");
    const { getEngine } = await import("./index");
    const claude = getEngine();
    expect(getEngine("claude")).toBe(claude);
    expect(claude.kind).toBe("fake");
    expect(claude.provider).toBe("claude");
    expect(claude.capabilities.planMode).toBe(true);
    const codex = getEngine("codex");
    expect(getEngine("codex")).toBe(codex);
    expect(codex).not.toBe(claude);
    expect(codex.kind).toBe("fake");
    expect(codex.provider).toBe("codex");
    expect(codex.capabilities.rewind).toBe(false);
  });

  it("runs Codex chats on the Codex engine and Claude's on Claude's", async () => {
    vi.stubEnv("JIG_ENGINE", "");
    const { getEngine } = await import("./index");
    expect(getEngine("codex").kind).toBe("codex");
    expect(getEngine("codex").capabilities.rewind).toBe(false);
    expect(getEngine().kind).toBe("claude");
  });
});
