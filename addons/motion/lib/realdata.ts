/**
 * The real-data scan on captures (M2, D-457): before a recording is kept, its page text is checked
 * for things that look real (e-mail addresses outside invented domains, phone numbers, and names you
 * listed in the product's `.jig/factory/kit/real-names.txt`). It warns; you decide. Pure.
 */

export interface Finding {
  kind: "email" | "phone" | "name";
  text: string;
}

/** Domains for made-up people and companies (RFC 2606 and the usual sample names). */
export const INVENTED_DOMAINS = [
  "example.com",
  "example.org",
  "example.net",
  "example.test",
  "test",
  "invalid",
  "localhost",
  "contoso.com",
  "fabrikam.com",
  "northwindtraders.com",
  "adventure-works.com",
  "wingtiptoys.com",
  "tailspintoys.com",
  "acme.test",
];

function invented(domain: string): boolean {
  const d = domain.toLowerCase();
  return (
    INVENTED_DOMAINS.some((x) => d === x || d.endsWith(`.${x}`)) ||
    /\.(test|example|invalid|localhost)$/.test(d)
  );
}

/** Names from `real-names.txt`: one per line, `#` starts a comment. */
export function parseNames(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*/, "").trim())
    .filter((l) => l.length >= 3)
    .slice(0, 500);
}

const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;
// Seven or more digits with the usual separators, optionally +country; not dates, times or versions.
const PHONE = /(?<![\w.:/-])\+?\d[\d ().-]{6,}\d(?![\w.:/-])/g;

/** What looks real in the texts, each once. */
export function scan(texts: string[], names: string[] = []): Finding[] {
  const out = new Map<string, Finding>();
  const add = (f: Finding) =>
    out.has(`${f.kind}:${f.text.toLowerCase()}`) || out.set(`${f.kind}:${f.text.toLowerCase()}`, f);
  const lowerNames = names.map((n) => [n, n.toLowerCase()] as const);
  for (const text of texts) {
    for (const m of text.matchAll(EMAIL)) if (!invented(m[1] ?? "")) add({ kind: "email", text: m[0] });
    for (const m of text.matchAll(PHONE)) {
      const digits = m[0].replace(/\D/g, "");
      if (digits.length < 7 || digits.length > 15) continue;
      if (/^\d{4}[-.]\d{2}[-.]\d{2}$/.test(m[0].trim())) continue;
      if (/^(\d)\1+$/.test(digits) || /^0123456|^1234567/.test(digits)) continue;
      add({ kind: "phone", text: m[0].trim() });
    }
    const lower = text.toLowerCase();
    for (const [name, l] of lowerNames) {
      const i = lower.indexOf(l);
      if (i < 0) continue;
      const before = lower[i - 1] ?? " ";
      const after = lower[i + l.length] ?? " ";
      if (!/\w/.test(before) && !/\w/.test(after)) add({ kind: "name", text: name });
    }
  }
  return [...out.values()].slice(0, 50);
}
