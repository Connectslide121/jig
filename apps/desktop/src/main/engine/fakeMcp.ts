import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { McpToolResult } from "./chatTools";
import { type LocalMcp, newMcpToken, startLocalMcp } from "./localMcp";
import type { ChatToolServer } from "./types";

/**
 * The fake engine calling a chat's tool the way Codex does (D-313): over the chat's own local MCP
 * server, with its token, through the official MCP client. The server starts on the first call.
 */
export class FakeMcpClient {
  private server?: Promise<{ local: LocalMcp; token: string }>;
  private closed = false;

  constructor(private readonly servers: Record<string, ChatToolServer>) {}

  /** The server that has `tool`, if any. */
  serverOf(tool: string): string | undefined {
    return Object.keys(this.servers).find((s) => this.servers[s]?.tools.some((t) => t.name === tool));
  }

  async call(
    server: string,
    tool: string,
    args: Record<string, unknown>,
  ): Promise<{ text: string; images: Array<{ mime: string; data: string }>; isError: boolean }> {
    this.server ??= (async () => {
      const token = newMcpToken();
      return { local: await startLocalMcp(this.servers, token), token };
    })();
    const { local, token } = await this.server;
    if (this.closed) throw new Error("The chat has ended");
    const client = new Client({ name: "jig-fake", version: "1.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(local.url(server)), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
      }),
    );
    try {
      // A stand-in waits for your answer on its card: no 60-second limit.
      const result = (await client.callTool({ name: tool, arguments: args }, undefined, {
        timeout: 30 * 60_000,
      })) as McpToolResult;
      const text: string[] = [];
      const images: Array<{ mime: string; data: string }> = [];
      for (const block of result.content)
        if (block.type === "text") text.push(block.text);
        else images.push({ mime: block.mimeType, data: block.data });
      return { text: text.join("\n"), images, isError: Boolean(result.isError) };
    } finally {
      await client.close();
    }
  }

  close(): void {
    this.closed = true;
    void this.server?.then(({ local }) => local.close()).catch(() => {});
  }
}
