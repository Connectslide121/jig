import { create } from "zustand";
import { errorMessage } from "../../lib/host";
import { useConfig } from "../../stores/config";
import { notify } from "../../workbench/toasts";
import {
  downloadNaturalVoice,
  makeSpeech,
  naturalState,
  type Playback,
  playSpeech,
  type Speech,
  useNaturalVoice,
} from "./naturalVoice";

/**
 * Reading Claude's messages aloud (D-208) with the natural voice (D-243) or the system's voices.
 * Code blocks are named, not read; links read as their text; Markdown marks are dropped.
 */
export function speakableText(markdown: string): string {
  return markdown
    .replace(/```[^\n]*\n[\s\S]*?(```|$)/g, "\n(code)\n")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/^\s*\|?\s*:?-{3,}.*$/gm, "")
    .replace(/\|/g, ", ")
    .replace(/(\*\*|~~|\*)(\S[\s\S]*?\S|\S)\1/g, "$2")
    .replace(/(^|\W)(__?)(\S[\s\S]*?\S|\S)\2(?=\W|$)/g, "$1$3")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export const useReading = create<{ reading?: string }>(() => ({}));

/** Reads a message aloud, or stops when it is the one being read. */
export function toggleReadAloud(id: string, markdown: string): void {
  const current = useReading.getState().reading;
  stopSpeaking();
  if (current === id) {
    useReading.setState({ reading: undefined });
    return;
  }
  // The first words are said on their own, so reading starts sooner (D-411).
  const early = earlyBreak(markdown, 0, true) ?? 0;
  const parts = [
    ...speechChunks(speakableText(markdown.slice(0, early))),
    ...speechParts(speakableText(markdown.slice(early))),
  ];
  useReading.setState({ reading: id });
  const next = (i: number) => {
    if (useReading.getState().reading !== id) return;
    if (i >= parts.length) {
      useReading.setState({ reading: undefined });
      return;
    }
    if (parts[i + 1]) preloadSpeech(parts[i + 1]!);
    speak(parts[i]!, { onEnd: () => next(i + 1) });
  };
  next(0);
}

/** Text in sentence-sized parts (a part at most ~250 characters), so reading starts quickly. */
export function speechParts(text: string, max = 250): string[] {
  const parts: string[] = [];
  let current = "";
  for (const sentence of text.split(/(?<=[.!?…:;])\s+|[\r\n]+/)) {
    const s = sentence.trim();
    if (!s) continue;
    if (current && current.length + s.length + 1 > max) {
      parts.push(current);
      current = "";
    }
    current = current ? `${current} ${s}` : s;
  }
  if (current) parts.push(current);
  return parts;
}

export interface SpeakHandlers {
  /**
   * It started; `levels`: the voice's loudness every 16 ms of its first piece, `speech`: the audio
   * and when it was asked for and made (natural voice only).
   */
  onStart?: (levels?: number[], speech?: Speech) => void;
  /** The natural voice's next piece started: its loudness every 16 ms. */
  onLevels?: (levels: number[]) => void;
  /** Each word (system voices only: they give no audio to measure). */
  onWord?: () => void;
  /** It finished or failed (not called after `stopSpeaking`). */
  onEnd: () => void;
}

/** What is being said now, so `stopSpeaking` can stop it. */
let speaking: { stop(): void } | undefined;
let fellBack = false;

/** Says `text` in the voice chosen in Settings: the natural voice, or the system's. */
export function speak(text: string, handlers: SpeakHandlers): void {
  let stopped = false;
  let playback: Playback | undefined;
  const token = {
    stop() {
      stopped = true;
      playback?.stop();
    },
  };
  speaking = token;
  const end = () => {
    if (speaking === token) speaking = undefined;
    if (!stopped) handlers.onEnd();
  };
  const { config, info } = useConfig.getState();
  // Tests (the fake engine) never download the natural voice.
  if (config?.speech.engine === "system" || info?.engine === "fake") {
    systemSpeak(text, handlers, end);
    return;
  }
  void (async () => {
    let state = await naturalState();
    if (state === "missing") {
      // The first time: offer the download, and read with the system's voice meanwhile.
      void downloadNaturalVoice();
      state = "declined";
    }
    if (stopped) return;
    if (state !== "ready") {
      systemSpeak(text, handlers, end);
      return;
    }
    const speech = makeSpeech(text);
    playback = playSpeech(speech, {
      onStart: (levels) => handlers.onStart?.(levels, speech),
      onLevels: (levels) => handlers.onLevels?.(levels),
      onEnd: end,
      onError: (error) => {
        if (stopped) return;
        if (!fellBack) {
          fellBack = true;
          notify({
            title: "The natural voice didn't work",
            message: `${errorMessage(error)} Your system's voice reads instead.`,
            tone: "warning",
          });
        }
        systemSpeak(text, handlers, end);
      },
    });
  })();
}

/** Gets `text` ready to be said next (the natural voice makes it while the current part plays). */
export function preloadSpeech(text: string): void {
  if (useConfig.getState().config?.speech.engine === "system") return;
  if (useNaturalVoice.getState().state === "ready") makeSpeech(text);
}

/** Stops whatever is being said. */
export function stopSpeaking(): void {
  const token = speaking;
  speaking = undefined;
  token?.stop();
  window.speechSynthesis?.cancel();
}

function systemSpeak(text: string, handlers: SpeakHandlers, end: () => void): void {
  const synth = window.speechSynthesis;
  if (!synth) {
    notify({ title: "Reading aloud isn't available", message: "This system has no speech voices." });
    end();
    return;
  }
  const utterance = voiceUtterance(text);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    end();
  };
  utterance.onend = finish;
  utterance.onerror = finish;
  utterance.onstart = () => handlers.onStart?.();
  utterance.onboundary = () => handlers.onWord?.();
  // Some systems never say the voice ended.
  timer = setTimeout(finish, 3000 + (text.length * 120) / utterance.rate);
  synth.speak(utterance);
}

/** An utterance in the chosen voice, at the chosen speed. */
export function voiceUtterance(text: string): SpeechSynthesisUtterance {
  const utterance = new SpeechSynthesisUtterance(text);
  const speech = useConfig.getState().config?.speech;
  const voice = speech?.voice
    ? window.speechSynthesis.getVoices().find((v) => v.name === speech.voice)
    : undefined;
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  }
  utterance.rate = speech?.rate ?? 1;
  return utterance;
}

/**
 * How much of a message that is still being written can be spoken now (from `from`): up to the
 * last finished sentence or line, never into an unfinished code block. All of it once `final`.
 */
export function speakableUntil(markdown: string, from: number, final: boolean): number {
  if (final) return markdown.length;
  let end = from;
  const boundary = /[.!?:;](?=\s)|\n/g;
  boundary.lastIndex = from;
  for (let m = boundary.exec(markdown); m; m = boundary.exec(markdown)) end = m.index + m[0].length;
  const fences = [...markdown.slice(0, end).matchAll(/^\s{0,3}```/gm)];
  if (fences.length % 2 === 1) end = Math.max(from, fences[fences.length - 1]!.index ?? from);
  return end;
}

/** The first thing said may end at a comma or clause mark with at least this many words before it. */
const EARLY_MIN_WORDS = 4;
/** …or, while the sentence is still being written, after this many words (D-411). */
const EARLY_MAX_WORDS = 8;
/** A sentence ends here; a clause mark (comma, semicolon, colon, dash) lets the first chunk end. */
const SENTENCE_END = /[.!?…]$/;
const CLAUSE_END = /(?:[,;:]|^[—–-])$/;

/**
 * Where the first thing said after a silence can end early (D-411), in `markdown` from `from`, so
 * the voice starts after a few words instead of a whole sentence: after the first comma, semicolon,
 * colon or dash with at least 4 words before it (and more than one word after it), or, while the
 * sentence is still being written, after 8 words. Only between two whole words (the next one has
 * begun), never inside a number ("1 000"), inline code, a link or bold text, or a code block.
 * `undefined`: no early end before the sentence's own.
 */
export function earlyBreak(markdown: string, from: number, final: boolean): number | undefined {
  const gaps = /\s+/g;
  gaps.lastIndex = from;
  let words = 0;
  let wordStart = from;
  let cut: number | undefined;
  for (let m = gaps.exec(markdown); m; m = gaps.exec(markdown)) {
    const at = m.index;
    const word = markdown.slice(wordStart, at);
    const next = at + m[0].length;
    wordStart = next;
    if (!word) continue;
    words++;
    // A sentence or line ended: the first chunk is that sentence (or ends at the comma found).
    if (SENTENCE_END.test(word) || m[0].includes("\n")) {
      if (cut !== undefined && wordsBetween(markdown, cut, at) < 2) return undefined;
      return cut;
    }
    if (cut !== undefined) {
      // A word after the comma is here; one more and the cut stands even before the sentence ends.
      if (wordsBetween(markdown, cut, next) >= 2) return cut;
      continue;
    }
    if (next >= markdown.length || !safeCut(markdown, from, at)) continue;
    if (CLAUSE_END.test(word) && words >= EARLY_MIN_WORDS) cut = at;
    else if (!final && words >= EARLY_MAX_WORDS) return at;
  }
  // The text ends without a sentence end: still being written, or the last words of a message.
  return cut !== undefined && wordsBetween(markdown, cut, markdown.length) >= 2 ? cut : undefined;
}

/** Whole words in `text` between `start` and `end`. */
function wordsBetween(text: string, start: number, end: number): number {
  return text.slice(start, end).split(/\s+/).filter(Boolean).length;
}

/** Cutting at `at` keeps numbers, inline code, links, bold text and code blocks whole. */
function safeCut(markdown: string, from: number, at: number): boolean {
  if (/\d/.test(markdown[at - 1] ?? "") && /\d/.test(markdown[at + 1] ?? "")) return false;
  const part = markdown.slice(from, at);
  const count = (s: string) => part.split(s).length - 1;
  if (count("`") % 2 || count("**") % 2 || count("[") !== count("]") || count("(") !== count(")"))
    return false;
  return (markdown.slice(0, at).match(/^\s{0,3}```/gm)?.length ?? 0) % 2 === 0;
}

/**
 * Speakable text as the chunks the voice says one after another (D-411): one per sentence or line,
 * so the first is made quickly and each next one while the one before plays (a long sentence is
 * made comma by comma and played as each piece is ready, D-411).
 */
export function speechChunks(text: string): string[] {
  return speechParts(text, 1);
}

/** The system's voices; they may arrive a moment after the page loads. */
export function speechVoices(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis;
  if (!synth) return Promise.resolve([]);
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(synth.getVoices()), 1500);
    synth.addEventListener(
      "voiceschanged",
      () => {
        clearTimeout(timer);
        resolve(synth.getVoices());
      },
      { once: true },
    );
  });
}
