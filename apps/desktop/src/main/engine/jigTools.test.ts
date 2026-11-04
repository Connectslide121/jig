import { describe, expect, it } from "vitest";
import type { SessionMeta } from "../../shared/engine";
import { findChatTool, isReadOnlyChatTool, toolHandlersOf } from "./chatTools";
import { jigToolServer, setAddonTools } from "./jigTools";
import { sdkMcpServers } from "./sdkMcp";

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
    const server = sdkMcpServers({ jig: jigToolServer(meta) }).jig as unknown as {
      instance: { _registeredTools: Record<string, { _meta?: Record<string, unknown> }> };
    };
    const tools = server.instance._registeredTools;
    expect(tools.addon_notes_add?._meta).toEqual({ "anthropic/alwaysLoad": true });
    expect(tools.addon_shop_report?._meta?.["anthropic/alwaysLoad"]).toBeUndefined();
    setAddonTools([]);
  });

  it("binds every tool to the chat, with the same names for any engine", async () => {
    let seen: SessionMeta | undefined;
    setAddonTools([
      {
        name: "addon_shop_list",
        description: "Lists",
        shape: {},
        readOnly: true,
        handler: async (_args, m) => {
          seen = m;
          return "listed";
        },
      },
    ]);
    const servers = { jig: jigToolServer(meta) };
    expect(isReadOnlyChatTool(servers, "mcp__jig__addon_shop_list")).toBe(true);
    expect(isReadOnlyChatTool(servers, "mcp__jig__jig_list_addons")).toBe(true);
    expect(isReadOnlyChatTool(servers, "mcp__jig__jig_request_build")).toBe(false);
    expect(isReadOnlyChatTool(servers, "mcp__other__addon_shop_list")).toBe(false);
    expect(findChatTool(servers, "Bash")).toBeUndefined();
    expect(await toolHandlersOf(servers).addon_shop_list!({})).toBe("listed");
    expect(seen?.id).toBe("s1");
    setAddonTools([]);
  });
});
