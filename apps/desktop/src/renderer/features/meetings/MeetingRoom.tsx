import {
  ArrowLeft,
  EyeOff,
  LayoutPanelLeft,
  Link2,
  MessageSquare,
  PanelBottom,
  PanelLeft,
  PanelRight,
  RotateCcw,
  Settings,
  SquareArrowOutUpRight,
  Video,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_MEETING_LAYOUT,
  MEETING_PANELS,
  MEETING_SLOTS,
  type MeetingLayout,
  type MeetingPanelId,
  type MeetingSizeKey,
  type MeetingSlot,
  movePanel,
  normalizeMeetingLayout,
  PANEL_TITLES,
  resizeSlot,
  SLOT_TITLES,
  setPanelHidden,
} from "../../../shared/meetingLayout";
import type { MeetingEvent, MeetingOverview, MeetingRecord } from "../../../shared/meetings";
import type { ProjectsState } from "../../../shared/projects";
import { call, errorMessage, useHostEvent } from "../../lib/host";
import { useThemeController } from "../../lib/theme";
import {
  Badge,
  Button,
  cn,
  ErrorBoundary,
  IconButton,
  type MenuEntry,
  MenuHost,
  openMenuAt,
  Spinner,
} from "../../ui";
import { Ask, Connection, DevicePicker, Prejoin, Review, ShareSources } from "./dialogs";
import { clock, dayAndTime } from "./format";
import { Lobby, STATUS } from "./Lobby";
import { type MediaState, MeetingMedia } from "./media";
import { NotesPanel, TranscriptPanel } from "./Panels";
import { SizedBox, Slot } from "./Slots";
import { Stage } from "./Stage";

const EMPTY_PROJECTS: ProjectsState = { projects: [], workspaces: [], activeId: undefined };
const SLOT_ICONS: Record<MeetingSlot, typeof PanelLeft> = {
  left: PanelLeft,
  right: PanelRight,
  bottom: PanelBottom,
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

/**
 * Three screens in one window (D-221): the lobby (upcoming and saved meetings), the live room (the
 * call in the middle, Transcript and Notes in slots you arrange) and a saved meeting's review.
 */
function Room() {
  const [overview, setOverview] = useState<MeetingOverview>();
  const [projects, setProjects] = useState<ProjectsState>(EMPTY_PROJECTS);
  const [events, setEvents] = useState<MeetingEvent[]>();
  const [opened, setOpened] = useState<string>();
  const [layout, setLayout] = useState<MeetingLayout>();
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
  // The layout is read once and then owned here; saving is debounced while a handle is dragged.
  useEffect(() => {
    if (overview && !layout) setLayout(normalizeMeetingLayout(overview.layout));
  }, [overview, layout]);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const changeLayout = (next: MeetingLayout) => {
    setLayout(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(
      () => void call("meetings.layout", next).catch((e) => setError(errorMessage(e))),
      300,
    );
  };
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
  if (!overview || !layout)
    return (
      <div className="h-screen bg-canvas text-fg">
        <Spinner center />
      </div>
    );
  const active = overview.records.find((r) => r.id === overview.activeId);
  const shown = overview.records.find((r) => r.id === opened);
  const record = active ?? shown;
  const captionTrouble = active && /unavailable|stopped/i.test(active.capture);
  const resize = (key: MeetingSizeKey, size: number) => changeLayout(resizeSlot(layout, key, size));
  const panelMenu = (id: MeetingPanelId): MenuEntry[] => [
    { heading: "Move to" },
    ...MEETING_SLOTS.map((slot) => ({
      label: SLOT_TITLES[slot],
      icon: SLOT_ICONS[slot],
      checked: layout.panels[id].slot === slot,
      onSelect: () => changeLayout(movePanel(layout, id, slot)),
    })),
    { separator: true },
    {
      label: `Hide ${PANEL_TITLES[id]}`,
      icon: EyeOff,
      onSelect: () => changeLayout(setPanelHidden(layout, id, true)),
    },
  ];
  const layoutMenu = (): MenuEntry[] => [
    { heading: "Panels" },
    ...MEETING_PANELS.map((id) => ({
      label: PANEL_TITLES[id],
      checked: !layout.panels[id].hidden,
      onSelect: () => changeLayout(setPanelHidden(layout, id, !layout.panels[id].hidden)),
    })),
    { separator: true },
    { label: "Reset layout", icon: RotateCcw, onSelect: () => changeLayout(DEFAULT_MEETING_LAYOUT) },
  ];
  const generateNotes = (id: string) =>
    void run(async () => {
      const chat = await call("meetings.notes", { id });
      await openChat(chat.sessionId);
    }, "notes");
  const askButton = (
    <Button size="sm" icon={MessageSquare} onClick={() => setAsk(true)}>
      Ask Claude
    </Button>
  );
  const notes = (r: MeetingRecord, menu?: MenuEntry[]) => (
    <NotesPanel
      record={r}
      busy={pending === "notes"}
      menu={menu}
      onGenerateNotes={() => generateNotes(r.id)}
      onReview={() => setReview(true)}
    />
  );
  const account = (
    <span className="flex max-w-64 items-center gap-2 text-xs text-muted">
      <span className={cn("size-2 shrink-0 rounded-full", connected ? "bg-success" : "bg-hint")} />
      <span className="truncate">
        {overview.fake ? "Test meeting service" : (overview.account ?? "Microsoft not connected")}
      </span>
    </span>
  );
  return (
    <div data-testid="meeting-room" className="flex h-screen flex-col bg-canvas text-fg">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-titlebar px-4">
        {active ? (
          <>
            <span className="size-2 shrink-0 rounded-full bg-danger" />
            <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{active.title}</h1>
            <Button icon={LayoutPanelLeft} onClick={(e) => openMenuAt(e.currentTarget, layoutMenu(), true)}>
              Layout
            </Button>
            {account}
          </>
        ) : shown ? (
          <>
            <IconButton icon={ArrowLeft} label="Back to meetings" onClick={() => setOpened(undefined)} />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-semibold">{shown.title}</h1>
              <div className="truncate text-xs text-muted">
                {dayAndTime(shown.startedAt)}
                {shown.endedAt ? ` – ${clock(shown.endedAt)}` : ""}
              </div>
            </div>
            <Badge tone={STATUS[shown.status].tone}>{STATUS[shown.status].label}</Badge>
            <Button icon={MessageSquare} onClick={() => setAsk(true)}>
              Ask Claude
            </Button>
            <Button
              icon={SquareArrowOutUpRight}
              onClick={() => void run(() => call("app.openExternal", { url: shown.joinUrl }))}
            >
              Open in Teams
            </Button>
          </>
        ) : (
          <>
            <Video className="size-4 shrink-0 text-accent" />
            <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">Meetings</h1>
            {account}
            <Button icon={Settings} onClick={() => setSettings(true)}>
              Connection
            </Button>
            <Button
              variant="primary"
              icon={Link2}
              onClick={() => setJoining({ title: "Teams meeting", url: "" })}
            >
              Join from link…
            </Button>
          </>
        )}
      </header>
      {active ? (
        <main className="flex min-h-0 flex-1">
          <Slot slot="left" layout={layout} onResize={resize} render={(id) => panel(id)} />
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1">
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
                onLeave={() =>
                  void run(async () => {
                    setOpened(active.id);
                    await media.current!.leave();
                  })
                }
              />
            </div>
            <Slot slot="bottom" layout={layout} onResize={resize} render={(id) => panel(id)} />
          </div>
          <Slot slot="right" layout={layout} onResize={resize} render={(id) => panel(id)} />
        </main>
      ) : shown ? (
        <main className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1">
            <TranscriptPanel record={shown} live={false} />
          </div>
          <SizedBox
            layout={layout}
            sizeKey="review.notes"
            edge="left"
            min={280}
            onResize={resize}
            label="Resize notes"
            className="border-l border-line bg-surface"
          >
            {notes(shown)}
          </SizedBox>
        </main>
      ) : (
        <Lobby
          events={events}
          records={overview.records}
          loading={pending === "calendar"}
          connected={connected}
          onRefresh={() => void refreshCalendar()}
          onConnect={() => setSettings(true)}
          onJoin={(event) => setJoining({ title: event.title, url: event.joinUrl! })}
          onOpen={setOpened}
        />
      )}
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

  function panel(id: MeetingPanelId) {
    const r = active!;
    return id === "transcript" ? (
      <TranscriptPanel record={r} live menu={panelMenu(id)} actions={askButton} />
    ) : (
      notes(r, panelMenu(id))
    );
  }
}
