import { create } from "zustand";
import { SPEECH_MODELS, type SpeechModel, type SpeechVariant } from "../../../shared/speech";
import { call, errorMessage } from "../../lib/host";
import { useConfig } from "../../stores/config";
import { confirmDialog } from "../../ui";
import { notify } from "../../workbench/toasts";
import {
  isSilent,
  joinSpeech,
  quietestCut,
  SAMPLE_RATE,
  type WorkerReply,
  type WorkerRequest,
} from "./protocol";

/**
 * What dictation and talking with Claude share (D-208, D-209): the Whisper worker, getting its
 * model ready, the microphone, and turning what you say into text while you say it.
 */

export const FAKE_TEXT = "Hello Claude, this came from the microphone.";

/** The model download (bytes; total 0 = not known yet) and where Whisper runs once loaded. */
export const useSpeechEngine = create<{
  downloading?: { target: string; loaded: number; total: number };
  device?: "gpu" | "cpu";
}>(() => ({}));

interface Transcriber {
  load(repo: string, gpu: boolean): Promise<"gpu" | "cpu">;
  transcribe(repo: string, gpu: boolean, audio: Float32Array, language: string): Promise<string>;
}

type Request = WorkerRequest extends infer R ? (R extends WorkerRequest ? Omit<R, "id"> : never) : never;

/** The Whisper worker, started on first use and kept for the next time. */
function workerTranscriber(): Transcriber {
  let worker: Worker | undefined;
  let next = 0;
  const waiting = new Map<
    number,
    { resolve: (reply: WorkerReply) => void; reject: (error: Error) => void }
  >();
  const ask = (request: Request) =>
    new Promise<WorkerReply>((resolve, reject) => {
      if (!worker) {
        worker = new Worker(new URL("./speech.worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = (event: MessageEvent<WorkerReply>) => {
          const reply = event.data;
          const pending = waiting.get(reply.id);
          waiting.delete(reply.id);
          if (reply.type === "error") pending?.reject(new Error(reply.message));
          else pending?.resolve(reply);
        };
        worker.onerror = (event) => {
          for (const pending of waiting.values())
            pending.reject(new Error(event.message || "Whisper stopped"));
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
    load: async (repo, gpu) => {
      const reply = await ask({ type: "load", repo, gpu });
      return reply.type === "ready" ? reply.device : "cpu";
    },
    transcribe: async (repo, gpu, audio, language) => {
      const reply = await ask({ type: "transcribe", repo, gpu, audio, language });
      return reply.type === "text" ? reply.text : "";
    },
  };
}

/** For tests (`JIG_ENGINE=fake`): a pretend download, and the same sentence for every recording. */
function fakeTranscriber(): Transcriber {
  return {
    load: async () => {
      for (const loaded of [0, 50, 100]) {
        const d = useSpeechEngine.getState().downloading;
        if (d) useSpeechEngine.setState({ downloading: { ...d, loaded, total: 100 } });
        await new Promise((r) => setTimeout(r, 150));
      }
      return "cpu";
    },
    transcribe: async () => FAKE_TEXT,
  };
}

let transcriber: Transcriber | undefined;
const ready = new Set<string>();

// The main process downloads the model and says how far it is.
window.jig?.on("speech.progress", ({ loaded, total }) => {
  const d = useSpeechEngine.getState().downloading;
  if (d) useSpeechEngine.setState({ downloading: { ...d, loaded, total } });
});

export interface SpeechSettings {
  model: SpeechModel;
  repo: string;
  language: string;
  gpu: boolean;
  live: boolean;
  pause: number;
  fake: boolean;
}

export function speechSettings(): SpeechSettings {
  const { config, info } = useConfig.getState();
  const model = config?.speech.model ?? "base";
  return {
    model,
    repo: SPEECH_MODELS[model].repo,
    language: config?.speech.language ?? "",
    gpu: config?.speech.gpu ?? true,
    live: config?.speech.live ?? true,
    pause: config?.speech.pause ?? 1000,
    fake: info?.engine === "fake",
  };
}

function engine(fake: boolean): Transcriber {
  transcriber ??= fake ? fakeTranscriber() : workerTranscriber();
  return transcriber;
}

let gpuFound: Promise<boolean> | undefined;
/** Whether this computer has a graphics card WebGPU can use. */
export function hasGpu(): Promise<boolean> {
  gpuFound ??= (async () => {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return Boolean(await gpu?.requestAdapter().catch(() => null));
  })();
  return gpuFound;
}

/** Where Whisper will run with the current settings. */
export async function speechVariant(s = speechSettings()): Promise<SpeechVariant> {
  return s.gpu && !s.fake && (await hasGpu()) ? "gpu" : "cpu";
}

/**
 * Gets the model ready. The first time it is downloaded (asking first, with progress); then
 * `afterDownload` decides whether to go on (talking) or stop there (dictation: click again).
 * Returns false when you decline or it fails.
 */
export async function prepareSpeech(target: string, afterDownload: "continue" | "stop"): Promise<boolean> {
  const s = speechSettings();
  const variant = await speechVariant(s);
  const key = `${s.repo}:${variant}`;
  if (ready.has(key)) return true;
  const status = (await call("speech.models")).find((m) => m.model === s.model);
  if (!status?.variants.includes(variant)) {
    const where = variant === "gpu" ? "on your graphics card" : "on this computer";
    const ok = await confirmDialog({
      title: "Download the speech model?",
      message: `Jig turns your speech into text ${where} with Whisper (${SPEECH_MODELS[s.model].label.toLowerCase()}, ${SPEECH_MODELS[s.model].size[variant]}). It is downloaded once from Hugging Face and kept in Jig's folder; what you say never leaves your computer. You can choose another model in Settings → Speech.`,
      confirmLabel: "Download",
    });
    if (!ok) return false;
    useSpeechEngine.setState({ downloading: { target, loaded: 0, total: 0 } });
    try {
      useSpeechEngine.setState({ device: await engine(s.fake).load(s.repo, variant === "gpu") });
    } catch (error) {
      notify({ title: "Couldn't get speech ready", message: errorMessage(error), tone: "danger" });
      return false;
    } finally {
      useSpeechEngine.setState({ downloading: undefined });
    }
    ready.add(key);
    if (afterDownload === "stop") {
      notify({
        title: "Dictation is ready",
        message: "Click the microphone, speak, and click it again to stop.",
        tone: "success",
      });
      return false;
    }
    return true;
  }
  // Downloaded: load it while you start speaking.
  void engine(s.fake)
    .load(s.repo, variant === "gpu")
    .then((device) => {
      ready.add(key);
      useSpeechEngine.setState({ device });
    })
    .catch(() => undefined);
  return true;
}

export function transcribe(audio: Float32Array, s = speechSettings()): Promise<string> {
  return speechVariant(s).then((variant) =>
    engine(s.fake).transcribe(s.repo, variant === "gpu", audio, s.language),
  );
}

async function microphoneAllowed(): Promise<boolean> {
  const access = await call("speech.microphone").catch(() => "unknown" as const);
  if (access !== "denied" && access !== "restricted") return true;
  notify({
    title: "Jig may not use the microphone",
    message:
      useConfig.getState().info?.platform === "darwin"
        ? "Allow Jig in System Settings → Privacy & Security → Microphone."
        : "Turn on microphone access for desktop apps in Settings → Privacy & security → Microphone.",
    tone: "danger",
  });
  return false;
}

/** Samples per microphone frame (128 ms). */
export const FRAME = 2048;

/**
 * The microphone as 16 kHz mono samples, kept as they come in. `onFrame` sees each 128 ms frame
 * (voice activity detection while talking with Claude).
 */
export class Capture {
  private chunks: Float32Array[] = [];
  /** Samples dropped from the front (`forget`), so indexes stay the same. */
  private dropped = 0;
  length = 0;
  onFrame?: (frame: Float32Array) => void;
  private context?: AudioContext;
  private node?: ScriptProcessorNode;

  private constructor(private readonly stream: MediaStream) {}

  static async open(): Promise<Capture | undefined> {
    if (!(await microphoneAllowed())) return undefined;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const capture = new Capture(stream);
      await capture.start();
      return capture;
    } catch (error) {
      notify({ title: "No microphone", message: errorMessage(error), tone: "danger" });
      return undefined;
    }
  }

  private async start(): Promise<void> {
    // The browser resamples the microphone to Whisper's rate.
    const context = new AudioContext({ sampleRate: SAMPLE_RATE });
    const source = context.createMediaStreamSource(this.stream);
    const node = context.createScriptProcessor(FRAME, 1, 1);
    node.onaudioprocess = (event) => {
      const frame = new Float32Array(event.inputBuffer.getChannelData(0));
      this.chunks.push(frame);
      this.length += frame.length;
      this.onFrame?.(frame);
    };
    source.connect(node);
    node.connect(context.destination);
    this.context = context;
    this.node = node;
    await context.resume();
  }

  /** Samples `from`–`to` (indexes since the microphone opened). */
  samples(from: number, to = this.length): Float32Array {
    const out = new Float32Array(Math.max(0, to - from));
    let at = this.dropped;
    for (const chunk of this.chunks) {
      const end = at + chunk.length;
      if (end > from && at < to) {
        const a = Math.max(from, at);
        const b = Math.min(to, end);
        out.set(chunk.subarray(a - at, b - at), a - from);
      }
      at = end;
      if (at >= to) break;
    }
    return out;
  }

  /** Drops audio before `index` (talking: what was already said). */
  forget(index: number): void {
    while (this.chunks.length && this.dropped + this.chunks[0]!.length <= index) {
      this.dropped += this.chunks.shift()!.length;
    }
  }

  close(): void {
    this.onFrame = undefined;
    if (this.node) this.node.onaudioprocess = null;
    for (const track of this.stream.getTracks()) track.stop();
    void this.context?.close().catch(() => undefined);
  }
}

/** Live passes: how often Whisper reads again what you said so far. */
const LIVE_EVERY_MS = 250;
/** A piece longer than this is fixed (its text kept) and the next starts after it. */
const PIECE_SAMPLES = 20 * SAMPLE_RATE;

/**
 * Turns what you say from `from` on into text, while you say it (with `live`): Whisper reads the
 * current piece again and again; long speech is cut at a quiet moment into pieces whose text is
 * kept. `finish` reads the last piece and returns everything.
 */
export class LiveText {
  private committed = "";
  private at: number;
  private lastPass = 0;
  private stopped = false;
  private loop?: Promise<void>;

  constructor(
    private readonly capture: Capture,
    from: number,
    private readonly onText: (text: string) => void,
    private readonly s = speechSettings(),
  ) {
    this.at = from;
    if (s.live) this.loop = this.run();
  }

  private async run(): Promise<void> {
    while (!this.stopped) {
      await new Promise((r) => setTimeout(r, LIVE_EVERY_MS));
      if (this.stopped) break;
      const end = this.capture.length;
      if (end - this.lastPass < SAMPLE_RATE * 0.4) continue;
      this.lastPass = end;
      const long = end - this.at > PIECE_SAMPLES;
      const cut = long
        ? this.at +
          quietestCut(
            this.capture.samples(this.at, end),
            PIECE_SAMPLES * 0.75,
            end - this.at - SAMPLE_RATE / 2,
          )
        : end;
      const text = await this.read(this.at, cut).catch(() => undefined);
      if (this.stopped || text === undefined) continue;
      if (long) {
        this.committed = joinSpeech(this.committed, text);
        this.at = cut;
        this.onText(this.committed);
      } else this.onText(joinSpeech(this.committed, text));
    }
  }

  private read(from: number, to: number): Promise<string> {
    const audio = this.capture.samples(from, to);
    if (!this.s.fake && isSilent(audio)) return Promise.resolve("");
    return transcribe(audio, this.s);
  }

  /** Everything you said, read once more to the end. */
  async finish(): Promise<string> {
    this.stopped = true;
    await this.loop;
    return joinSpeech(this.committed, await this.read(this.at, this.capture.length));
  }

  cancel(): void {
    this.stopped = true;
  }
}
