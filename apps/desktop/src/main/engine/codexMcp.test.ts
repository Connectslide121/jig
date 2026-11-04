import { describe, expect, it } from "vitest";
import { JIG_MCP_TOKEN_ENV, jigMcpConfig } from "./codexMcp";

describe("Codex config for a chat's Jig tools", () => {
  it("adds each server by URL with the token's variable, read-only tools pre-approved", () => {
    const handler = async () => "ok";
    const config = jigMcpConfig(
      {
        jig: {
          tools: [
            { name: "jig_get_settings", description: "", shape: {}, readOnly: true, handler },
            { name: "jig_update_settings", description: "", shape: {}, handler },
          ],
        },
      },
      (name) => `http://127.0.0.1:1234/mcp/${name}`,
    );
    expect(config).toEqual({
      "mcp_servers.jig": {
        url: "http://127.0.0.1:1234/mcp/jig",
        bearer_token_env_var: JIG_MCP_TOKEN_ENV,
        startup_timeout_sec: 20,
        tool_timeout_sec: 1800,
        tools: { jig_get_settings: { approval_mode: "approve" } },
      },
    });
    // The token itself is never in the config.
    expect(JSON.stringify(config)).not.toMatch(/Bearer/);
  });
});
