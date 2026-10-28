/**
 * What the activity log may keep of a text (pure, tested). Secrets are masked everywhere; in chat
 * messages, large pasted blocks (API responses, JSON, stack traces, logs…) are replaced by their kind
 * and size, so the log keeps "pasted an HTTP response" and never the response itself.
 */

export const MASK = "«secret»";

const SECRET_NAMES =
  "api[_-]?key|apikey|secret|client[_-]?secret|token|access[_-]?token|refresh[_-]?token|id[_-]?token|auth[_-]?token|password|passwd|pwd|passphrase|private[_-]?key|account[_-]?key|shared[_-]?access[_-]?key|sas|sig|signature|session[_-]?id|cookie";

const RULES: Array<[RegExp, (substring: string, ...groups: string[]) => string]> = [
  // Private key blocks.
  [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
    () => `${MASK} (private key)`,
  ],
  // Authorization / cookie headers: keep the header name.
  [
    /\b((?:proxy-)?authorization|cookie|set-cookie|x-api-key|api-key|ocp-apim-subscription-key)(\s*[:=]\s*)("?)[^\n"]+/gi,
    (_m, name, sep, quote) => `${name}${sep}${quote}${MASK}`,
  ],
  // Bearer / Basic credentials anywhere.
  [/\b(Bearer|Basic|Token)\s+[A-Za-z0-9\-._~+/]{8,}=*/g, (_m, scheme) => `${scheme} ${MASK}`],
  // JSON web tokens.
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, () => MASK],
  // Well-known key formats.
  [
    /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|glpat-[A-Za-z0-9_-]{20,})\b/g,
    () => MASK,
  ],
  // Credentials in URLs: https://user:password@host
  [/\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]+@/gi, (_m, start) => `${start}${MASK}@`],
  // name=value / name: value / "name": "value" / --name value, for secret-looking names.
  [
    new RegExp(`(["']?\\b(?:${SECRET_NAMES})\\b["']?\\s*[:=]\\s*)(["']?)[^\\s"',;&}]+`, "gi"),
    (_m, start, quote) => `${start}${quote}${MASK}`,
  ],
  [
    new RegExp(`(--(?:${SECRET_NAMES})(?:\\s+|=))("?)[^\\s"]+`, "gi"),
    (_m, start, quote) => `${start}${quote}${MASK}`,
  ],
];

/** Masks secret-looking values (tokens, keys, passwords, cookies, credentials in URLs). */
export function maskSecrets(text: string): string {
  let out = text;
  for (const [pattern, replace] of RULES) out = out.replace(pattern, replace as never);
  return out;
}

export type PasteKind = "http" | "json" | "stack trace" | "log" | "xml/html" | "sql" | "data" | "code";

const HTTP_LINE =
  /^(?:HTTP\/[\d.]+ \d{3}|(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) \S+ HTTP\/|[A-Za-z][\w-]*: .+$)/;
const STACK_LINE =
  /^\s*(?:at [\w$.<>[\]]+ ?\(|at .+:\d+(?::\d+)?\)?$|File ".+", line \d+|Traceback \(most recent call last\)|\w+(?:\.\w+)*(?:Exception|Error)\b|--- End of)/;
const LOG_LINE =
  /^\s*\[?\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}|^\s*\[?(?:TRACE|DEBUG|INFO|WARN(?:ING)?|ERROR|FATAL|fail|info|warn)\]?[:\s]/;

/** What kind of pasted content a block of lines is. */
export function classifyPaste(lines: string[]): PasteKind {
  const text = lines.join("\n").trim();
  const count = (re: RegExp) => lines.filter((l) => re.test(l)).length;
  const share = (re: RegExp) => count(re) / Math.max(1, lines.length);
  if (
    /^HTTP\/[\d.]+ \d{3}/m.test(text) ||
    /^(?:GET|POST|PUT|PATCH|DELETE) \S+ HTTP\//m.test(text) ||
    share(HTTP_LINE) >= 0.6
  )
    return "http";
  if (count(STACK_LINE) >= 2) return "stack trace";
  if (/^[[{]/.test(text)) {
    try {
      JSON.parse(text);
      return "json";
    } catch {
      if (share(/^\s*["{}[\],]|^\s*"[^"]+"\s*:/) >= 0.5) return "json";
    }
  }
  if (share(LOG_LINE) >= 0.5) return "log";
  if (/^\s*</.test(text) && share(/^\s*<\/?[A-Za-z!?]/) >= 0.4) return "xml/html";
  if (/^\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH|CREATE)\b/i.test(text) || share(/^\s*\|.*\|\s*$/) >= 0.6)
    return "sql";
  // A long blob with almost no spaces: base64, a token dump, minified code.
  if (lines.length <= 2 && lines.some((l) => l.length > 200 && (l.match(/\s/g)?.length ?? 0) < l.length / 50))
    return "data";
  return "code";
}

/** Looks like pasted material rather than something typed as a sentence. */
function looksPasted(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (t.length > 300 && !/\s\w+\s\w+\s/.test(t.slice(0, 300))) return true; // a long blob (base64, minified)
  return (
    /^[{}[\]"<]/.test(t) ||
    /^\s{2,}\S/.test(line) ||
    /^\t/.test(line) ||
    HTTP_LINE.test(t) ||
    STACK_LINE.test(line) ||
    LOG_LINE.test(line) ||
    /[;{}]\s*$/.test(t) ||
    /^(?:[\w.]+\(|\w+ = |const |let |var |def |class |import |from |public |private |return )/.test(t)
  );
}

/** Blocks of at least this many lines, or this many characters, count as a paste. */
const MIN_LINES = 6;
const MIN_CHARS = 600;

export interface Collapsed {
  text: string;
  /** Pasted blocks found, by kind, e.g. { json: 1, "stack trace": 1 }. */
  pasted: Partial<Record<PasteKind, number>>;
}

/**
 * Replaces pasted blocks in a chat message with `[pasted <kind>, N lines]`: fenced code blocks of 6+
 * lines, and runs of 6+ pasted-looking lines (or 600+ characters, or one long blob). What you typed
 * around them stays.
 */
export function collapsePastes(message: string): Collapsed {
  const pasted: Collapsed["pasted"] = {};
  const lines = message.split("\n");
  const out: string[] = [];
  const summarize = (block: string[]) => {
    const kind = classifyPaste(block);
    pasted[kind] = (pasted[kind] ?? 0) + 1;
    out.push(`[pasted ${kind}, ${block.length} line${block.length === 1 ? "" : "s"}]`);
  };
  const big = (block: string[]) => block.length >= MIN_LINES || block.join("\n").length >= MIN_CHARS;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    // A fenced block.
    if (/^\s*(```|~~~)/.test(line)) {
      const fence = /^\s*(```|~~~)/.exec(line)![1]!;
      let j = i + 1;
      while (j < lines.length && !lines[j]!.trim().startsWith(fence)) j++;
      const body = lines.slice(i + 1, j);
      if (big(body)) summarize(body);
      else out.push(...lines.slice(i, Math.min(j + 1, lines.length)));
      i = j + 1;
      continue;
    }
    // A run of pasted-looking lines (blank lines inside the run are allowed).
    if (looksPasted(line)) {
      let j = i;
      let last = i;
      while (
        j < lines.length &&
        (looksPasted(lines[j]!) || (!lines[j]!.trim() && j + 1 < lines.length && looksPasted(lines[j + 1]!)))
      ) {
        if (lines[j]!.trim()) last = j;
        j++;
      }
      const block = lines.slice(i, last + 1);
      if (big(block)) summarize(block);
      else out.push(...block);
      i = last + 1;
      continue;
    }
    out.push(line);
    i++;
  }
  return { text: out.join("\n"), pasted };
}

/** A chat message as the activity log keeps it: pastes collapsed, secrets masked. */
export function sanitizePrompt(message: string): Collapsed {
  const collapsed = collapsePastes(message);
  return { text: maskSecrets(collapsed.text), pasted: collapsed.pasted };
}
