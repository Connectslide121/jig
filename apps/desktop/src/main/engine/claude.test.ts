import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: mocks.query,
  createSdkMcpServer: vi.fn(),
  tool: vi.fn(),
}));

import { ClaudeEngine } from "./claude";

function controlQuery() {
  return {
    async *[Symbol.asyncIterator]() {
      yield* [];
    },
    supportedModels: vi.fn().mockResolvedValue([
      {
        value: "sonnet",
        displayName: "Sonnet",
        description: "Coding",
        supportsEffort: true,
        supportedEffortLevels: ["low", "high"],
      },
    ]),
    usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: vi
      .fn()
      .mockResolvedValue({ rate_limits_available: false }),
    close: vi.fn(),
  };
}
beforeEach(() => mocks.query.mockReset());
describe("prompt-free Claude Code control requests", () => {
  it("discovers models without sending a prompt or creating a chat, and closes", async () => {
    const q = controlQuery();
    mocks.query.mockReturnValue(q);
    expect(await new ClaudeEngine().models({ env: {}, claudePath: "" })).toEqual([
      { value: "sonnet", displayName: "Sonnet", description: "Coding", efforts: ["low", "high"] },
    ]);
    const request = mocks.query.mock.calls[0]![0];
    expect(request.options).toMatchObject({ tools: [], settingSources: [], persistSession: false });
    expect(await request.prompt[Symbol.asyncIterator]().next()).toEqual({ value: undefined, done: true });
    expect(request.options.abortController.signal.aborted).toBe(true);
    expect(q.close).toHaveBeenCalledOnce();
  });
  it("closes and aborts even when model discovery fails", async () => {
    const q = controlQuery();
    q.supportedModels.mockRejectedValue(new Error("not available"));
    mocks.query.mockReturnValue(q);
    await expect(new ClaudeEngine().models({ env: {}, claudePath: "" })).rejects.toThrow("not available");
    expect(q.close).toHaveBeenCalledOnce();
    expect(mocks.query.mock.calls[0]![0].options.abortController.signal.aborted).toBe(true);
  });
  it("retains the usage control request and its cleanup", async () => {
    const q = controlQuery();
    mocks.query.mockReturnValue(q);
    expect(await new ClaudeEngine().planUsage({ env: {}, claudePath: "" })).toEqual({
      rate_limits_available: false,
    });
    expect(q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET).toHaveBeenCalledWith({
      skipBehaviors: true,
    });
    expect(q.close).toHaveBeenCalledOnce();
  });
});
