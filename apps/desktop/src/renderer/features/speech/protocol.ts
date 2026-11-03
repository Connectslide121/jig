/** Messages between the dictation controller and the Whisper worker. */
export type WorkerRequest =
  | { type: "load"; id: number; repo: string; gpu: boolean }
  | { type: "transcribe"; id: number; repo: string; gpu: boolean; audio: Float32Array; language: string };

export type WorkerReply =
  | { type: "ready"; id: number; device: "gpu" | "cpu" }
  | { type: "text"; id: number; text: string }
  | { type: "error"; id: number; message: string };

/** Whisper's input rate. */
export const SAMPLE_RATE = 16_000;

/** True when the recording is (nearly) silent, so there is nothing to transcribe. */
export function isSilent(audio: Float32Array, threshold = 0.01): boolean {
  let peak = 0;
  for (const sample of audio) peak = Math.max(peak, Math.abs(sample));
  return peak < threshold;
}

/** Loudness (root mean square) of some samples. */
export function level(audio: Float32Array, from = 0, to = audio.length): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += audio[i]! * audio[i]!;
  return to > from ? Math.sqrt(sum / (to - from)) : 0;
}

/**
 * Where to end a piece of a long recording: the quietest 100 ms between `from` and `to` (so a word
 * isn't cut in two), as a sample index.
 */
export function quietestCut(audio: Float32Array, from: number, to: number): number {
  const window = SAMPLE_RATE / 10;
  let best = to;
  let quietest = Number.POSITIVE_INFINITY;
  for (let start = Math.max(0, from); start + window <= Math.min(to, audio.length); start += window / 2) {
    const loudness = level(audio, start, start + window);
    if (loudness < quietest) {
      quietest = loudness;
      best = start + window / 2;
    }
  }
  return best;
}

/** Whisper's words for sounds that aren't speech: [Music], (water running), *sniffs*, ♪. */
const NOISE_TAGS = /\[[^\]]*\]|\([^)]*\)|\*[^*]*\*|[♪♫]+/g;
/** Sounds that say nothing on their own. */
const FILLERS = new Set(["you", "uh", "um", "uhm", "hmm", "mm", "mhm", "ah", "oh", "eh", "huh"]);
/**
 * What Whisper makes up from noise or near-silence (it learnt from subtitled videos). Dropped only
 * when there was hardly any voice: said for real, they stay.
 */
const MADE_UP = new Set([
  "thank you",
  "thanks",
  "thanks for watching",
  "thank you for watching",
  "thank you so much for watching",
  "please subscribe",
  "subtitles by the amaraorg community",
  "gracias",
  "gracias por ver",
  "subtítulos realizados por la comunidad de amaraorg",
]);

/**
 * What you said without what Whisper hears in noise: sound tags are removed, and a lone filler
 * ("you", "um") is nothing. With `voiced` (seconds of voice the detector heard), a phrase Whisper
 * makes up from noise is nothing too when there was less than a second of voice.
 */
export function cleanSpeech(text: string, voiced = Number.POSITIVE_INFINITY): string {
  const words = text.replace(NOISE_TAGS, " ").replace(/\s+/g, " ").trim();
  const key = words
    .toLowerCase()
    .replace(/[^\p{L}\p{N}' ]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!key || FILLERS.has(key)) return "";
  if (voiced < 1 && MADE_UP.has(key)) return "";
  return words;
}

/** Pieces of what you said, one after the other. */
export function joinSpeech(...parts: string[]): string {
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(" ");
}

/** Where dictated text sits in the message: replaced as the words come in. */
export interface DictationSpan {
  start: number;
  end: number;
}

/**
 * Puts dictated text into a message in place of `span` (the caret, the first time), with a space on
 * either side when needed. Returns the new text, the span to replace next time and the caret.
 */
export function placeDictation(
  text: string,
  span: DictationSpan,
  spoken: string,
): { text: string; span: DictationSpan; caret: number } {
  const before = text.slice(0, span.start);
  const after = text.slice(span.end);
  const lead = spoken && before && !/\s$/.test(before) ? " " : "";
  const trail = spoken && after && !/^[\s.,!?;:)\]]/.test(after) ? " " : "";
  const insert = `${lead}${spoken}${trail}`;
  return {
    text: `${before}${insert}${after}`,
    span: { start: span.start, end: span.start + insert.length },
    caret: before.length + lead.length + spoken.length,
  };
}

/** Puts dictated text into a message at the caret. */
export function insertDictation(
  text: string,
  caret: number,
  spoken: string,
): { text: string; caret: number } {
  const placed = placeDictation(text, { start: caret, end: caret }, spoken);
  return { text: placed.text, caret: placed.caret };
}
