import type { JsonValue } from "./codex-protocol/serde_json/JsonValue";
import type { ChatToolServer } from "./types";

/** Long-running Jig tools (a test run, a release) may take a while before they answer. */
const TOOL_TIMEOUT_SEC = 1800;

/**
 * Codex config overrides (`thread/start` `config`, dotted keys) that add a chat's Jig tool servers
 * as streamable-HTTP MCP servers. Each key adds one server and leaves the user's own Codex MCP
 * servers alone. Read-only tools are pre-approved, as they run unasked in Claude chats (D-077).
 *
 * The token goes in as a header of the thread's config, never in Codex's environment: Codex passes
 * its whole environment to the commands it runs, so a command could read it there and call Jig's
 * tools without the approval card. Codex doesn't write the thread's config into its rollout
 * (checked with 0.166.0), and the token dies with the chat.
 */
export function jigMcpConfig(
  servers: Record<string, ChatToolServer>,
  urlOf: (server: string) => string,
  token: string,
): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(servers).map(([name, server]) => [
      `mcp_servers.${name}`,
      {
        url: urlOf(name),
        http_headers: { Authorization: `Bearer ${token}` },
        startup_timeout_sec: 20,
        tool_timeout_sec: TOOL_TIMEOUT_SEC,
        tools: Object.fromEntries(
          server.tools.filter((t) => t.readOnly).map((t) => [t.name, { approval_mode: "approve" }]),
        ),
      },
    ]),
  );
}
