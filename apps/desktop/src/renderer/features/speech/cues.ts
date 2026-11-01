import { create } from "zustand";
import type { SessionStatus } from "../../../shared/engine";
import { useConfig } from "../../stores/config";
import { useSessions } from "../sessions/store";

/**
 * Sounds that say what Claude is doing when you aren't looking (D-210): a soft repeating motif
 * while it works (so you know it hasn't hung), a rising chime when it finishes, and a falling one
 * when it needs you. Made with Web Audio, quiet, no files. `speech.workSound` turns them off.
 */
export type Cue = "start" | "tick" | "done" | "attention";

/** Notes (Hz) and their start (s) for each cue. */
const NOTES: Record<Exclude<Cue, "tick">, Array<[number, number]>> = {
  start: [
    [392, 0],
    [587.33, 0.09],
  ],
  done: [
    [523.25, 0],
    [659.25, 0.1],
    [783.99, 0.2],
    [1046.5, 0.3],
  ],
  attention: [
    [783.99, 0],
    [587.33, 0.16],
  ],
};
/** The working motif: one soft note per tick, walking up and down. */
const TICKS = [659.25, 783.99, 987.77, 783.99];
/** How often the working motif plays (ms). */
export const TICK_MS = 2400;

let context: AudioContext | undefined;
let tickIndex = 0;

function audio(): AudioContext | undefined {
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
    return context;
  } catch {
    return undefined;
  }
}

function note(ctx: AudioContext, freq: number, at: number, gain: number, length: number): void {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  // A soft pluck: quick attack, gentle fade.
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(gain, at + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(env).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + length + 0.05);
}

export function soundsOn(): boolean {
  return useConfig.getState().config?.speech.workSound ?? true;
}

/** Plays a cue now (nothing when sounds are off). */
export function playCue(cue: Cue): void {
  useCues.setState((s) => ({ played: [...s.played.slice(-19), cue] }));
  if (!soundsOn()) return;
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime + 0.02;
  if (cue === "tick") {
    note(ctx, TICKS[tickIndex++ % TICKS.length]!, now, 0.05, 0.35);
    return;
  }
  for (const [freq, at] of NOTES[cue]) note(ctx, freq, now + at, 0.07, 0.45);
}

/** The cue for a chat that stopped working; nothing while it still works. */
export function endCue(status: SessionStatus | undefined): Cue | undefined {
  if (status === "working" || status === "starting") return undefined;
  return status === "idle" ? "done" : "attention";
}

/** Plays the working motif every `TICK_MS` until stopped. */
export class WorkCue {
  private timer?: ReturnType<typeof setInterval>;
  private delay?: ReturnType<typeof setTimeout>;

  get running(): boolean {
    return Boolean(this.timer || this.delay);
  }

  /** Starts after `afterMs` (so a quick answer plays nothing). */
  start(afterMs = 0): void {
    if (this.running) return;
    const begin = () => {
      this.delay = undefined;
      playCue("tick");
      this.timer = setInterval(() => playCue("tick"), TICK_MS);
    };
    if (afterMs > 0) this.delay = setTimeout(begin, afterMs);
    else begin();
  }

  stop(): void {
    clearTimeout(this.delay);
    clearInterval(this.timer);
    this.delay = undefined;
    this.timer = undefined;
  }
}

/** Chats whose work Jig is following with sounds, and the last cues (for tests). */
export const useCues = create<{ following: string[]; played: Cue[] }>(() => ({ following: [], played: [] }));

const followed = new Map<string, () => void>();

/**
 * Follows a chat's work after talking handed it over: the motif while it works, a chime when it
 * finishes (done) or waits for you (and again working when you answer), until the turn ends;
 * then `onDone`.
 */
export function followWork(target: string, onDone?: () => void): void {
  unfollowWork(target);
  const cue = new WorkCue();
  let waiting = false;
  /** Approving a plan leaves the chat waiting or idle for a moment before it works. */
  let seenWork = false;
  const end = () => {
    cue.stop();
    clearTimeout(grace);
    unsubscribe();
    followed.delete(target);
    useCues.setState((s) => ({ following: s.following.filter((t) => t !== target) }));
  };
  const check = (force = false) => {
    const status = useSessions.getState().metas[target]?.status;
    if (status === "working" || status === "starting") {
      seenWork = true;
      waiting = false;
      cue.start(TICK_MS / 2);
    } else if (status && !seenWork && !force) return;
    else if (status === "needs_you") {
      cue.stop();
      if (!waiting) playCue("attention");
      waiting = true;
    } else {
      if (status) playCue(endCue(status)!);
      end();
      if (status) onDone?.();
    }
  };
  const unsubscribe = useSessions.subscribe((s, prev) => {
    if (s.metas[target]?.status !== prev.metas[target]?.status) check();
  });
  const grace = setTimeout(() => {
    if (!seenWork) check(true);
  }, 4000);
  followed.set(target, end);
  useCues.setState((s) => ({ following: [...s.following, target] }));
  check();
}

/** Stops following a chat's work (talking started again, or the chat closed). */
export function unfollowWork(target: string): void {
  followed.get(target)?.();
}
