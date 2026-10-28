import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { protocol, session } from "electron";

const here = fileURLToPath(new URL(".", import.meta.url));
const rendererDir = join(here, "../renderer");

/** `jig-app://app/…` serves the bundled UI; `jig-addon://<id>/…` serves add-on bundles (phase 6). */
export function registerSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "jig-app",
      privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true },
    },
    {
      scheme: "jig-addon",
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
    },
    // File previews: granted folders only (main/files/preview.ts). `stream` for audio and video.
    {
      scheme: "jig-file",
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
    },
    // File icon themes: icons and fonts of a loaded theme (main/themes/fileIcons.ts).
    {
      scheme: "jig-icons",
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
    },
  ]);
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

export function mimeFor(path: string): string {
  return MIME[extname(path).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Content Security Policy for the UI. Scripts only from the app itself and add-on bundles; no remote
 * code. `'unsafe-eval'` is not allowed. In dev, Vite's client and React refresh need inline scripts and
 * a websocket.
 */
export function contentSecurityPolicy(dev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' jig-addon: 'wasm-unsafe-eval'${dev ? " 'unsafe-inline'" : ""}`,
    "style-src 'self' 'unsafe-inline' jig-addon:",
    "img-src 'self' data: blob: https: jig-addon: jig-icons: jig-file:",
    "media-src jig-file:",
    "font-src 'self' data: jig-icons:",
    `connect-src 'self' jig-addon:${dev ? " ws://localhost:* http://localhost:*" : ""}`,
    "frame-src http://localhost:* http://127.0.0.1:* jig-file:",
    "object-src 'none'",
    "base-uri 'none'",
  ].join("; ");
}

export function installAppProtocol(): void {
  protocol.handle("jig-app", async (request) => {
    const url = new URL(request.url);
    const relative = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, "") || "index.html";
    const file = join(rendererDir, relative);
    if (!file.startsWith(rendererDir + sep)) return new Response("Forbidden", { status: 403 });
    try {
      const body = await readFile(file);
      return new Response(body, {
        headers: { "content-type": mimeFor(file), "content-security-policy": contentSecurityPolicy(false) },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });

  if (process.env.JIG_RENDERER_URL) {
    session.defaultSession.webRequest.onHeadersReceived(
      { urls: ["http://localhost:*/*"] },
      (details, callback) => {
        if (details.resourceType !== "mainFrame") return callback({});
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            "content-security-policy": [contentSecurityPolicy(true)],
          },
        });
      },
    );
  }
}
