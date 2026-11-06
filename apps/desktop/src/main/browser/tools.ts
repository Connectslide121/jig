import { z } from "zod";
import type { BrowserState } from "../../shared/browser";
import { networkSummary, VIEWPORTS } from "../../shared/browser";
import type { JigTool } from "../engine/jigTools";
import type { ToolOutput } from "../engine/types";
import { logger } from "../log";
import { LIMITS, secs, TimeoutError, withTimeout } from "./deadline";
import type { BrowserPages } from "./pages";
import type { BrowserPage } from "./service";

const log = logger("browser");
/** Results say how long they took from this long on (ms), so Claude notices time passing. */
const SHOW_TIME_MS = 3_000;
/** Calls this long or longer go into main.log (ms). */
const LOG_TIME_MS = 10_000;

const target = {
  ref: z.number().int().optional().describe("Element number from jig_browser_read, e.g. 4 for [4]"),
  selector: z.string().optional().describe("CSS selector, when there is no ref"),
};

const where = (s: BrowserState) =>
  `${s.title ? `"${s.title}" — ` : ""}${s.url}${s.errors ? ` (${s.errors} console error${s.errors === 1 ? "" : "s"}: jig_browser_console)` : ""}`;

async function pageText(browser: BrowserPage): Promise<string> {
  const page = await browser.snapshot();
  return [
    `Page: ${page.title ? `"${page.title}" — ` : ""}${page.url}`,
    "",
    page.text + (page.truncated ? "\n… (more text below)" : ""),
    "",
    page.items.length ? `Interactive elements:\n${page.items.join("\n")}` : "No interactive elements.",
  ].join("\n");
}

const withText = (out: ToolOutput, edit: (text: string) => string): ToolOutput =>
  typeof out === "string" ? edit(out) : { ...out, text: edit(out.text) };

/** A browser tool, given the calling chat's page. */
type PageTool = Omit<JigTool, "handler"> & {
  handler: (args: Record<string, unknown>, page: BrowserPage) => Promise<ToolOutput>;
};

/**
 * Every browser tool call acts on the calling chat's own page (D-320; a jig-tester subagent calls
 * through its parent chat, so it uses that chat's page). It has a backstop (`LIMITS.call`) and gives
 * up when the chat is stopped (D-319): the browser's own waits are limited too, so an abandoned call
 * ends soon by itself and the page stays usable. A result says how long it took when that's over a
 * few seconds, and starts with what happened to the page since the last call (a crash, a recreated
 * page, a page Jig closed).
 */
export function guardBrowserTool(pages: BrowserPages, tool: PageTool): JigTool {
  return {
    ...tool,
    handler: async (args, meta, signal) => {
      const started = Date.now();
      const took = () => Date.now() - started;
      const timing = () => (took() >= SHOW_TIME_MS ? `(took ${secs(took())})` : "");
      const { page, notice: closed } = pages.begin(meta.id);
      const notices = () => [closed, page.takeNotice()].filter(Boolean).join("\n") || undefined;
      let out: ToolOutput;
      try {
        out = await withTimeout(tool.handler(args, page), LIMITS.call, "call", signal);
      } catch (error) {
        let message = (error as Error).message;
        if (error instanceof TimeoutError && error.label === "call") {
          log.warn(`${tool.name} didn't finish in ${secs(LIMITS.call)}; abandoned it`);
          message = `${tool.name} didn't finish in ${secs(LIMITS.call)} and was abandoned. The browser is still usable: try again, or jig_browser_read to see where the page is.`;
        } else if (signal?.aborted) {
          log.info(`${tool.name} abandoned after ${secs(took())}: the chat was stopped`);
          message = "Stopped: the chat was stopped while the browser was working.";
        } else if (took() >= LOG_TIME_MS) log.info(`${tool.name} failed after ${secs(took())}`);
        const notice = notices();
        if (notice && !message.includes(notice)) message = `${notice}\n${message}`;
        throw new Error([message, timing()].filter(Boolean).join(" "));
      } finally {
        pages.end(meta.id);
      }
      if (took() >= LOG_TIME_MS) log.info(`${tool.name} took ${secs(took())}`);
      const notice = notices();
      const time = timing();
      if (!notice && !time) return out;
      return withText(out, (text) =>
        [notice ? `Note: ${notice}` : "", text, time].filter(Boolean).join("\n"),
      );
    },
  };
}

/**
 * Jig's browser as tools on the `jig` server: Claude opens the app it is building, reads the page,
 * clicks and types like a person, takes screenshots (shown in the chat) and reads the console. Each
 * chat has its own page (D-320); the user watches it in the Browser view, one tab per chat's page, and
 * can take over at any time.
 */
export function browserTools(pages: BrowserPages): JigTool[] {
  return tools().map((t) => guardBrowserTool(pages, t));
}

function tools(): PageTool[] {
  const after = (b: BrowserPage, what: string): string => `${what}\nNow at ${where(b.state())}`;
  return [
    {
      name: "jig_browser_open",
      description:
        "Open a web page in this chat's own page of Jig's browser, a real Chromium page inside Jig that the user can watch (e.g. the dev server you started: `localhost:5173`, or a file:// page). Returns the page text and its numbered interactive elements. Use it to check UI work yourself: open, click, type, screenshot, read the console. The page is this chat's own (your jig-tester subagents share it); other chats browsing at the same time have theirs and never change yours.",
      shape: { url: z.string().describe("URL, e.g. http://localhost:3000 or localhost:3000/login") },
      handler: async (args, b) => {
        const { state, timedOut, url } = await b.open(String(args.url));
        if (timedOut)
          return `The page didn't finish loading in ${secs(LIMITS.load)} (still loading: ${url}). The page may be waiting on a dev server; try jig_browser_read or open it again.\nNow at ${where(state)}`;
        if (state.errors && !state.title)
          return `Couldn't load ${state.url}. ${JSON.stringify(b.consoleEntries(false).at(-1)?.message ?? "")}`;
        return pageText(b);
      },
    },
    {
      name: "jig_browser_read",
      readOnly: true,
      description:
        "Read this chat's page in Jig's browser: its text and the interactive elements numbered [n] for jig_browser_click / jig_browser_type. Read again after the page changes: numbers are renewed.",
      shape: {},
      handler: async (_args, b) => pageText(b),
    },
    {
      name: "jig_browser_click",
      description:
        "Click an element of this chat's page in Jig's browser, by its number from jig_browser_read, a CSS selector or its visible text. Real mouse events, like a person.",
      shape: { ...target, text: z.string().optional().describe("Visible text of a button or link") },
      handler: async (args, b) =>
        after(
          b,
          await b.click({
            ref: args.ref as number | undefined,
            selector: args.selector as string | undefined,
            text: args.text as string | undefined,
          }),
        ),
    },
    {
      name: "jig_browser_type",
      description:
        "Type into a field of this chat's page in Jig's browser (by number or selector). Replaces what is in it unless clear is false; submit presses Enter afterwards.",
      shape: {
        ...target,
        text: z.string(),
        clear: z.boolean().optional().describe("Clear the field first (default true)"),
        submit: z.boolean().optional().describe("Press Enter after typing"),
      },
      handler: async (args, b) =>
        after(
          b,
          await b.type(
            { ref: args.ref as number | undefined, selector: args.selector as string | undefined },
            String(args.text),
            { clear: args.clear as boolean | undefined, submit: args.submit as boolean | undefined },
          ),
        ),
    },
    {
      name: "jig_browser_press",
      description:
        "Press a key in this chat's page of Jig's browser: Enter, Escape, Tab, ArrowDown, Backspace, a letter…",
      shape: { key: z.string().describe("Key name, e.g. Enter, Escape, Tab, ArrowDown") },
      handler: async (args, b) => after(b, await b.press(String(args.key))),
    },
    {
      name: "jig_browser_screenshot",
      readOnly: true,
      description:
        "Screenshot of this chat's page in Jig's browser (headless: nothing pops up for the user). The images come back to you and show in the chat. fullPage captures the whole page, not only the visible part; sizes takes one screenshot per window size (desktop 1280×800, tablet 820×1180, phone 390×844) and then restores the size, for responsive checks in one call. Use jig_browser_read for text.",
      shape: {
        fullPage: z.boolean().optional().describe("The whole page, not only the visible part"),
        sizes: z
          .array(z.enum(["desktop", "tablet", "phone"]))
          .max(3)
          .optional()
          .describe('One screenshot per window size, e.g. ["phone", "desktop"]'),
      },
      handler: async (args, b): Promise<ToolOutput> => {
        const fullPage = Boolean(args.fullPage);
        const sizes = (args.sizes as Array<keyof typeof VIEWPORTS> | undefined) ?? [];
        if (!sizes.length) {
          const shot = await b.screenshot({ fullPage });
          return {
            text: `Screenshot of ${where(b.state())} (${shot.width}×${shot.height}${fullPage ? ", whole page" : ""}).`,
            images: [{ mime: "image/png", data: shot.png }],
          };
        }
        const before = b.size();
        const lines: string[] = [];
        const images: Array<{ mime: string; data: string }> = [];
        try {
          for (const name of sizes) {
            const v = VIEWPORTS[name];
            b.resize(v.width, v.height);
            await new Promise((r) => setTimeout(r, 400));
            const shot = await b.screenshot({ fullPage });
            lines.push(`${images.length + 1}. ${v.label} (${v.width}×${v.height})`);
            images.push({ mime: "image/png", data: shot.png });
          }
        } finally {
          b.resize(before.width, before.height);
        }
        return {
          text: `Screenshots of ${where(b.state())}${fullPage ? ", whole page" : ""}, in this order:\n${lines.join("\n")}`,
          images,
        };
      },
    },
    {
      name: "jig_browser_console",
      readOnly: true,
      description:
        "Console messages and load errors of this chat's page in Jig's browser since it opened or was last cleared (most recent last).",
      shape: {
        errorsOnly: z.boolean().optional().describe("Only errors"),
        clear: z.boolean().optional().describe("Clear the list after reading"),
      },
      handler: async (args, b) => {
        const list = b
          .consoleEntries(Boolean(args.clear))
          .filter((e) => !args.errorsOnly || e.level === "error")
          .slice(-100);
        if (!list.length) return "No console messages.";
        return list
          .map(
            (e) =>
              `[${e.level}] ${e.message}${e.source ? ` (${e.source}${e.line ? `:${e.line}` : ""})` : ""}`,
          )
          .join("\n");
      },
    },
    {
      name: "jig_browser_network",
      readOnly: true,
      description:
        "The requests this chat's page in Jig's browser made (like the Network tab in DevTools): method, status, type, time, size, URL. Filter by part of the URL, or only failed ones. Pass `id` for one request's headers (credentials redacted), request body and response body. Use it to debug API calls instead of asking the user to copy them from their browser.",
      shape: {
        filter: z.string().optional().describe("Part of the URL (e.g. /api/), or a method"),
        errorsOnly: z.boolean().optional().describe("Only failed requests and HTTP errors (4xx/5xx)"),
        id: z.string().optional().describe("A request's id from the list, for its detail"),
        clear: z.boolean().optional().describe("Empty the log after reading it"),
      },
      handler: async (args, b) => {
        if (args.id) {
          const d = await b.networkDetail(String(args.id));
          const headers = (h?: Record<string, string>) =>
            Object.entries(h ?? {})
              .map(([k, v]) => `  ${k}: ${v}`)
              .join("\n");
          return [
            `${d.method} ${d.url}`,
            d.error
              ? `Failed: ${d.error}`
              : `${d.status ?? "pending"} ${d.statusText ?? ""} (${d.mimeType ?? ""})`,
            d.requestHeaders ? `Request headers:\n${headers(d.requestHeaders)}` : "",
            d.postData ? `Request body:\n${d.postData}` : "",
            d.responseHeaders ? `Response headers:\n${headers(d.responseHeaders)}` : "",
            d.body !== undefined ? `Response body:\n${d.body}` : "",
            d.bodyNote ?? "",
          ]
            .filter(Boolean)
            .join("\n");
        }
        return networkSummary(b.networkEntries(Boolean(args.clear)), {
          filter: args.filter as string | undefined,
          errorsOnly: Boolean(args.errorsOnly),
        });
      },
    },
    {
      name: "jig_browser_eval",
      description:
        "Run a JavaScript expression in this chat's page of Jig's browser and get its value as JSON (awaited if it is a promise). For checks the page text can't show: state, computed styles, localStorage.",
      shape: {
        expression: z.string().describe("An expression, e.g. document.querySelectorAll('li').length"),
      },
      handler: async (args, b) => b.evaluate(String(args.expression)),
    },
    {
      name: "jig_browser_resize",
      description:
        "Resize this chat's page of Jig's browser to test responsive layouts: a preset (desktop 1280×800, tablet 820×1180, phone 390×844) or width and height.",
      shape: {
        preset: z.enum(["desktop", "tablet", "phone"]).optional(),
        width: z.number().int().min(200).max(4000).optional(),
        height: z.number().int().min(200).max(4000).optional(),
      },
      handler: async (args, b) => {
        const preset = args.preset ? VIEWPORTS[args.preset as keyof typeof VIEWPORTS] : undefined;
        const width = (args.width as number | undefined) ?? preset?.width ?? VIEWPORTS.desktop.width;
        const height = (args.height as number | undefined) ?? preset?.height ?? VIEWPORTS.desktop.height;
        const s = b.resize(width, height);
        await new Promise((r) => setTimeout(r, 300));
        return `This chat's page is now ${s.width}×${s.height}.`;
      },
    },
    {
      name: "jig_browser_navigate",
      description: "Go back, forward or reload this chat's page in Jig's browser.",
      shape: { action: z.enum(["back", "forward", "reload"]) },
      handler: async (args, b) => {
        const s = await b.navigate(args.action as "back" | "forward" | "reload");
        return `Now at ${where(s)}`;
      },
    },
  ];
}
