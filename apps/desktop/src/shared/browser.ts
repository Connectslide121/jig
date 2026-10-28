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
