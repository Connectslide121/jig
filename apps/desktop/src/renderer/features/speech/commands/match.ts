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

/** The greetings before "Jig", as Whisper writes them. */
const GREETINGS = new Set(["hey", "hay", "hei", "hej", "hi", "ey", "eh", "ok", "okay", "a", "yo"]);
/** How Whisper has written the name itself. */
const SPELLINGS = new Set(["jig", "jigg", "jigs", "jik", "jick", "jeg", "gig", "zig"]);
/**
 * A word that sounds like "jig" (D-389): a j-like start (j, g, dj, z, ch, sh, or b/d, which Whisper
 * swaps for a soft j), a short i, and a hard end (g, k, ck…); an e only after j or g ("jeg", not
 * "check" or "deck"); "jeep" and the bare letter "g" too. "Jake", "Jack", "Jim", "Jeff", "did",
 * "give" don't.
 */
const SOUNDS_LIKE_JIG =
  /^(?:(?:j|g|dj|dg|dz|z|ch|sh|b|d)(?:i|ee|ea|ie|y)(?:g|gg|gs|k|ck|ks|c|q|x)|[jg]e(?:g|gg|k|ck)|jeep|g)$/;
/** "Hey Jig" written as one word: "heyjig", "hijig", "hejig". */
const MERGED = /^(?:hey|hay|hi|he|hej|ok|okay)(?<name>[a-z]+)$/;

/** Whether a word is one of the greetings before "Jig" ("hey", "ok"…). */
export function isGreeting(word: string | undefined): boolean {
  return word !== undefined && GREETINGS.has(word);
}

/** Whether a word is the name, as Whisper spells it or close enough in sound. */
function nameWord(word: string | undefined): "spelling" | "sounds-like" | undefined {
  if (!word) return undefined;
  if (SPELLINGS.has(word)) return "spelling";
  return SOUNDS_LIKE_JIG.test(word.replace(/(.)\1+/g, "$1$1")) ? "sounds-like" : undefined;
}

/** What the wake check made of the start of something said: for the readout in the training (D-389). */
export interface WakeMatch {
  /** What was said after the wake words ("" = only them); undefined when it wasn't for Jig. */
  rest?: string;
  /** How the wake words were found. */
  via?: "spelling" | "sounds-like" | "learned";
  /** Why it was or wasn't "Hey Jig", in plain words. */
  reason: string;
}

/**
 * Whether `text` starts with "Hey Jig" (D-278, D-389): the greeting and the name as Whisper spells
 * it, a word that sounds like "jig", or one of the starts Whisper wrote for your own voice when you
 * trained it (`learned`, cleaned words such as "hey you"). The greeting is needed unless `bare`.
 */
export function matchWake(text: string, learned: readonly string[] = [], bare = false): WakeMatch {
  const words = cleanWords(text).split(" ").filter(Boolean);
  if (!words.length) return { reason: "Nothing was heard" };
  const after = (n: number) => words.slice(n).join(" ");
  for (const variant of learned) {
    const v = cleanWords(variant).split(" ").filter(Boolean);
    if (v.length && v.every((w, i) => words[i] === w))
      return { rest: after(v.length), via: "learned", reason: `Your trained “${v.join(" ")}”` };
  }
  const [first, second] = words;
  if (first && GREETINGS.has(first)) {
    // "a big deal", "a gig tonight": after "a" only the name's own spellings count.
    const via = first === "a" && !SPELLINGS.has(second ?? "") ? undefined : nameWord(second);
    if (via)
      return {
        rest: after(2),
        via,
        reason: `“${first} ${second}”${via === "spelling" ? "" : " sounds like Hey Jig"}`,
      };
    return { reason: second ? `“${first}” then “${second}”, not Jig` : `Only “${first}”` };
  }
  const merged = first ? MERGED.exec(first) : null;
  const mergedVia = nameWord(merged?.groups?.name);
  if (mergedVia) return { rest: after(1), via: mergedVia, reason: `“${first}” sounds like Hey Jig` };
  const bareVia = bare ? nameWord(first) : undefined;
  if (bareVia) return { rest: after(1), via: bareVia, reason: `“${first}”` };
  return { reason: `Starts with “${words.slice(0, 2).join(" ")}”, not Hey Jig` };
}

/**
 * What you said after "Hey Jig", or undefined when it wasn't for Jig. The greeting is needed unless
 * `bare` (then "Jig, new chat" counts too). "Hey Jig" alone gives "".
 */
export function afterWake(text: string, bare = false, learned: readonly string[] = []): string | undefined {
  return matchWake(text, learned, bare).rest;
}

/**
 * The start of a take in the training (cleaned, at most three words) that the defaults don't already
 * hear as "Hey Jig", to be learned as yours; undefined when the defaults hear it or it's no use (empty,
 * or a whole sentence).
 */
export function learnedStart(text: string): string | undefined {
  const words = cleanWords(text).split(" ").filter(Boolean);
  if (!words.length || words.length > 3) return undefined;
  // A greeting alone would wake Jig on every "hey".
  if (words.length === 1 && GREETINGS.has(words[0]!)) return undefined;
  if (matchWake(text).rest !== undefined) return undefined;
  return words.join(" ");
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
