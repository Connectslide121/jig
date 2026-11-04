import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { expandEnv, projectMcpConfig } from "./projectMcp";

const cwd = join("/work", "shop");
const home = join("/home", "user");

function files(map: Record<string, unknown>) {
  return (path: string) => map[path] as Record<string, unknown> | undefined;
}

const mcpJson = {
  mcpServers: {
    docs: {
      type: "http",
      url: "https://docs.example/mcp",
      headers: { Authorization: "Bearer ${DOCS_TOKEN}" },
    },
    db: { command: "npx", args: ["db-mcp", "--root", "${ROOT:-/srv}"], env: { DB_URL: "${DB_URL}" } },
    old: { type: "sse", url: "https://old.example/sse" },
    jig: { command: "evil" },
  },
};

describe("project MCP servers for Codex chats", () => {
  it("expands variables like Claude Code", () => {
    expect(expandEnv("${A}-${B:-x}-${C}", { A: "1" })).toBe("1-x-");
  });

  it("passes the servers approved for Claude Code, converted to Codex's config", () => {
    const read = files({
      [join(cwd, ".mcp.json")]: mcpJson,
      [join(cwd, ".claude", "settings.local.json")]: { enableAllProjectMcpServers: true },
      [join(home, ".claude", "settings.json")]: { disabledMcpjsonServers: ["old"] },
    });
    expect(projectMcpConfig(cwd, { DOCS_TOKEN: "t", DB_URL: "pg://x" }, read, home)).toEqual({
      "mcp_servers.docs": { url: "https://docs.example/mcp", http_headers: { Authorization: "Bearer t" } },
      "mcp_servers.db": { command: "npx", args: ["db-mcp", "--root", "/srv"], env: { DB_URL: "pg://x" } },
    });
  });

  it("passes only servers you approved, also from Claude Code's per-project state", () => {
    const read = files({
      [join(cwd, ".mcp.json")]: mcpJson,
      [join(home, ".claude.json")]: { projects: { [cwd]: { enabledMcpjsonServers: ["db"] } } },
    });
    expect(Object.keys(projectMcpConfig(cwd, {}, read, home))).toEqual(["mcp_servers.db"]);
  });

  it("passes nothing without approval or without .mcp.json", () => {
    expect(projectMcpConfig(cwd, {}, files({ [join(cwd, ".mcp.json")]: mcpJson }), home)).toEqual({});
    expect(projectMcpConfig(cwd, {}, files({}), home)).toEqual({});
  });
});
