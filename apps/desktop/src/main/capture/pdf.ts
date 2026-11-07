import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { BrowserWindow, session } from "electron";
import { markHelperWindow } from "../appWindows";
import { withTimeout } from "./record";

export interface PdfInput {
  /** An HTML file, absolute. */
  file: string;
  /** Where the PDF goes, absolute, ending in `.pdf`. */
  out: string;
  /** `a4` (portrait, the default) or `slides` (16:9 landscape); the page's own `@page` rule wins. */
  page?: "a4" | "slides";
}

let running = 0;

/**
 * `api.capture.pdf` (D-466): prints a local HTML file to PDF in a hidden window (never shown, its
 * own in-memory session, no pop-ups, no permissions, no downloads, no navigation away), with its
 * backgrounds, after its fonts have loaded.
 */
export async function printPdf(input: PdfInput): Promise<{ path: string; bytes: number }> {
  if (running >= 2) throw new Error("Two PDFs are already being made; wait for one to finish");
  running++;
  const ses = session.fromPartition(`pdf-${randomBytes(6).toString("hex")}`, { cache: false });
  ses.setPermissionRequestHandler((_wc, _permission, done) => done(false));
  ses.setPermissionCheckHandler(() => false);
  ses.on("will-download", (event) => event.preventDefault());
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 720,
    webPreferences: {
      session: ses,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  markHelperWindow(win);
  const wc = win.webContents;
  const url = pathToFileURL(input.file).toString();
  wc.setWindowOpenHandler(() => ({ action: "deny" }));
  wc.on("will-navigate", (event, to) => {
    if (to !== url) event.preventDefault();
  });
  wc.setAudioMuted(true);
  try {
    await withTimeout(wc.loadURL(url), 30_000, `The page didn't load: ${input.file}`);
    await withTimeout(
      wc.executeJavaScript("document.fonts ? document.fonts.ready.then(() => true) : true"),
      10_000,
      "The page's fonts didn't load",
    ).catch(() => undefined);
    const data = await wc.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      ...(input.page === "slides"
        ? {
            landscape: false,
            pageSize: { width: 13.333, height: 7.5 },
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
          }
        : { pageSize: "A4" as const }),
    });
    await mkdir(dirname(input.out), { recursive: true });
    await writeFile(input.out, data);
    return { path: input.out, bytes: data.length };
  } finally {
    running--;
    if (!win.isDestroyed()) win.destroy();
  }
}
