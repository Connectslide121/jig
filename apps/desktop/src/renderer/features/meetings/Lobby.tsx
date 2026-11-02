import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileText,
  Link2,
  Plug,
  RefreshCw,
  Sparkles,
  Trash2,
  Video,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { MeetingEvent, MeetingRecord } from "../../../shared/meetings";
import { Badge, type BadgeTone, Button, cn, contextMenu, IconButton, Spinner } from "../../ui";
import { clock, dayAndTime, dayLabel, duration, startsIn } from "./format";

export const STATUS: Record<MeetingRecord["status"], { label: string; tone: BadgeTone }> = {
  joining: { label: "Joining", tone: "warning" },
  connected: { label: "Live", tone: "danger" },
  ended: { label: "Ended", tone: "neutral" },
  interrupted: { label: "Interrupted", tone: "warning" },
};

/** Re-renders every 30 s so "in 12 min" stays true. */
function useMinute(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const ongoing = (e: MeetingEvent, now: number) =>
  new Date(e.start).getTime() <= now && now < new Date(e.end).getTime();

/**
 * Before a call: the next meeting as a large card, the rest of the next 14 days as cards by day,
 * and the meeting history as cards. A whole card is the button.
 */
export function Lobby({
  events,
  view,
  onView,
  records,
  loading,
  connected,
  onRefresh,
  onConnect,
  onJoin,
  onJoinLink,
  onOpen,
  onDelete,
}: {
  events?: MeetingEvent[];
  view: "agenda" | "week";
  onView(view: "agenda" | "week"): void;
  records: MeetingRecord[];
  loading: boolean;
  connected: boolean;
  onRefresh(): void;
  onConnect(): void;
  onJoin(event: MeetingEvent): void;
  onJoinLink(): void;
  onOpen(id: string): void;
  onDelete(id: string): void;
}) {
  const now = useMinute();
  const [weekOffset, setWeekOffset] = useState(0);
  const joinable = (events ?? []).filter((e) => new Date(e.end).getTime() > now || ongoing(e, now));
  const [next, ...later] = joinable;
  const days = new Map<string, MeetingEvent[]>();
  for (const event of later) {
    const label = dayLabel(event.start);
    days.set(label, [...(days.get(label) ?? []), event]);
  }
  return (
    // A stable gutter, so switching Agenda and Week doesn't shift the page sideways.
    <div className="min-h-0 flex-1 overflow-y-auto" style={{ scrollbarGutter: "stable" }}>
      <div className="mx-auto max-w-6xl space-y-10 px-8 py-8">
        <section className="space-y-3">
          <SectionHeading title="Next up">
            <IconButton
              icon={RefreshCw}
              size="sm"
              label="Refresh calendar"
              disabled={loading || !connected}
              onClick={onRefresh}
            />
          </SectionHeading>
          <div className="relative h-36">
            {!connected ? (
              <Placeholder
                icon={Plug}
                title="Connect Microsoft to see your Teams meetings"
                text="Or paste a Teams link to join any meeting."
              >
                <Button onClick={onConnect}>Connect…</Button>
                <Button icon={Link2} onClick={onJoinLink}>
                  Join from link…
                </Button>
              </Placeholder>
            ) : !events ? (
              loading && <Spinner center />
            ) : !next ? (
              <Placeholder
                icon={CalendarDays}
                title="Nothing scheduled in the next 14 days"
                text="Paste a Teams link to join any meeting."
              >
                <Button icon={Link2} onClick={onJoinLink}>
                  Join from link…
                </Button>
              </Placeholder>
            ) : (
              <NextCard event={next} now={now} onJoin={onJoin} />
            )}
          </div>
        </section>
        {connected && events && (
          <section className="space-y-4">
            <div className="flex h-8 items-center gap-2">
              <h2 className="text-xs font-semibold tracking-wide text-hint uppercase">
                {view === "agenda" ? "Later" : weekTitle(weekOffset)}
              </h2>
              {view === "week" && (
                <span className="flex items-center">
                  <IconButton
                    icon={ChevronLeft}
                    size="sm"
                    label="Previous week"
                    disabled={weekOffset === 0}
                    onClick={() => setWeekOffset(weekOffset - 1)}
                  />
                  <IconButton
                    icon={ChevronRight}
                    size="sm"
                    label="Next week"
                    disabled={weekOffset === 1}
                    onClick={() => setWeekOffset(weekOffset + 1)}
                  />
                </span>
              )}
              <Segmented<"agenda" | "week">
                className="ml-auto"
                value={view}
                onChange={onView}
                items={[
                  ["agenda", "Agenda"],
                  ["week", "Week"],
                ]}
              />
            </div>
            {view === "week" ? (
              <Week events={joinable} offset={weekOffset} now={now} onJoin={onJoin} />
            ) : !days.size ? (
              <p className="text-sm text-muted">Nothing else in the next 14 days.</p>
            ) : (
              <div className="space-y-6">
                {[...days].map(([label, list]) => (
                  <div key={label} className="space-y-3">
                    <SectionHeading title={label} />
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-4">
                      {list.map((event) => (
                        <EventCard key={event.id} event={event} now={now} onJoin={onJoin} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
        <section className="space-y-3">
          <SectionHeading title="Meeting history" />
          {!records.length ? (
            <div className="h-28">
              <Placeholder
                icon={FileText}
                title="No meetings yet"
                text="Captions and notes from meetings you join are kept here."
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-4">
              {records.map((r) => (
                <SavedCard key={r.id} record={r} onOpen={onOpen} onDelete={onDelete} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SectionHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-7 items-center gap-2">
      <h2 className="min-w-0 flex-1 truncate text-xs font-semibold tracking-wide text-hint uppercase">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Placeholder({
  icon: Icon,
  title,
  text,
  children,
}: {
  icon: typeof Plug;
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-full items-center gap-4 rounded-xl border border-dashed border-line-strong px-6">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-hint">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted">{text}</div>
      </div>
      {children && <div className="flex shrink-0 gap-2">{children}</div>}
    </div>
  );
}

const card =
  "group relative flex w-full rounded-xl border border-line bg-surface text-left transition-colors " +
  "hover:border-accent hover:bg-raised focus-visible:border-accent focus-visible:outline-none " +
  "disabled:pointer-events-none disabled:opacity-60";

/** The next meeting: big time, countdown, and the whole card joins. */
function NextCard({
  event,
  now,
  onJoin,
}: {
  event: MeetingEvent;
  now: number;
  onJoin(e: MeetingEvent): void;
}) {
  const live = ongoing(event, now);
  return (
    <button
      type="button"
      aria-label={`Join ${event.title}`}
      disabled={!event.joinUrl}
      onClick={() => onJoin(event)}
      className={cn(card, "h-full items-center gap-8 px-8", live && "border-accent")}
    >
      <div className="w-36 shrink-0">
        <div className="text-2xl font-semibold tabular-nums">{clock(event.start)}</div>
        <div className="text-sm text-muted tabular-nums">until {clock(event.end)}</div>
      </div>
      <div className="h-16 w-px shrink-0 bg-line" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex h-5 items-center gap-2 text-xs font-medium">
          {live ? (
            <>
              <span className="size-2 rounded-full bg-danger" />
              <span className="text-danger">Happening now</span>
            </>
          ) : (
            <span className="text-accent">{startsIn(event.start, event.end, now)}</span>
          )}
        </div>
        <div className="truncate text-xl font-semibold" title={event.title}>
          {event.title}
        </div>
        <div className="truncate text-sm text-muted">
          {dayLabel(event.start)} · {duration(event.start, event.end)} · {event.organizer}
        </div>
      </div>
      <span
        className={cn(
          "flex h-10 shrink-0 items-center gap-2 rounded-lg px-5 text-sm font-medium transition-colors",
          event.joinUrl ? "bg-accent text-on-accent group-hover:bg-accent-hover" : "bg-active text-muted",
        )}
      >
        <Video className="size-4" />
        {event.joinUrl ? "Join" : "No Teams link"}
      </span>
    </button>
  );
}

function EventCard({
  event,
  now,
  onJoin,
}: {
  event: MeetingEvent;
  now: number;
  onJoin(e: MeetingEvent): void;
}) {
  return (
    <button
      type="button"
      aria-label={`Join ${event.title}`}
      disabled={!event.joinUrl}
      onClick={() => onJoin(event)}
      className={cn(card, "h-32 flex-col justify-between p-4", ongoing(event, now) && "border-accent")}
    >
      <div className="flex w-full items-center gap-2 text-sm tabular-nums">
        <span className="font-semibold">{clock(event.start)}</span>
        <span className="text-hint">– {clock(event.end)}</span>
        <span className="ml-auto text-xs text-hint">{duration(event.start, event.end)}</span>
      </div>
      <div className="line-clamp-2 w-full text-sm font-medium" title={event.title}>
        {event.title}
      </div>
      <div className="flex w-full items-center gap-2 text-xs">
        <span className="min-w-0 flex-1 truncate text-muted">{event.organizer}</span>
        <span className="flex shrink-0 items-center gap-1 font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Video className="size-3.5" />
          {event.joinUrl ? "Join" : "No link"}
        </span>
      </div>
    </button>
  );
}

function SavedCard({
  record,
  onOpen,
  onDelete,
}: {
  record: MeetingRecord;
  onOpen(id: string): void;
  onDelete(id: string): void;
}) {
  const open = record.actions.filter((a) => !a.queued).length;
  return (
    <button
      type="button"
      aria-label={`Open ${record.title}`}
      onClick={() => onOpen(record.id)}
      onContextMenu={contextMenu([
        { label: "Open", icon: FileText, onSelect: () => onOpen(record.id) },
        { separator: true },
        { label: "Delete meeting…", icon: Trash2, danger: true, onSelect: () => onDelete(record.id) },
      ])}
      className={cn(card, "h-28 flex-col justify-between p-4")}
    >
      <div className="w-full space-y-0.5">
        <div className="flex w-full items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium" title={record.title}>
            {record.title}
          </span>
          <Badge tone={STATUS[record.status].tone}>{STATUS[record.status].label}</Badge>
        </div>
        <div className="truncate text-xs text-muted">
          {dayAndTime(record.startedAt)}
          {record.endedAt ? ` · ${duration(record.startedAt, record.endedAt)}` : ""}
        </div>
      </div>
      <div className="flex w-full items-center gap-3 text-xs text-hint">
        <span className="flex items-center gap-1">
          <FileText className="size-3.5" />
          {record.captions.length} captions
        </span>
        <span className={cn("flex items-center gap-1", !record.notes && "invisible")}>
          <Sparkles className="size-3.5" />
          Notes
        </span>
        <span className={cn("ml-auto text-accent", !open && "invisible")}>{open} to review</span>
      </div>
    </button>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange(value: T): void;
  items: Array<[T, string]>;
  className?: string;
}) {
  return (
    <div className={cn("flex h-7 items-center rounded-md border border-line bg-surface p-0.5", className)}>
      {items.map(([id, label]) => (
        <button
          type="button"
          key={id}
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={cn(
            "h-full rounded-sm px-3 text-xs font-medium transition-colors",
            value === id ? "bg-active text-fg" : "text-muted hover:text-fg",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Monday 00:00 of this week, plus `offset` weeks. */
function weekStart(offset: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
  return d;
}

function weekTitle(offset: number): string {
  if (offset === 0) return "This week";
  if (offset === 1) return "Next week";
  return weekStart(offset).toLocaleDateString([], { day: "numeric", month: "short" });
}

/** Monday to Sunday side by side; today is marked, past days are dimmed. */
function Week({
  events,
  offset,
  now,
  onJoin,
}: {
  events: MeetingEvent[];
  offset: number;
  now: number;
  onJoin(e: MeetingEvent): void;
}) {
  const start = weekStart(offset);
  const today = new Date(now).toDateString();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((d) => {
        const key = d.toDateString();
        const isToday = key === today;
        const past = d.getTime() < new Date(today).getTime();
        const list = events.filter((e) => new Date(e.start).toDateString() === key);
        return (
          <div
            key={key}
            className={cn(
              "flex min-h-72 min-w-0 flex-col gap-2 rounded-xl border p-2",
              isToday ? "border-accent bg-surface" : "border-line",
              past && "opacity-50",
            )}
          >
            <div className="flex h-7 items-baseline gap-1.5 px-1">
              <span className={cn("text-xs font-semibold uppercase", isToday ? "text-accent" : "text-hint")}>
                {d.toLocaleDateString([], { weekday: "short" })}
              </span>
              <span
                className={cn("text-sm tabular-nums", isToday ? "font-semibold text-accent" : "text-muted")}
              >
                {d.getDate()}
              </span>
            </div>
            {list.map((event) => (
              <button
                type="button"
                key={event.id}
                aria-label={`Join ${event.title}`}
                disabled={!event.joinUrl}
                onClick={() => onJoin(event)}
                className={cn(
                  card,
                  "h-16 flex-col justify-center px-2.5",
                  ongoing(event, now) && "border-accent",
                )}
              >
                <span className="text-xs text-muted tabular-nums">
                  {clock(event.start)} – {clock(event.end)}
                </span>
                <span className="line-clamp-2 w-full text-xs font-medium" title={event.title}>
                  {event.title}
                </span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}
