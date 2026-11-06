// The quality gate's judgments, kept pure so they are unit-tested: what counts as real data, a
// layout shift, a misaligned list, and how the results become check.json.

export interface CheckResult {
  id: string;
  pass: boolean;
  detail: string;
}

export interface CheckReport {
  pass: boolean;
  checks: CheckResult[];
  screenshots: string[];
}

export const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1280", width: 1280, height: 800 },
  { name: "834", width: 834, height: 1112 },
  { name: "390", width: 390, height: 844 },
] as const;

/** The most a demo may weigh (index.html plus everything beside it). */
export const MAX_BYTES = 2 * 1024 * 1024;

/** Cumulative layout shift above this fails (Jig's rule is "no layout shift"; this allows rounding). */
export const MAX_CLS = 0.01;

const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;
// Two or more groups of digits split by spaces, dots or dashes, optionally +country or (area):
// 070-123 45 67, +46 70 123 45 67, (555) 123-4567. Dates and times don't match (too few digits, or a time follows).
const PHONE = /(?<![\d:])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{1,4}\)[\s.-]?)?\d{2,4}(?:[\s.-]\d{2,4}){1,4}(?![:\d])/g;

/** Domains that can never be real (RFC 2606), always allowed. */
const RESERVED = [".example", ".test", ".invalid", ".localhost"];

export function domainAllowed(domain: string, allow: readonly string[] = []): boolean {
  const d = domain.toLowerCase();
  if (RESERVED.some((r) => d.endsWith(r)) || d === "example.com" || d === "example.org" || d === "example.net") return true;
  return allow.some((a) => d === a.toLowerCase() || d.endsWith(`.${a.toLowerCase()}`));
}

export interface RealDataHit {
  kind: "email" | "phone" | "name";
  value: string;
}

/** Real-looking contact data and names from the real-customer list, found in a screen's text. */
export function scanRealData(text: string, opts: { allowDomains?: readonly string[]; realNames?: readonly string[] } = {}): RealDataHit[] {
  const hits: RealDataHit[] = [];
  for (const m of text.matchAll(EMAIL)) {
    if (!domainAllowed(m[1] ?? "", opts.allowDomains)) hits.push({ kind: "email", value: m[0] });
  }
  for (const m of text.matchAll(PHONE)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 9 && digits.length <= 15) hits.push({ kind: "phone", value: m[0].trim() });
  }
  for (const name of opts.realNames ?? []) {
    const n = name.trim();
    if (!n || n.startsWith("#")) continue;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`, "iu");
    if (re.test(text)) hits.push({ kind: "name", value: n });
  }
  return dedupe(hits);
}

function dedupe(hits: RealDataHit[]): RealDataHit[] {
  const seen = new Set<string>();
  return hits.filter((h) => {
    const k = `${h.kind}:${h.value}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Lines of a real-names file: one name per line, `#` comments and blank lines ignored. */
export const parseNames = (file: string) =>
  file
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

/** Absolute or remote references in the built HTML: they break opening it from disk. */
export function nonLocalRefs(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<(?:script|link|img|source|iframe)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const url = m[1] ?? "";
    if (url.startsWith("data:") || url.startsWith("#")) continue;
    if (/^(?:[a-z]+:)?\/\//i.test(url) || url.startsWith("/")) out.push(url);
  }
  return out;
}

/** A list's rows as measured in the page: each row's column boxes (left and right x), in order. */
export type MeasuredList = { where: string; rows: { left: number; right: number }[][] };

/**
 * Lists whose rows don't line up: rows with the same columns whose column starts or row ends differ
 * by more than `tolerance` px (a status pushed sideways by a long name, a badge that isn't at the
 * right edge in every row).
 */
export function misaligned(lists: MeasuredList[], tolerance = 2): string[] {
  const bad: string[] = [];
  for (const list of lists) {
    const rows = list.rows.filter((r) => r.length > 1);
    if (rows.length < 3) continue;
    const count = rows[0]?.length ?? 0;
    if (!rows.every((r) => r.length === count)) continue;
    let reason = "";
    for (let c = 0; c < count && !reason; c++) {
      const lefts = rows.map((r) => r[c]?.left ?? 0);
      if (Math.max(...lefts) - Math.min(...lefts) > tolerance) reason = `column ${c + 1} starts at different x`;
    }
    const ends = rows.map((r) => r[count - 1]?.right ?? 0);
    if (!reason && Math.max(...ends) - Math.min(...ends) > tolerance) reason = "the last column doesn't end at the same x";
    if (reason) bad.push(`${list.where}: ${reason}`);
  }
  return bad;
}

export function report(checks: CheckResult[], screenshots: string[]): CheckReport {
  return { pass: checks.every((c) => c.pass), checks, screenshots };
}

/** A check from a list of problems: passes when empty, the detail lists the first few. */
export function fromProblems(id: string, problems: string[], ok: string): CheckResult {
  if (!problems.length) return { id, pass: true, detail: ok };
  const shown = problems.slice(0, 8).join("; ");
  return { id, pass: false, detail: problems.length > 8 ? `${shown}; and ${problems.length - 8} more` : shown };
}
