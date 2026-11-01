/** Small formatting helpers shared by the meeting room's views. */

export const clock = (value: string | number) =>
  new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** "Today", "Tomorrow" or "Mon 3 Nov". */
export function dayLabel(value: string, now = new Date()): string {
  const d = new Date(value);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (dayKey(d) === dayKey(now)) return "Today";
  if (dayKey(d) === dayKey(tomorrow)) return "Tomorrow";
  return d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
}

/** "Mon 3 Nov · 14:00". */
export const dayAndTime = (value: string) => `${dayLabel(value)} · ${clock(value)}`;

/** "1:05:09" or "5:09". */
export function elapsed(fromIso: string, now: number): string {
  const total = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** "45 min" or "1 h 10 min". */
export function duration(fromIso: string, toIso: string): string {
  const minutes = Math.max(1, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0]![0] ?? "") + (parts.length > 1 ? (parts.at(-1)![0] ?? "") : "")).toUpperCase();
}

export const SPEECH_LANGUAGES: Array<[string, string]> = [
  ["en-us", "English (US)"],
  ["en-gb", "English (UK)"],
  ["sv-se", "Swedish"],
  ["es-es", "Spanish"],
  ["de-de", "German"],
  ["fr-fr", "French"],
  ["nl-nl", "Dutch"],
  ["it-it", "Italian"],
  ["pt-br", "Portuguese (Brazil)"],
  ["ja-jp", "Japanese"],
  ["zh-cn", "Chinese (Simplified)"],
];
