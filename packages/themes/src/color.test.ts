import { describe, expect, it } from "vitest";
import {
  BLACK,
  composite,
  contrastRatio,
  ensureContrast,
  isDark,
  luminance,
  mix,
  parseColor,
  readableOn,
  shade,
  toHex,
  WHITE,
} from "./color";

const c = (s: string) => parseColor(s)!;

describe("parseColor", () => {
  it("parses hex in every length", () => {
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("#0f08")).toEqual({ r: 0, g: 255, b: 0, a: 0x88 / 255 });
    expect(parseColor("#123456")).toEqual({ r: 0x12, g: 0x34, b: 0x56, a: 1 });
    expect(parseColor("#12345680")?.a).toBeCloseTo(128 / 255);
    expect(parseColor("  #ABCDEF  ")).toEqual({ r: 0xab, g: 0xcd, b: 0xef, a: 1 });
  });

  it("parses rgb()/rgba() in comma and space syntax", () => {
    expect(parseColor("rgb(1, 2, 3)")).toEqual({ r: 1, g: 2, b: 3, a: 1 });
    expect(parseColor("rgba(1,2,3,0.5)")).toEqual({ r: 1, g: 2, b: 3, a: 0.5 });
    expect(parseColor("rgb(1 2 3 / 50%)")).toEqual({ r: 1, g: 2, b: 3, a: 0.5 });
  });

  it("parses a few names and rejects junk", () => {
    expect(parseColor("white")).toEqual(WHITE);
    expect(parseColor("transparent")?.a).toBe(0);
    for (const bad of ["", "#12", "#12345", "#gggggg", "hsl(1,2%,3%)", "nope", undefined, null]) {
      expect(parseColor(bad as string)).toBeUndefined();
    }
  });
});

describe("toHex", () => {
  it("writes 6 digits when opaque and 8 when translucent", () => {
    expect(toHex(c("#abcdef"))).toBe("#abcdef");
    expect(toHex({ r: 0, g: 0, b: 0, a: 0.5 })).toBe("#00000080");
    expect(toHex({ r: 300, g: -5, b: 127.6, a: 1 })).toBe("#ff0080");
  });
});

describe("mixing and compositing", () => {
  it("mixes linearly", () => {
    expect(toHex(mix(BLACK, WHITE, 0.5))).toBe("#808080");
    expect(mix(BLACK, WHITE, 0)).toEqual(BLACK);
    expect(mix(BLACK, WHITE, 1)).toEqual(WHITE);
  });

  it("composites a translucent colour over an opaque base", () => {
    expect(toHex(composite({ ...WHITE, a: 0.5 }, BLACK))).toBe("#808080");
    expect(composite(c("#123456"), WHITE)).toEqual(c("#123456"));
    expect(composite({ ...WHITE, a: 0 }, c("#123456"))).toEqual(c("#123456"));
  });

  it("shades towards white or black", () => {
    expect(toHex(shade(c("#808080"), 1))).toBe("#ffffff");
    expect(toHex(shade(c("#808080"), -1))).toBe("#000000");
    expect(shade(c("#80808080"), 0.5).a).toBeCloseTo(128 / 255);
  });
});

describe("contrast", () => {
  it("computes WCAG luminance and ratios", () => {
    expect(luminance(BLACK)).toBe(0);
    expect(luminance(WHITE)).toBeCloseTo(1);
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21);
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21);
    expect(contrastRatio(c("#777777"), WHITE)).toBeCloseTo(4.48, 1);
  });

  it("classifies dark colours and picks readable text", () => {
    expect(isDark(c("#1e1f22"))).toBe(true);
    expect(isDark(c("#fbfaf8"))).toBe(false);
    expect(readableOn(c("#1e1f22"))).toEqual(WHITE);
    expect(readableOn(c("#ffff00"))).toEqual(BLACK);
  });

  it("ensureContrast leaves passing colours alone and fixes failing ones", () => {
    const bg = c("#1e1f22");
    expect(ensureContrast(c("#ffffff"), bg, 4.5)).toEqual(WHITE);
    const fixed = ensureContrast(c("#2a2b2e"), bg, 4.5);
    expect(contrastRatio(fixed, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(fixed, bg)).toBeLessThan(6); // moved only as far as needed
    const light = ensureContrast(c("#eeeeee"), WHITE, 3);
    expect(contrastRatio(light, WHITE)).toBeGreaterThanOrEqual(3);
  });

  it("ensureContrast composites translucent foregrounds first", () => {
    const out = ensureContrast({ ...WHITE, a: 0.1 }, BLACK, 7);
    expect(out.a).toBe(1);
    expect(contrastRatio(out, BLACK)).toBeGreaterThanOrEqual(7);
  });
});
