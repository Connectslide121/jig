import { create } from "zustand";
import { errorMessage } from "../../../lib/host";
import { updateConfig } from "../../../stores/config";
import { Capture, FRAME, prepareSpeech, speechSettings } from "../engine";
import { amplitude } from "../meter";
import { cleanSpeech, level, SAMPLE_RATE } from "../protocol";
import { cleanWords, matchWake } from "./match";
import { useWake } from "./state";
import { profileFromTakes, type WakeTake } from "./tuning";
import { transcribeWake } from "./wake";

/**
 * "Train Hey Jig" (D-389): you say "Hey Jig" five times; for each take Jig keeps what Whisper wrote
 * and how loud and voice-like it was, never the audio. The profile tunes listening to your voice.
 */

export const TAKES = 5;
/** Lenient on purpose: a take is something you were asked to say, so a soft one counts. */
const TAKE = { start: 0.35, keep: 0.25, gate: 0.004 };
/** Frames (128 ms) of voice that start a take. */
const START_FRAMES = 2;
/** Audio kept from before the voice was noticed (as when listening). */
const PREROLL = 0.5 * SAMPLE_RATE;
/** A pause this long ends a take. */
const END_PAUSE = 0.6 * SAMPLE_RATE;
/** "Hey Jig" is short: a take is cut after this. */
const MAX_TAKE = 2.5 * SAMPLE_RATE;

export type TakeState =
  | { state: "waiting" }
  | { state: "done"; take: WakeTake; known: boolean }
  | { state: "again"; heard: string };

export type TrainPhase = "starting" | "listening" | "hearing" | "reading" | "done" | "failed";

interface TrainState {
  open: boolean;
  /** Opened by turning Hey Jig on: saving or skipping turns it on (D-389). */
  turnOn: boolean;
  phase: TrainPhase;
  takes: TakeState[];
  /** The take being said (0-based); `TAKES` when all are done. */
  current: number;
  /** Why the last try didn't count, or what went wrong. */
  message?: string;
  /** Microphone level now (0–1, on the waves' log scale). */
  level: number;
}

const fresh = (): Omit<TrainState, "open" | "turnOn"> => ({
  phase: "starting",
  takes: Array.from({ length: TAKES }, () => ({ state: "waiting" }) as TakeState),
  current: 0,
  message: undefined,
  level: 0,
});

export const useTraining = create<TrainState>(() => ({ open: false, turnOn: false, ...fresh() }));

let session: TrainSession | undefined;

/** Opens the training. `turnOn`: Hey Jig was just turned on without a profile (D-389). */
export function openWakeTraining(options: { turnOn?: boolean } = {}): void {
  if (useTraining.getState().open) return;
  useTraining.setState({ open: true, turnOn: Boolean(options.turnOn), ...fresh() });
  useWake.setState({ training: true });
  session = new TrainSession();
  void session.start();
}

/** Starts the takes again. */
export function restartWakeTraining(): void {
  session?.stop();
  useTraining.setState(fresh());
  session = new TrainSession();
  void session.start();
}

/** Closes the training; `save` keeps the profile. Either way, opened by turning on, it turns Hey Jig on. */
export function closeWakeTraining(save: boolean): void {
  const { turnOn, takes } = useTraining.getState();
  session?.stop();
  session = undefined;
  useTraining.setState({ open: false });
  useWake.setState({ training: false });
  const done = takes.flatMap((t) => (t.state === "done" ? [t.take] : []));
  const wakeProfile = save && done.length === TAKES ? profileFromTakes(done) : undefined;
  if (wakeProfile || turnOn)
    void updateConfig({
      speech: { ...(wakeProfile ? { wakeProfile } : {}), ...(turnOn ? { wake: true } : {}) },
    });
}

/** What a take's transcription counts as: a take, or a reason to say it again. */
export function judgeTake(text: string): { ok: true; known: boolean } | { ok: false; message: string } {
  const words = cleanWords(text).split(" ").filter(Boolean);
  if (!words.length) return { ok: false, message: "Didn't catch that. Say “Hey Jig” again." };
  if (words.length > 4) return { ok: false, message: "That was more than “Hey Jig”. Say just “Hey Jig”." };
  return { ok: true, known: matchWake(text).rest !== undefined };
}

class TrainSession {
  private capture?: Capture;
  private stopped = false;
  private floor = 0.004;
  private loud = 0;
  private from?: number;
  private lastVoice = 0;
  private levels: number[] = [];
  private voices: number[] = [];
  private reading = false;
  private readonly fake = speechSettings().fake;

  async start(): Promise<void> {
    if (this.fake) {
      window.addEventListener("jig-fake-wake", this.fakeHeard);
      useTraining.setState({ phase: "listening" });
      return;
    }
    if (!(await prepareSpeech("wake", "continue"))) {
      if (!this.stopped)
        useTraining.setState({ phase: "failed", message: "The speech model isn't downloaded." });
      return;
    }
    const capture = await Capture.open({ detectVoice: true });
    if (!capture || this.stopped) {
      capture?.close();
      if (!this.stopped)
        useTraining.setState({ phase: "failed", message: "Jig couldn't open the microphone." });
      return;
    }
    this.capture = capture;
    capture.onFrame = (frame, end, voice) => this.frame(frame, end, voice);
    useTraining.setState({ phase: "listening" });
  }

  stop(): void {
    this.stopped = true;
    window.removeEventListener("jig-fake-wake", this.fakeHeard);
    this.capture?.close();
    this.capture = undefined;
  }

  private frame(frame: Float32Array, now: number, voice: number | undefined): void {
    const capture = this.capture;
    if (this.stopped || !capture) return;
    const l = level(frame, 0, frame.length);
    useTraining.setState({ level: amplitude(l) });
    if (this.reading || useTraining.getState().current >= TAKES) {
      capture.forget(now);
      return;
    }
    this.floor = l < this.floor ? this.floor * 0.7 + l * 0.3 : this.floor * 0.998 + l * 0.002;
    this.floor = Math.max(this.floor, 0.002);
    const loud = l > Math.max(TAKE.gate, this.floor * 2.5);
    const voiced = loud && (voice === undefined || voice >= TAKE.start);
    if (this.from === undefined) {
      this.loud = voiced ? this.loud + 1 : 0;
      if (voiced) {
        this.levels.push(l);
        this.voices.push(voice ?? 1);
      } else {
        this.levels = [];
        this.voices = [];
      }
      if (this.loud >= START_FRAMES) {
        this.from = Math.max(0, now - (this.loud + 1) * FRAME - PREROLL);
        this.lastVoice = now;
        useTraining.setState({ phase: "hearing", message: undefined });
      } else capture.forget(now - SAMPLE_RATE);
      return;
    }
    if (voiced) {
      this.levels.push(l);
      this.voices.push(voice ?? 1);
    }
    const going = voice === undefined ? loud : voice >= TAKE.keep && l > this.floor * 2;
    if (going) this.lastVoice = now;
    if (now - this.lastVoice > END_PAUSE || now - this.from > MAX_TAKE) {
      const from = this.from;
      const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
      const stats = { level: mean(this.levels), voice: mean(this.voices) };
      this.from = undefined;
      this.loud = 0;
      this.levels = [];
      this.voices = [];
      void this.read(capture.samples(from, now), stats);
      capture.forget(now);
    }
  }

  private async read(audio: Float32Array, stats: { level: number; voice: number }): Promise<void> {
    this.reading = true;
    useTraining.setState({ phase: "reading" });
    try {
      const text = cleanSpeech(await transcribeWake(audio), 1);
      if (!this.stopped) this.took(text, stats);
    } catch (error) {
      if (!this.stopped) useTraining.setState({ phase: "listening", message: errorMessage(error) });
    } finally {
      this.reading = false;
    }
  }

  /** A take was read: it counts, or the same take is asked for again. */
  private took(text: string, stats: { level: number; voice: number }): void {
    const { takes, current } = useTraining.getState();
    if (current >= TAKES) return;
    const judged = judgeTake(text);
    const next = [...takes];
    if (!judged.ok) {
      next[current] = { state: "again", heard: text };
      useTraining.setState({ takes: next, phase: "listening", message: judged.message });
      return;
    }
    next[current] = { state: "done", take: { text, ...stats }, known: judged.known };
    const done = current + 1 >= TAKES;
    useTraining.setState({
      takes: next,
      current: current + 1,
      phase: done ? "done" : "listening",
      message: undefined,
    });
    if (done) this.capture?.close();
  }

  /** Tests: each `jig-fake-wake` event is a take, as Whisper would write it. */
  private readonly fakeHeard = (event: Event) => {
    this.took(String((event as CustomEvent<string>).detail ?? ""), { level: 0.05, voice: 0.9 });
  };
}
