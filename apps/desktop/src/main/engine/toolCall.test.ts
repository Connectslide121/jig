import { describe, expect, it } from "vitest";
import { isRequestedCall, toolCallPrompt } from "./toolCall";

describe("isRequestedCall", () => {
  const request = { tool: "RemoteTrigger", input: { action: "run", trigger_id: "trig_1" } };
  it("allows only the exact call", () => {
    expect(isRequestedCall(request, "RemoteTrigger", { action: "run", trigger_id: "trig_1" })).toBe(true);
    expect(
      isRequestedCall(request, "RemoteTrigger", { trigger_id: "trig_1", action: "run", body: undefined }),
    ).toBe(true);
    expect(isRequestedCall(request, "RemoteTrigger", { action: "run", trigger_id: "trig_2" })).toBe(false);
    expect(isRequestedCall(request, "RemoteTrigger", { action: "update", trigger_id: "trig_1" })).toBe(false);
    expect(isRequestedCall(request, "RemoteTrigger", { action: "run", trigger_id: "trig_1", body: {} })).toBe(
      false,
    );
    expect(isRequestedCall(request, "Bash", { action: "run", trigger_id: "trig_1" })).toBe(false);
  });
  it("compares nested bodies", () => {
    const update = {
      tool: "RemoteTrigger",
      input: { action: "update", trigger_id: "t", body: { enabled: false } },
    };
    expect(
      isRequestedCall(update, "RemoteTrigger", {
        action: "update",
        trigger_id: "t",
        body: { enabled: false },
      }),
    ).toBe(true);
    expect(
      isRequestedCall(update, "RemoteTrigger", {
        action: "update",
        trigger_id: "t",
        body: { enabled: false, prompt: "x" },
      }),
    ).toBe(false);
  });
  it("tells Claude the exact input", () => {
    expect(toolCallPrompt(request)).toContain('{"action":"run","trigger_id":"trig_1"}');
  });
});
