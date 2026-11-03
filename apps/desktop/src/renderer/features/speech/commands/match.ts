import { VOICE_COMMANDS, type VoiceCommand, type VoiceSlot } from "./grammar";

/** Understanding "Hey Jig …" on this computer, without Claude (D-278). */

const CONTRACTIONS: Array<[RegExp, string]> = [
  [/\bwhat'?s\b/g, "what is"],
  [/\bhow'?s\b/g, "how is"],
  [/\bwhere'?s\b/g, "where is"],
  [/\bthat'?s\b/g, "that is"],
];

/** Lowercase words without punctuation, contractions spelled out: "What's up?" → "what is up". */
export function cleanWords(text: string): string {
  let t = text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [from, to] of CONTRACTIONS) t = t.replace(from, to);
  return t;
}

/** How Whisper writes "Hey Jig": the greeting, then the name as it hears it. */
const WAKE = /^(?:(?:hey|hay|hi|ok|okay|a|yo) )?(?:jig|jigg|jigs|jik|jick|jeg|gig|zig)(?: (?<rest>.*))?$/;
const GREETED_WAKE = /^(?:hey|hay|hi|ok|okay|a|yo) (?:jig|jigg|jigs|jik|jick|jeg|gig|zig)\b/;

/**
 * What you said after "Hey Jig", or undefined when it wasn't for Jig. The greeting is needed unless
 * `bare` (then "Jig, new chat" counts too). "Hey Jig" alone gives "".
 */
export function afterWake(text: string, bare = false): string | undefined {
  const words = cleanWords(text);
  if (!bare && !GREETED_WAKE.test(words)) return undefined;
  const m = WAKE.exec(words);
  return m ? (m.groups?.rest ?? "").trim() : undefined;
}

/** Polite padding around a command: "could you please …", "… for me". */
function trimPolite(words: string): string {
  return words
    .replace(/^(?:(?:please|can you|could you|would you|will you|i want to|i'd like to|let's|lets) )+/, "")
    .replace(/(?: (?:please|for me|now|thanks|thank you))+$/, "")
    .trim();
}

export interface ParsedCommand {
  command: VoiceCommand;
  /** The names said for the command's slots, as said (match them with `matchName`). */
  slots: Partial<Record<VoiceSlot, string>>;
}

/** The command in what you said (after the wake word), or undefined when Jig doesn't know it. */
export function parseCommand(
  text: string,
  commands: VoiceCommand[] = VOICE_COMMANDS,
): ParsedCommand | undefined {
  const words = trimPolite(cleanWords(text));
  if (!words) return undefined;
  for (const command of commands)
    for (const pattern of command.patterns) {
      const m = pattern.exec(words);
      if (!m) continue;
      const slots: Partial<Record<VoiceSlot, string>> = {};
      for (const [key, value] of Object.entries(m.groups ?? {}))
        if (value?.trim()) slots[key as VoiceSlot] = value.trim();
      return { command, slots };
    }
  return undefined;
}

function distance(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length]!;
}

/** How alike a spoken name and a real one are, 0–1; spaces and dashes don't count ("knowia studio" = "KnowiaStudio"). */
export function nameScore(spoken: string, name: string): number {
  const a = cleanWords(spoken).replace(/[\s'-]/g, "");
  const b = cleanWords(name.replace(/[-_./]/g, " ")).replace(/[\s'-]/g, "");
  if (!a || !b) return 0;
  if (a === b) return 1;
  // "the shop app" said for "Shop": a whole-word start counts nearly as much as the name itself.
  if (b.startsWith(a) || a.startsWith(b))
    return 0.9 * (Math.min(a.length, b.length) / Math.max(a.length, b.length)) + 0.1;
  return 1 - distance(a, b) / Math.max(a.length, b.length);
}

/** The real name closest to what you said, if it is close enough to be the one you meant. */
export function matchName<T>(
  spoken: string,
  items: T[],
  nameOf: (item: T) => string,
  min = 0.6,
): T | undefined {
  let best: T | undefined;
  let bestScore = min;
  for (const item of items) {
    const score = nameScore(spoken, nameOf(item));
    if (best === undefined ? score >= bestScore : score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}
