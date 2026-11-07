import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BrowserWindow, type NativeImage, session } from "electron";
import { markHelperWindow } from "../appWindows";
import { logger } from "../log";
import {
  CAPTURE_LIMITS,
  type CaptureStep,
  changeScript,
  clickScript,
  describeStep,
  findScript,
  framesDue,
  highlightScript,
  hoverScript,
  isCaptureUrl,
  moveScript,
  OVERLAY_SCRIPT,
  scrollScript,
  stepPause,
  TEXT_SCRIPT,
  typeCharScript,
} from "./steps";

const log = logger("capture");

export interface CaptureInput {
  url: string;
  steps: CaptureStep[];
  width: number;
  height: number;
  maxSeconds: number;
  fps?: number;
}

export interface CaptureResult {
  /** The folder of the frames, `000001.jpg` on, inside the add-on's data folder. */
  dir: string;
  frames: number;
  fps: number;
  width: number;
  height: number;
  seconds: number;
  /** Stopped at `maxSeconds` before the last step. */
  cut: boolean;
  /** The page's text after loading and after each step (for a real-data scan), at most 40. */
  texts: string[];
  /**
   * When each step acted (seconds into the recording) and, for steps on an element, its box as a
   * share of the frame (0–1), so a caller can zoom or highlight there.
   */
  events: CaptureEvent[];
}

export interface CaptureEvent {
  step: number;
  do: CaptureStep["do"];
  at: number;
  box?: { x: number; y: number; w: number; h: number };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let running = 0;

/**
 * `api.capture.record` (D-457, D-464): loads `url` in an offscreen window of the given size (never
 * shown, its own in-memory session, no pop-ups, no permissions, no downloads), plays the steps with
 * a drawn cursor and records what it paints as JPEG frames at a steady rate. A step that fails stops
 * the capture with the step's name, and the frames are removed.
 */
export async function recordCapture(input: CaptureInput, dataDir: string): Promise<CaptureResult> {
  if (!isCaptureUrl(input.url)) throw new Error("A capture starts from an http(s) or file address");
  if (running >= 2) throw new Error("Two captures are already recording; wait for one to finish");
  running++;
  const fps = input.fps === 60 ? 60 : input.fps === 24 ? 24 : 30;
  const width = Math.round(input.width);
  const height = Math.round(input.height);
  const dir = join(dataDir, "captures", `c_${randomBytes(5).toString("hex")}`);
  await mkdir(dir, { recursive: true });
  const ses = session.fromPartition(`capture-${randomBytes(6).toString("hex")}`, { cache: false });
  ses.setPermissionRequestHandler((_wc, _permission, done) => done(false));
  ses.setPermissionCheckHandler(() => false);
  ses.on("will-download", (event) => event.preventDefault());
  const win = new BrowserWindow({
    show: false,
    width,
    height,
    useContentSize: true,
    frame: false,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      offscreen: true,
      session: ses,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });
  markHelperWindow(win);
  const wc = win.webContents;
  wc.setWindowOpenHandler(() => ({ action: "deny" }));
  wc.on("will-navigate", (event, url) => {
    if (!isCaptureUrl(url)) event.preventDefault();
  });
  wc.setFrameRate(fps);
  wc.setAudioMuted(true);

  let latest: NativeImage | undefined;
  wc.on("paint", (_event, _dirty, image) => {
    latest = image;
  });
  wc.on("did-finish-load", () => void wc.executeJavaScript(OVERLAY_SCRIPT).catch(() => undefined));

  let written = 0;
  let started = 0;
  let writing: Promise<unknown> = Promise.resolve();
  let timer: ReturnType<typeof setInterval> | undefined;
  const texts: string[] = [];
  const events: CaptureEvent[] = [];
  let cut = false;
  const frameOf = (image: NativeImage) => {
    const size = image.getSize();
    const fit = size.width === width && size.height === height ? image : image.resize({ width, height });
    return fit.toJPEG(88);
  };
  const keepText = async () => {
    const text = String(await wc.executeJavaScript(TEXT_SCRIPT).catch(() => ""));
    if (text && texts.at(-1) !== text && texts.length < 40) texts.push(text);
  };
  const deadline = () => started && Date.now() - started > input.maxSeconds * 1000;

  try {
    await withTimeout(wc.loadURL(input.url), 30_000, `The page didn't load: ${input.url}`);
    await wc.executeJavaScript(OVERLAY_SCRIPT).catch(() => undefined);
    // Wait for the first paint, then record at a steady rate (repeating the last frame while nothing
    // changes, so the video keeps real time).
    for (let i = 0; !latest && i < 50; i++) {
      wc.invalidate();
      await sleep(100);
    }
    if (!latest) throw new Error("The page painted nothing");
    started = Date.now();
    const tick = () => {
      const due = Math.min(framesDue(Date.now() - started, fps), Math.ceil(input.maxSeconds * fps));
      if (!latest || written >= due) return;
      const jpeg = frameOf(latest);
      const files: Promise<void>[] = [];
      while (written < due) {
        written++;
        files.push(writeFile(join(dir, `${String(written).padStart(6, "0")}.jpg`), jpeg));
      }
      writing = writing.then(() => Promise.all(files));
    };
    timer = setInterval(tick, Math.floor(1000 / fps));
    await keepText();
    await sleep(400);
    for (const [index, step] of input.steps.entries()) {
      if (deadline()) {
        cut = true;
        break;
      }
      const name = describeStep(step, index);
      try {
        await runStep(wc, step, (box) => {
          const at = Math.round(((Date.now() - started) / 1000) * 100) / 100;
          const share = (n: number, of: number) => Math.round(Math.max(0, Math.min(1, n / of)) * 1000) / 1000;
          events.push({
            step: index,
            do: step.do,
            at,
            ...(box
              ? {
                  box: {
                    x: share(box.left, width),
                    y: share(box.top, height),
                    w: share(box.w, width),
                    h: share(box.h, height),
                  },
                }
              : {}),
          });
        });
      } catch (error) {
        throw new Error(`${name} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      await sleep(stepPause(step));
      await keepText();
    }
    await sleep(600);
    tick();
    clearInterval(timer);
    timer = undefined;
    await writing;
    if (!written) throw new Error("Nothing was recorded");
    return { dir, frames: written, fps, width, height, seconds: written / fps, cut, texts, events };
  } catch (error) {
    if (timer) clearInterval(timer);
    await writing.catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
    log.info(`capture failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  } finally {
    running--;
    if (!win.isDestroyed()) win.destroy();
  }
}

type Box = { x: number; y: number; w: number; h: number; left: number; top: number };

/** Plays one step; `acted` is called the moment it acts, with the element's box when it has one. */
async function runStep(
  wc: Electron.WebContents,
  step: CaptureStep,
  acted: (box?: Box) => void,
): Promise<void> {
  const run = (script: string) => wc.executeJavaScript(script, true) as Promise<unknown>;
  const find = async (selector: string) => {
    const found = (await run(findScript(selector))) as Box | { error: string };
    if ("error" in found) throw new Error(found.error);
    return found;
  };
  switch (step.do) {
    case "go":
      if (!isCaptureUrl(step.url)) throw new Error("only http(s) and file addresses");
      acted();
      await withTimeout(wc.loadURL(step.url), 30_000, "the page didn't load");
      await run(OVERLAY_SCRIPT);
      return;
    case "click":
    case "hover": {
      const at = await find(step.selector);
      await run(moveScript(at.x, at.y));
      await sleep(650);
      acted(at);
      if (!(await run(step.do === "click" ? clickScript(step.selector) : hoverScript(step.selector))))
        throw new Error(`nothing matches ${step.selector}`);
      return;
    }
    case "type": {
      const at = await find(step.selector);
      await run(moveScript(at.x, at.y));
      await sleep(500);
      acted(at);
      await run(clickScript(step.selector));
      const text = step.text.slice(0, CAPTURE_LIMITS.text);
      for (let i = 1; i <= text.length; i++) {
        await run(typeCharScript(step.selector, text.slice(0, i)));
        await sleep(55);
      }
      await run(changeScript(step.selector));
      return;
    }
    case "scroll":
      acted(step.selector ? await find(step.selector) : undefined);
      if (!(await run(scrollScript(step)))) throw new Error(`nothing matches ${step.selector}`);
      return;
    case "wait":
      acted();
      return;
    case "highlight": {
      const at = await find(step.selector);
      acted(at);
      await run(highlightScript(at, Math.min(CAPTURE_LIMITS.wait, step.ms ?? 1200)));
      return;
    }
  }
}

function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    work.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
