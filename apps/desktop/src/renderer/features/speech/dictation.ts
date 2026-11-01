import { create } from "zustand";
import { SPEECH_MODELS, type SpeechModel } from "../../../shared/speech";
import { call, errorMessage } from "../../lib/host";
import { useConfig } from "../../stores/config";
import { confirmDialog } from "../../ui";
import { notify } from "../../workbench/toasts";
import { downmix, isSilent, SAMPLE_RATE, type WorkerReply, type WorkerRequest } from "./protocol";

/**
 * Dictation (D-208): one recording at a time, for one chat's composer. The microphone records until
 * you click again; Whisper turns it into text on this computer and the text goes where the caret is.
 */
export type DictationPhase = "idle" | "downloading" | "recording" | "transcribing";

interface DictationState {
  phase: DictationPhase;
  /** The chat whose composer is dictating. */
  target?: string;
  /** Model download, in bytes (total 0 = not known yet). */
  progress?: { loaded: number; total: number };
}

export const useDictation = create<DictationState>(() => ({ phase: "idle" }));

/** Longest recording; dictation stops by itself after this. */
const MAX_RECORDING_MS = 5 * 60_000;
const FAKE_TEXT = "Hello Claude, this came from the microphone.";

interface Transcriber {
  load(repo: string): Promise<void>;
  transcribe(repo: string, audio: Float32Array, language: string): Promise<string>;
}

/** The Whisper worker, started on first use and kept for the next dictation. */
function workerTranscriber(): Transcriber {
  let worker: Worker | undefined;
  let next = 0;
  const waiting = new Map<number, { resolve: (text: string) => void; reject: (error: Error) => void }>();
  const ask = (
    request: WorkerRequest extends infer R ? (R extends WorkerRequest ? Omit<R, "id"> : never) : never,
  ) =>
    new Promise<string>((resolve, reject) => {
      if (!worker) {
        worker = new Worker(new URL("./speech.worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = (event: MessageEvent<WorkerReply>) => {
          const reply = event.data;
          const pending = waiting.get(reply.id);
          waiting.delete(reply.id);
          if (reply.type === "error") pending?.reject(new Error(reply.message));
          else pending?.resolve(reply.type === "text" ? reply.text : "");
        };
        worker.onerror = (event) => {
          for (const pending of waiting.values())
            pending.reject(new Error(event.message || "Dictation stopped"));
          waiting.clear();
          worker?.terminate();
          worker = undefined;
        };
      }
      const id = ++next;
      waiting.set(id, { resolve, reject });
      worker.postMessage({ ...request, id } as WorkerRequest);
    });
  return {
    load: async (repo) => void (await ask({ type: "load", repo })),
    transcribe: (repo, audio, language) => ask({ type: "transcribe", repo, audio, language }),
  };
}

/** For tests (`JIG_ENGINE=fake`): a pretend download, and the same sentence for every recording. */
function fakeTranscriber(): Transcriber {
  return {
    load: async () => {
      for (const loaded of [0, 50, 100]) {
        if (useDictation.getState().phase === "downloading")
          useDictation.setState({ progress: { loaded, total: 100 } });
        await new Promise((r) => setTimeout(r, 150));
      }
    },
    transcribe: async () => FAKE_TEXT,
  };
}

let transcriber: Transcriber | undefined;

// The main process downloads the model and says how far it is.
window.jig?.on("speech.progress", ({ loaded, total }) => {
  if (useDictation.getState().phase === "downloading") useDictation.setState({ progress: { loaded, total } });
});
const ready = new Set<string>();
let recording:
  | { recorder: MediaRecorder; stream: MediaStream; chunks: Blob[]; timer: ReturnType<typeof setTimeout> }
  | undefined;
let deliver: ((text: string) => void) | undefined;
let discard = false;
/** Between the click and the recording (download question, microphone prompt). */
let starting = false;

function settings(): { model: SpeechModel; language: string; fake: boolean } {
  const { config, info } = useConfig.getState();
  return {
    model: config?.speech.model ?? "base",
    language: config?.speech.language ?? "",
    fake: info?.engine === "fake",
  };
}

function engine(fake: boolean): Transcriber {
  transcriber ??= fake ? fakeTranscriber() : workerTranscriber();
  return transcriber;
}

/**
 * The first dictation with a model downloads it (asking first, with progress in a dialog). Returns
 * false when you decline or it fails.
 */
async function prepare(target: string): Promise<boolean> {
  const { model, fake } = settings();
  const repo = SPEECH_MODELS[model].repo;
  if (ready.has(repo)) return true;
  const status = (await call("speech.models")).find((m) => m.model === model);
  if (!status?.downloaded) {
    const ok = await confirmDialog({
      title: "Download the dictation model?",
      message: `Jig turns your speech into text on this computer with Whisper (${SPEECH_MODELS[model].label.toLowerCase()}, ${SPEECH_MODELS[model].size}). It is downloaded once from Hugging Face and kept in Jig's folder; what you say never leaves your computer. You can choose another model in Settings → Speech.`,
      confirmLabel: "Download",
    });
    if (!ok) return false;
    useDictation.setState({ phase: "downloading", target, progress: { loaded: 0, total: 0 } });
    try {
      await engine(fake).load(repo);
    } catch (error) {
      useDictation.setState({ phase: "idle", target: undefined, progress: undefined });
      notify({ title: "Couldn't get dictation ready", message: errorMessage(error), tone: "danger" });
      return false;
    }
    ready.add(repo);
    useDictation.setState({ phase: "idle", target: undefined, progress: undefined });
    notify({
      title: "Dictation is ready",
      message: "Click the microphone, speak, and click it again to stop.",
      tone: "success",
    });
    return false;
  }
  // Downloaded: load it while you speak.
  void engine(fake)
    .load(repo)
    .then(() => ready.add(repo))
    .catch(() => undefined);
  return true;
}

async function microphone(): Promise<MediaStream | undefined> {
  const access = await call("speech.microphone").catch(() => "unknown" as const);
  if (access === "denied" || access === "restricted") {
    notify({
      title: "Jig may not use the microphone",
      message:
        useConfig.getState().info?.platform === "darwin"
          ? "Allow Jig in System Settings → Privacy & Security → Microphone."
          : "Turn on microphone access for desktop apps in Settings → Privacy & security → Microphone.",
      tone: "danger",
    });
    return undefined;
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (error) {
    notify({ title: "No microphone", message: errorMessage(error), tone: "danger" });
    return undefined;
  }
}

/** Starts dictating into a chat's composer; `onText` receives what you said. */
export async function startDictation(target: string, onText: (text: string) => void): Promise<void> {
  if (starting || useDictation.getState().phase !== "idle") return;
  starting = true;
  let stream: MediaStream | undefined;
  try {
    if (!(await prepare(target))) return;
    stream = await microphone();
  } finally {
    starting = false;
  }
  if (!stream) return;
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.onstop = () => void finish(chunks, recorder.mimeType);
  deliver = onText;
  discard = false;
  recording = { recorder, stream, chunks, timer: setTimeout(stopDictation, MAX_RECORDING_MS) };
  recorder.start();
  useDictation.setState({ phase: "recording", target });
}

/** Stops recording and transcribes it. */
export function stopDictation(): void {
  if (!recording) return;
  clearTimeout(recording.timer);
  for (const track of recording.stream.getTracks()) track.stop();
  if (recording.recorder.state !== "inactive") recording.recorder.stop();
  recording = undefined;
}

/** Stops recording and forgets it (the chat closed, or Escape). */
export function cancelDictation(): void {
  if (!recording) return;
  discard = true;
  stopDictation();
}

async function finish(chunks: Blob[], mimeType: string): Promise<void> {
  const onText = deliver;
  deliver = undefined;
  if (discard) {
    useDictation.setState({ phase: "idle", target: undefined });
    return;
  }
  useDictation.setState({ phase: "transcribing" });
  const { model, language, fake } = settings();
  try {
    const audio = await decode(new Blob(chunks, { type: mimeType }));
    if (!fake && isSilent(audio)) {
      notify({ title: "Nothing heard", message: "Check the microphone and speak a little louder." });
      return;
    }
    const text = await engine(fake).transcribe(SPEECH_MODELS[model].repo, audio, language);
    if (text) onText?.(text);
    else notify({ title: "Nothing heard", message: "Whisper didn't recognise any words." });
  } catch (error) {
    notify({ title: "Dictation failed", message: errorMessage(error), tone: "danger" });
  } finally {
    useDictation.setState({ phase: "idle", target: undefined });
  }
}

/** The recording as 16 kHz mono samples, what Whisper reads. */
async function decode(blob: Blob): Promise<Float32Array> {
  const context = new AudioContext({ sampleRate: SAMPLE_RATE });
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    return downmix(Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i)));
  } finally {
    void context.close();
  }
}
