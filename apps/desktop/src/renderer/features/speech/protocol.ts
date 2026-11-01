/** Messages between the dictation controller and the Whisper worker. */
export type WorkerRequest =
  | { type: "load"; id: number; repo: string }
  | { type: "transcribe"; id: number; repo: string; audio: Float32Array; language: string };

export type WorkerReply =
  | { type: "ready"; id: number }
  | { type: "text"; id: number; text: string }
  | { type: "error"; id: number; message: string };

/** Whisper's input rate. */
export const SAMPLE_RATE = 16_000;

/** One channel from several: their average. */
export function downmix(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0]!;
  const length = Math.min(...channels.map((c) => c.length));
  const out = new Float32Array(length);
  for (const channel of channels) for (let i = 0; i < length; i++) out[i]! += channel[i]! / channels.length;
  return out;
}

/** True when the recording is (nearly) silent, so there is nothing to transcribe. */
export function isSilent(audio: Float32Array, threshold = 0.01): boolean {
  let peak = 0;
  for (const sample of audio) peak = Math.max(peak, Math.abs(sample));
  return peak < threshold;
}

/** Puts dictated text into a message at the caret, with a space on either side when needed. */
export function insertDictation(
  text: string,
  caret: number,
  spoken: string,
): { text: string; caret: number } {
  const before = text.slice(0, caret);
  const after = text.slice(caret);
  const lead = before && !/\s$/.test(before) ? " " : "";
  const trail = after && !/^\s/.test(after) ? " " : "";
  const insert = `${lead}${spoken}${trail}`;
  return { text: `${before}${insert}${after}`, caret: before.length + lead.length + spoken.length };
}
