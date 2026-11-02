import { create } from "zustand";
import { naturalVoice, VOICE_MODEL, VOICE_SAMPLE_RATE } from "../../../shared/speech";
import { call, errorMessage } from "../../lib/host";
import { useConfig } from "../../stores/config";
import { confirmDialog } from "../../ui";
import { notify } from "../../workbench/toasts";
import { amplitude, sliceLevels } from "./meter";

/**
 * The natural voice (D-243): a background process in the main process turns text into audio with
 * Kokoro on this computer; it plays here through Web Audio. The model is downloaded once (asking
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

/** Loads the natural voice in the background when it is the one that reads and is downloaded. */
export function warmNaturalVoice(): void {
  if (useConfig.getState().config?.speech.engine === "system") return;
  void naturalState().then((state) => {
    if (state === "ready")
      call("speech.prepareVoice", { voice: naturalSettings().voice }).catch(() => undefined);
  });
}

/** Audio made or being made, so the next sentence is ready when this one ends. */
const made = new Map<string, Promise<Float32Array>>();
const MADE_KEPT = 8;

/** `text` as audio in the chosen voice (made once, however often it is asked for). */
export function makeSpeech(text: string): Promise<Float32Array> {
  const { voice, speed } = naturalSettings();
  const key = `${voice}|${speed}|${text}`;
  let audio = made.get(key);
  if (!audio) {
    audio = call("speech.say", { text, voice, speed });
    made.set(key, audio);
    audio.catch(() => made.delete(key));
    while (made.size > MADE_KEPT) made.delete(made.keys().next().value!);
  }
  return audio;
}

let context: AudioContext | undefined;

export interface Playback {
  stop(): void;
}

/**
 * Plays audio. `onStart` gets its loudness (one wave height per 16 ms) for the sound waves;
 * `onEnd` is called when it has played to the end (not when stopped).
 */
export function playAudio(
  audio: Float32Array,
  handlers: { onStart?: (levels: number[]) => void; onEnd: () => void },
): Playback {
  context ??= new AudioContext();
  const ctx = context;
  void ctx.resume();
  const buffer = ctx.createBuffer(1, Math.max(1, audio.length), VOICE_SAMPLE_RATE);
  buffer.getChannelData(0).set(audio);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  let stopped = false;
  source.onended = () => {
    if (!stopped) handlers.onEnd();
  };
  source.start();
  handlers.onStart?.(
    sliceLevels(audio, Math.max(1, Math.round(audio.length / (VOICE_SAMPLE_RATE * 0.016)))).map((l) =>
      amplitude(l),
    ),
  );
  return {
    stop() {
      stopped = true;
      try {
        source.stop();
      } catch {
        // Already ended.
      }
    },
  };
}
