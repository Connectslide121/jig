/** Small colour toolkit: parsing, mixing, compositing and WCAG contrast. Colours are sRGB. */

export interface Rgba {
  r: number; // 0–255
  g: number;
  b: number;
  a: number; // 0–1
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const NAMED: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  transparent: "#00000000",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
};

/** Parses `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()/rgba()` (comma or space syntax) and a few names. */
export function parseColor(input: string | undefined | null): Rgba | undefined {
  if (!input) return undefined;
  const value = input.trim().toLowerCase();
  const named = NAMED[value];
  if (named) return parseColor(named);
  const hex = /^#([0-9a-f]{3,8})$/.exec(value)?.[1];
  if (hex) {
    if (hex.length === 3 || hex.length === 4) {
      const [r, g, b, a = "f"] = hex.split("");
      return {
        r: Number.parseInt(r! + r!, 16),
        g: Number.parseInt(g! + g!, 16),
        b: Number.parseInt(b! + b!, 16),
        a: Number.parseInt(a + a, 16) / 255,
      };
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: Number.parseInt(hex.slice(0, 2), 16),
        g: Number.parseInt(hex.slice(2, 4), 16),
        b: Number.parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }
    return undefined;
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(value);
  if (fn) {
    const alpha =
      fn[4] === undefined ? 1 : fn[4].endsWith("%") ? Number.parseFloat(fn[4]) / 100 : Number(fn[4]);
    return { r: Number(fn[1]), g: Number(fn[2]), b: Number(fn[3]), a: clamp(alpha, 0, 1) };
  }
  return undefined;
}

const hex2 = (n: number) =>
  Math.round(clamp(n, 0, 255))
    .toString(16)
    .padStart(2, "0");

/** `#rrggbb`, or `#rrggbbaa` when not fully opaque. */
export function toHex(color: Rgba): string {
  const base = `#${hex2(color.r)}${hex2(color.g)}${hex2(color.b)}`;
  return color.a >= 0.999 ? base : `${base}${hex2(color.a * 255)}`;
}

/** Linear interpolation from `a` (t=0) to `b` (t=1), including alpha. */
export function mix(a: Rgba, b: Rgba, t: number): Rgba {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
    a: a.a + (b.a - a.a) * t,
  };
}

/** Paints a (possibly translucent) colour over an opaque base, returning an opaque colour. */
export function composite(top: Rgba, base: Rgba): Rgba {
  const a = top.a;
  return {
    r: top.r * a + base.r * (1 - a),
    g: top.g * a + base.g * (1 - a),
    b: top.b * a + base.b * (1 - a),
    a: 1,
  };
}

export const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };
export const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };

/** WCAG relative luminance (alpha ignored). */
export function luminance(color: Rgba): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

/** WCAG contrast ratio between two opaque colours, 1–21. */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export function isDark(color: Rgba): boolean {
  return luminance(color) < 0.25;
}

/** Black or white, whichever reads better on `background`. */
export function readableOn(background: Rgba): Rgba {
  return contrastRatio(WHITE, background) >= contrastRatio(BLACK, background) ? WHITE : BLACK;
}

/**
 * Moves `fg` towards white or black (whichever is further from `bg`) until it reaches `minRatio`
 * against `bg`. Keeps the hue roughly; returns `fg` unchanged when it already passes. Aims 1% above
 * `minRatio` so rounding to 8-bit hex afterwards can't drop it below.
 */
export function ensureContrast(fg: Rgba, bg: Rgba, minRatio: number): Rgba {
  const solid = composite(fg, bg);
  if (contrastRatio(solid, bg) >= minRatio) return solid;
  const target = readableOn(bg);
  const goal = Math.min(minRatio * 1.01, contrastRatio(target, bg));
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    const t = (lo + hi) / 2;
    if (contrastRatio(mix(solid, target, t), bg) >= goal) hi = t;
    else lo = t;
  }
  return mix(solid, target, hi);
}

/** Lightens (amount > 0) or darkens (amount < 0) by mixing with white/black. */
export function shade(color: Rgba, amount: number): Rgba {
  return amount >= 0
    ? mix(color, { ...WHITE, a: color.a }, amount)
    : mix(color, { ...BLACK, a: color.a }, -amount);
}
