import { describe, expect, it } from "vitest";
import { spanishNumber, spanishPhonemes, spanishWord } from "./spanish";

describe("spanishWord", () => {
  it.each([
    ["hola", "ˈola"],
    ["soy", "sˈoɪ"],
    ["así", "asˈi"],
    ["hablamos", "aβlˈamos"],
    ["contigo", "kontˈiɣo"],
    ["cuando", "kwando"],
    ["sueno", "swˈeno"],
    ["guerra", "ɡˈera"],
    ["gente", "xˈente"],
    ["pingüino", "pinɡwˈino"],
    ["chico", "ʧˈiko"],
    ["calle", "kˈaʝe"],
    ["niño", "nˈiɲo"],
    ["zapato", "θapˈato"],
    ["ciudad", "θjuðˈað"],
    ["país", "paˈis"],
    ["perro", "pˈero"],
    ["pero", "peɾo"],
    ["rosa", "rˈosa"],
    ["que", "ke"],
    ["y", "i"],
  ])("%s → %s", (word, phonemes) => expect(spanishWord(word)).toBe(phonemes));
});

describe("spanishNumber", () => {
  it.each([
    [0, "cero"],
    [21, "veintiuno"],
    [45, "cuarenta y cinco"],
    [100, "cien"],
    [115, "ciento quince"],
    [1000, "mil"],
    [2026, "dos mil veintiséis"],
    [21000, "veintiún mil"],
    [1_000_000, "un millón"],
  ])("%i → %s", (n, words) => expect(spanishNumber(n)).toBe(words));
});

describe("spanishPhonemes", () => {
  it("keeps punctuation and drops the opening marks", () => {
    expect(spanishPhonemes("¡Hola, Claude! ¿Qué tal?")).toBe("ˈola, klˈaʊðe! kˈe tˈal?");
  });

  it("reads numbers as words", () => {
    expect(spanishPhonemes("Son 3 archivos.")).toBe("sˈon tɾˈes aɾʧˈiβos.");
  });
});
