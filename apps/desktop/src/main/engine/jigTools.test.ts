import { describe, expect, it } from "vitest";
import type { SessionMeta } from "../../shared/engine";
import { findChatTool, isReadOnlyChatTool, toolHandlersOf } from "./chatTools";
import { fileEditGuidance, jigContext, jigToolServer, setAddonTools } from "./jigTools";
import { recordOfferedTools, resetOfferedTools } from "./offeredTools";
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

describe("jigContext's file editing rule (D-360)", () => {
  it("steers Claude to Edit/Write and away from shell edits, on every platform", () => {
    const text = jigContext(meta, undefined);
    expect(text).toContain(fileEditGuidance(true, process.platform));
    for (const platform of ["linux", "darwin", "win32"] as const) {
      const rule = fileEditGuidance(true, platform);
      expect(rule).toContain("Change files with the Edit tool");
      expect(rule).toContain("`sed -i`");
      expect(rule).toContain("`\\n`, quotes and `$` changed silently");
      expect(rule).toContain("read the replacement text from files");
    }
  });

  it("names apply_patch for Codex chats", () => {
    const text = jigContext({ ...meta, provider: "codex" } as SessionMeta, undefined);
    expect(text).toContain(fileEditGuidance(false, process.platform));
    expect(fileEditGuidance(false, "linux")).toContain("Change files with apply_patch");
    expect(fileEditGuidance(false, "linux")).not.toContain("Edit tool");
  });

  it("adds the Python and PowerShell specifics only on Windows", () => {
    expect(fileEditGuidance(true, "win32")).toContain("`-X utf8`");
    expect(fileEditGuidance(true, "win32")).toContain("not `&&`");
    expect(fileEditGuidance(true, "linux")).not.toContain("-X utf8");
    expect(jigContext(meta, undefined)).not.toContain("pass long scripts inline");
  });
});

describe("jigContext and the Artifact tool (D-404)", () => {
  it("mentions it only when Claude Code's init listed it", () => {
    resetOfferedTools();
    expect(jigContext(meta, undefined)).not.toContain("Artifact");
    recordOfferedTools(["Read", "Edit"]);
    expect(jigContext(meta, undefined)).not.toContain("Artifact");
    recordOfferedTools(["Read", "Artifact"]);
    expect(jigContext(meta, undefined)).toContain("Pages you publish with the Artifact tool");
    resetOfferedTools();
  });
});

describe("jigContext and Pages (D-405)", () => {
  it("tells chats to publish visual output as a page only while the Pages tool exists", () => {
    setAddonTools([]);
    expect(jigContext(meta, undefined)).not.toContain("addon_pages_publish");
    setAddonTools([{ name: "addon_pages_publish", description: "d", shape: {}, handler: async () => "ok" }]);
    for (const provider of ["claude", "codex"] as const)
      expect(jigContext({ ...meta, provider } as SessionMeta, undefined)).toContain(
        "publish it with addon_pages_publish",
      );
    setAddonTools([]);
  });
});
