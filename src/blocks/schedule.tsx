import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmt, today } from "../kit/data";
import type { Tone } from "./status";

export interface ScheduleResource {
  id: string;
  name: string;
  detail?: string;
  initials?: string;
}

export interface ScheduleEvent {
  id: string;
  resource: string;
  start: Date;
  end: Date;
  title: string;
  detail?: string;
  tone?: Tone;
}

const EVENT_TONE: Record<Tone, string> = {
  neutral: "border-l-muted-foreground/50 bg-muted",
  primary: "border-l-primary bg-primary/10",
  success: "border-l-success bg-success/10",
  warning: "border-l-warning bg-warning/15",
  danger: "border-l-destructive bg-destructive/10",
  info: "border-l-info bg-info/10",
};

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/**
 * A day's schedule: people (or rooms, vehicles) down the side, hours across, events as blocks. The
 * timeline scrolls sideways inside the card on narrow screens; the names stay put.
 */
export function Schedule({
  resources,
  events,
  hours = [7, 18],
  initialDay = today(),
  now: fixedNow,
  onEventClick,
  demo,
}: {
  resources: ScheduleResource[];
  events: ScheduleEvent[];
  hours?: [number, number];
  initialDay?: Date;
  /** The demo's clock (its scenario's moment), else the real time. */
  now?: Date;
  onEventClick?: (e: ScheduleEvent) => void;
  demo?: string;
}) {
  const [day, setDay] = useState(initialDay);
  const [realNow, setNow] = useState(() => new Date());
  useEffect(() => {
    if (fixedNow) return;
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, [fixedNow]);
  const now = fixedNow ?? realNow;
  const [from, to] = hours;
  const span = (to - from) * 60;
  const pos = (d: Date) => ((d.getHours() * 60 + d.getMinutes() - from * 60) / span) * 100;
  const shift = (days: number) => {
    const d = new Date(day);
    d.setDate(d.getDate() + days);
    setDay(d);
  };
  const todays = events.filter((e) => sameDay(e.start, day));
  const isToday = sameDay(day, today());
  const nowPos = pos(now);
  const hourList = Array.from({ length: to - from }, (_, i) => from + i);

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-card" data-demo={demo}>
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <p className="flex-1 font-display text-base font-semibold">
          {day.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <Button variant="outline" size="sm" onClick={() => setDay(today())} disabled={isToday}>
          Today
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Previous day" onClick={() => shift(-1)}>
          <ChevronLeft />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Next day" onClick={() => shift(1)}>
          <ChevronRight />
        </Button>
      </div>
      <div className="flex">
        <div className="w-44 shrink-0 border-r @max-xl:w-14">
          <div className="h-9 border-b" />
          {resources.map((r) => (
            <div key={r.id} className="flex h-16 items-center gap-2.5 border-b px-3 last:border-b-0">
              <Avatar className="size-8">
                <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">
                  {r.initials ?? r.name.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 @max-xl:sr-only">
                <p className="truncate text-sm font-medium">{r.name}</p>
                {r.detail && <p className="truncate text-xs text-muted-foreground">{r.detail}</p>}
              </div>
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="relative min-w-[44rem]">
            <div className="grid h-9 border-b" style={{ gridTemplateColumns: `repeat(${hourList.length}, 1fr)` }}>
              {hourList.map((h) => (
                <div key={h} className="border-l px-2 pt-2 text-xs text-muted-foreground tabular-nums first:border-l-0">
                  {String(h).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            {resources.map((r) => (
              <div key={r.id} className="relative h-16 border-b last:border-b-0">
                <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${hourList.length}, 1fr)` }} aria-hidden>
                  {hourList.map((h) => (
                    <div key={h} className="border-l border-dashed first:border-l-0" />
                  ))}
                </div>
                {todays
                  .filter((e) => e.resource === r.id)
                  .map((e) => {
                    const left = Math.max(0, pos(e.start));
                    const width = Math.min(100, pos(e.end)) - left;
                    return (
                      <button
                        type="button"
                        key={e.id}
                        data-demo={`event-${e.id}`}
                        onClick={() => onEventClick?.(e)}
                        className={cn(
                          "absolute top-2 bottom-2 overflow-hidden rounded-md border-l-[3px] px-2 py-1 text-left transition-shadow hover:shadow-card focus-visible:ring-2 focus-visible:ring-ring",
                          EVENT_TONE[e.tone ?? "primary"],
                        )}
                        style={{ left: `${left}%`, width: `calc(${width}% - 4px)` }}
                      >
                        <p className="truncate text-xs font-semibold">{e.title}</p>
                        <p className="truncate text-xs text-muted-foreground tabular-nums">
                          {fmt.clock(e.start)}–{fmt.clock(e.end)}
                          {e.detail ? ` · ${e.detail}` : ""}
                        </p>
                      </button>
                    );
                  })}
              </div>
            ))}
            {isToday && nowPos > 0 && nowPos < 100 && (
              <div className="pointer-events-none absolute top-9 bottom-0 w-px bg-destructive" style={{ left: `${nowPos}%` }} aria-hidden>
                <span className="absolute -top-1 -left-1 size-2 rounded-full bg-destructive" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
