import { describe, expect, it, vi } from "vitest";
import type { PermissionDecision, PermissionRequest } from "../../shared/engine";
import {
  codexToolCardName,
  EXIT_PLAN_TOOL,
  JIG_ADDED_TEXT,
  PLAN_MODE_PROMPT,
  standInTools,
} from "./codexTools";

function tools(decision: PermissionDecision) {
  const asked: PermissionRequest[] = [];
  const planApproved = vi.fn();
  const list = standInTools({
    askPermission: async (request) => {
      asked.push(request);
      return decision;
    },
    callId: async () => "item-1",
    signal: () => new AbortController().signal,
    planApproved,
  });
  const tool = (name: string) => list.find((t) => t.name === name)!;
  return { asked, planApproved, tool };
}

describe("Codex stand-in tools (D-315)", () => {
  it("show as Claude's cards; other MCP calls keep their names", () => {
    expect(codexToolCardName("jig", "exit_plan")).toBe("ExitPlanMode");
    expect(codexToolCardName("jig", "jig_get_settings")).toBe("mcp__jig__jig_get_settings");
    expect(codexToolCardName("github", "exit_plan")).toBe("mcp__github__exit_plan");
  });

  it("exit_plan asks on the plan card of the call and reports the approval", async () => {
    const { asked, planApproved, tool } = tools({ behavior: "allow" });
    const out = await tool(EXIT_PLAN_TOOL).handler({ plan: "1. Do it" });
    expect(asked[0]).toMatchObject({
      requestId: "item-1",
      toolName: "ExitPlanMode",
      input: { plan: "1. Do it" },
    });
    expect(planApproved).toHaveBeenCalledOnce();
    expect(String(out)).toMatch(/approved/);
  });

  it("exit_plan passes the user's feedback back when they keep planning", async () => {
    const { planApproved, tool } = tools({ behavior: "deny", message: "The user wants changes: smaller" });
    expect(await tool(EXIT_PLAN_TOOL).handler({ plan: "x" })).toBe("The user wants changes: smaller");
    expect(planApproved).not.toHaveBeenCalled();
  });

  it("Jig's added text is recognised in a message", () => {
    expect(`${PLAN_MODE_PROMPT}\nHello`.replace(JIG_ADDED_TEXT, "")).toBe("Hello");
  });
});
