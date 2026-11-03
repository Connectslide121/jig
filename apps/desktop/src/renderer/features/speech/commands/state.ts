import { create } from "zustand";

/** What "Hey Jig" is doing (D-278), for the listening indicator. */
export type WakePhase = "off" | "starting" | "listening" | "awake" | "working" | "speaking";

export const useWake = create<{ phase: WakePhase; heard?: string; said?: string }>(() => ({ phase: "off" }));

/** Jig's own voice: muted, the answers are only shown (commands still run). */
export const useWakeVoice = create<{ muted: boolean }>(() => ({ muted: false }));
