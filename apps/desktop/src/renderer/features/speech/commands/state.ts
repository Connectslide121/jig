import { create } from "zustand";

/** What "Hey Jig" is doing (D-278), for the listening indicator. */
export type WakePhase = "off" | "starting" | "listening" | "awake" | "working" | "speaking";

/**
 * One thing said that the wake check read (D-389): what Whisper wrote, whether it was "Hey Jig" and
 * why, and how loud and voice-like it was. The last few are shown in the training dialog.
 */
export interface WakeCheck {
  at: number;
  text: string;
  woke: boolean;
  reason: string;
  /** Loudest frame (RMS). */
  level: number;
  /** Highest voice-detector score (undefined without the detector, or with the fake engine). */
  voice?: number;
}

export const useWake = create<{
  phase: WakePhase;
  heard?: string;
  said?: string;
  /** The last wake checks, newest last. */
  checks: WakeCheck[];
  /** The training has the microphone: listening waits. */
  training: boolean;
}>(() => ({ phase: "off", checks: [], training: false }));

/** How many wake checks the readout keeps. */
const KEEP_CHECKS = 8;

export function recordWakeCheck(check: WakeCheck): void {
  useWake.setState((s) => ({ checks: [...s.checks, check].slice(-KEEP_CHECKS) }));
  if (import.meta.env.DEV) console.debug("[hey-jig]", check.woke ? "woke" : "ignored", check);
}

/** Jig's own voice: muted, the answers are only shown (commands still run). */
export const useWakeVoice = create<{ muted: boolean }>(() => ({ muted: false }));
