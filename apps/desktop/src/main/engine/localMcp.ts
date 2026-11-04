import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { logger } from "../log";
import { runChatTool } from "./chatTools";
import type { ChatToolServer } from "./types";

const log = logger("engine");

/**
 * One chat's Jig tools as a real MCP server, for engines that can't take in-process tools (Codex,
 * D-313): streamable HTTP on 127.0.0.1 with a random port, one random token for this chat, closed
 * with the chat. Each server is at `/mcp/<name>` (`/mcp/jig`), so the tool names are the same as in
 * Claude chats (`mcp__jig__addon_tasks_add`).
 */
export interface LocalMcp {
  /** The server's address (`http://127.0.0.1:<port>/mcp/jig`). */
  url(server: string): string;
  close(): Promise<void>;
}

/** A fresh secret for one chat's server: 32 random bytes, URL-safe. */
export function newMcpToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Why a request is refused before any tool sees it, or undefined when it may go on. */
export function refuseMcpRequest(
  request: { method?: string; url?: string; headers: Record<string, string | string[] | undefined> },
  allowed: { port: number; token: string; servers: string[] },
): { status: number; text: string } | undefined {
  // DNS rebinding: a web page that resolves its own name to 127.0.0.1 still sends its Host.
  const host = String(request.headers.host ?? "").toLowerCase();
  if (host !== `127.0.0.1:${allowed.port}` && host !== `localhost:${allowed.port}`)
    return { status: 403, text: "Forbidden" };
  // Browsers always say where a cross-site request comes from; Codex never sends an Origin.
  if (request.headers.origin !== undefined) return { status: 403, text: "Forbidden" };
  const auth = String(request.headers.authorization ?? "");
  const given = Buffer.from(/^Bearer (.+)$/.exec(auth)?.[1] ?? "");
  const expected = Buffer.from(allowed.token);
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return { status: 401, text: "Unauthorized" };
  const name = /^\/mcp\/([\w-]+)\/?$/.exec(new URL(request.url ?? "/", "http://x").pathname)?.[1];
  if (!name || !allowed.servers.includes(name)) return { status: 404, text: "Not found" };
  // Stateless JSON responses only: no server-sent event stream to open.
  if (request.method !== "POST") return { status: 405, text: "Method not allowed" };
  return undefined;
}

/** An MCP server with one Jig tool server's tools (built per request; the tools are cheap). */
function mcpServerFor(name: string, server: ChatToolServer): McpServer {
  const mcp = new McpServer(
    { name, version: "1.0.0" },
    server.instructions ? { instructions: server.instructions } : undefined,
  );
  for (const t of server.tools)
    mcp.registerTool(
      t.name,
      {
        description: t.description,
        inputSchema: t.shape,
        annotations: { readOnlyHint: Boolean(t.readOnly) },
      },
      (args: Record<string, unknown>, extra) => runChatTool(t, args, extra.signal),
    );
  return mcp;
}

/** Starts the chat's server on 127.0.0.1; only requests with `token` reach a tool. */
export async function startLocalMcp(
  servers: Record<string, ChatToolServer>,
  token: string,
): Promise<LocalMcp> {
  let port = 0;
  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const refused = refuseMcpRequest(req, { port, token, servers: Object.keys(servers) });
    if (refused) {
      res.writeHead(refused.status, { "content-type": "text/plain" }).end(refused.text);
      return;
    }
    const name = /^\/mcp\/([\w-]+)/.exec(new URL(req.url ?? "/", "http://x").pathname)![1]!;
    const mcp = mcpServerFor(name, servers[name]!);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
      void mcp.close();
    });
    await mcp.connect(transport);
    await transport.handleRequest(req, res);
  };
  const http = createServer((req, res) => {
    handle(req, res).catch((error: Error) => {
      log.warn("Jig's MCP server failed a request", error);
      if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" }).end("Internal error");
    });
  });
  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(0, "127.0.0.1", () => resolve());
  });
  port = (http.address() as AddressInfo).port;
  return {
    url: (server) => `http://127.0.0.1:${port}/mcp/${server}`,
    close: () =>
      new Promise<void>((resolve) => {
        http.closeAllConnections();
        http.close(() => resolve());
      }),
  };
}
