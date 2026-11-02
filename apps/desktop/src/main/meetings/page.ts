import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { contentSecurityPolicy, mimeFor } from "../protocols";

let server: Server | undefined;
let origin: string | undefined;
let owner: number | undefined;

/** ACS accepts localhost, HTTPS or file, but rejects Electron's secure custom scheme. */
export async function meetingPage(senderId: number, rendererDirectory?: string): Promise<string> {
  if (!server) {
    const root = rendererDirectory ?? fileURLToPath(new URL("../renderer/", import.meta.url));
    const next = createServer(async (request, response) => {
      if (request.headers.host !== new URL(origin!).host || !["GET", "HEAD"].includes(request.method ?? "")) {
        response.writeHead(403).end();
        return;
      }
      try {
        const url = new URL(request.url!, origin);
        const path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
        if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) {
          response.writeHead(403).end();
          return;
        }
        const body = await readFile(path);
        response.writeHead(200, {
          "content-type": mimeFor(path),
          "content-security-policy": `${contentSecurityPolicy(false, true)}; frame-ancestors 'none'`,
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        });
        response.end(request.method === "HEAD" ? undefined : body);
      } catch {
        response.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve, reject) => {
      next.once("error", reject);
      next.listen(0, "127.0.0.1", resolve);
    });
    const address = next.address();
    if (!address || typeof address === "string") throw new Error("Meeting page failed to start");
    origin = `http://localhost:${address.port}`;
    server = next;
    server.unref();
  }
  owner = senderId;
  return `${origin}/index.html?meetingRoom=1`;
}

export function meetingPageOrigin(): string | undefined {
  return origin;
}

/** Only the window that main opened can call IPC from the temporary loopback origin. */
export function isMeetingPage(senderId: number, value: string): boolean {
  if (!origin || senderId !== owner) return false;
  try {
    const url = new URL(value);
    return (
      url.origin === origin && url.pathname === "/index.html" && url.searchParams.get("meetingRoom") === "1"
    );
  } catch {
    return false;
  }
}

export function closeMeetingPage(): void {
  owner = undefined;
  origin = undefined;
  server?.close();
  server?.closeAllConnections();
  server = undefined;
}
