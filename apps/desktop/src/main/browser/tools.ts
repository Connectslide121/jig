import { z } from "zod";
import type { BrowserState } from "../../shared/browser";
import { VIEWPORTS } from "../../shared/browser";
import type { JigTool } from "../engine/jigTools";
import type { ToolOutput } from "../engine/types";
import type { BrowserService } from "./service";

const target = {
  ref: z.number().int().optional().describe("Element number from jig_browser_read, e.g. 4 for [4]"),
  selector: z.string().optional().describe("CSS selector, when there is no ref"),
};

const where = (s: BrowserState) =>
  `${s.title ? `"${s.title}" — ` : ""}${s.url}${s.errors ? ` (${s.errors} console error${s.errors === 1 ? "" : "s"}: jig_browser_console)` : ""}`;

async function pageText(browser: BrowserService): Promise<string> {
  const page = await browser.snapshot();
  return [
    `Page: ${page.title ? `"${page.title}" — ` : ""}${page.url}`,
    "",
    page.text + (page.truncated ? "\n… (more text below)" : ""),
    "",
    page.items.length ? `Interactive elements:\n${page.items.join("\n")}` : "No interactive elements.",
  ].join("\n");
}

/**
 * Claude's browser as tools on the `jig` server: Claude opens the app it is building, reads the page,
 * clicks and types like a person, takes screenshots (shown in the chat) and reads the console. The
 * user watches the same page in the Browser view and can take over at any time.
 */
export function browserTools(browser: () => BrowserService): JigTool[] {
  const after = async (what: string): Promise<string> => `${what}\nNow at ${where(browser().state())}`;
  return [
    {
      name: "jig_browser_open",
      description:
        "Open a web page in Claude's browser, a real Chromium page inside Jig that the user can watch (e.g. the dev server you started: `localhost:5173`, or a file:// page). Returns the page text and its numbered interactive elements. Use it to check UI work yourself: open, click, type, screenshot, read the console.",
      shape: { url: z.string().describe("URL, e.g. http://localhost:3000 or localhost:3000/login") },
      handler: async (args) => {
        const state = await browser().open(String(args.url));
        if (state.errors && !state.title)
          return `Couldn't load ${state.url}. ${JSON.stringify(browser().consoleEntries(false).at(-1)?.message ?? "")}`;
        return pageText(browser());
      },
    },
    {
      name: "jig_browser_read",
      readOnly: true,
      description:
        "Read the current page of Claude's browser: its text and the interactive elements numbered [n] for jig_browser_click / jig_browser_type. Read again after the page changes: numbers are renewed.",
      shape: {},
      handler: async () => pageText(browser()),
    },
    {
      name: "jig_browser_click",
      description:
        "Click an element of the page in Claude's browser, by its number from jig_browser_read, a CSS selector or its visible text. Real mouse events, like a person.",
      shape: { ...target, text: z.string().optional().describe("Visible text of a button or link") },
      handler: async (args) =>
        after(
          await browser().click({
            ref: args.ref as number | undefined,
            selector: args.selector as string | undefined,
            text: args.text as string | undefined,
          }),
        ),
    },
    {
      name: "jig_browser_type",
      description:
        "Type into a field of the page in Claude's browser (by number or selector). Replaces what is in it unless clear is false; submit presses Enter afterwards.",
      shape: {
        ...target,
        text: z.string(),
        clear: z.boolean().optional().describe("Clear the field first (default true)"),
        submit: z.boolean().optional().describe("Press Enter after typing"),
      },
      handler: async (args) =>
        after(
          await browser().type(
            { ref: args.ref as number | undefined, selector: args.selector as string | undefined },
            String(args.text),
            { clear: args.clear as boolean | undefined, submit: args.submit as boolean | undefined },
          ),
        ),
    },
    {
      name: "jig_browser_press",
      description: "Press a key in Claude's browser: Enter, Escape, Tab, ArrowDown, Backspace, a letter…",
      shape: { key: z.string().describe("Key name, e.g. Enter, Escape, Tab, ArrowDown") },
      handler: async (args) => after(await browser().press(String(args.key))),
    },
    {
      name: "jig_browser_screenshot",
      readOnly: true,
      description:
        "Screenshot of the page in Claude's browser (headless: nothing pops up for the user). The images come back to you and show in the chat. fullPage captures the whole page, not only the visible part; sizes takes one screenshot per window size (desktop 1280×800, tablet 820×1180, phone 390×844) and then restores the size, for responsive checks in one call. Use jig_browser_read for text.",
      shape: {
        fullPage: z.boolean().optional().describe("The whole page, not only the visible part"),
        sizes: z
          .array(z.enum(["desktop", "tablet", "phone"]))
          .max(3)
          .optional()
          .describe('One screenshot per window size, e.g. ["phone", "desktop"]'),
      },
      handler: async (args): Promise<ToolOutput> => {
        const fullPage = Boolean(args.fullPage);
        const sizes = (args.sizes as Array<keyof typeof VIEWPORTS> | undefined) ?? [];
        if (!sizes.length) {
          const shot = await browser().screenshot({ fullPage });
          return {
            text: `Screenshot of ${where(browser().state())} (${shot.width}×${shot.height}${fullPage ? ", whole page" : ""}).`,
            images: [{ mime: "image/png", data: shot.png }],
          };
        }
        const before = browser().size();
        const lines: string[] = [];
        const images: Array<{ mime: string; data: string }> = [];
        try {
          for (const name of sizes) {
            const v = VIEWPORTS[name];
            browser().resize(v.width, v.height);
            await new Promise((r) => setTimeout(r, 400));
            const shot = await browser().screenshot({ fullPage });
            lines.push(`${images.length + 1}. ${v.label} (${v.width}×${v.height})`);
            images.push({ mime: "image/png", data: shot.png });
          }
        } finally {
          browser().resize(before.width, before.height);
        }
        return {
          text: `Screenshots of ${where(browser().state())}${fullPage ? ", whole page" : ""}, in this order:\n${lines.join("\n")}`,
          images,
        };
      },
    },
    {
      name: "jig_browser_console",
      readOnly: true,
      description:
        "Console messages and load errors of Claude's browser since it opened or was last cleared (most recent last).",
      shape: {
        errorsOnly: z.boolean().optional().describe("Only errors"),
        clear: z.boolean().optional().describe("Clear the list after reading"),
      },
      handler: async (args) => {
        const list = browser()
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
      name: "jig_browser_eval",
      description:
        "Run a JavaScript expression in the page of Claude's browser and get its value as JSON (awaited if it is a promise). For checks the page text can't show: state, computed styles, localStorage.",
      shape: {
        expression: z.string().describe("An expression, e.g. document.querySelectorAll('li').length"),
      },
      handler: async (args) => browser().evaluate(String(args.expression)),
    },
    {
      name: "jig_browser_resize",
      description:
        "Resize Claude's browser to test responsive layouts: a preset (desktop 1280×800, tablet 820×1180, phone 390×844) or width and height.",
      shape: {
        preset: z.enum(["desktop", "tablet", "phone"]).optional(),
        width: z.number().int().min(200).max(4000).optional(),
        height: z.number().int().min(200).max(4000).optional(),
      },
      handler: async (args) => {
        const preset = args.preset ? VIEWPORTS[args.preset as keyof typeof VIEWPORTS] : undefined;
        const width = (args.width as number | undefined) ?? preset?.width ?? VIEWPORTS.desktop.width;
        const height = (args.height as number | undefined) ?? preset?.height ?? VIEWPORTS.desktop.height;
        const s = browser().resize(width, height);
        await new Promise((r) => setTimeout(r, 300));
        return `Claude's browser is now ${s.width}×${s.height}.`;
      },
    },
    {
      name: "jig_browser_navigate",
      description: "Go back, forward or reload the page in Claude's browser.",
      shape: { action: z.enum(["back", "forward", "reload"]) },
      handler: async (args) => {
        const s = await browser().navigate(args.action as "back" | "forward" | "reload");
        return `Now at ${where(s)}`;
      },
    },
  ];
}
