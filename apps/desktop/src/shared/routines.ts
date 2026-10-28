/**
 * Claude Code routines (scheduled cloud runs, Claude Code's `RemoteTrigger` tool) as Jig shows them.
 * The parsers are tolerant: the tool returns the routines service's JSON, whose shape may grow.
 */
export interface Routine {
  id: string;
  name: string;
  /** Cron expression (5 fields, optionally `CRON_TZ=<zone> ` first). */
  schedule?: string;
  /** A one-time routine's time. */
  runOnceAt?: string;
  enabled: boolean;
  nextRunAt?: string;
  prompt?: string;
  createdAt?: string;
  lastRun?: { status: string; at?: string; sessionId?: string };
}

export interface RoutineRun {
  sessionId: string;
  status: string;
  firedAt?: string;
  finishedAt?: string;
}

export interface RoutineLogEntry {
  role: string;
  text: string;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | undefined =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : undefined;
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

/** Text from a string or from content blocks (`[{ type: "text", text }]`). */
function textOf(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v))
    return (
      v
        .map((b) => (typeof b === "string" ? b : (str(obj(b)?.text) ?? "")))
        .filter(Boolean)
        .join("\n") || undefined
    );
  return undefined;
}

/** The array a list response holds (`data`, `triggers`, `runs`, `items`, or the body itself). */
function listOf(
  body: unknown,
  keys = ["data", "triggers", "routines", "runs", "items", "events", "messages"],
): unknown[] {
  if (Array.isArray(body)) return body;
  const o = obj(body);
  for (const key of keys) if (Array.isArray(o?.[key])) return o[key] as unknown[];
  return [];
}

function promptOf(t: Json): string | undefined {
  const direct = textOf(t.prompt);
  if (direct) return direct;
  const events = obj(obj(t.job_config)?.ccr)?.events;
  if (Array.isArray(events)) return textOf(obj(obj(obj(events[0])?.data)?.message)?.content);
  return undefined;
}

export function parseRoutine(value: unknown): Routine | undefined {
  const t = obj(value);
  const id = str(t?.id) ?? str(t?.trigger_id);
  if (!t || !id) return undefined;
  const last = obj(t.last_run);
  return {
    id,
    name: str(t.name) ?? id,
    schedule: str(t.cron_expression) ?? str(t.schedule),
    runOnceAt: str(t.run_once_at),
    enabled: t.enabled !== false,
    nextRunAt: str(t.next_run_at),
    prompt: promptOf(t),
    createdAt: str(t.created_at),
    ...(last
      ? {
          lastRun: {
            status: str(last.status) ?? "unknown",
            at: str(last.fired_at) ?? str(last.finished_at),
            sessionId: str(last.session_id),
          },
        }
      : {}),
  };
}

export const parseRoutines = (body: unknown): Routine[] =>
  listOf(body).flatMap((t) => {
    const r = parseRoutine(t);
    return r ? [r] : [];
  });

export const parseRuns = (body: unknown): RoutineRun[] =>
  listOf(body).flatMap((value) => {
    const r = obj(value);
    const sessionId = str(r?.session_id) ?? str(r?.id);
    if (!r || !sessionId) return [];
    return [
      {
        sessionId,
        status: str(r.status) ?? "unknown",
        firedAt: str(r.fired_at) ?? str(r.created_at),
        finishedAt: str(r.finished_at),
      },
    ];
  });

/** A run's transcript as role + text lines; anything else is shown as JSON. */
export function parseRunLog(body: unknown): RoutineLogEntry[] {
  return listOf(body).flatMap((value) => {
    const e = obj(value);
    if (!e) return [];
    const message = obj(e.message);
    const text = textOf(e.text) ?? textOf(e.content) ?? textOf(message?.content);
    const role = str(e.role) ?? str(message?.role) ?? str(e.type) ?? "event";
    return text ? [{ role, text }] : [];
  });
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const two = (n: number) => String(n).padStart(2, "0");

/** A cron schedule in words: "Weekdays at 08:37 (Europe/Stockholm)". Unknown shapes stay as they are. */
export function describeSchedule(expression: string): string {
  const tzMatch = /^CRON_TZ=(\S+)\s+(.*)$/.exec(expression.trim());
  const zone = tzMatch ? tzMatch[1]! : "UTC";
  const fields = (tzMatch ? tzMatch[2]! : expression).trim().split(/\s+/);
  if (fields.length !== 5) return expression;
  const [m, h, dom, mon, dow] = fields as [string, string, string, string, string];
  const num = (v: string) => (/^\d+$/.test(v) ? Number(v) : undefined);
  const minute = num(m);
  const hour = num(h);
  const time = minute !== undefined && hour !== undefined ? `${two(hour)}:${two(minute)}` : undefined;
  const suffix = ` (${zone})`;
  const step = (v: string) => /^\*\/(\d+)$/.exec(v)?.[1];
  if (step(m) && h === "*" && dom === "*" && mon === "*" && dow === "*") return `Every ${step(m)} minutes`;
  if (minute !== undefined && h === "*" && dom === "*" && mon === "*" && dow === "*")
    return `Every hour at :${two(minute)}`;
  if (minute !== undefined && step(h) && dom === "*" && mon === "*" && dow === "*")
    return `Every ${step(h)} hours at :${two(minute)}`;
  if (!time || mon !== "*") return expression;
  if (dom === "*" && dow === "*") return `Every day at ${time}${suffix}`;
  if (dom === "*" && dow === "1-5") return `Weekdays at ${time}${suffix}`;
  if (dom === "*" && /^[0-6](,[0-6])*$/.test(dow))
    return `Every ${dow
      .split(",")
      .map((d) => DAYS[Number(d)])
      .join(" and ")} at ${time}${suffix}`;
  if (num(dom) !== undefined && dow === "*") return `On day ${dom} of every month at ${time}${suffix}`;
  return expression;
}

/** The body of a RemoteTrigger answer (`{ status, json }`), or an error with the service's message. */
export function remoteTriggerBody(structured: unknown, text: string): unknown {
  const s = obj(structured);
  const raw = typeof s?.json === "string" ? s.json : text;
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    body = undefined;
  }
  const status = typeof s?.status === "number" ? s.status : 200;
  if (status >= 400 || body === undefined) {
    const o = obj(body);
    const message =
      str(o?.error) ?? str(obj(o?.error)?.message) ?? str(o?.message) ?? (raw.slice(0, 300) || "No answer");
    throw new Error(`The routines service said: ${message}${status >= 400 ? ` (${status})` : ""}`);
  }
  return body;
}
