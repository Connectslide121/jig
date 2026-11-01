import {
  CalendarDays,
  ExternalLink,
  History,
  Link2,
  MessageSquare,
  RefreshCw,
  Settings,
  Video,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MeetingEvent, MeetingOverview, MeetingRecord } from "../../../shared/meetings";
import type { ProjectsState } from "../../../shared/projects";
import { call, errorMessage, useHostEvent } from "../../lib/host";
import { useThemeController } from "../../lib/theme";
import {
  Badge,
  type BadgeTone,
  Button,
  cn,
  Empty,
  ErrorBoundary,
  IconButton,
  ListRow,
  MenuHost,
  Spinner,
  Tabs,
} from "../../ui";
import { Pane } from "../../workbench/Pane";
import { Ask, Connection, DevicePicker, Prejoin, Review, ShareSources } from "./dialogs";
import { clock, dayAndTime, dayLabel, duration } from "./format";
import { type MediaState, MeetingMedia } from "./media";
import { Stage } from "./Stage";
import { Transcript } from "./Transcript";

const EMPTY_PROJECTS: ProjectsState = { projects: [], workspaces: [], activeId: undefined };

const STATUS: Record<MeetingRecord["status"], { label: string; tone: BadgeTone }> = {
  joining: { label: "Joining", tone: "warning" },
  connected: { label: "Live", tone: "danger" },
  ended: { label: "Ended", tone: "neutral" },
  interrupted: { label: "Interrupted", tone: "warning" },
};

export function MeetingRoom(): React.JSX.Element {
  useThemeController();
  return (
    <ErrorBoundary label="Meeting room">
      <Room />
      <MenuHost />
    </ErrorBoundary>
  );
}

type Pending = "calendar" | "notes" | "join" | "ask" | "queue" | "connection" | "call";

function Room() {
  const [overview, setOverview] = useState<MeetingOverview>();
  const [projects, setProjects] = useState<ProjectsState>(EMPTY_PROJECTS);
  const [events, setEvents] = useState<MeetingEvent[]>();
  const [tab, setTab] = useState<"upcoming" | "saved">("upcoming");
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Pending>();
  const [settings, setSettings] = useState(false);
  const [devicePicker, setDevicePicker] = useState(false);
  const [joining, setJoining] = useState<{ url: string; title: string }>();
  const [ask, setAsk] = useState(false);
  const [review, setReview] = useState(false);
  const [sharing, setSharing] = useState<Array<{ id: string; name: string; thumbnail: string }>>();
  const [mediaState, setMediaState] = useState<MediaState>({
    state: "Not connected",
    muted: true,
    camera: false,
    sharing: false,
    participants: [],
    hasVideo: false,
  });
  const media = useRef<MeetingMedia | null>(null);
  media.current ??= new MeetingMedia((e) => setError(errorMessage(e)));
  const attachCanvas = useCallback((element: HTMLDivElement | null) => media.current!.setCanvas(element), []);
  const refreshed = useRef(0);
  const reload = useCallback(async () => {
    const version = ++refreshed.current;
    const data = await call("meetings.overview");
    if (version === refreshed.current) setOverview(data);
  }, []);
  const run = async (fn: () => Promise<unknown>, key: Pending = "call") => {
    setPending(key);
    setError("");
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(undefined);
    }
  };
  useEffect(() => {
    void reload().catch((e) => setError(errorMessage(e)));
    void call("projects.list")
      .then(setProjects)
      .catch((e) => setError(errorMessage(e)));
    return media.current!.subscribe(setMediaState);
  }, [reload]);
  useHostEvent("meetings.changed", () => {
    void reload().catch((e) => setError(errorMessage(e)));
  });
  useHostEvent("projects.changed", setProjects);
  useHostEvent("meetings.leaveRequested", () => {
    void run(async () => {
      await media.current!.leave();
      window.close();
    });
  });
  const connected = Boolean(overview?.account || overview?.fake);
  const refreshCalendar = () =>
    run(async () => {
      setEvents(await call("meetings.calendar"));
    }, "calendar");
  // Load the calendar once as soon as there is an account to read it with.
  const loadedCalendar = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: load once per connection.
  useEffect(() => {
    if (!connected || loadedCalendar.current) return;
    loadedCalendar.current = true;
    void refreshCalendar();
  }, [connected]);
  const openChat = (sessionId: string) => call("meetings.revealChat", { sessionId });
  if (!overview)
    return (
      <div className="h-screen bg-canvas text-fg">
        <Spinner center />
      </div>
    );
  const active = overview.records.find((r) => r.id === overview.activeId);
  const record =
    overview.records.find((r) => r.id === (selected ?? overview.activeId)) ?? overview.records[0];
  const viewingOther = Boolean(active && record && record.id !== active.id);
  const captionTrouble = active && /unavailable|stopped/i.test(active.capture);
  return (
    <div data-testid="meeting-room" className="flex h-screen flex-col bg-canvas text-fg">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-titlebar px-4">
        <Video className="size-4 text-accent" />
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">Meetings</h1>
        <span className="flex w-64 items-center justify-end gap-2 text-xs text-muted">
          <span className={cn("size-2 shrink-0 rounded-full", connected ? "bg-success" : "bg-hint")} />
          <span className="truncate">
            {overview.fake ? "Test meeting service" : (overview.account ?? "Microsoft not connected")}
          </span>
        </span>
        <Button icon={Settings} onClick={() => setSettings(true)} disabled={Boolean(active)}>
          Connection
        </Button>
      </header>
      <main className="flex min-h-0 flex-1">
        <Pane
          id="addon.meetings.agenda"
          edge="right"
          defaultSize={300}
          min={240}
          max={500}
          className="flex flex-col border-r border-line bg-surface"
        >
          <div className="flex h-14 shrink-0 items-center px-3">
            <Button
              variant="primary"
              icon={Link2}
              className="w-full"
              disabled={Boolean(active)}
              onClick={() => setJoining({ title: "Teams meeting", url: "" })}
            >
              Join from link…
            </Button>
          </div>
          <div className="flex shrink-0 items-center border-b border-line pr-2">
            <Tabs
              className="flex-1 border-b-0"
              value={tab}
              onChange={setTab}
              items={[
                { id: "upcoming", label: "Upcoming" },
                { id: "saved", label: `Saved · ${overview.records.length}` },
              ]}
            />
            <IconButton
              icon={RefreshCw}
              size="sm"
              label="Refresh calendar"
              className={cn(tab !== "upcoming" && "invisible")}
              disabled={pending === "calendar" || !connected}
              onClick={() => void refreshCalendar()}
            />
          </div>
          <div className="relative min-h-0 flex-1 overflow-y-auto p-1.5">
            {tab === "upcoming" ? (
              <Upcoming
                events={events}
                loading={pending === "calendar"}
                connected={connected}
                busy={Boolean(active)}
                onConnect={() => setSettings(true)}
                onJoin={(event) => setJoining({ title: event.title, url: event.joinUrl! })}
              />
            ) : !overview.records.length ? (
              <Empty icon={History} title="No saved meetings" className="h-full">
                Captions and notes from meetings you join are kept here.
              </Empty>
            ) : (
              <div role="listbox" aria-label="Saved meetings" className="space-y-0.5">
                {overview.records.map((r) => (
                  <ListRow
                    key={r.id}
                    selected={r.id === record?.id}
                    onClick={() => setSelected(r.id)}
                    className="h-12"
                    description={`${dayAndTime(r.startedAt)}${r.endedAt ? ` · ${duration(r.startedAt, r.endedAt)}` : ""}`}
                    trailing={
                      <span className="flex w-20 justify-end">
                        <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                      </span>
                    }
                  >
                    {r.title}
                  </ListRow>
                ))}
              </div>
            )}
          </div>
        </Pane>
        <div className="flex min-w-0 flex-1 flex-col">
          <Pane
            id="addon.meetings.stage"
            edge="bottom"
            defaultSize={300}
            min={180}
            max={720}
            className="border-b border-line"
          >
            <Stage
              active={active}
              media={mediaState}
              fake={overview.fake}
              attachCanvas={attachCanvas}
              onMute={() => void run(() => media.current!.mute())}
              onCamera={() => void run(() => media.current!.camera())}
              onShare={() =>
                void run(async () => {
                  if (mediaState.sharing) await media.current!.share();
                  else setSharing(await call("meetings.shareSources"));
                })
              }
              onDevices={() => setDevicePicker(true)}
              onRetryCaptions={() => void run(() => media.current!.startCaptions())}
              onLeave={() => void run(() => media.current!.leave())}
            />
          </Pane>
          <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{record?.title ?? "No meeting selected"}</div>
              <div className="truncate text-xs text-muted">
                {record
                  ? `${dayAndTime(record.startedAt)}${record.endedAt ? ` – ${clock(record.endedAt)}` : ""} · ${STATUS[record.status].label}`
                  : "Join a meeting or pick a saved one"}
              </div>
            </div>
            {viewingOther && (
              <Button onClick={() => setSelected(active!.id)}>
                <span className="size-2 rounded-full bg-danger" />
                Back to live meeting
              </Button>
            )}
            <Button icon={MessageSquare} disabled={!record} onClick={() => setAsk(true)}>
              Ask Claude
            </Button>
            <IconButton
              icon={ExternalLink}
              label="Open in Teams"
              disabled={!record || Boolean(active)}
              onClick={() => void run(() => call("app.openExternal", { url: record!.joinUrl }))}
            />
          </div>
          <Transcript
            record={record}
            live={Boolean(active && record?.id === active.id)}
            busy={pending === "notes"}
            onGenerateNotes={() =>
              void run(async () => {
                const chat = await call("meetings.notes", { id: record!.id });
                await openChat(chat.sessionId);
              }, "notes")
            }
            onReview={() => setReview(true)}
          />
        </div>
      </main>
      <footer
        role="status"
        className="flex h-7 shrink-0 items-center gap-2 border-t border-line bg-surface px-3 text-xs"
      >
        {error ? (
          <>
            <span className="min-w-0 flex-1 truncate text-danger" title={error}>
              {error}
            </span>
            <button
              type="button"
              aria-label="Dismiss error"
              className="rounded-sm text-hint hover:text-fg"
              onClick={() => setError("")}
            >
              <X className="size-3.5" />
            </button>
          </>
        ) : (
          <>
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                active ? (mediaState.state === "Connected" ? "bg-success" : "bg-warning") : "bg-hint",
              )}
            />
            <span className="min-w-0 truncate text-muted">
              {active
                ? `${mediaState.state} · ${active.capture}${mediaState.sharing ? " · Sharing your screen" : ""}`
                : "No call"}
            </span>
            {captionTrouble && !overview.fake && (
              <button
                type="button"
                className="shrink-0 text-accent hover:underline"
                onClick={() => void run(() => media.current!.startCaptions())}
              >
                Retry captions
              </button>
            )}
            <span className="ml-auto shrink-0 truncate text-hint">
              Meetings are global · switching projects won't interrupt a call
            </span>
          </>
        )}
      </footer>
      {settings && (
        <Connection
          settings={overview.settings}
          account={overview.account}
          fake={overview.fake}
          busy={pending === "connection"}
          onClose={() => setSettings(false)}
          onSave={(next) =>
            run(async () => {
              await call("meetings.configure", next);
              setSettings(false);
            }, "connection")
          }
          onConnect={(next) =>
            run(async () => {
              await call("meetings.configure", next);
              await call("meetings.signIn");
              setSettings(false);
              loadedCalendar.current = false;
            }, "connection")
          }
          onDisconnect={() =>
            run(async () => {
              await call("meetings.signOut");
              setEvents(undefined);
              loadedCalendar.current = false;
            }, "connection")
          }
        />
      )}
      {devicePicker && (
        <DevicePicker
          media={media.current}
          onClose={() => setDevicePicker(false)}
          onError={(e) => setError(errorMessage(e))}
        />
      )}
      {joining && (
        <Prejoin
          meeting={joining}
          fake={overview.fake}
          media={media.current}
          busy={pending === "join"}
          onClose={() => setJoining(undefined)}
          onError={(e) => setError(errorMessage(e))}
          onJoin={(meeting, options) =>
            run(async () => {
              const r = await call("meetings.join", meeting);
              setSelected(r.id);
              setJoining(undefined);
              await media.current!.join(r, { ...options, fake: overview.fake });
            }, "join")
          }
        />
      )}
      {ask && record && (
        <Ask
          record={record}
          projects={projects}
          busy={pending === "ask"}
          onClose={() => setAsk(false)}
          onAsk={(question, projectId) =>
            run(async () => {
              const chat = await call("meetings.ask", { id: record.id, question, projectId });
              await openChat(chat.sessionId);
              setAsk(false);
            }, "ask")
          }
        />
      )}
      {review && record && (
        <Review
          record={record}
          projects={projects}
          busy={pending === "queue"}
          onClose={() => setReview(false)}
          onQueue={(actions, actionIds) =>
            run(async () => {
              await call("meetings.actions", { id: record.id, actions });
              await call("meetings.queue", { id: record.id, actionIds });
              setReview(false);
            }, "queue")
          }
        />
      )}
      {sharing && (
        <ShareSources
          sources={sharing}
          onClose={() => setSharing(undefined)}
          onPick={(id) =>
            void run(async () => {
              setSharing(undefined);
              await media.current!.share(id);
            })
          }
        />
      )}
    </div>
  );
}

/** The next 14 days of Teams meetings, by day, times and Join buttons each in their own column. */
function Upcoming({
  events,
  loading,
  connected,
  busy,
  onConnect,
  onJoin,
}: {
  events?: MeetingEvent[];
  loading: boolean;
  connected: boolean;
  busy: boolean;
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
          <h3 className="flex h-7 items-center px-2 text-2xs font-semibold tracking-wide text-hint uppercase">
            {label}
          </h3>
          {list.map((event) => {
            const ongoing = new Date(event.start).getTime() <= now && now < new Date(event.end).getTime();
            return (
              <div key={event.id} className="flex h-12 items-center gap-2 rounded-md px-2 hover:bg-hover">
                <time
                  className={cn(
                    "w-10 shrink-0 text-right text-sm tabular-nums",
                    ongoing ? "font-semibold text-accent" : "text-muted",
                  )}
                >
                  {clock(event.start)}
                </time>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm" title={event.title}>
                    {event.title}
                  </div>
                  <div className="truncate text-xs text-muted">
                    {ongoing ? "Now · " : ""}
                    {event.organizer}
                  </div>
                </div>
                <span className="flex w-12 shrink-0 justify-end">
                  {event.joinUrl && (
                    <Button
                      size="sm"
                      variant={ongoing ? "primary" : "secondary"}
                      disabled={busy}
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
