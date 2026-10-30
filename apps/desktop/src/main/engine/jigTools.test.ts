import { describe, expect, it } from "vitest";
import type { SessionMeta } from "../../shared/engine";
import { jigMcpServer, setAddonTools } from "./jigTools";

const meta = { id: "s1", cwd: "/repo" } as SessionMeta;

describe("the jig MCP server", () => {
  it("keeps tools marked alwaysLoad in Claude's prompt, others behind tool search", () => {
    setAddonTools([
      {
        name: "addon_notes_add",
        description: "Adds a note",
        shape: {},
        alwaysLoad: true,
        handler: async () => "ok",
      },
      { name: "addon_shop_report", description: "A report", shape: {}, handler: async () => "ok" },
    ]);
    const server = jigMcpServer(meta) as unknown as {
      instance: { _registeredTools: Record<string, { _meta?: Record<string, unknown> }> };
    };
    const tools = server.instance._registeredTools;
    expect(tools.addon_notes_add?._meta).toEqual({ "anthropic/alwaysLoad": true });
    expect(tools.addon_shop_report?._meta?.["anthropic/alwaysLoad"]).toBeUndefined();
    setAddonTools([]);
  });
});
