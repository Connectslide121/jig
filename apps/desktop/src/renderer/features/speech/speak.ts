import { create } from "zustand";
import { errorMessage } from "../../lib/host";
import { useConfig } from "../../stores/config";
import { notify } from "../../workbench/toasts";
import {
  downloadNaturalVoice,
  makeSpeech,
  naturalState,
  type Playback,
  playAudio,
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
  const parts = speechParts(speakableText(markdown));
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
  /** It started; `levels`: the voice's loudness every 16 ms (natural voice only). */
  onStart?: (levels?: number[]) => void;
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
    try {
      const audio = await makeSpeech(text);
      if (stopped) return;
      playback = playAudio(audio, { onStart: (levels) => handlers.onStart?.(levels), onEnd: end });
    } catch (error) {
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
    }
  })();
}

/** Gets `text` ready to be said next (the natural voice makes it while the current part plays). */
export function preloadSpeech(text: string): void {
  if (useConfig.getState().config?.speech.engine === "system") return;
  if (useNaturalVoice.getState().state === "ready") makeSpeech(text).catch(() => undefined);
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
