import {
  CalendarDays,
  History,
  Link2,
  MessagesSquare,
  Phone,
  Settings,
  SquareArrowOutUpRight,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { setPin } from "../../../shared/meetingChatList";
import {
  type MeetingLayout,
  type MeetingSizeKey,
  normalizeMeetingLayout,
  resizeSlot,
  setHistoryTranscript,
} from "../../../shared/meetingLayout";
import {
  MEETINGS_TABS,
  type MeetingEvent,
  type MeetingPerson,
  type MeetingRecord,
  type MeetingStart,
  type MeetingsTab,
} from "../../../shared/meetings";
import { call, errorMessage, useHostEvent } from "../../lib/host";
import { Button, CountBadge, cn, confirmDialog, type MenuEntry, Spinner } from "../../ui";
import { ToastHost } from "../../workbench/toasts";
import { CallDialog } from "./Calls";
import { type ChatList, ChatsView, type OpenChat } from "./Chats";
import { Connection } from "./dialogs";
import { MeetingHistory } from "./History";
import { Lobby } from "./Lobby";
import { NewChatDialog } from "./NewChat";
import { AccountLabel, MeetingsShell, StatusBar, useMeetingsData } from "./Shell";

export function MeetingLobby(): React.JSX.Element {
  return (
    <MeetingsShell label="Meetings lobby">
      <LobbyWindow />
    </MeetingsShell>
  );
}

/** The tabs, in the rail's order: icon, title (the header and the rail's label). */
const TABS: Record<MeetingsTab, { title: string; icon: typeof CalendarDays }> = {
  calendar: { title: "Calendar", icon: CalendarDays },
  chats: { title: "Chats", icon: MessagesSquare },
  meetings: { title: "Meetings", icon: History },
};
const TAB_KEY = "jig.meetings.tab";

const asTab = (value: unknown): MeetingsTab | undefined => MEETINGS_TABS.find((tab) => tab === value);

/**
 * The Meetings window (D-292, D-376), three tabs in a rail: the Calendar (upcoming meetings), your
 * Teams Chats, and the Meetings you have had (the history, with notes and transcript). It stays usable
 * beside a running call; joining and calling happen in the call window, which this asks main to bring
 * up. It never receives the calling credential.
 */
function LobbyWindow() {
  const { overview, setOverview, projects, error, setError, pending, reload, run, connected } =
    useMeetingsData();
  const [events, setEvents] = useState<MeetingEvent[]>();
  // The tab it opened on (a link, a call that ended), else the one you used last, else the Calendar.
  const [section, setSection] = useState<MeetingsTab>(() => {
    const params = new URLSearchParams(window.location.search);
    return (
      asTab(params.get("tab")) ??
      (params.get("select") ? "meetings" : undefined) ??
      asTab(localStorage.getItem(TAB_KEY)) ??
      "calendar"
    );
  });
  /** The meeting to show on the Meetings tab; `at` changes with every request. */
  const [target, setTarget] = useState<{ select: string; at: number } | undefined>(() => {
    const select = new URLSearchParams(window.location.search).get("select");
    return select ? { select, at: Date.now() } : undefined;
  });
  const [layout, setLayout] = useState<MeetingLayout>();
  const [settings, setSettings] = useState(false);
  const [calling, setCalling] = useState(false);
  const [chatList, setChatList] = useState<ChatList>();
  const [chatsLoading, setChatsLoading] = useState(false);
  const [teamsChat, setTeamsChat] = useState<OpenChat>();
  /** New chat (D-332), open with the people it starts with. */
  const [newChat, setNewChat] = useState<MeetingPerson[]>();
  // A call that just ended, or a link to a meeting: its tab (main brings this window to the front).
  useHostEvent("meetings.show", ({ tab, select }) => {
    const next = tab ?? (select ? "meetings" : undefined);
    if (next) setSection(next);
    if (select) setTarget({ select, at: Date.now() });
  });
  useEffect(() => {
    localStorage.setItem(TAB_KEY, section);
  }, [section]);
  useEffect(() => {
    document.title = "Jig Meetings";
  }, []);
  // The lists' widths; the call window keeps the rest of the layout (it is saved together).
  useEffect(() => {
    if (overview && !layout) setLayout(normalizeMeetingLayout(overview.layout));
  }, [overview, layout]);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** Changes the lobby's part of the layout at once, and saves it a moment later. */
  const unsaved = useRef<Array<(layout: MeetingLayout) => MeetingLayout>>([]);
  const changeLayout = (change: (layout: MeetingLayout) => MeetingLayout) => {
    if (!layout) return;
    setLayout(change(layout));
    unsaved.current.push(change);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const changes = unsaved.current.splice(0);
      // Starts from the saved layout, so panels the call window moved meanwhile stay where they are.
      void call("meetings.overview")
        .then((o) =>
          call(
            "meetings.layout",
            changes.reduce((l, c) => c(l), normalizeMeetingLayout(o.layout)),
          ),
        )
        .catch((e) => setError(errorMessage(e)));
    }, 300);
  };
  const resize = (key: MeetingSizeKey, size: number) => changeLayout((l) => resizeSlot(l, key, size));
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
  const loadChats = async () => {
    setChatsLoading(true);
    try {
      setChatList(await call("meetings.chats"));
    } catch (e) {
      setChatList((kept) => ({ state: "ok", chats: kept?.chats ?? [], error: errorMessage(e) }));
    } finally {
      setChatsLoading(false);
    }
  };
  // Your chats: read once you're connected (for the unread count on the rail), then every 30
  // seconds while Chats shows.
  // biome-ignore lint/correctness/useExhaustiveDependencies: on connecting and on showing Chats.
  useEffect(() => {
    if (!connected) return;
    void loadChats();
    if (section !== "chats") return;
    const timer = setInterval(() => void loadChats(), 30_000);
    return () => clearInterval(timer);
  }, [connected, section]);
  if (!overview || !layout)
    return (
      <div className="h-screen bg-canvas text-fg">
        <Spinner center />
      </div>
    );
  const live = overview.records.find((r) => r.id === overview.activeId);
  const unread = chatList?.chats.filter((c) => c.unread).length ?? 0;
  /** Opens your one-to-one chat with someone from Call…; false when you have none yet. */
  const chatWith = async (person: { id: string; name: string }) => {
    const found = await call("meetings.chatWith", { peerId: person.id });
    if (found.state === "ok" && !found.chatId) return false;
    setCalling(false);
    setSection("chats");
    // Without Microsoft's approval, Chats shows how to connect.
    if (found.chatId)
      setTeamsChat({ id: found.chatId, name: person.name, kind: "oneOnOne", peerId: person.id });
    return true;
  };
  /** Has the call window join, call or come forward; one call at a time, so a live one is shown instead. */
  const start = async (what: MeetingStart) => {
    if (live && what.kind !== "show") {
      const show = await confirmDialog({
        title: live.call ? "You're in a call" : "You're in a meeting",
        message: `Leave "${live.title}" before you join or call someone else.`,
        confirmLabel: live.call ? "Show call" : "Show meeting",
      });
      if (!show) return;
      what = { kind: "show" };
    }
    await run(() => call("meetings.start", what));
  };
  /** Call back and Open in Teams, in a meeting's ⋯ menu on the Meetings tab. */
  const meetingMenu = (r: MeetingRecord): MenuEntry[] =>
    r.call
      ? [
          {
            label: "Call back",
            icon: Phone,
            disabled: !r.call.peerId || r.id === overview.activeId,
            onSelect: () =>
              void start({ kind: "call", peerId: r.call!.peerId, peerName: r.call!.peerName, camera: false }),
          },
        ]
      : [
          {
            label: "Open in Teams",
            icon: SquareArrowOutUpRight,
            onSelect: () => void run(() => call("app.openExternal", { url: r.joinUrl })),
          },
        ];
  const Icon = TABS[section].icon;
  return (
    <div data-testid="meeting-lobby" className="flex h-screen flex-col bg-canvas text-fg">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-titlebar px-4">
        <Icon className="size-4 shrink-0 text-accent" />
        <h1 className="shrink-0 text-sm font-semibold">{TABS[section].title}</h1>
        <AccountLabel overview={overview} />
        <Button icon={Settings} onClick={() => setSettings(true)}>
          Connection
        </Button>
        <Button icon={Phone} disabled={!connected} onClick={() => setCalling(true)}>
          Call…
        </Button>
        <Button
          variant="primary"
          icon={Link2}
          onClick={() => void start({ kind: "join", title: "Teams meeting", url: "" })}
        >
          Join from link…
        </Button>
      </header>
      <div className="flex min-h-0 flex-1">
        {/* The rail, like Teams': always there, so switching sections moves nothing. */}
        <nav
          aria-label="Sections"
          className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-line bg-surface py-2"
        >
          {MEETINGS_TABS.map((id) => {
            const { title, icon: TabIcon } = TABS[id];
            return (
              <button
                key={id}
                type="button"
                aria-label={title}
                aria-current={section === id ? "page" : undefined}
                onClick={() => setSection(id)}
                className={cn(
                  "relative flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-md text-2xs",
                  section === id ? "bg-active text-accent" : "text-muted hover:bg-hover hover:text-fg",
                )}
              >
                <TabIcon className="size-5" />
                {title}
                <CountBadge count={id === "chats" ? unread : 0} className="absolute top-1 right-1.5" />
              </button>
            );
          })}
        </nav>
        {section === "chats" ? (
          <ChatsView
            list={chatList}
            loading={chatsLoading}
            connected={connected}
            layout={layout}
            open={teamsChat}
            pins={overview.chatPins}
            onResize={resize}
            onOpen={(c) => {
              setTeamsChat(c);
              // Opening it reads it (main counts it as read from then on, D-296).
              setChatList(
                (l) =>
                  l && { ...l, chats: l.chats.map((x) => (x.id === c.id ? { ...x, unread: false } : x)) },
              );
            }}
            onPin={(chatId, pinned) => {
              // At once here; main keeps them and tells the call window (meetings.changed).
              setOverview((o) => o && { ...o, chatPins: setPin(o.chatPins, chatId, pinned) });
              void call("meetings.chatPin", { chatId, pinned }).catch((e) => {
                setError(errorMessage(e));
                void reload();
              });
            }}
            onNewChat={() => setNewChat([])}
            onRefresh={() => void loadChats()}
            onConnectAccount={() => setSettings(true)}
            onConnectChat={async () => {
              try {
                await call("meetings.chatConnect");
              } catch (e) {
                setError(errorMessage(e));
              }
              await loadChats();
            }}
            onSent={() => void loadChats()}
            onError={setError}
          />
        ) : section === "meetings" ? (
          <MeetingHistory
            projects={projects}
            boards={overview.boards}
            layout={layout}
            onResize={resize}
            onTranscript={(shown) => changeLayout((l) => setHistoryTranscript(l, shown))}
            target={target}
            extraMenu={meetingMenu}
          />
        ) : (
          <Lobby
            view={overview.lobbyView}
            onView={(view) => {
              setOverview((current) => (current ? { ...current, lobbyView: view } : current));
              void call("meetings.lobbyView", { view }).catch((e) => {
                setError(errorMessage(e));
                void reload();
              });
            }}
            events={events}
            loading={pending === "calendar"}
            connected={connected}
            onRefresh={() => void refreshCalendar()}
            onConnect={() => setSettings(true)}
            onJoin={(event) => void start({ kind: "join", title: event.title, url: event.joinUrl! })}
            onJoinLink={() => void start({ kind: "join", title: "Teams meeting", url: "" })}
          />
        )}
      </div>
      <StatusBar error={error} onDismiss={() => setError("")}>
        {/* The live call, one click away; the same spot says "No call" between calls. */}
        {live ? (
          <button
            type="button"
            data-testid="lobby-live-call"
            className="flex min-w-0 items-center gap-2 rounded-sm text-fg hover:text-accent"
            title={live.call ? "Show the call" : "Show the meeting"}
            onClick={() => void start({ kind: "show" })}
          >
            <span className="size-2 shrink-0 rounded-full bg-danger" />
            <span className="truncate">
              {live.call ? "In a call" : "In a meeting"}: {live.title}
            </span>
            <span className="shrink-0 text-accent">{live.call ? "Show call" : "Show meeting"}</span>
          </button>
        ) : (
          <>
            <span className="size-2 shrink-0 rounded-full bg-hint" />
            <span className="min-w-0 truncate text-muted">No call</span>
          </>
        )}
        <span className="ml-auto hidden shrink-0 truncate text-hint sm:inline">
          Meetings are global · switching projects won't interrupt a call
        </span>
      </StatusBar>
      {calling && (
        <CallDialog
          records={overview.records}
          onClose={() => setCalling(false)}
          onChat={chatWith}
          onNewChat={(person) => {
            setCalling(false);
            setSection("chats");
            setNewChat([person]);
          }}
          onCall={async (person, options) => {
            setCalling(false);
            await start({ kind: "call", peerId: person.id, peerName: person.name, camera: options.camera });
          }}
        />
      )}
      {newChat && (
        <NewChatDialog
          initial={newChat}
          onClose={() => setNewChat(undefined)}
          onStarted={(chat) => {
            setNewChat(undefined);
            setSection("chats");
            setTeamsChat(chat);
            void loadChats();
          }}
        />
      )}
      {settings && (
        <Connection
          settings={overview.settings}
          account={overview.account}
          fake={overview.fake}
          ringing={overview.ringing}
          onRinging={(on) => void run(() => call("meetings.setRinging", { on }), "connection")}
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
      <ToastHost />
    </div>
  );
}
