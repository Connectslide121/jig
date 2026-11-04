import {
  ArrowLeft,
  CalendarDays,
  Link2,
  MessageSquare,
  MessagesSquare,
  MoreHorizontal,
  Phone,
  Settings,
  SquareArrowOutUpRight,
  Trash2,
  Video,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { setPin } from "../../../shared/meetingChatList";
import {
  type MeetingLayout,
  type MeetingSizeKey,
  normalizeMeetingLayout,
  resizeSlot,
} from "../../../shared/meetingLayout";
import type { MeetingEvent, MeetingPerson, MeetingRecord, MeetingStart } from "../../../shared/meetings";
import { call, errorMessage, useHostEvent } from "../../lib/host";
import { Badge, Button, CountBadge, cn, confirmDialog, IconButton, openMenuAt, Spinner } from "../../ui";
import { CallDialog } from "./Calls";
import { type ChatList, ChatsView, type OpenChat } from "./Chats";
import { Ask, Connection, Review } from "./dialogs";
import { clock, dayAndTime } from "./format";
import { Lobby, STATUS } from "./Lobby";
import { NewChatDialog } from "./NewChat";
import { NotesPanel, TranscriptPanel } from "./Panels";
import { AccountLabel, MeetingsShell, StatusBar, useMeetingsData } from "./Shell";
import { SizedBox } from "./Slots";

export function MeetingLobby(): React.JSX.Element {
  return (
    <MeetingsShell label="Meetings lobby">
      <LobbyWindow />
    </MeetingsShell>
  );
}

/**
 * The Meetings lobby window (D-292): upcoming meetings, the history and a saved meeting's review. It
 * stays usable beside a running call; joining and calling happen in the call window, which this asks
 * main to bring up. It never receives the calling credential.
 */
function LobbyWindow() {
  const { overview, setOverview, projects, error, setError, pending, reload, run, connected } =
    useMeetingsData();
  const [events, setEvents] = useState<MeetingEvent[]>();
  const [opened, setOpened] = useState<string | undefined>(
    () => new URLSearchParams(window.location.search).get("review") ?? undefined,
  );
  const [layout, setLayout] = useState<MeetingLayout>();
  const [settings, setSettings] = useState(false);
  const [calling, setCalling] = useState(false);
  const [ask, setAsk] = useState(false);
  const [review, setReview] = useState(false);
  /** The lobby's two sections, from the rail on the left: meetings, or your Teams chats (D-296). */
  const [section, setSection] = useState<"meetings" | "chats">("meetings");
  const [chatList, setChatList] = useState<ChatList>();
  const [chatsLoading, setChatsLoading] = useState(false);
  const [teamsChat, setTeamsChat] = useState<OpenChat>();
  /** New chat (D-332), open with the people it starts with. */
  const [newChat, setNewChat] = useState<MeetingPerson[]>();
  // A call that just ended: its review opens here (main brings this window to the front).
  useHostEvent("meetings.review", ({ id }) => {
    setSection("meetings");
    setOpened(id);
    setAsk(false);
    setReview(false);
  });
  useEffect(() => {
    document.title = "Jig Meetings";
  }, []);
  // The review's notes width; the call window keeps the rest of the layout (it is saved together).
  useEffect(() => {
    if (overview && !layout) setLayout(normalizeMeetingLayout(overview.layout));
  }, [overview, layout]);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const resize = (key: MeetingSizeKey, size: number) => {
    if (!layout) return;
    setLayout(resizeSlot(layout, key, size));
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      // Starts from the saved layout, so panels the call window moved meanwhile stay where they are.
      void call("meetings.overview")
        .then((o) => call("meetings.layout", resizeSlot(normalizeMeetingLayout(o.layout), key, size)))
        .catch((e) => setError(errorMessage(e)));
    }, 300);
  };
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
  const shown = section === "meetings" ? overview.records.find((r) => r.id === opened) : undefined;
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
  const openChat = (sessionId: string) => call("meetings.revealChat", { sessionId });
  const remove = async (r: MeetingRecord) => {
    const ok = await confirmDialog({
      title: `Delete "${r.title}"?`,
      message:
        "Deletes its transcript, notes and actions from this computer. Chats where you already asked Claude about it keep what Claude read there.",
      confirmLabel: "Delete meeting",
      danger: true,
    });
    if (!ok) return;
    await run(async () => {
      await call("meetings.delete", { id: r.id });
      if (opened === r.id) setOpened(undefined);
    });
  };
  return (
    <div data-testid="meeting-lobby" className="flex h-screen flex-col bg-canvas text-fg">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-titlebar px-4">
        {shown ? (
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
            {shown.call ? (
              <Button
                icon={Phone}
                disabled={!shown.call.peerId || shown.id === overview.activeId}
                onClick={() =>
                  void start({
                    kind: "call",
                    peerId: shown.call!.peerId,
                    peerName: shown.call!.peerName,
                    camera: false,
                  })
                }
              >
                Call back
              </Button>
            ) : (
              <Button
                icon={SquareArrowOutUpRight}
                onClick={() => void run(() => call("app.openExternal", { url: shown.joinUrl }))}
              >
                Open in Teams
              </Button>
            )}
            <IconButton
              icon={MoreHorizontal}
              label="Meeting options"
              onClick={(e) =>
                openMenuAt(
                  e.currentTarget,
                  [
                    {
                      label: "Delete meeting…",
                      icon: Trash2,
                      danger: true,
                      disabled: shown.id === overview.activeId,
                      onSelect: () => void remove(shown),
                    },
                  ],
                  true,
                )
              }
            />
          </>
        ) : (
          <>
            {section === "chats" ? (
              <MessagesSquare className="size-4 shrink-0 text-accent" />
            ) : (
              <Video className="size-4 shrink-0 text-accent" />
            )}
            <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">
              {section === "chats" ? "Chats" : "Meetings"}
            </h1>
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
          </>
        )}
      </header>
      <div className="flex min-h-0 flex-1">
        {/* The rail, like Teams': always there, so switching sections moves nothing. */}
        <nav
          aria-label="Sections"
          className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-line bg-surface py-2"
        >
          {(
            [
              ["meetings", "Meetings", CalendarDays, 0],
              ["chats", "Chats", MessagesSquare, unread],
            ] as const
          ).map(([id, label, Icon, count]) => (
            <button
              key={id}
              type="button"
              aria-label={label}
              aria-current={section === id ? "page" : undefined}
              onClick={() => setSection(id)}
              className={cn(
                "relative flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-md text-2xs",
                section === id ? "bg-active text-accent" : "text-muted hover:bg-hover hover:text-fg",
              )}
            >
              <Icon className="size-5" />
              {label}
              <CountBadge count={count} className="absolute top-1 right-1.5" />
            </button>
          ))}
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
        ) : shown ? (
          <main className="flex min-h-0 min-w-0 flex-1">
            {/* The transcript keeps a readable width; the notes give way in a narrow window. */}
            <div className="flex min-w-72 flex-1">
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
              <NotesPanel
                record={shown}
                busy={pending === "notes"}
                onGenerateNotes={() =>
                  void run(async () => {
                    const chat = await call("meetings.notes", { id: shown.id });
                    await openChat(chat.sessionId);
                  }, "notes")
                }
                onReview={() => setReview(true)}
              />
            </SizedBox>
          </main>
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
            records={overview.records}
            folders={overview.folders}
            onError={setError}
            loading={pending === "calendar"}
            connected={connected}
            onRefresh={() => void refreshCalendar()}
            onConnect={() => setSettings(true)}
            onJoin={(event) => void start({ kind: "join", title: event.title, url: event.joinUrl! })}
            onJoinLink={() => void start({ kind: "join", title: "Teams meeting", url: "" })}
            onOpen={(id) => (id === overview.activeId ? void start({ kind: "show" }) : setOpened(id))}
            onDelete={(id) => {
              const r = overview.records.find((x) => x.id === id);
              if (r) void remove(r);
            }}
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
      {ask && shown && (
        <Ask
          record={shown}
          projects={projects}
          busy={pending === "ask"}
          onClose={() => setAsk(false)}
          onAsk={(question, projectId) =>
            run(async () => {
              const chat = await call("meetings.ask", { id: shown.id, question, projectId });
              await openChat(chat.sessionId);
              setAsk(false);
            }, "ask")
          }
        />
      )}
      {review && shown && (
        <Review
          record={shown}
          projects={projects}
          busy={pending === "queue"}
          onClose={() => setReview(false)}
          onQueue={(actions, actionIds) =>
            run(async () => {
              await call("meetings.actions", { id: shown.id, actions });
              await call("meetings.queue", { id: shown.id, actionIds });
              setReview(false);
            }, "queue")
          }
        />
      )}
    </div>
  );
}
