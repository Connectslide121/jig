/**
 * English text → phonemes for the natural voice (D-243), with espeak-ng (the `phonemizer` package).
 * Adapted from kokoro-js 1.2.1 (Apache-2.0, hexgrad and Xenova), which prepares text the way Kokoro
 * was trained: numbers, times and money spelled out, punctuation kept between the phonemized words.
 */

export type Phonemize = (text: string, language: string) => Promise<string[]>;

/** "1990" → "19 90", "10:30" → "10 30", "10:00" → "10 o'clock". */
function splitNumber(n: string): string {
  if (n.includes(".")) return n;
  if (n.includes(":")) {
    const [h, m] = n.split(":").map(Number) as [number, number];
    if (m === 0) return `${h} o'clock`;
    return m < 10 ? `${h} oh ${m}` : `${h} ${m}`;
  }
  const year = Number.parseInt(n.slice(0, 4), 10);
  if (year < 1100 || year % 1000 < 10) return n;
  const left = n.slice(0, 2);
  const right = Number.parseInt(n.slice(2, 4), 10);
  const s = n.endsWith("s") ? "s" : "";
  if (year % 1000 >= 100 && year % 1000 <= 999) {
    if (right === 0) return `${left} hundred${s}`;
    if (right < 10) return `${left} oh ${right}${s}`;
  }
  return `${left} ${right}${s}`;
}

/** "$5.50" → "5 dollars and 50 cents". */
function money(m: string): string {
  const unit = m[0] === "$" ? "dollar" : "pound";
  if (Number.isNaN(Number(m.slice(1)))) return `${m.slice(1)} ${unit}s`;
  if (!m.includes(".")) return `${m.slice(1)} ${unit}${m.slice(1) === "1" ? "" : "s"}`;
  const [whole, part] = m.slice(1).split(".") as [string, string];
  const cents = Number.parseInt(part.padEnd(2, "0"), 10);
  const small = m[0] === "$" ? (cents === 1 ? "cent" : "cents") : cents === 1 ? "penny" : "pence";
  return `${whole} ${unit}${whole === "1" ? "" : "s"} and ${cents} ${small}`;
}

/** "3.14" → "3 point 1 4". */
function pointNumber(n: string): string {
  const [a, b] = n.split(".") as [string, string];
  return `${a} point ${b.split("").join(" ")}`;
}

/** Text as Kokoro expects it: quotes and brackets evened out, titles, numbers and money spelled. */
export function normalizeEnglish(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/«/g, "“")
    .replace(/»/g, "”")
    .replace(/[“”]/g, '"')
    .replace(/\(/g, "«")
    .replace(/\)/g, "»")
    .replace(/[^\S \n]/g, " ")
    .replace(/ {2,}/g, " ")
    .replace(/(?<=\n) +(?=\n)/g, "")
    .replace(/\bD[Rr]\.(?= [A-Z])/g, "Doctor")
    .replace(/\b(?:Mr\.|MR\.(?= [A-Z]))/g, "Mister")
    .replace(/\b(?:Ms\.|MS\.(?= [A-Z]))/g, "Miss")
    .replace(/\b(?:Mrs\.|MRS\.(?= [A-Z]))/g, "Mrs")
    .replace(/\betc\.(?! [A-Z])/gi, "etc")
    .replace(/\b(y)eah?\b/gi, "$1e'a")
    .replace(/\d*\.\d+|\b\d{4}s?\b|(?<!:)\b(?:[1-9]|1[0-2]):[0-5]\d\b(?!:)/g, splitNumber)
    .replace(/(?<=\d),(?=\d)/g, "")
    .replace(/[$£]\d+(?:\.\d+)?(?: hundred| thousand| (?:[bm]|tr)illion)*\b|[$£]\d+\.\d\d?\b/gi, money)
    .replace(/\d*\.\d+/g, pointNumber)
    .replace(/(?<=\d)-(?=\d)/g, " to ")
    .replace(/(?<=\d)S/g, " S")
    .replace(/(?<=[BCDFGHJ-NP-TV-Z])'?s\b/g, "'S")
    .replace(/(?<=X')S\b/g, "s")
    .replace(/(?:[A-Za-z]\.){2,} [a-z]/g, (m) => m.replace(/\./g, "-"))
    .replace(/(?<=[A-Z])\.(?=[A-Z])/gi, "-")
    .trim();
}

/** Runs of punctuation (with their spaces), kept as they are between the phonemized words. */
const PUNCTUATION = /(\s*[;:,.!?¡¿—…"«»“”(){}[\]]+\s*)+/g;

/** Splits text into words and punctuation, in order. */
export function splitPunctuation(text: string): Array<{ punctuation: boolean; text: string }> {
  const parts: Array<{ punctuation: boolean; text: string }> = [];
  let at = 0;
  for (const m of text.matchAll(PUNCTUATION)) {
    if (at < m.index) parts.push({ punctuation: false, text: text.slice(at, m.index) });
    if (m[0].length) parts.push({ punctuation: true, text: m[0] });
    at = m.index + m[0].length;
  }
  if (at < text.length) parts.push({ punctuation: false, text: text.slice(at) });
  return parts;
}

/** English text → phonemes, American (`en-us`) or British (`en-gb`). */
export async function englishPhonemes(text: string, british: boolean, phonemize: Phonemize): Promise<string> {
  const parts = splitPunctuation(normalizeEnglish(text));
  const language = british ? "en" : "en-us";
  const spoken = await Promise.all(
    parts.map(async (p) => (p.punctuation ? p.text : (await phonemize(p.text, language)).join(" "))),
  );
  let out = spoken
    .join("")
    .replace(/kəkˈoːɹoʊ/g, "kˈoʊkəɹoʊ")
    .replace(/kəkˈɔːɹəʊ/g, "kˈəʊkəɹəʊ")
    .replace(/ʲ/g, "j")
    .replace(/r/g, "ɹ")
    .replace(/x/g, "k")
    .replace(/ɬ/g, "l")
    .replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/g, " ")
    .replace(/ z(?=[;:,.!?¡¿—…"«»“” ]|$)/g, "z");
  if (!british) out = out.replace(/(?<=nˈaɪn)ti(?!ː)/g, "di");
  return out.trim();
}
