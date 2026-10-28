/**
 * The weekly pattern run (default Monday 10:00, local time). A run that was missed (Jig wasn't
 * running) happens at the next launch.
 */
export interface WeeklySchedule {
  enabled: boolean;
  day: number; // 0 = Sunday … 6 = Saturday
  hour: number;
  minute: number;
}

/** The most recent scheduled moment at or before `now`. */
export function lastOccurrence(now: Date, s: WeeklySchedule): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), s.hour, s.minute, 0, 0);
  const back = (now.getDay() - s.day + 7) % 7;
  d.setDate(d.getDate() - back);
  if (d.getTime() > now.getTime()) d.setDate(d.getDate() - 7);
  return d;
}

export function nextOccurrence(now: Date, s: WeeklySchedule): Date {
  const last = lastOccurrence(now, s);
  const next = new Date(last);
  next.setDate(next.getDate() + 7);
  return next;
}

/** Whether a scheduled run was missed since `lastRun` (ISO), e.g. at launch. */
export function isRunDue(now: Date, s: WeeklySchedule, lastRun: string | undefined): boolean {
  if (!s.enabled) return false;
  const last = lastOccurrence(now, s);
  return !lastRun || new Date(lastRun).getTime() < last.getTime();
}
