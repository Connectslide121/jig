import { create } from "zustand";
import { naturalVoice, VOICE_MODEL, VOICE_SAMPLE_RATE } from "../../../shared/speech";
import { call, errorMessage } from "../../lib/host";
import { useConfig } from "../../stores/config";
import { confirmDialog } from "../../ui";
import { notify } from "../../workbench/toasts";
import { routeToSpeaker } from "./devices";
import { amplitude, sliceLevels } from "./meter";

/**
 * The natural voice (D-243): a background process in the main process turns text into audio with
 * Kokoro on this computer; it plays here through Web Audio, piece by piece as it is made (D-411). The model is downloaded once (asking
 * first); until then, or when it fails, the system's voices read instead.
 */

/** Whether the natural voice can read now. `missing`: not downloaded; `declined`: not this time. */
export type NaturalState = "unknown" | "missing" | "declined" | "downloading" | "ready";

export const useNaturalVoice = create<{ state: NaturalState; loaded: number; total: number }>(() => ({
  state: "unknown",
  loaded: 0,
  total: 0,
}));

// (Not in unit tests, which have no window.)
if (typeof window !== "undefined")
  window.jig?.on("speech.progress", ({ model, loaded, total }) => {
    if (model === "voice") useNaturalVoice.setState({ loaded, total });
  });

/** The voice and speed chosen in Settings. */
export function naturalSettings(): { voice: string; speed: number } {
  const speech = useConfig.getState().config?.speech;
  return { voice: naturalVoice(speech?.naturalVoice).id, speed: speech?.rate ?? 1 };
}

let checking: Promise<NaturalState> | undefined;

/** Checks (once) whether the model is downloaded. */
export function naturalState(): Promise<NaturalState> {
  const { state } = useNaturalVoice.getState();
  if (state !== "unknown") return Promise.resolve(state);
  checking ??= call("speech.voiceModel")
    .then((s) => {
      const next: NaturalState = s.downloaded ? "ready" : "missing";
      if (useNaturalVoice.getState().state === "unknown") useNaturalVoice.setState({ state: next });
      return useNaturalVoice.getState().state;
    })
    .catch(() => "missing" as const)
    .finally(() => {
      checking = undefined;
    });
  return checking;
}

/** Forgets what is known about the model (it was removed). */
export function resetNaturalVoice(): void {
  made.clear();
  warmedAt = -Infinity;
  useNaturalVoice.setState({ state: "unknown", loaded: 0, total: 0 });
}

/**
 * Downloads the model, asking first unless `ask` is false (Settings' Download button). Runs in the
 * background: the system's voices read meanwhile.
 */
export async function downloadNaturalVoice(ask = true): Promise<boolean> {
  const { state } = useNaturalVoice.getState();
  if (state === "downloading") return false;
  if (ask) {
    const ok = await confirmDialog({
      title: "Download the natural voice?",
      message: `Jig can read Claude's replies with a realistic voice (Kokoro, ${VOICE_MODEL.size}). It is downloaded once from Hugging Face and runs on this computer: what Claude says is never sent anywhere. Until it's ready, your system's voice reads. You can change the voice in Settings → Speech.`,
      confirmLabel: "Download",
    });
    if (!ok) {
      useNaturalVoice.setState({ state: "declined" });
      return false;
    }
  }
  useNaturalVoice.setState({ state: "downloading", loaded: 0, total: 0 });
  try {
    await call("speech.prepareVoice", { voice: naturalSettings().voice });
    useNaturalVoice.setState({ state: "ready" });
    notify({
      title: "The natural voice is ready",
      message: "Claude's replies are read with it now.",
      tone: "success",
    });
    return true;
  } catch (error) {
    useNaturalVoice.setState({ state: "missing" });
    notify({ title: "Couldn't download the natural voice", message: errorMessage(error), tone: "danger" });
    return false;
  }
}

let warmedAt = -Infinity;

/**
 * Loads the natural voice in the background when it is the one that reads and is downloaded, so
 * what is said next doesn't wait for the model (a few seconds). Also keeps a loaded voice from
 * stopping for being unused. Cheap to call often: at most once a minute.
 */
export function warmNaturalVoice(): void {
  if (useConfig.getState().config?.speech.engine === "system") return;
  const now = performance.now();
  if (now - warmedAt < 60_000) return;
  warmedAt = now;
  void naturalState().then((state) => {
    if (state === "ready")
      call("speech.prepareVoice", { voice: naturalSettings().voice }).catch(() => undefined);
  });
}

/**
 * Audio of one text, made piece by piece in the background process (D-411): the pieces that are
 * made so far, in order, and whether all of them are.
 */
export class Speech {
  readonly parts: Float32Array[] = [];
  /** All pieces are made (or it failed: `error`). */
  done = false;
  error?: unknown;
  /** When it was asked for, and when its first piece came (`performance.now()`), for the timings. */
  readonly askedAt = performance.now();
  firstAt?: number;
  private expected?: number;
  private readonly listeners = new Set<() => void>();

  /** Calls `listener` whenever a piece comes, it is done or it failed. Returns how to stop. */
  watch(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The background process made piece `index`. */
  add(index: number, audio: Float32Array): void {
    this.firstAt ??= performance.now();
    this.parts[index] = audio;
    this.check();
  }

  /** The background process made `parts` pieces in all. */
  finish(parts: number): void {
    this.expected = parts;
    this.check();
  }

  fail(error: unknown): void {
    this.error = error;
    this.done = true;
    this.changed();
  }

  private check(): void {
    // The last piece may come after the answer that says how many there are.
    if (this.expected !== undefined && this.parts.filter(Boolean).length >= this.expected) this.done = true;
    this.changed();
  }

  private changed(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

/** Speech being made, by the number its pieces come with. */
const making = new Map<number, Speech>();
let lastId = 0;

// (Not in unit tests, which have no window.)
if (typeof window !== "undefined")
  window.jig?.on("speech.part", ({ id, index, audio }) => making.get(id)?.add(index, audio));

/** Audio made or being made, so the next sentence is ready when this one ends. */
const made = new Map<string, Speech>();
const MADE_KEPT = 8;

/** `text` as audio in the chosen voice (made once, however often it is asked for). */
export function makeSpeech(text: string): Speech {
  const { voice, speed } = naturalSettings();
  const key = `${voice}|${speed}|${text}`;
  let speech = made.get(key);
  if (!speech) {
    const id = ++lastId;
    const fresh = new Speech();
    speech = fresh;
    making.set(id, fresh);
    made.set(key, fresh);
    call("speech.sayParts", { id, text, voice, speed })
      .then(({ parts }) => fresh.finish(parts))
      .catch((error: unknown) => {
        made.delete(key);
        fresh.fail(error);
      })
      .finally(() => {
        if (fresh.done) making.delete(id);
        else fresh.watch(() => fresh.done && making.delete(id));
      });
    while (made.size > MADE_KEPT) made.delete(made.keys().next().value!);
  }
  return speech;
}

let context: AudioContext | undefined;

export interface Playback {
  stop(): void;
}

/** How far ahead of now a piece that is ready starts (seconds), so its start is never late. */
const LEAD = 0.02;

/**
 * Plays speech as its pieces come, each one starting exactly where the one before ends (on the
 * audio clock), so there is no gap between them. `onStart` gets the first piece's loudness (one
 * wave height per 16 ms) when it starts, `onLevels` each next piece's when it starts; `onEnd` is
 * called when all of it has played (not when stopped); `onError` when it failed before any of it
 * could play.
 */
export function playSpeech(
  speech: Speech,
  handlers: {
    onStart?: (levels: number[]) => void;
    onLevels?: (levels: number[]) => void;
    onEnd: () => void;
    onError: (error: unknown) => void;
  },
): Playback {
  context ??= new AudioContext();
  const ctx = context;
  routeToSpeaker(ctx);
  void ctx.resume();
  let stopped = false;
  let next = 0;
  let at = 0;
  const sources = new Set<AudioBufferSourceNode>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const stop = () => {
    stopped = true;
    unwatch();
    for (const timer of timers) clearTimeout(timer);
    for (const source of sources) {
      try {
        source.stop();
      } catch {
        // Not started or already ended.
      }
    }
    sources.clear();
  };
  const settle = () => {
    if (stopped || !speech.done || next < speech.parts.length || sources.size) return;
    if (speech.error && next === 0) {
      stop();
      handlers.onError(speech.error);
      return;
    }
    stop();
    handlers.onEnd();
  };
  const pump = () => {
    if (stopped) return;
    for (let audio = speech.parts[next]; audio; audio = speech.parts[next]) {
      const first = next === 0;
      next++;
      const buffer = ctx.createBuffer(1, Math.max(1, audio.length), VOICE_SAMPLE_RATE);
      buffer.getChannelData(0).set(audio);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      const start = Math.max(at, ctx.currentTime + LEAD);
      at = start + buffer.duration;
      source.onended = () => {
        sources.delete(source);
        settle();
      };
      sources.add(source);
      source.start(start);
      const levels = sliceLevels(
        audio,
        Math.max(1, Math.round(audio.length / (VOICE_SAMPLE_RATE * 0.016))),
      ).map((l) => amplitude(l));
      // The waves follow each piece when it is heard, not when it is made.
      const timer = setTimeout(
        () => {
          timers.delete(timer);
          if (stopped) return;
          if (first) handlers.onStart?.(levels);
          else handlers.onLevels?.(levels);
        },
        Math.max(0, (start - ctx.currentTime) * 1000),
      );
      timers.add(timer);
    }
    settle();
  };
  const unwatch = speech.watch(pump);
  pump();
  return { stop };
}
