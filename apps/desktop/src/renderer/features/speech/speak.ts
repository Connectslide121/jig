import { create } from "zustand";
import { useConfig } from "../../stores/config";
import { notify } from "../../workbench/toasts";

/**
 * Reading Claude's messages aloud with the system's voices (D-208). Code blocks are named, not read;
 * links read as their text; Markdown marks are dropped.
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
  const synth = window.speechSynthesis;
  if (!synth) {
    notify({ title: "Reading aloud isn't available", message: "This system has no speech voices." });
    return;
  }
  const current = useReading.getState().reading;
  synth.cancel();
  if (current === id) {
    useReading.setState({ reading: undefined });
    return;
  }
  const utterance = voiceUtterance(speakableText(markdown));
  const done = () => {
    if (useReading.getState().reading === id) useReading.setState({ reading: undefined });
  };
  utterance.onend = done;
  utterance.onerror = done;
  useReading.setState({ reading: id });
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
