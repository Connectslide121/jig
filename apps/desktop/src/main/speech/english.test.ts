import { describe, expect, it } from "vitest";
import { englishPhonemes, normalizeEnglish, splitPunctuation } from "./english";

describe("normalizeEnglish", () => {
  it("spells out years, times, money and decimals", () => {
    expect(normalizeEnglish("In 1990 at 10:30 it cost $5.50, or 3.14 of it.")).toBe(
      "In 19 90 at 10 30 it cost 5 dollars and 50 cents, or 3 point 1 4 of it.",
    );
    expect(normalizeEnglish("Meet at 9:00.")).toBe("Meet at 9 o'clock.");
  });

  it("expands titles and evens out quotes", () => {
    expect(normalizeEnglish("Dr. Smith said “hi” to Mr. Jones (twice).")).toBe(
      'Doctor Smith said "hi" to Mister Jones «twice».',
    );
  });
});

describe("splitPunctuation", () => {
  it("keeps punctuation runs between words", () => {
    expect(splitPunctuation("Hi, there! Ok")).toEqual([
      { punctuation: false, text: "Hi" },
      { punctuation: true, text: ", " },
      { punctuation: false, text: "there" },
      { punctuation: true, text: "! " },
      { punctuation: false, text: "Ok" },
    ]);
  });
});

describe("englishPhonemes", () => {
  it("phonemizes the words, keeps punctuation and maps espeak's symbols to Kokoro's", async () => {
    const phonemize = async (text: string, language: string) => [`${language}:${text.toLowerCase()}r`];
    expect(await englishPhonemes("Hi, there.", false, phonemize)).toBe("en-us:hiɹ, en-us:theɹeɹ.");
    expect(await englishPhonemes("Hi", true, phonemize)).toBe("en:hiɹ");
  });
});
