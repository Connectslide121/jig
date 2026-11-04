import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { runChatTool } from "./chatTools";
import type { ChatToolServer } from "./types";

/**
 * A chat's Jig tools as the Agent SDK's in-process MCP servers: how Claude Code gets them (D-313).
 * Only the Claude engine uses this; Codex gets the same tools from the chat's local MCP server.
 */
export function sdkMcpServers(servers: Record<string, ChatToolServer>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(servers).map(([name, server]) => [
      name,
      createSdkMcpServer({
        name,
        version: "1.0.0",
        ...(server.instructions ? { instructions: server.instructions } : {}),
        tools: server.tools.map((t) =>
          tool(
            t.name,
            t.description,
            t.shape,
            (args, extra) =>
              runChatTool(t, args as Record<string, unknown>, (extra as { signal?: AbortSignal })?.signal),
            t.alwaysLoad ? { alwaysLoad: true } : undefined,
          ),
        ),
      }),
    ]),
  );
}
