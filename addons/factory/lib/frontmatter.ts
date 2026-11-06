/**
 * An output file's front-matter (architecture.md → Files in the product repository): `status`,
 * `recipe`, `version`, `run`, `provider`, `model`, `createdAt`, and `history` once a person acts.
 * A small YAML subset, enough for what the factory writes and recipes read: scalars, inline lists
 * (`[a, b]`), block lists of scalars and block lists of flow maps (`- { status: approved, by: me }`).
 * Pure.
 */
import type { OutputHistoryEntry, OutputStatus } from "./run";

export type Scalar = string | number | boolean | null;
export type Value = Scalar | Scalar[] | Array<Record<string, Scalar>>;
export type FrontMatter = Record<string, Value>;

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function unquote(s: string): string {
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    if (s.startsWith('"')) {
      try {
        return JSON.parse(s) as string;
      } catch {
        return s.slice(1, -1);
      }
    }
    return s.slice(1, -1).replace(/''/g, "'");
  }
  return s;
}

/** Splits on commas outside quotes and brackets. */
function splitTop(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = "";
  let cur = "";
  for (const ch of s) {
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "[" || ch === "{") depth++;
    else if (ch === "]" || ch === "}") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function scalar(raw: string): Scalar {
  const s = raw.trim();
  if (s === "" || s === "null" || s === "~") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return unquote(s);
}

function flowMap(raw: string): Record<string, Scalar> {
  const inner = raw.trim().replace(/^\{/, "").replace(/\}$/, "");
  const out: Record<string, Scalar> = {};
  for (const part of splitTop(inner)) {
    const i = part.indexOf(":");
    if (i > 0) out[part.slice(0, i).trim()] = scalar(part.slice(i + 1));
  }
  return out;
}

function value(raw: string): Value {
  const s = raw.trim().replace(/\s+#.*$/, "");
  if (s.startsWith("[") && s.endsWith("]")) return splitTop(s.slice(1, -1)).map(scalar);
  return scalar(s);
}

/** The front-matter and the text after it; no front-matter gives `{}` and the whole text. */
export function parseFrontMatter(text: string): { data: FrontMatter; body: string } {
  const m = FENCE.exec(text);
  if (!m) return { data: {}, body: text };
  const data: FrontMatter = {};
  let listKey: string | undefined;
  for (const line of (m[1] ?? "").split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const item = /^\s+-\s+(.*)$/.exec(line) ?? /^-\s+(.*)$/.exec(line);
    if (item && listKey) {
      const raw = (item[1] ?? "").trim();
      const list = (Array.isArray(data[listKey]) ? data[listKey] : []) as Array<
        Scalar | Record<string, Scalar>
      >;
      list.push(raw.startsWith("{") ? flowMap(raw) : scalar(raw));
      data[listKey] = list as Value;
      continue;
    }
    const kv = /^([A-Za-z_][\w.-]*):(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1] ?? "";
    const rest = (kv[2] ?? "").trim();
    if (rest === "" || rest.startsWith("#")) {
      listKey = key;
      data[key] = [];
    } else {
      listKey = undefined;
      data[key] = value(rest);
    }
  }
  return { data, body: text.slice(m[0].length) };
}

function quoteIfNeeded(v: Scalar): string {
  if (v === null) return "null";
  if (typeof v !== "string") return String(v);
  if (v === "" || /^[\s-]|[:#,[\]{}"']|\s$|^(true|false|null|~|-?\d+(\.\d+)?)$/.test(v))
    return JSON.stringify(v);
  return v;
}

function line(key: string, v: Value): string[] {
  if (!Array.isArray(v)) return [`${key}: ${quoteIfNeeded(v)}`];
  if (v.length === 0) return [`${key}: []`];
  if (v.every((x) => typeof x !== "object" || x === null))
    return [`${key}: [${(v as Scalar[]).map(quoteIfNeeded).join(", ")}]`];
  return [
    `${key}:`,
    ...(v as Array<Record<string, Scalar>>).map(
      (m) =>
        `  - { ${Object.entries(m)
          .filter(([, x]) => x !== undefined)
          .map(([k, x]) => `${k}: ${quoteIfNeeded(x)}`)
          .join(", ")} }`,
    ),
  ];
}

/** The text with this front-matter (replacing any it had). */
export function writeFrontMatter(data: FrontMatter, body: string): string {
  const lines = Object.entries(data)
    .filter(([, v]) => v !== undefined)
    .flatMap(([k, v]) => line(k, v));
  return `---\n${lines.join("\n")}\n---\n${body.startsWith("\n") ? body.slice(1) : body}`;
}

/** Sets some keys, keeping the others and the body. Adds front-matter when the file had none. */
export function updateFrontMatter(text: string, change: FrontMatter): string {
  const { data, body } = parseFrontMatter(text);
  return writeFrontMatter({ ...data, ...change }, body.startsWith("\n") ? body : `\n${body}`);
}

/** An output's status moves on: `status` changes and the move is added to `history`. */
export function setStatus(text: string, entry: OutputHistoryEntry): string {
  const { data } = parseFrontMatter(text);
  const history = (Array.isArray(data.history) ? data.history : []).filter(
    (x): x is Record<string, Scalar> => typeof x === "object" && x !== null,
  );
  const next: Record<string, Scalar> = {
    status: entry.status,
    by: entry.by,
    at: entry.at,
    edited: entry.edited,
  };
  if (entry.note) next.note = entry.note;
  return updateFrontMatter(text, { status: entry.status, history: [...history, next] });
}

/** The status the file says, when it says a known one. */
export function statusOf(data: FrontMatter): OutputStatus | undefined {
  const s = data.status;
  return typeof s === "string" &&
    ["draft", "reviewed", "approved", "published", "rejected", "superseded"].includes(s)
    ? (s as OutputStatus)
    : undefined;
}
