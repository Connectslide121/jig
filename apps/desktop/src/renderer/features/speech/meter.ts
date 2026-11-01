import { level } from "./protocol";

/**
 * How loud things are while talking with Claude (D-210), for the sound waves: your microphone, and
 * Claude's voice (the system's voices give no audio to measure, so each spoken word is a pulse).
 */

/** A microphone level (RMS, 0–1) as a wave height (0–1), on a log scale: a quiet room is 0. */
export function amplitude(rms: number): number {
  if (!(rms > 0)) return 0;
  return Math.min(1, Math.max(0, (Math.log10(rms) + 2.5) / 1.7));
}

/** The levels of `parts` equal slices of a frame, oldest first. */
export function sliceLevels(frame: Float32Array, parts: number): number[] {
  const size = Math.max(1, Math.floor(frame.length / parts));
  const out: number[] = [];
  for (let at = 0; at + size <= frame.length; at += size) out.push(level(frame, at, at + size));
  return out;
}

/**
 * Wave heights over time. Microphone frames arrive in batches (every 128 ms); their slices are
 * played back one per `stepMs`, so the waves move smoothly a moment behind your voice. Pulses (a
 * word Claude says) jump up and fade.
 */
export class Meter {
  private queue: number[] = [];
  private nextAt = 0;
  private target = 0;
  private value = 0;
  private last = 0;

  constructor(private readonly stepMs = 16) {}

  /** Wave heights (0–1) of a batch, oldest first. */
  push(heights: number[], now: number): void {
    // Never fall behind more than a batch and a bit.
    if (this.queue.length > heights.length * 2) this.queue = this.queue.slice(-heights.length);
    this.queue.push(...heights);
    if (this.nextAt < now) this.nextAt = now;
  }

  pulse(height: number): void {
    this.target = Math.max(this.target, Math.min(1, height));
  }

  /** Silence now (Claude stopped, the microphone was muted). */
  clear(): void {
    this.queue = [];
    this.target = 0;
  }

  /** The height to draw at `now` (ms): rises fast, falls slowly. */
  sample(now: number): number {
    while (this.queue.length && now >= this.nextAt) {
      this.target = this.queue.shift()!;
      this.nextAt += this.stepMs;
    }
    const dt = Math.min(100, Math.max(0, now - (this.last || now)));
    this.last = now;
    const rate = this.target > this.value ? 0.35 : 0.08;
    this.value += (this.target - this.value) * (1 - (1 - rate) ** (dt / 16));
    // Pulses fade by themselves.
    if (!this.queue.length) this.target *= 0.9 ** (dt / 16);
    return this.value;
  }
}

/** The two voices in the conversation. */
export const meters = { you: new Meter(), claude: new Meter() };
