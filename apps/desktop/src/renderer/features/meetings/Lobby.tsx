import { CalendarDays, ChevronRight, History, RefreshCw } from "lucide-react";
import type { MeetingEvent, MeetingRecord } from "../../../shared/meetings";
import { Badge, type BadgeTone, Button, Card, cn, Empty, IconButton, Spinner } from "../../ui";
import { clock, dayAndTime, dayLabel, duration } from "./format";
import { PanelHeader } from "./Panels";

export const STATUS: Record<MeetingRecord["status"], { label: string; tone: BadgeTone }> = {
  joining: { label: "Joining", tone: "warning" },
  connected: { label: "Live", tone: "danger" },
  ended: { label: "Ended", tone: "neutral" },
  interrupted: { label: "Interrupted", tone: "warning" },
};

/** Before a call: what's coming up and what you've saved. The call itself has its own screen. */
export function Lobby({
  events,
  records,
  loading,
  connected,
  onRefresh,
  onConnect,
  onJoin,
  onOpen,
}: {
  events?: MeetingEvent[];
  records: MeetingRecord[];
  loading: boolean;
  connected: boolean;
  onRefresh(): void;
  onConnect(): void;
  onJoin(event: MeetingEvent): void;
  onOpen(id: string): void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-hidden p-6">
      <div className="mx-auto grid h-full max-w-7xl grid-cols-5 gap-6">
        <Card className="col-span-3 flex min-h-0 flex-col overflow-hidden shadow-none">
          <PanelHeader title="Upcoming" detail="Next 14 days">
            <IconButton
              icon={RefreshCw}
              size="sm"
              label="Refresh calendar"
              disabled={loading || !connected}
              onClick={onRefresh}
            />
          </PanelHeader>
          <div className="relative min-h-0 flex-1 overflow-y-auto p-2">
            <Upcoming
              events={events}
              loading={loading}
              connected={connected}
              onConnect={onConnect}
              onJoin={onJoin}
            />
          </div>
        </Card>
        <Card className="col-span-2 flex min-h-0 flex-col overflow-hidden shadow-none">
          <PanelHeader title="Saved meetings" detail={records.length ? String(records.length) : ""} />
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {!records.length ? (
              <Empty icon={History} title="No saved meetings" className="h-full">
                Captions and notes from meetings you join are kept here.
              </Empty>
            ) : (
              <div role="listbox" aria-label="Saved meetings" className="space-y-0.5">
                {records.map((r) => (
                  <button
                    type="button"
                    key={r.id}
                    onClick={() => onOpen(r.id)}
                    className="group flex h-14 w-full items-center gap-3 rounded-md px-3 text-left hover:bg-hover focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-none"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{r.title}</span>
                      <span className="block truncate text-xs text-muted">
                        {dayAndTime(r.startedAt)}
                        {r.endedAt ? ` · ${duration(r.startedAt, r.endedAt)}` : ""}
                        {` · ${r.captions.length} captions`}
                      </span>
                    </span>
                    <span className="flex w-20 shrink-0 justify-end">
                      <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-hint group-hover:text-fg" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

/** The next 14 days of Teams meetings, by day, times and Join buttons each in their own column. */
function Upcoming({
  events,
  loading,
  connected,
  onConnect,
  onJoin,
}: {
  events?: MeetingEvent[];
  loading: boolean;
  connected: boolean;
  onConnect(): void;
  onJoin(event: MeetingEvent): void;
}) {
  if (!connected)
    return (
      <Empty icon={CalendarDays} title="Calendar not connected" className="h-full">
        <p>Connect Microsoft to see your Teams meetings for the next 14 days.</p>
        <Button className="mt-3" onClick={onConnect}>
          Connect…
        </Button>
      </Empty>
    );
  if (!events) return loading ? <Spinner center /> : null;
  if (!events.length)
    return (
      <Empty icon={CalendarDays} title="Nothing in the next 14 days" className="h-full">
        Paste a Teams link to join any meeting.
      </Empty>
    );
  const now = Date.now();
  const days = new Map<string, MeetingEvent[]>();
  for (const event of events) {
    const label = dayLabel(event.start);
    days.set(label, [...(days.get(label) ?? []), event]);
  }
  return (
    <div className={cn(loading && "opacity-60")}>
      {[...days].map(([label, list]) => (
        <section key={label}>
          <h3 className="flex h-8 items-center px-3 text-2xs font-semibold tracking-wide text-hint uppercase">
            {label}
          </h3>
          {list.map((event) => {
            const ongoing = new Date(event.start).getTime() <= now && now < new Date(event.end).getTime();
            return (
              <div key={event.id} className="flex h-14 items-center gap-3 rounded-md px-3 hover:bg-hover">
                <span className="w-28 shrink-0 text-right text-sm whitespace-nowrap tabular-nums">
                  <span className={ongoing ? "font-semibold text-accent" : ""}>{clock(event.start)}</span>
                  <span className="text-hint"> – {clock(event.end)}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm" title={event.title}>
                    {event.title}
                  </div>
                  <div className="truncate text-xs text-muted">
                    {ongoing ? "Happening now · " : ""}
                    {event.organizer}
                  </div>
                </div>
                <span className="flex w-16 shrink-0 justify-end">
                  {event.joinUrl && (
                    <Button
                      size="sm"
                      variant={ongoing ? "primary" : "secondary"}
                      onClick={() => onJoin(event)}
                    >
                      Join
                    </Button>
                  )}
                </span>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
