/** Claude's browser: an offscreen page in Jig that Claude drives with tools and you can watch. */
export interface BrowserState {
  open: boolean;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  width: number;
  height: number;
  /** Console errors since the console was last cleared. */
  errors: number;
  /** Requests in the network log, and how many failed or got an HTTP error. */
  requests: number;
  failedRequests: number;
}

export interface ConsoleEntry {
  level: "log" | "info" | "warning" | "error";
  message: string;
  source?: string;
  line?: number;
  at: string;
}

/** Input from the live view, in page coordinates (you taking over from Claude). */
export type BrowserInput =
  | {
      type: "mouseDown" | "mouseUp" | "mouseMove";
      x: number;
      y: number;
      button?: "left" | "right";
      clickCount?: number;
    }
  | { type: "wheel"; x: number; y: number; deltaX: number; deltaY: number }
  | { type: "keyDown" | "keyUp"; key: string }
  | { type: "text"; text: string };

export const VIEWPORTS = {
  desktop: { width: 1280, height: 800, label: "Desktop" },
  tablet: { width: 820, height: 1180, label: "Tablet" },
  phone: { width: 390, height: 844, label: "Phone" },
} as const;

/** "localhost:5173" → "http://localhost:5173"; refuses javascript:, data: and other schemes. */
export function normalizeUrl(input: string): string {
  const raw = input.trim();
  if (!raw) throw new Error("Give a URL");
  // "localhost:5173" looks like a scheme to URL, so known host shapes are checked first.
  const host = /^(localhost|127\.0\.0\.1|\[::1\]|[\w-]+(\.[\w-]+)+)(:\d+)?(\/|$)/i.test(raw);
  const withScheme = host ? `${/^(localhost|127\.|\[::1\])/i.test(raw) ? "http" : "https"}://${raw}` : raw;
  const url = new URL(withScheme);
  if (!["http:", "https:", "file:"].includes(url.protocol))
    throw new Error(`Claude's browser opens http(s) and file pages only, not ${url.protocol}`);
  return url.toString();
}

/** A request the page made (Claude's browser network log, from Chromium's DevTools protocol). */
export interface NetworkEntry {
  id: string;
  method: string;
  url: string;
  /** document, xhr, fetch, script, stylesheet, image… */
  type: string;
  status?: number;
  statusText?: string;
  mimeType?: string;
  /** Failed to load (network error, blocked, cancelled). */
  error?: string;
  startedAt: string;
  /** Milliseconds from request to finish. */
  durationMs?: number;
  /** Bytes received. */
  size?: number;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  postData?: string;
}

const SECRET_HEADERS =
  /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key|x-auth-token|ocp-apim-subscription-key)$/i;

/** Headers with credential values replaced (Claude and the view never see cookies or tokens). */
export function redactHeaders(headers: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers ?? {}))
    out[k] = SECRET_HEADERS.test(k) ? "«redacted»" : String(v).slice(0, 2000);
  return out;
}

/** A failed request, or one with an HTTP error status. */
export const isNetworkError = (e: NetworkEntry) => Boolean(e.error) || (e.status ?? 0) >= 400;

/** The network log as lines for Claude: `#id GET 200 xhr 123ms /api/cart`. */
export function networkSummary(
  entries: NetworkEntry[],
  options: { filter?: string; errorsOnly?: boolean; limit?: number } = {},
): string {
  const filter = options.filter?.toLowerCase();
  const list = entries
    .filter((e) => !filter || e.url.toLowerCase().includes(filter) || e.method.toLowerCase() === filter)
    .filter((e) => !options.errorsOnly || isNetworkError(e))
    .slice(-(options.limit ?? 100));
  if (!list.length) return "No requests recorded.";
  return list
    .map(
      (e) =>
        `#${e.id} ${e.method} ${e.error ? `failed (${e.error})` : (e.status ?? "pending")} ${e.type}${e.durationMs !== undefined ? ` ${Math.round(e.durationMs)}ms` : ""}${e.size !== undefined ? ` ${e.size}B` : ""} ${e.url}`,
    )
    .join("\n");
}
