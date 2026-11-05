import { oggOpus } from "../../../shared/ogg";
import { VOICE_SAMPLE_RATE } from "../../../shared/speech";
import { call } from "../../lib/host";
import { useConfig } from "../../stores/config";
import { speechSettings, transcribe } from "../speech/engine";

/**
 * Voice messages on your phone (D-350): the host hands this window what needs a browser's audio —
 * Whisper for a voice message you sent, and the natural voice plus WebCodecs' Opus encoder for one
 * Jig sends back — and gets the text or the Ogg file.
 */

const fromBase64 = (data: string) => Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

/** A voice message (Ogg Opus) as 16 kHz mono samples, as Whisper wants them. */
async function decode(ogg: Uint8Array): Promise<Float32Array> {
  // decodeAudioData resamples to the context's rate.
  const ctx = new OfflineAudioContext(1, 1, 16_000);
  const buffer = await ctx.decodeAudioData(ogg.slice().buffer);
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const mixed = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const channel = buffer.getChannelData(c);
    for (let i = 0; i < mixed.length; i++) mixed[i]! += channel[i]! / buffer.numberOfChannels;
  }
  return mixed;
}

async function voiceToText(ogg: Uint8Array): Promise<string> {
  const settings = speechSettings();
  // The fake engine (tests) answers without real audio.
  const audio = settings.fake ? new Float32Array(16_000) : await decode(ogg);
  return (await transcribe(audio, settings)).trim();
}

/** Samples at one rate to another (the natural voice speaks at 24 kHz, Opus wants 48 kHz). */
async function resample(samples: Float32Array, from: number, to: number): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, Math.ceil((samples.length * to) / from), to);
  const buffer = ctx.createBuffer(1, samples.length, from);
  buffer.copyToChannel(new Float32Array(samples), 0);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();
  return (await ctx.startRendering()).getChannelData(0);
}

/** 48 kHz mono samples as an Ogg Opus voice message. */
async function encode(samples: Float32Array): Promise<Uint8Array> {
  const packets: Uint8Array[] = [];
  let failed: unknown;
  const encoder = new AudioEncoder({
    output: (chunk) => {
      const bytes = new Uint8Array(chunk.byteLength);
      chunk.copyTo(bytes);
      packets.push(bytes);
    },
    error: (error) => {
      failed = error;
    },
  });
  encoder.configure({ codec: "opus", sampleRate: 48_000, numberOfChannels: 1, bitrate: 32_000 });
  const step = 4800;
  for (let at = 0; at < samples.length; at += step) {
    const part = samples.subarray(at, Math.min(at + step, samples.length));
    const data = new AudioData({
      format: "f32",
      sampleRate: 48_000,
      numberOfChannels: 1,
      numberOfFrames: part.length,
      timestamp: Math.round((at / 48_000) * 1e6),
      data: new Float32Array(part),
    });
    encoder.encode(data);
    data.close();
  }
  await encoder.flush();
  encoder.close();
  if (failed) throw failed;
  return oggOpus(packets, { samples: samples.length });
}

async function textToVoice(text: string): Promise<Uint8Array> {
  const speech = useConfig.getState().config?.speech;
  // The fake engine (tests) has no natural voice: half a second of tone, through the real encoder.
  const pcm = speechSettings().fake
    ? Float32Array.from(
        { length: VOICE_SAMPLE_RATE / 2 },
        (_, i) => 0.2 * Math.sin((2 * Math.PI * 440 * i) / VOICE_SAMPLE_RATE),
      )
    : await call("speech.say", {
        text,
        voice: speech?.naturalVoice ?? "af_heart",
        speed: speech?.rate ?? 1,
      });
  return encode(await resample(pcm, VOICE_SAMPLE_RATE, 48_000));
}

let started = false;
/** Answers the host's voice jobs while Jig runs. */
export function startPhoneVoice(): void {
  if (started) return;
  started = true;
  window.jig.on("phone.voiceJob", (job) => {
    const work =
      job.kind === "transcribe"
        ? voiceToText(fromBase64(job.data)).then((text) => ({ text }))
        : textToVoice(job.data).then((ogg) => ({ data: toBase64(ogg) }));
    void work
      .then((result) => call("phone.voiceDone", { id: job.id, ...result }))
      .catch((error) =>
        call("phone.voiceDone", { id: job.id, error: String((error as Error)?.message ?? error) }),
      )
      .catch(() => undefined);
  });
}
