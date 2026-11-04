import type { ChatTool, ChatToolServer, ToolOutput } from "./types";

/** An MCP tool result (text and image blocks), what both Jig's MCP servers answer. */
export interface McpToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>;
  isError?: boolean;
}

/** A tool's output as MCP content: its text, then its images (a browser screenshot). */
export function mcpContent(out: ToolOutput): McpToolResult {
  if (typeof out === "string") return { content: [{ type: "text", text: out }] };
  return {
    content: [
      { type: "text", text: out.text },
      ...(out.images ?? []).map((i) => ({ type: "image" as const, data: i.data, mimeType: i.mime })),
    ],
  };
}

/** Runs a tool for an MCP server: a thrown error becomes an error result, never a crash. */
export async function runChatTool(tool: ChatTool, args: Record<string, unknown>): Promise<McpToolResult> {
  try {
    return mcpContent(await tool.handler(args));
  } catch (error) {
    return { content: [{ type: "text", text: `Error: ${(error as Error).message}` }], isError: true };
  }
}

/** Every tool of a chat's servers as plain functions by name (the fake engine's scripted sessions). */
export function toolHandlersOf(
  servers: Record<string, ChatToolServer> | undefined,
): Record<string, ChatTool["handler"]> {
  const handlers: Record<string, ChatTool["handler"]> = {};
  for (const server of Object.values(servers ?? {}))
    for (const t of server.tools) handlers[t.name] = t.handler;
  return handlers;
}

/** The tool behind a model-facing name (`mcp__jig__jig_get_settings`), if it is one of Jig's. */
export function findChatTool(
  servers: Record<string, ChatToolServer> | undefined,
  toolName: string,
): ChatTool | undefined {
  const match = /^mcp__(.+?)__(.+)$/.exec(toolName);
  if (!match) return undefined;
  return servers?.[match[1]!]?.tools.find((t) => t.name === match[2]);
}

/** True for Jig's tools that only read: no engine asks before them (D-077). */
export function isReadOnlyChatTool(
  servers: Record<string, ChatToolServer> | undefined,
  toolName: string,
): boolean {
  return Boolean(findChatTool(servers, toolName)?.readOnly);
}
