import { describe, expect, it } from "vitest";
import { jigMcpConfig } from "./codexMcp";

describe("Codex config for a chat's Jig tools", () => {
  it("adds each server by URL with the chat's token, read-only tools pre-approved", () => {
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
      "secret",
    );
    expect(config).toEqual({
      "mcp_servers.jig": {
        url: "http://127.0.0.1:1234/mcp/jig",
        http_headers: { Authorization: "Bearer secret" },
        startup_timeout_sec: 20,
        tool_timeout_sec: 1800,
        tools: { jig_get_settings: { approval_mode: "approve" } },
      },
    });
  });
});
