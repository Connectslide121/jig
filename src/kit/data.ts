// Sample data for demos: seeded (the same every load), believable, with dates relative to today.
// Names and companies are invented from parts; e-mail domains end in .example.

/** A seeded random source (mulberry32): the same seed gives the same data on every load. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min;
  const pick = <T>(list: readonly T[]): T => {
    if (!list.length) throw new Error("pick from an empty list");
    return list[Math.floor(next() * list.length)] as T;
  };
  const weighted = <T>(entries: readonly (readonly [T, number])[]): T => {
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let r = next() * total;
    for (const [v, w] of entries) {
      r -= w;
      if (r < 0) return v;
    }
    return (entries[entries.length - 1] as readonly [T, number])[0];
  };
  const shuffle = <T>(list: readonly T[]): T[] => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  };
  return { next, int, pick, weighted, shuffle, chance: (p: number) => next() < p };
}
export type Random = ReturnType<typeof seeded>;

const FIRST = [
  "Amira", "Jonas", "Lea", "Mateo", "Noor", "Elias", "Freya", "Omar", "Sofia", "Lukas", "Aiko", "Daniel",
  "Ines", "Kofi", "Maja", "Ravi", "Selma", "Tomás", "Wen", "Yusuf", "Clara", "Hugo", "Leila", "Nils",
  "Priya", "Oskar", "Zara", "Malik", "Ebba", "Felix", "Hanna", "Idris", "Julia", "Kenji", "Linnea", "Marco",
] as const;
const LAST = [
  "Lindqvist", "Okafor", "Moreau", "Haddad", "Nakamura", "Castillo", "Bergström", "Novak", "Andersen",
  "Rahman", "Fischer", "Costa", "Ivanova", "Mensah", "Larsen", "Kowalski", "Duarte", "Sato", "Holm",
  "Petrović", "Ekström", "Bianchi", "Varga", "Nyström", "Adeyemi", "Kaur", "Lehtonen", "Silva",
] as const;
const COMPANY_A = ["North", "Bright", "Clear", "Stone", "River", "Oak", "Harbor", "Summit", "Field", "Pine", "Copper", "Lumen"] as const;
const COMPANY_B = ["line", "works", "point", "gate", "field", "wave", "path", "craft", "bridge", "loop", "yard", "stack"] as const;
const COMPANY_C = ["AB", "Group", "Partners", "Labs", "& Co", "Services", "Logistics", "Health", "Studio", ""] as const;

export interface Person {
  id: string;
  name: string;
  first: string;
  last: string;
  initials: string;
  email: string;
}

export function person(r: Random, domain = "fabrikam.example"): Person {
  const first = r.pick(FIRST);
  const last = r.pick(LAST);
  const slug = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z]/g, "");
  return {
    id: `${slug(first)}-${slug(last)}-${r.int(100, 999)}`,
    name: `${first} ${last}`,
    first,
    last,
    initials: `${first[0]}${last[0]}`,
    email: `${slug(first)}.${slug(last)}@${domain}`,
  };
}

/** Distinct people (no repeated names). */
export function people(r: Random, count: number, domain?: string): Person[] {
  const seen = new Set<string>();
  const out: Person[] = [];
  for (let tries = 0; out.length < count && tries < count * 50; tries++) {
    const p = person(r, domain);
    if (seen.has(p.name)) continue;
    seen.add(p.name);
    out.push(p);
  }
  return out;
}

export function company(r: Random): string {
  const name = `${r.pick(COMPANY_A)}${r.pick(COMPANY_B)}`;
  const suffix = r.pick(COMPANY_C);
  return suffix ? `${name} ${suffix}` : name;
}

/** Today at 00:00, local time. Every demo date is relative to it. */
export function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** A date `days` from today (negative: in the past), at hh:mm. */
export function daysFromNow(days: number, hour = 9, minute = 0): Date {
  const d = today();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/**
 * The demo's clock: today at the scenario's time. Statuses, "now" lines and greetings use it, so a
 * demo about 07:30 shows 07:30 whenever it is opened.
 */
export function scenarioTime(hour: number, minute = 0): Date {
  return daysFromNow(0, hour, minute);
}

/** The Monday of this week. */
export function startOfWeek(date = today()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

const locale = () => (typeof navigator !== "undefined" ? navigator.language : "en-GB");

export const fmt = {
  date: (d: Date) => d.toLocaleDateString(locale(), { day: "numeric", month: "short" }),
  weekday: (d: Date) => d.toLocaleDateString(locale(), { weekday: "short", day: "numeric" }),
  time: (d: Date) => d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }),
  /** 24-hour "07:30": for schedules and timelines, where width matters. */
  clock: (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
  number: (n: number, digits = 0) => n.toLocaleString(locale(), { maximumFractionDigits: digits, minimumFractionDigits: digits }),
  money: (n: number, currency = "EUR") =>
    n.toLocaleString(locale(), { style: "currency", currency, maximumFractionDigits: n >= 1000 ? 0 : 2 }),
  percent: (n: number, digits = 0) => `${(n * 100).toFixed(digits)} %`,
  /** "in 2 h", "3 days ago", "today". */
  relative: (d: Date, now = new Date()) => {
    const mins = Math.round((d.getTime() - now.getTime()) / 60000);
    const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: "auto", style: "short" });
    if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
    const hours = Math.round(mins / 60);
    if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
    return rtf.format(Math.round(hours / 24), "day");
  },
};
