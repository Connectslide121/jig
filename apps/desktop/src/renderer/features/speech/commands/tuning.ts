import { learnedStart } from "./match";

/**
 * How sure and how loud speech must be to count while listening for "Hey Jig" (D-278), and how the
 * training moves that to your voice (D-389). Pure, so it is unit-tested.
 */
export interface WakeThresholds {
  /** Voice-detector score (0–1) that starts something said. */
  start: number;
  /** Score that keeps it going. */
  keep: number;
  /** Loudness (RMS) that starts it, at least (the room's noise floor raises it). */
  gate: number;
  /** Loudness that keeps it going. */
  keepGate: number;
}

export const DEFAULT_THRESHOLDS: WakeThresholds = { start: 0.6, keep: 0.4, gate: 0.012, keepGate: 0.008 };

/** The lowest the training may take them: below this, noise starts things too. */
const FLOOR: WakeThresholds = { start: 0.45, keep: 0.3, gate: 0.005, keepGate: 0.0035 };

/** Kept within `lo`–`hi`, rounded to 4 places (so 0.6 - 0.2 is 0.4). */
const clamp = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)) * 1e4) / 1e4;

/**
 * The thresholds for a trained voice: the loudness gate at a third of how loud your "Hey Jig" was and
 * the voice score a little under yours, never stricter than the defaults (training only makes Jig hear
 * more of you) and never under `FLOOR`.
 */
export function wakeThresholds(profile?: { level: number; voice: number } | null): WakeThresholds {
  if (!profile) return DEFAULT_THRESHOLDS;
  const gate = clamp(profile.level / 3, FLOOR.gate, DEFAULT_THRESHOLDS.gate);
  const start = clamp(profile.voice - 0.2, FLOOR.start, DEFAULT_THRESHOLDS.start);
  return {
    start,
    keep: clamp(start - 0.2, FLOOR.keep, DEFAULT_THRESHOLDS.keep),
    gate,
    keepGate: clamp(
      (DEFAULT_THRESHOLDS.keepGate * gate) / DEFAULT_THRESHOLDS.gate,
      FLOOR.keepGate,
      DEFAULT_THRESHOLDS.keepGate,
    ),
  };
}

/** One "Hey Jig" said in the training: what Whisper wrote, and how loud and voice-like it was. */
export interface WakeTake {
  text: string;
  /** Mean loudness (RMS) of its voiced frames. */
  level: number;
  /** Mean voice-detector score of its voiced frames (1 when there's no detector). */
  voice: number;
}

export interface WakeProfile {
  trainedAt: string;
  heard: string[];
  variants: string[];
  level: number;
  voice: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * The profile from the takes: every transcription, the starts the defaults missed (learned as yours),
 * and the median loudness and voice score, so one loud or quiet take doesn't decide.
 */
export function profileFromTakes(takes: WakeTake[], now = new Date()): WakeProfile {
  const variants: string[] = [];
  for (const take of takes) {
    const start = learnedStart(take.text);
    if (start && !variants.includes(start)) variants.push(start);
  }
  return {
    trainedAt: now.toISOString(),
    heard: takes.map((t) => t.text.slice(0, 120)),
    variants: variants.slice(0, 10).map((v) => v.slice(0, 40)),
    level: takes.length ? clamp(median(takes.map((t) => t.level)), 0, 1) : 0,
    voice: takes.length ? clamp(median(takes.map((t) => t.voice)), 0, 1) : 0,
  };
}
