import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { type LocalMcp, newMcpToken, refuseMcpRequest, startLocalMcp } from "./localMcp";
import type { ChatToolServer } from "./types";

const servers: Record<string, ChatToolServer> = {
  jig: {
    instructions: "Tools of Jig",
    tools: [
      {
        name: "jig_echo",
        description: "Echoes",
        shape: { text: z.string() },
        readOnly: true,
        handler: async (args) => `echo ${String(args.text)}`,
      },
      {
        name: "jig_shot",
        description: "A screenshot",
        shape: {},
        handler: async () => ({ text: "shot", images: [{ mime: "image/png", data: "iVBORw0KGgo=" }] }),
      },
      {
        name: "jig_fail",
        description: "Fails",
        shape: {},
        handler: async () => {
          throw new Error("nope");
        },
      },
    ],
  },
};

let local: LocalMcp | undefined;
afterEach(async () => {
  await local?.close();
  local = undefined;
});

async function connect(url: string, token: string) {
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    }),
  );
  return client;
}

describe("a chat's local MCP server", () => {
  it("serves the chat's tools under their own names, with images and errors", async () => {
    const token = newMcpToken();
    local = await startLocalMcp(servers, token);
    expect(local.url("jig")).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp\/jig$/);
    const client = await connect(local.url("jig"), token);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(["jig_echo", "jig_shot", "jig_fail"]);
    expect(tools[0]?.annotations?.readOnlyHint).toBe(true);
    expect(await client.callTool({ name: "jig_echo", arguments: { text: "hi" } })).toMatchObject({
      content: [{ type: "text", text: "echo hi" }],
    });
    expect(await client.callTool({ name: "jig_shot", arguments: {} })).toMatchObject({
      content: [
        { type: "text", text: "shot" },
        { type: "image", mimeType: "image/png", data: "iVBORw0KGgo=" },
      ],
    });
    expect(await client.callTool({ name: "jig_fail", arguments: {} })).toMatchObject({
      isError: true,
      content: [{ type: "text", text: "Error: nope" }],
    });
    await client.close();
  });

  it("refuses requests without the chat's token", async () => {
    local = await startLocalMcp(servers, newMcpToken());
    await expect(connect(local.url("jig"), newMcpToken())).rejects.toThrow();
    const res = await fetch(local.url("jig"), { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
  });

  it("refuses other hosts, browsers, unknown servers and other methods", () => {
    const allowed = { port: 4000, token: "secret", servers: ["jig"] };
    const ok = {
      method: "POST",
      url: "/mcp/jig",
      headers: { host: "127.0.0.1:4000", authorization: "Bearer secret" },
    };
    expect(refuseMcpRequest(ok, allowed)).toBeUndefined();
    expect(
      refuseMcpRequest({ ...ok, headers: { ...ok.headers, host: "evil.test:4000" } }, allowed)?.status,
    ).toBe(403);
    expect(
      refuseMcpRequest({ ...ok, headers: { ...ok.headers, origin: "https://evil.test" } }, allowed)?.status,
    ).toBe(403);
    expect(
      refuseMcpRequest({ ...ok, headers: { ...ok.headers, authorization: "Bearer secreT" } }, allowed)
        ?.status,
    ).toBe(401);
    expect(refuseMcpRequest({ ...ok, url: "/mcp/other" }, allowed)?.status).toBe(404);
    expect(refuseMcpRequest({ ...ok, method: "GET" }, allowed)?.status).toBe(405);
  });
});
