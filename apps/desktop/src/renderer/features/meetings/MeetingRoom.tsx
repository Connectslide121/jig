import {
  AudioLines,
  EyeOff,
  LayoutPanelLeft,
  MessageSquare,
  PanelBottom,
  PanelLeft,
  PanelRight,
  RotateCcw,
  Video,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_MEETING_LAYOUT,
  LOBBY_SIZES,
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
import {
  AI_CAPTION_LANGUAGES,
  type MeetingCall,
  type MeetingRecord,
  type MeetingStart,
} from "../../../shared/meetings";
import { call, errorMessage, useHostEvent } from "../../lib/host";
import { updateConfig, useConfig } from "../../stores/config";
import { Button, cn, Empty, type MenuEntry, openMenuAt, Select, Spinner } from "../../ui";
import { IncomingCall } from "./Calls";
import { ChatPanel, type ChatStatus } from "./Chat";
import { Ask, DevicePicker, Prejoin, Review, ShareSources } from "./dialogs";
import { SPEECH_LANGUAGES } from "./format";
import { INITIAL_MEDIA, type MediaState, MeetingMedia, type Ringing, selfPerson } from "./media";

/** Captions of a call follow the system language when Teams supports it. */
const callLanguage = () =>
  SPEECH_LANGUAGES.find(([code]) => code === navigator.language.toLowerCase())?.[0] ?? "en-us";

import { NotesPanel, PeoplePanel, TranscriptPanel } from "./Panels";
import { AccountLabel, MeetingsShell, StatusBar, useConfigStore, useMeetingsData } from "./Shell";
import { Slot } from "./Slots";
import { Stage } from "./Stage";

const SLOT_ICONS: Record<MeetingSlot, typeof PanelLeft> = {
  left: PanelLeft,
  right: PanelRight,
  bottom: PanelBottom,
};

export function MeetingRoom(): React.JSX.Element {
  return (
    <MeetingsShell label="Meeting room">
      <Room />
    </MeetingsShell>
  );
}

/**
 * The call window (D-217, D-292): device check before joining, the live call (in the middle,
 * Transcript, Notes, Chat and People in slots you arrange) and calls ringing. The lobby lives in its
 * own window; this one waits hidden between calls and is the only one with the calling SDK.
 */
function Room() {
  const { overview, projects, error, setError, pending, setPending, reload, run, connected } =
    useMeetingsData();
  const [layout, setLayout] = useState<MeetingLayout>();
  const [starting, setStarting] = useState(false);
  const [devicePicker, setDevicePicker] = useState(false);
  const [joining, setJoining] = useState<{ url: string; title: string }>();
  const [ask, setAsk] = useState(false);
  const [review, setReview] = useState(false);
  const [sharing, setSharing] = useState<Array<{ id: string; name: string; thumbnail: string }>>();
  const [mediaState, setMediaState] = useState<MediaState>(INITIAL_MEDIA);
  const [ringing, setRinging] = useState<Ringing>();
  const media = useRef<MeetingMedia | null>(null);
  media.current ??= new MeetingMedia((e) => setError(errorMessage(e)));
  useEffect(() => media.current!.subscribe(setMediaState), []);
  // Transcribe on this computer when Teams captions aren't available (D-321).
  useConfigStore();
  const localTranscription = useConfig((s) => s.config?.meetings.localTranscription ?? true);
  useEffect(() => media.current!.setLocalTranscription(localTranscription), [localTranscription]);
  // Noise suppression on your microphone (D-322); a change applies to the call at once.
  const noiseSuppression = useConfig((s) => s.config?.meetings.noiseSuppression ?? true);
  useEffect(() => media.current!.setNoiseSuppression(noiseSuppression), [noiseSuppression]);
  const toggleNoiseSuppression = () =>
    void updateConfig({ meetings: { noiseSuppression: !noiseSuppression } }).catch((e) =>
      setError(errorMessage(e)),
    );
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
    saveTimer.current = setTimeout(() => {
      // The lobby window's sizes (review notes, chat list) are its own: keep what it saved meanwhile.
      void call("meetings.overview")
        .then((o) => {
          const saved = normalizeMeetingLayout(o.layout).sizes;
          const sizes = { ...next.sizes };
          for (const key of LOBBY_SIZES)
            if (saved[key] === undefined) delete sizes[key];
            else sizes[key] = saved[key];
          return call("meetings.layout", { ...next, sizes });
        })
        .catch((e) => setError(errorMessage(e)));
    }, 300);
  };
  // Teams calls ring here while Jig runs and ringing is on (D-254); the window may be hidden meanwhile.
  const listen = Boolean(overview && connected && overview.ringing);
  const fakeService = Boolean(overview?.fake);
  useEffect(() => {
    const m = media.current!;
    if (!listen) {
      void m.stopListening();
      return;
    }
    void m
      .listen((r) => {
        setRinging(r);
        void call("meetings.incoming", { name: r?.name }).catch(() => {});
      }, fakeService)
      .catch((e) => setError(`Jig can't ring for Teams calls: ${errorMessage(e)}`));
    // The test meeting service rings on request, so the e2e tests can answer a call; and makes Teams
    // captions unavailable, so they can see the local transcript take over.
    if (fakeService)
      Object.assign(window, {
        jigTestRing: (name: string) => m.fakeRing(name),
        jigTestCaptionsUnavailable: () => m.fakeCaptionsUnavailable(),
      });
  }, [listen, fakeService, setError]);
  // Your caption language from last time applies to the next call (D-260).
  const savedLanguage = overview?.captionLanguage;
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the saved choice changes.
  useEffect(() => {
    if (savedLanguage !== undefined && savedLanguage !== mediaState.captionLanguage)
      void media.current!.setCaptionLanguage(savedLanguage).catch((e) => setError(errorMessage(e)));
  }, [savedLanguage]);
  // Devices picked last time apply to calls too, not only to meetings joined from the dialog (D-323).
  const savedDevices = overview ? JSON.stringify(overview.devices) : undefined;
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the saved picks change.
  useEffect(() => {
    if (overview) media.current!.remember(overview.devices);
  }, [savedDevices]);
  // The window's title says what it is (the page's own title would just say "Jig").
  const liveTitle = overview?.records.find((r) => r.id === overview.activeId)?.title;
  useEffect(() => {
    document.title = liveTitle ? `${liveTitle} · Jig Meetings` : "Jig Call";
  }, [liveTitle]);
  /** Places or answers a one-to-one call; a meeting or call in progress ends first. */
  const startCall = async (peer: MeetingCall, options: { camera: boolean }, answering = false) => {
    setError("");
    setStarting(true);
    try {
      if (overview?.activeId) await media.current!.leave();
      const r = await call("meetings.startCall", peer);
      const callOptions = {
        muted: false,
        camera: options.camera,
        language: callLanguage(),
        fake: fakeService,
      };
      if (answering) await media.current!.answer(r, callOptions);
      else await media.current!.callPerson(r, peer.peerId, callOptions);
    } catch (e) {
      setError(errorMessage(e));
    }
    await reload().catch(() => undefined);
    setStarting(false);
  };
  // What the lobby asked for (D-292): taken once the overview is here, at start and on each request.
  const loaded = Boolean(overview);
  const take = async () => {
    let next: MeetingStart | null;
    try {
      next = await call("meetings.takeStart");
    } catch (e) {
      setError(errorMessage(e));
      return;
    }
    if (next?.kind === "join") setJoining({ url: next.url, title: next.title });
    else if (next?.kind === "call")
      await startCall(
        { peerId: next.peerId, peerName: next.peerName, direction: "outgoing" },
        { camera: next.camera },
      );
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: once the overview has loaded.
  useEffect(() => {
    if (loaded) void take();
  }, [loaded]);
  useHostEvent("meetings.startRequested", () => {
    if (loaded) void take();
  });
  // With nothing left to show (no call, device check or ringing), main hides the window again; an
  // error stays on screen until it is dismissed.
  const busy = Boolean(joining || ringing || starting || overview?.activeId);
  const wasBusy = useRef(false);
  useEffect(() => {
    if (busy) {
      wasBusy.current = true;
      return;
    }
    if (!wasBusy.current || error) return;
    wasBusy.current = false;
    void call("meetings.callIdle").catch(() => {});
  }, [busy, error]);
  const openChat = (sessionId: string) => call("meetings.revealChat", { sessionId });
  // The meeting's Teams chat (D-270): read every 5 seconds while you're in a meeting or call, also
  // with the Chat panel hidden, so the notes see it too.
  const [chatStatus, setChatStatus] = useState<ChatStatus>();
  const activeId = overview?.activeId;
  useEffect(() => {
    setChatStatus(undefined);
    if (!activeId) return;
    let live = true;
    const read = () =>
      void call("meetings.chat", { id: activeId })
        .then((s) => live && setChatStatus(s))
        .catch((e) => live && setChatStatus({ state: "ok", error: errorMessage(e) }));
    read();
    const timer = setInterval(read, 5000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [activeId]);
  if (!overview || !layout)
    return (
      <div className="h-screen bg-canvas text-fg">
        <Spinner center />
      </div>
    );
  const active = overview.records.find((r) => r.id === overview.activeId);
  const record = active;
  const captionTrouble = active && /unavailable|stopped|not ready|locally/i.test(active.capture);
  // Why: the latest notice in the transcript (the real error from Teams), as the status's tooltip.
  const captionReason = captionTrouble ? active.gaps.at(-1)?.reason : undefined;
  const resize = (key: MeetingSizeKey, size: number) => changeLayout(resizeSlot(layout, key, size));
  const panelMenu = (id: MeetingPanelId): MenuEntry[] => [
    ...(id === "transcript"
      ? ([
          {
            label: "Transcribe on this computer without Teams captions",
            icon: AudioLines,
            checked: localTranscription,
            onSelect: () =>
              void updateConfig({ meetings: { localTranscription: !localTranscription } }).catch((e) =>
                setError(errorMessage(e)),
              ),
          },
          { separator: true },
        ] satisfies MenuEntry[])
      : []),
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
  // Teams' languages, and the ones Claude translates into when Teams can't (D-277).
  const captionLanguages = [
    ...mediaState.captionLanguages,
    ...AI_CAPTION_LANGUAGES.filter((c) => !mediaState.captionLanguages.some((t) => t.toLowerCase() === c)),
  ];
  // "Swedish" rather than "Swedish (Sweden)", unless two variants of a language are offered.
  const languageName = (code: string) => {
    const base = code.split("-")[0]!;
    const shared = captionLanguages.filter((c) => c.split("-")[0] === base).length > 1;
    try {
      return (
        new Intl.DisplayNames([navigator.language], { type: "language" }).of(shared ? code : base) ?? code
      );
    } catch {
      return code;
    }
  };
  const askButton = (
    <>
      {/*
        Captions in your language: Teams translates (Teams Premium), or else Claude (D-277); the
        original stays under it.
      */}
      <Select
        aria-label="Show captions in"
        title="Show captions in another language: Teams translates with Teams Premium, otherwise Claude does"
        className="h-7 w-40 text-xs"
        value={mediaState.captionLanguage}
        onChange={(e) => {
          const language = e.target.value;
          void run(async () => {
            await call("meetings.captionLanguage", { language });
            await media.current!.setCaptionLanguage(language);
          });
        }}
        data-testid="caption-language"
      >
        <option value="">As spoken</option>
        {captionLanguages.map((code) => (
          <option key={code} value={code}>
            {languageName(code)}
          </option>
        ))}
      </Select>
      <Button size="sm" icon={MessageSquare} onClick={() => setAsk(true)}>
        Ask Claude
      </Button>
    </>
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
          </>
        ) : (
          <>
            <Video className="size-4 shrink-0 text-accent" />
            <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">Call</h1>
          </>
        )}
        <AccountLabel overview={overview} />
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
                slot={(key) => media.current!.slot(key)}
                peopleOpen={!layout.panels.people.hidden}
                onPeople={() => changeLayout(setPanelHidden(layout, "people", !layout.panels.people.hidden))}
                onMute={() => void run(() => media.current!.mute())}
                onCamera={() => void run(() => media.current!.camera())}
                onShare={() =>
                  void run(async () => {
                    if (mediaState.sharing) await media.current!.share();
                    else setSharing(await call("meetings.shareSources"));
                  })
                }
                onDevices={() => setDevicePicker(true)}
                onNoiseSuppression={toggleNoiseSuppression}
                leaveLabel={active.call ? "Hang up" : "Leave"}
                onRetryCaptions={() => void run(() => media.current!.startCaptions())}
                onLeave={() =>
                  void run(async () => {
                    await media.current!.leave();
                  })
                }
              />
            </div>
            <Slot slot="bottom" layout={layout} onResize={resize} render={(id) => panel(id)} />
          </div>
          <Slot slot="right" layout={layout} onResize={resize} render={(id) => panel(id)} />
        </main>
      ) : (
        <main className="flex min-h-0 flex-1 items-center justify-center">
          {starting || pending === "join" ? (
            <Spinner center />
          ) : (
            <Empty icon={Video} title="No call">
              <p>Join a meeting or call someone from the Meetings lobby.</p>
              <Button
                className="mt-3"
                onClick={() =>
                  void run(async () => {
                    await call("meetings.open");
                    await call("meetings.callIdle");
                  })
                }
              >
                Open Meetings
              </Button>
            </Empty>
          )}
        </main>
      )}
      <StatusBar error={error} onDismiss={() => setError("")}>
        <span
          className={cn(
            "size-2 shrink-0 rounded-full",
            active ? (mediaState.state === "Connected" ? "bg-success" : "bg-warning") : "bg-hint",
          )}
        />
        <span className="min-w-0 truncate text-muted" title={captionReason}>
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
        <span className="ml-auto hidden shrink-0 truncate text-hint md:inline">
          Meetings are global · switching projects won't interrupt a call
        </span>
      </StatusBar>
      {ringing && (
        <IncomingCall
          ringing={ringing}
          inCall={Boolean(overview.activeId)}
          onDecline={() => media.current!.declineRinging()}
          onAnswer={(options) => {
            const r = ringing;
            setRinging(undefined);
            void call("meetings.incoming", {}).catch(() => {});
            void startCall(
              { peerId: r.peerId ?? "", peerName: r.name, direction: "incoming" },
              options,
              true,
            );
          }}
        />
      )}
      {devicePicker && (
        <DevicePicker
          media={media.current}
          fake={overview.fake}
          noiseSuppression={mediaState.noiseSuppression}
          onNoiseSuppression={toggleNoiseSuppression}
          onClose={() => setDevicePicker(false)}
          onError={(e) => setError(errorMessage(e))}
        />
      )}
      {joining && (
        <Prejoin
          meeting={joining}
          fake={overview.fake}
          remembered={overview.devices}
          media={media.current}
          busy={pending === "join"}
          onClose={() => setJoining(undefined)}
          onError={(e) => setError(errorMessage(e))}
          onJoin={async (meeting, options) => {
            setPending("join");
            setError("");
            let r: MeetingRecord;
            try {
              // A rejected link or host error stays in the still-open pre-join modal (D-222).
              r = await call("meetings.join", meeting);
            } finally {
              setPending(undefined);
            }
            // From here the modal is gone, so call failures show in the room (D-234).
            setJoining(undefined);
            try {
              await media.current!.join(r, { ...options, fake: overview.fake });
            } catch (error) {
              setError(errorMessage(error));
            }
            await reload();
          }}
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
    if (id === "people")
      return <PeoplePanel people={mediaState.people} you={selfPerson(mediaState)} menu={panelMenu(id)} />;
    if (id === "chat")
      return (
        <ChatPanel
          messages={r.chat ?? []}
          status={chatStatus}
          menu={panelMenu(id)}
          onConnect={async () => {
            try {
              await call("meetings.chatConnect");
              setChatStatus(await call("meetings.chat", { id: r.id }));
            } catch (e) {
              setError(errorMessage(e));
            }
          }}
          onSend={async (text) => {
            try {
              await call("meetings.chatSend", { id: r.id, text });
            } catch (e) {
              setError(errorMessage(e));
              throw e;
            }
          }}
        />
      );
    return id === "transcript" ? (
      <TranscriptPanel record={r} live menu={panelMenu(id)} actions={askButton} />
    ) : (
      notes(r, panelMenu(id))
    );
  }
}
