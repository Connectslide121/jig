import type { JsonValue } from "./codex-protocol/serde_json/JsonValue";
import type { ChatToolServer } from "./types";

/**
 * The environment variable that carries a Codex chat's MCP token (D-313). Codex reads it itself
 * (`bearer_token_env_var`), so the token is in neither the thread's config nor its saved rollout,
 * and Codex's default shell policy keeps `*TOKEN*` variables out of the commands it runs.
 */
export const JIG_MCP_TOKEN_ENV = "JIG_MCP_TOKEN";

/** Long-running Jig tools (a test run, a release) may take a while before they answer. */
const TOOL_TIMEOUT_SEC = 1800;

/**
 * Codex config overrides (`thread/start` `config`, dotted keys) that add a chat's Jig tool servers
 * as streamable-HTTP MCP servers. Each key adds one server and leaves the user's own Codex MCP
 * servers alone. Read-only tools are pre-approved, as they run unasked in Claude chats (D-077).
 */
export function jigMcpConfig(
  servers: Record<string, ChatToolServer>,
  urlOf: (server: string) => string,
): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(servers).map(([name, server]) => [
      `mcp_servers.${name}`,
      {
        url: urlOf(name),
        bearer_token_env_var: JIG_MCP_TOKEN_ENV,
        startup_timeout_sec: 20,
        tool_timeout_sec: TOOL_TIMEOUT_SEC,
        tools: Object.fromEntries(
          server.tools.filter((t) => t.readOnly).map((t) => [t.name, { approval_mode: "approve" }]),
        ),
      },
    ]),
  );
}
