import { app, type BrowserWindow, dialog } from "electron";
import { CHANNEL_EVENT, type HostEvents } from "../../shared/ipc";
import type { QuitPurpose, QuitReason } from "../../shared/quit";
import { closingQuits, hiddenMode, revealWindow, workbenchWindow } from "../appWindows";
import { handle } from "../ipc/router";
import { logger } from "../log";

/**
 * One quit flow for everything that wants to ask before Jig closes (D-343). Quitting from the menu,
 * Alt+F4, closing the last window or installing an update first asks every quit guard (Meetings, add-ons'
 * `contributes.quitGuards`) with a short time limit. When any answers, the quit is cancelled and the
 * workbench shows one modal listing the reasons; it quits only on the user's choice. Then the flushes
 * (the last chat writes) run once and Jig quits for real. Documented in docs/architecture.md → Quitting.
 */

const log = logger("quit");

/** A reason to ask, and what its buttons do. */
export interface QuitAsk {
  reason: QuitReason;
  run?: (actionId: string) => Promise<unknown>;
}

/** A guard answers with its reasons to ask (none = nothing to ask). */
export type QuitGuard = () => Promise<QuitAsk[]> | QuitAsk[];

/** How long a guard may take before it is skipped. */
export const GUARD_TIMEOUT_MS = 2_000;

const guards = new Map<string, QuitGuard>();
const flushes: Array<() => Promise<unknown>> = [];

/**
 * idle → asking (gathering answers) → confirmed (the user agreed, or nothing asked) → flushing → done.
 * While the modal is open the phase is idle again: the quit was cancelled until the user decides.
 */
type Phase = "idle" | "asking" | "confirmed" | "flushing" | "done";
let phase: Phase = "idle";
let pending: { asks: QuitAsk[]; then: () => void } | undefined;
let installed = false;

/** Hidden (tests) never asks, unless a test opts in with JIG_ASK_BEFORE_QUIT. */
export function asksBeforeQuit(env: Record<string, string | undefined> = process.env): boolean {
  return !hiddenMode(env) || Boolean(env.JIG_ASK_BEFORE_QUIT);
}

/** Adds a guard Jig asks before it quits; registering the same id again replaces it. */
export function registerQuitGuard(id: string, guard: QuitGuard): void {
  install();
  guards.set(id, guard);
}

/** Work that must finish before Jig quits (it runs once, after the user agreed). */
export function beforeQuitting(flush: () => Promise<unknown>): void {
  install();
  flushes.push(flush);
}

/** The quit was agreed to: windows may close without asking again. */
export function quitConfirmed(): boolean {
  return phase === "confirmed" || phase === "flushing" || phase === "done";
}

/**
 * Asks the guards, then runs `then` (by default quitting). Resolves true when it ran right away, false
 * when the modal asks (`then` runs later, on the user's choice) or a question is already being gathered.
 */
export async function requestQuit(then: () => void = () => app.quit(), purpose: QuitPurpose = "quit") {
  if (quitConfirmed()) {
    then();
    return true;
  }
  if (phase === "asking") return false;
  phase = "asking";
  const asks = asksBeforeQuit() ? await gather() : [];
  if (!asks.length) {
    pending = undefined;
    phase = "confirmed";
    then();
    return true;
  }
  pending = { asks, then };
  phase = "idle";
  show(asks, purpose);
  return false;
}

/** Every guard's reasons, each guard given `GUARD_TIMEOUT_MS`; a failing or slow guard is skipped. */
export async function gather(timeoutMs = GUARD_TIMEOUT_MS): Promise<QuitAsk[]> {
  const answers = await Promise.all(
    [...guards].map(async ([id, guard]) => {
      let timer: NodeJS.Timeout | undefined;
      const late = new Promise<"late">((resolve) => {
        timer = setTimeout(() => resolve("late"), timeoutMs);
      });
      try {
        const value = await Promise.race([Promise.resolve().then(guard), late]);
        if (value === "late") {
          log.warn(`Quit guard ${id} took over ${timeoutMs} ms, skipped`);
          return [];
        }
        return value;
      } catch (error) {
        log.warn(`Quit guard ${id} failed, skipped: ${(error as Error).message}`);
        return [];
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  return answers.flat();
}

/** The user's choice in the modal. A failing action throws and leaves the question open. */
export async function decide(choice: { quit: boolean; reason?: string; action?: string }): Promise<void> {
  const current = pending;
  if (!current) return;
  if (!choice.quit) {
    pending = undefined;
    return;
  }
  if (choice.reason && choice.action) {
    const ask = current.asks.find((a) => a.reason.key === choice.reason);
    if (ask?.run) await ask.run(choice.action);
  }
  if (pending !== current) return;
  pending = undefined;
  phase = "confirmed";
  current.then();
}

/** Closing the last window asks first, like quitting (on macOS closing a window never quits). */
export function guardWindowClose(window: BrowserWindow): void {
  window.on("close", (event) => {
    if (process.platform === "darwin" || quitConfirmed() || !closingQuits(window)) return;
    event.preventDefault();
    void requestQuit();
  });
}

function show(asks: QuitAsk[], purpose: QuitPurpose): void {
  const reasons = asks.map((a) => a.reason);
  const window = workbenchWindow();
  if (window) {
    revealWindow(window);
    const question: HostEvents["quit.ask"] = { purpose, reasons };
    window.webContents.send(CHANNEL_EVENT, "quit.ask", question);
    return;
  }
  // No workbench to show it in (only the Meetings lobby is open): the system's own question.
  void dialog
    .showMessageBox({
      type: "question",
      message: purpose === "update" ? "Restart Jig to install the update?" : "Quit Jig?",
      detail: reasons.map((r) => [r.message, r.detail].filter(Boolean).join("\n")).join("\n\n"),
      buttons: ["Cancel", purpose === "update" ? "Restart anyway" : "Quit anyway"],
      defaultId: 0,
      cancelId: 0,
    })
    .then(({ response }) => decide({ quit: response === 1 }));
}

function install(): void {
  if (installed) return;
  installed = true;
  // First of the before-quit listeners, so the others see a cancelled quit as `defaultPrevented`.
  app.prependListener("before-quit", (event) => {
    if (phase === "done") return;
    event.preventDefault();
    if (phase === "confirmed") {
      phase = "flushing";
      void Promise.allSettled(flushes.map((flush) => flush())).finally(() => {
        phase = "done";
        app.quit();
      });
    } else if (phase === "idle") void requestQuit();
  });
  handle("quit.decide", (choice) => decide(choice));
}
