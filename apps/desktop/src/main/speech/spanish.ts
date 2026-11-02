/**
 * Spanish text → phonemes for the natural voice (D-243). The bundled espeak-ng data only knows
 * English, and Spanish spelling says almost exactly how a word sounds, so a short set of rules is
 * enough. The output follows espeak-ng's `es` (Castilian) phonemes, which Kokoro's Spanish voices
 * were trained on: stress `ˈ` before the stressed vowel, `θ` for c/z, `β ð ɣ` between vowels.
 */

const VOWELS = "aeiouáéíóúü";
const ACCENTED: Record<string, string> = { á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u" };
const STRONG = new Set(["a", "e", "o"]);

/** Short words Spanish says without stress (articles, prepositions, pronouns, conjunctions). */
const UNSTRESSED = new Set(
  (
    "a al con de del e el en la las le les lo los me mi mis nos o os por que se sin su sus te tu tus " +
    "u un y para pero como cuando donde"
  ).split(" "),
);

const ONES = [
  "cero uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince",
  "dieciséis diecisiete dieciocho diecinueve veinte veintiuno veintidós veintitrés veinticuatro",
  "veinticinco veintiséis veintisiete veintiocho veintinueve",
]
  .join(" ")
  .split(" ");
const TENS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const HUNDREDS = [
  "",
  "ciento",
  "doscientos",
  "trescientos",
  "cuatrocientos",
  "quinientos",
  "seiscientos",
  "setecientos",
  "ochocientos",
  "novecientos",
];

/** A whole number as Spanish words (up to 999 999 999; bigger ones are read digit by digit). */
export function spanishNumber(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999_999) return String(n).split("").join(" ");
  if (n < 30) return ONES[n]!;
  if (n < 100) return TENS[Math.floor(n / 10)]! + (n % 10 ? ` y ${ONES[n % 10]}` : "");
  if (n === 100) return "cien";
  if (n < 1000) return HUNDREDS[Math.floor(n / 100)]! + (n % 100 ? ` ${spanishNumber(n % 100)}` : "");
  if (n < 1_000_000) {
    const thousands = Math.floor(n / 1000);
    const head =
      thousands === 1
        ? "mil"
        : `${spanishNumber(thousands)
            .replace(/veintiuno$/, "veintiún")
            .replace(/uno$/, "un")} mil`;
    return head + (n % 1000 ? ` ${spanishNumber(n % 1000)}` : "");
  }
  const millions = Math.floor(n / 1_000_000);
  const head = millions === 1 ? "un millón" : `${spanishNumber(millions).replace(/uno$/, "un")} millones`;
  return head + (n % 1_000_000 ? ` ${spanishNumber(n % 1_000_000)}` : "");
}

const isVowel = (c: string | undefined) => c !== undefined && VOWELS.includes(c);

/** The vowel letters of a word grouped into syllable nuclei (diphthongs together), as letter indexes. */
function nuclei(word: string): number[][] {
  const groups: number[][] = [];
  let current: number[] = [];
  for (let i = 0; i < word.length; i++) {
    const c = word[i]!;
    // "qu" and "gu" before e/i: the u is silent, not a vowel.
    if (
      (c === "u" && (word[i - 1] === "q" || word[i - 1] === "g") && /[eiéí]/.test(word[i + 1] ?? "")) ||
      !isVowel(c)
    ) {
      if (current.length) groups.push(current);
      current = [];
      continue;
    }
    const prev = current.length ? word[current[current.length - 1]!]! : undefined;
    // Two strong vowels, or an accented weak one, are separate syllables.
    const hiatus =
      prev !== undefined &&
      ((STRONG.has(ACCENTED[prev] ?? prev) && STRONG.has(ACCENTED[c] ?? c)) ||
        c === "í" ||
        c === "ú" ||
        prev === "í" ||
        prev === "ú");
    if (hiatus) {
      groups.push(current);
      current = [];
    }
    current.push(i);
  }
  if (current.length) groups.push(current);
  return groups;
}

/** The letter index of the stressed vowel, or -1 when the word is said without stress. */
function stressedVowel(word: string, groups: number[][]): number {
  for (let i = 0; i < word.length; i++) if ("áéíóú".includes(word[i]!)) return i;
  if (!groups.length || UNSTRESSED.has(word)) return -1;
  const last = word[word.length - 1]!;
  const group =
    /[aeiouns]/.test(last) && groups.length > 1 ? groups[groups.length - 2]! : groups[groups.length - 1]!;
  // The strong vowel of a diphthong carries the stress (ue → e, ia → a); two weak ones: the second.
  return group.find((i) => STRONG.has(word[i]!)) ?? group[group.length - 1]!;
}

/** One Spanish word (lower case letters) → phonemes. */
export function spanishWord(word: string): string {
  const groups = nuclei(word);
  const stressed = stressedVowel(word, groups);
  const nucleusOf = new Map<number, number[]>();
  for (const g of groups) for (const i of g) nucleusOf.set(i, g);
  let out = "";
  for (let i = 0; i < word.length; i++) {
    const c = word[i]!;
    const next = word[i + 1];
    const prev = word[i - 1];
    const front = /[eiéí]/.test(next ?? "");
    const afterPauseOrNasal = i === 0 || prev === "n" || prev === "m";
    if (isVowel(c) && nucleusOf.has(i)) {
      const plain = ACCENTED[c] ?? c;
      const group = nucleusOf.get(i)!;
      if (i === stressed) out += "ˈ";
      // The syllable's vowel: the strong one, or the second of two weak ones ("ciu", "cui").
      const core = group.find((g) => STRONG.has(word[g]!)) ?? group[group.length - 1]!;
      if (i !== core && i !== stressed) {
        // Rising diphthongs glide in (j, w); falling ones glide out (ɪ, ʊ), as espeak-ng writes them.
        out += i < core ? (plain === "i" ? "j" : "w") : plain === "i" ? "ɪ" : "ʊ";
      } else out += plain;
      continue;
    }
    switch (c) {
      case "u": // silent u in qu/gu
      case "h":
        break;
      case "b":
      case "v":
        out += afterPauseOrNasal ? "b" : "β";
        break;
      case "c":
        if (next === "h") {
          out += "ʧ";
          i++;
        } else out += front ? "θ" : "k";
        break;
      case "d":
        out += afterPauseOrNasal || prev === "l" ? "d" : "ð";
        break;
      case "g":
        if (front) out += "x";
        else out += afterPauseOrNasal ? "ɡ" : "ɣ";
        if (next === "ü") {
          out += "w";
          i++;
        }
        break;
      case "j":
        out += "x";
        break;
      case "l":
        if (next === "l") {
          out += "ʝ";
          i++;
        } else out += "l";
        break;
      case "ñ":
        out += "ɲ";
        break;
      case "q":
        out += "k";
        break;
      case "r":
        if (next === "r") {
          out += "r";
          i++;
        } else out += i === 0 || prev === "n" || prev === "l" || prev === "s" ? "r" : "ɾ";
        break;
      case "x":
        out += i === 0 ? "s" : "ks";
        break;
      case "y":
        // "y" alone, or at the end after a vowel ("hoy", "muy"), is a vowel.
        if (word.length === 1) out += "i";
        else if (i === word.length - 1 && isVowel(prev)) out += "ɪ";
        else out += "ʝ";
        break;
      case "z":
        out += "θ";
        break;
      case "k":
      case "w":
      case "f":
      case "m":
      case "n":
      case "p":
      case "s":
      case "t":
        out += c;
        break;
      default:
        break;
    }
  }
  return out;
}

/** Spanish text → phonemes for Kokoro: words become phonemes, punctuation and spaces stay. */
export function spanishPhonemes(text: string): string {
  return text
    .toLowerCase()
    .replace(/(\d+)[.,](\d+)/g, (_, a: string, b: string) => `${a} coma ${b}`)
    .replace(/\d+/g, (n) => spanishNumber(Number(n)))
    .replace(/%/g, " por ciento")
    .replace(/[¡¿]/g, "")
    .replace(/[a-zñáéíóúü]+/g, (w) => spanishWord(w))
    .replace(/[^\sˈa-zɡβðɣθʧʝɲɾɪʊ.,;:!?—…"()“”]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
