import type { TeamsCall } from "@azure/communication-calling";
import { getIdentifierRawId } from "@azure/communication-common";
import type { MeetingCaption } from "../../../shared/meetings";
import {
  attributePiece,
  keepLocalPiece,
  pruneSpans,
  type SpeakingSpan,
  SpeechChunker,
  type SpeechPiece,
  type TranscriptSwitch,
} from "../../../shared/meetingTranscript";
import { SPEECH_MODELS } from "../../../shared/speech";
import { call } from "../../lib/host";
import { FAKE_TEXT, FRAME, speechSettings, speechVariant, transcribe } from "../speech/engine";
import { cleanSpeech, level, SAMPLE_RATE } from "../speech/protocol";

/**
 * The meeting transcript when Teams captions don't run (D-321): the call's audio and your
 * microphone, cut into pieces of 5–10 seconds at silences and turned into text by Whisper on this
 * computer (the Speech settings' model, in dictation's worker). Audio stays in this window's memory
 * only until its piece is transcribed; only the text goes to main, as captions marked `local`.
 */

/** More pieces than this waiting for Whisper: the oldest are skipped, so the transcript keeps up. */
const MAX_WAITING = 4;
/** Frames kept for the piece being cut (a piece is at most 10 s). */
const KEEP_MS = 15_000;

interface Frame {
  at: number;
  samples: Float32Array;
}

export interface LocalTranscriptOptions {
  call: TeamsCall;
  /** Whisper's language code ("en"); empty = Whisper recognises it. */
  language: string;
  /** The microphone the call uses (the calling SDK's device id); empty = the system's default. */
  microphoneId: string;
  /** Which source writes the transcript now (pieces Teams' captions already have are dropped). */
  source(): TranscriptSwitch;
  onCaption(caption: MeetingCaption): void;
  /** Something the transcript should say (once): pieces were skipped, a stream failed. */
  onNotice(reason: string): void;
}

/** Why local transcription can't run now, or undefined when it can (the model is downloaded). */
export async function localTranscriptUnavailable(): Promise<string | undefined> {
  const s = speechSettings();
  if (s.fake) return undefined;
  const variant = await speechVariant(s);
  const status = (await call("speech.models")).find((m) => m.model === s.model);
  if (status?.variants.includes(variant)) return undefined;
  return `Teams captions unavailable, and transcribing on this computer needs the Whisper model (${SPEECH_MODELS[s.model].label}): download it in Settings → Speech`;
}

export class LocalTranscript {
  private context?: AudioContext;
  private stops: Array<() => void> = [];
  private spans: SpeakingSpan[] = [];
  private queue: Promise<void> = Promise.resolve();
  private waiting = 0;
  private skipped = false;
  private stopped = false;
  private remoteStreams = new Set<unknown>();

  constructor(private readonly options: LocalTranscriptOptions) {}

  async start(): Promise<void> {
    const { call: c } = this.options;
    // One clock for frames and speaking spans: wall time in ms.
    this.context = new AudioContext({ sampleRate: SAMPLE_RATE });
    await this.context.resume();
    const remote = () => {
      for (const stream of c.remoteAudioStreams) {
        if (this.remoteStreams.has(stream)) continue;
        this.remoteStreams.add(stream);
        void stream
          .getMediaStream()
          .then((media) => this.listen("call", media))
          .catch((error: unknown) =>
            this.options.onNotice(`Couldn't listen to the call's audio: ${String(error)}`),
          );
      }
    };
    c.on("remoteAudioStreamsUpdated", remote);
    this.stops.push(() => c.off("remoteAudioStreamsUpdated", remote));
    remote();
    try {
      const microphone = await this.microphone();
      if (!this.stopped) this.listen("you", microphone, () => c.isMuted);
      else for (const track of microphone.getTracks()) track.stop();
    } catch (error) {
      this.options.onNotice(`Couldn't listen to your microphone: ${String(error)}`);
    }
    for (const p of c.remoteParticipants)
      if (p.isSpeaking) this.speaking(getIdentifierRawId(p.identifier), p.displayName || "Participant", true);
  }

  /** Your microphone, as the call uses it, with echo cancellation so the call isn't heard twice. */
  private async microphone(): Promise<MediaStream> {
    const audio = { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    const device = this.options.microphoneId.replace(/^microphone:/, "");
    if (!device || device === "default") return navigator.mediaDevices.getUserMedia({ audio });
    return navigator.mediaDevices
      .getUserMedia({ audio: { ...audio, deviceId: { exact: device } } })
      .catch(() => navigator.mediaDevices.getUserMedia({ audio }));
  }

  /** Someone in the call started or stopped speaking (the calling SDK's `isSpeaking`). */
  speaking(id: string, name: string, speaking: boolean): void {
    const now = Date.now();
    const open = this.spans.find((s) => s.id === id && s.to === undefined);
    if (speaking && !open) this.spans.push({ id, name, from: now });
    if (!speaking && open) open.to = now;
    this.spans = pruneSpans(this.spans, now);
  }

  private listen(kind: "you" | "call", media: MediaStream, muted?: () => boolean): void {
    const context = this.context;
    if (!context || this.stopped) return;
    // Chromium only feeds a call's remote audio to Web Audio while a media element plays it.
    const sink = kind === "call" ? new Audio() : undefined;
    if (sink) {
      sink.muted = true;
      sink.srcObject = media;
      void sink.play().catch(() => undefined);
    }
    const source = context.createMediaStreamSource(media);
    const node = context.createScriptProcessor(FRAME, 1, 1);
    const chunker = new SpeechChunker();
    const frameMs = (FRAME / SAMPLE_RATE) * 1000;
    let frames: Frame[] = [];
    node.onaudioprocess = (event) => {
      if (this.stopped) return;
      const at = Date.now() - frameMs;
      // Muted, you say nothing to the call: nothing to transcribe either.
      const samples = muted?.()
        ? new Float32Array(FRAME)
        : new Float32Array(event.inputBuffer.getChannelData(0));
      frames.push({ at, samples });
      frames = frames.filter((f) => f.at > at - KEEP_MS);
      const piece = chunker.push(at, frameMs, level(samples));
      if (!piece) return;
      const audio = this.samples(frames, piece);
      frames = frames.filter((f) => f.at >= piece.to);
      this.enqueue(kind, piece, audio);
    };
    source.connect(node);
    // A script processor only runs while connected to the output; it writes silence there.
    node.connect(context.destination);
    this.stops.push(() => {
      node.onaudioprocess = null;
      node.disconnect();
      source.disconnect();
      if (sink) sink.srcObject = null;
      if (kind === "you") for (const track of media.getTracks()) track.stop();
    });
  }

  private samples(frames: Frame[], piece: SpeechPiece): Float32Array {
    const inside = frames.filter((f) => f.at >= piece.from && f.at < piece.to);
    const out = new Float32Array(inside.reduce((n, f) => n + f.samples.length, 0));
    let offset = 0;
    for (const f of inside) {
      out.set(f.samples, offset);
      offset += f.samples.length;
    }
    return out;
  }

  private enqueue(kind: "you" | "call", piece: SpeechPiece, audio: Float32Array): void {
    if (this.waiting >= MAX_WAITING) {
      if (!this.skipped)
        this.options.onNotice("Transcribing on this computer fell behind; some speech was skipped");
      this.skipped = true;
      return;
    }
    // Who spoke is decided now, while the speaking marks are fresh.
    const who =
      kind === "you" ? { id: "you", name: "You" } : attributePiece(this.spans, piece.from, piece.to);
    this.waiting++;
    this.queue = this.queue
      .then(async () => {
        const s = speechSettings();
        const text = s.fake
          ? FAKE_TEXT
          : cleanSpeech(
              await transcribe(audio, { ...s, language: this.options.language }),
              piece.voiceMs / 1000,
            );
        if (!text || !keepLocalPiece(this.options.source(), piece.from, piece.to)) return;
        this.options.onCaption({
          id: `local-${kind}-${piece.from}`,
          speakerId: who.id,
          speaker: who.name,
          timestamp: new Date(piece.from).toISOString(),
          text,
          final: true,
          source: "local",
        });
      })
      .catch((error: unknown) => {
        if (!this.skipped) this.options.onNotice(`Whisper couldn't transcribe: ${String(error)}`);
        this.skipped = true;
      })
      .finally(() => {
        this.waiting--;
      });
  }

  /** Stops listening; pieces already cut are still transcribed (and dropped if Teams has them). */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const fn of this.stops) fn();
    this.stops = [];
    const context = this.context;
    this.context = undefined;
    void this.queue.finally(() => context?.close().catch(() => undefined));
  }
}
