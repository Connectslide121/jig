/** "just now", "5 min ago", "3 h ago", "2 d ago". */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = (now - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

/** A chat event's time for its column: "11:03". */
export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

/** A short day for the time column when the day changes: "Tue 3 Nov". */
export function shortDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** Whether two times fall on the same calendar day (here). */
export function sameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

/**
 * An event's time in full for its tooltip: "11:03:42", with the day when it isn't today, and how long
 * after the event before ("· 2 min after the previous step").
 */
export function eventTime(iso: string, previous?: string, now = Date.now()): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const day = sameDay(iso, new Date(now).toISOString()) ? "" : `${shortDay(iso)}, `;
  if (!previous) return `${day}${time}`;
  const gap = Math.max(0, at.getTime() - new Date(previous).getTime()) / 1000;
  const after =
    gap < 1
      ? "right after the previous step"
      : gap < 60
        ? `${Math.round(gap)} s after the previous step`
        : gap < 3600
          ? `${Math.round(gap / 60)} min after the previous step`
          : `${Math.floor(gap / 3600)} h ${Math.round((gap % 3600) / 60)} min after the previous step`;
  return `${day}${time} · ${after}`;
}
