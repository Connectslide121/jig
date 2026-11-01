import {
  CalendarDays,
  FileText,
  MessageSquare,
  Mic,
  MonitorUp,
  PhoneOff,
  RefreshCw,
  Settings,
  Video,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  MeetingAction,
  MeetingEvent,
  MeetingOverview,
  MeetingRecord,
  MeetingSettings,
} from "../../../shared/meetings";
import type { ProjectsState } from "../../../shared/projects";
import { call, errorMessage, useHostEvent } from "../../lib/host";
import { useThemeController } from "../../lib/theme";
import {
  Button,
  Dialog,
  ErrorBoundary,
  Input,
  Markdown,
  MenuHost,
  Select,
  Spinner,
  Textarea,
} from "../../ui";
import { Pane } from "../../workbench/Pane";
import { ProjectSwatch } from "../projects/colors";
import { type MediaState, MeetingMedia } from "./media";

const EMPTY_PROJECTS: ProjectsState = { projects: [], workspaces: [], activeId: undefined };
const time = (value: string) =>
  new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

export function MeetingRoom(): React.JSX.Element {
  useThemeController();
  return (
    <ErrorBoundary label="Meeting room">
      <Room />
      <MenuHost />
    </ErrorBoundary>
  );
}

function Room() {
  const [overview, setOverview] = useState<MeetingOverview>();
  const [projects, setProjects] = useState<ProjectsState>(EMPTY_PROJECTS);
  const [events, setEvents] = useState<MeetingEvent[]>([]);
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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
  const transcriptContainer = useRef<HTMLDivElement>(null);
  const followingTranscript = useRef(true);
  const previousTranscript = useRef<string | undefined>(undefined);
  const reload = useCallback(async () => {
    const version = ++refreshed.current;
    const data = await call("meetings.overview");
    if (version === refreshed.current) setOverview(data);
  }, []);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
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
  const active = overview?.records.find((r) => r.id === overview.activeId);
  const record =
    overview?.records.find((r) => r.id === (selected ?? overview.activeId)) ?? overview?.records[0];
  const lastCaption = record?.captions.at(-1);
  useEffect(() => {
    if (!lastCaption?.id || !lastCaption.text) return;
    if (previousTranscript.current !== record?.id) followingTranscript.current = true;
    previousTranscript.current = record?.id;
    const container = transcriptContainer.current;
    if (container && followingTranscript.current) container.scrollTop = container.scrollHeight;
  }, [record?.id, lastCaption?.id, lastCaption?.text]);
  const refreshCalendar = () =>
    run(async () => {
      setEvents(await call("meetings.calendar"));
    });
  const openChat = async (sessionId: string) => {
    await call("meetings.revealChat", { sessionId });
  };
  if (!overview)
    return (
      <div className="h-screen bg-base text-fg">
        <Spinner center />
      </div>
    );
  return (
    <div data-testid="meeting-room" className="flex h-screen flex-col bg-base text-fg">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
        <Video className="size-5 text-accent" />
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold">
          {active ? active.title : "Meetings"}
        </h1>
        <span className="w-56 truncate text-right text-sm text-muted">
          {overview.fake ? "Test meeting service" : (overview.account ?? "Microsoft not connected")}
        </span>
        <Button icon={Settings} onClick={() => setSettings(true)} disabled={Boolean(active)}>
          Connection
        </Button>
      </header>
      <div
        role="status"
        className="flex h-12 shrink-0 items-center overflow-auto border-b border-line px-4 text-sm text-warning"
      >
        {error ||
          (active
            ? `${mediaState.state} · ${active.capture}${mediaState.sharing ? " · Sharing your screen" : ""}`
            : "Meetings are global. You can change projects without interrupting a call.")}
      </div>
      <main className="flex min-h-0 flex-1">
        <Pane
          id="addon.meetings.agenda"
          edge="right"
          defaultSize={300}
          min={240}
          max={500}
          className="flex flex-col border-r border-line"
        >
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
            <CalendarDays className="size-4" />
            <span className="flex-1 text-sm font-semibold">Upcoming · 14 days</span>
            <Button
              icon={RefreshCw}
              busy={busy}
              onClick={() => void refreshCalendar()}
              aria-label="Refresh calendar"
            />
          </div>
          <div className="flex h-12 shrink-0 items-center gap-2 px-3">
            <Button
              variant="primary"
              disabled={Boolean(active)}
              onClick={() => setJoining({ title: "Teams meeting", url: "" })}
            >
              Join from link…
            </Button>
            <Button
              disabled={!active}
              onClick={() => {
                setSelected(active?.id);
              }}
            >
              Current
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {!events.length && (
              <p className="p-3 text-sm text-muted">
                Refresh your calendar after connecting Microsoft, or join from a meeting link.
              </p>
            )}
            {events.map((event) => (
              <div key={event.id} className="flex h-20 items-center gap-2 border-b border-line px-3">
                <div className="w-12 shrink-0 text-right text-sm tabular-nums">{time(event.start)}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm" title={event.title}>
                    {event.title}
                  </div>
                  <div className="truncate text-xs text-muted">
                    {new Date(event.start).toLocaleDateString()} · {event.organizer}
                  </div>
                </div>
                <div className="w-12 shrink-0">
                  {event.joinUrl && (
                    <Button
                      size="sm"
                      disabled={Boolean(active)}
                      onClick={() => setJoining({ title: event.title, url: event.joinUrl! })}
                    >
                      Join
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <div className="flex h-12 items-center border-b border-line px-3 text-sm font-semibold">
              Saved meetings
            </div>
            {overview.records.map((r) => (
              <button
                type="button"
                key={r.id}
                onClick={() => setSelected(r.id)}
                className="flex h-16 w-full items-center gap-2 border-b border-line px-3 text-left hover:bg-hover"
              >
                <FileText className="size-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{r.title}</span>
                  <span className="block truncate text-xs text-muted">
                    {new Date(r.startedAt).toLocaleString()}
                  </span>
                </span>
                <span className="w-20 shrink-0 text-right text-xs text-muted">{r.status}</span>
              </button>
            ))}
          </div>
        </Pane>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative flex h-64 shrink-0 flex-col border-b border-line p-3">
            <div ref={attachCanvas} className="flex min-h-0 flex-1 gap-2 overflow-hidden" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted">
              {!active
                ? "Join a Teams meeting to see video and shared content here."
                : mediaState.hasVideo
                  ? ""
                  : !mediaState.participants.length
                    ? "Waiting for participants"
                    : mediaState.participants.join(" · ")}
            </div>
          </div>
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
              <Button icon={Mic} disabled={!active} onClick={() => void run(() => media.current!.mute())}>
                {mediaState.muted ? "Unmute" : "Mute"}
              </Button>
              <Button
                icon={Settings}
                disabled={!active || overview.fake}
                onClick={() => setDevicePicker(true)}
              >
                Devices
              </Button>
              <Button
                icon={Video}
                disabled={!active || overview.fake}
                onClick={() => void run(() => media.current!.camera())}
              >
                {mediaState.camera ? "Camera off" : "Camera on"}
              </Button>
              <Button
                icon={MonitorUp}
                disabled={!active}
                variant={mediaState.sharing ? "primary" : "secondary"}
                onClick={() =>
                  void run(async () => {
                    if (mediaState.sharing) await media.current!.share();
                    else setSharing(await call("meetings.shareSources"));
                  })
                }
              >
                {mediaState.sharing ? "Stop sharing" : "Share screen"}
              </Button>
              <Button
                disabled={!active || overview.fake}
                onClick={() => void run(() => media.current!.startCaptions())}
              >
                Retry captions
              </Button>
            </div>
            <Button
              icon={PhoneOff}
              variant="danger"
              disabled={!active}
              onClick={() => void run(() => media.current!.leave())}
            >
              Leave
            </Button>
          </div>
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
              {record?.title ?? "Transcript"}
            </span>
            <Button icon={MessageSquare} disabled={!record} onClick={() => setAsk(true)}>
              Ask Claude
            </Button>
            <Button
              disabled={!record || busy}
              onClick={() =>
                void run(async () => {
                  const chat = await call("meetings.notes", { id: record!.id });
                  await openChat(chat.sessionId);
                })
              }
            >
              Generate notes
            </Button>
            <Button disabled={!record?.actions.length} onClick={() => setReview(true)}>
              Review actions
            </Button>
            <Button
              disabled={!record || Boolean(active)}
              onClick={() => void run(() => call("app.openExternal", { url: record!.joinUrl }))}
            >
              Open in Teams
            </Button>
          </div>
          <div className="flex min-h-0 flex-1">
            <div
              data-testid="meeting-transcript"
              ref={transcriptContainer}
              onScroll={() => {
                const container = transcriptContainer.current;
                if (container)
                  followingTranscript.current =
                    container.scrollHeight - container.scrollTop - container.clientHeight < 32;
              }}
              className="min-w-0 flex-1 overflow-y-auto p-4"
            >
              {!record?.captions.length && (
                <p className="text-sm text-muted">
                  Captions will appear here as people speak. No audio recording is saved.
                </p>
              )}
              {record?.captions.map((c) => (
                <div key={c.id} className="mb-3 flex h-24 gap-3 overflow-hidden text-sm">
                  <time className="w-12 shrink-0 text-right text-xs tabular-nums text-muted">
                    {time(c.timestamp)}
                  </time>
                  <div className="min-w-0 flex-1 overflow-y-auto">
                    <span className="font-semibold">{c.speaker}</span>
                    <p className={c.final ? "whitespace-pre-wrap" : "whitespace-pre-wrap text-muted"}>
                      {c.text}
                    </p>
                  </div>
                </div>
              ))}
              {record?.gaps.map((g, index) => (
                <p key={`${g.at}-${index}`} className="text-sm text-warning">
                  {time(g.at)} · {g.reason}
                </p>
              ))}
            </div>
            <Pane
              id="addon.meetings.notes"
              edge="left"
              defaultSize={300}
              min={220}
              max={600}
              className="overflow-y-auto border-l border-line p-4"
            >
              <h2 className="mb-3 text-sm font-semibold">Meeting notes</h2>
              {record?.notes ? (
                <Markdown text={record.notes} />
              ) : (
                <p className="text-sm text-muted">
                  Generate notes when you want them. Claude is only invoked by your actions.
                </p>
              )}
            </Pane>
          </div>
        </div>
      </main>
      {settings && (
        <Connection
          settings={overview.settings}
          connected={Boolean(overview.account)}
          busy={busy}
          onClose={() => setSettings(false)}
          onSave={(next) =>
            run(async () => {
              await call("meetings.configure", next);
              setSettings(false);
            })
          }
          onConnect={() =>
            run(async () => {
              await call("meetings.signIn");
              setSettings(false);
            })
          }
          onDisconnect={() => run(() => call("meetings.signOut"))}
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
          busy={busy}
          onClose={() => setJoining(undefined)}
          onError={(e) => setError(errorMessage(e))}
          onJoin={(meeting, options) =>
            run(async () => {
              const r = await call("meetings.join", meeting);
              setSelected(r.id);
              setJoining(undefined);
              await media.current!.join(r, { ...options, fake: overview.fake });
            })
          }
        />
      )}
      {ask && record && (
        <Ask
          record={record}
          projects={projects}
          busy={busy}
          onClose={() => setAsk(false)}
          onAsk={(question, projectId) =>
            run(async () => {
              const chat = await call("meetings.ask", { id: record.id, question, projectId });
              await openChat(chat.sessionId);
              setAsk(false);
            })
          }
        />
      )}
      {review && record && (
        <Review
          record={record}
          projects={projects}
          busy={busy}
          onClose={() => setReview(false)}
          onQueue={(actions, actionIds) =>
            run(async () => {
              await call("meetings.actions", { id: record.id, actions });
              await call("meetings.queue", { id: record.id, actionIds });
              setReview(false);
            })
          }
        />
      )}
      {sharing && (
        <Dialog open title="Share a screen or window" width="lg" onClose={() => setSharing(undefined)}>
          <div className="grid grid-cols-2 gap-3">
            {sharing.map((source) => (
              <button
                type="button"
                key={source.id}
                className="rounded-lg border border-line p-2 text-left hover:bg-hover"
                onClick={() =>
                  void run(async () => {
                    setSharing(undefined);
                    await media.current!.share(source.id);
                  })
                }
              >
                {source.thumbnail ? (
                  <img src={source.thumbnail} alt="" className="aspect-video w-full object-contain" />
                ) : (
                  <div className="flex aspect-video w-full items-center justify-center bg-surface text-muted">
                    <MonitorUp className="size-12" />
                  </div>
                )}
                <span className="block truncate text-sm">{source.name}</span>
              </button>
            ))}
          </div>
        </Dialog>
      )}
    </div>
  );
}

function DevicePicker({
  media,
  onClose,
  onError,
}: {
  media: MeetingMedia;
  onClose(): void;
  onError(error: unknown): void;
}) {
  const [devices, setDevices] = useState<Awaited<ReturnType<MeetingMedia["prepare"]>>>();
  const [microphone, setMicrophone] = useState("");
  const [speaker, setSpeaker] = useState("");
  const [camera, setCamera] = useState("");
  const [busy, setBusy] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: enumerate once when the user opens the picker.
  useEffect(() => {
    void media.prepare().then(setDevices).catch(onError);
  }, []);
  return (
    <Dialog
      open
      title="Meeting devices"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            busy={busy}
            disabled={!devices}
            variant="primary"
            onClick={() =>
              void (async () => {
                setBusy(true);
                try {
                  await media.devices(microphone, speaker, camera, false);
                  onClose();
                } catch (e) {
                  onError(e);
                } finally {
                  setBusy(false);
                }
              })()
            }
          >
            Apply devices
          </Button>
        </>
      }
    >
      <div className="h-48 space-y-3">
        {!devices ? (
          <Spinner center />
        ) : (
          (
            [
              ["Microphone", microphone, setMicrophone, devices.microphones],
              ["Speakers", speaker, setSpeaker, devices.speakers],
              ["Camera", camera, setCamera, devices.cameras],
            ] as const
          ).map(([label, value, setValue, choices]) => (
            <label key={label} htmlFor={`in-call-${label}`} className="block text-sm">
              {label}
              <Select id={`in-call-${label}`} value={value} onChange={(e) => setValue(e.target.value)}>
                <option value="">System default</option>
                {choices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </label>
          ))
        )}
      </div>
    </Dialog>
  );
}

function Connection({
  settings,
  connected,
  busy,
  onClose,
  onSave,
  onConnect,
  onDisconnect,
}: {
  settings: MeetingSettings;
  connected: boolean;
  busy: boolean;
  onClose(): void;
  onSave(value: MeetingSettings): Promise<void>;
  onConnect(): Promise<void>;
  onDisconnect(): Promise<void>;
}) {
  const [value, setValue] = useState(settings);
  return (
    <Dialog
      open
      title="Microsoft meeting connection"
      onClose={onClose}
      footer={
        <>
          <Button disabled={busy} onClick={() => void onSave(value)}>
            Save settings
          </Button>
          <Button
            busy={busy}
            disabled={!settings.clientId || !settings.endpoint}
            variant="primary"
            onClick={() => void onConnect()}
          >
            Connect Microsoft
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-muted">
        Your Azure CLI sign-in authorises the calling resource. Microsoft sign-in opens in your browser.
        Credentials stay in memory; reconnect after restarting Jig. Calling has Azure usage charges.
      </p>
      <div className="space-y-3">
        {(
          [
            ["tenantId", "Tenant ID"],
            ["clientId", "Application client ID"],
            ["endpoint", "Communication Services endpoint"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} htmlFor={`meeting-${key}`} className="block text-sm">
            {label}
            <Input
              id={`meeting-${key}`}
              value={value[key]}
              onChange={(e) => setValue({ ...value, [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted">
        If approval is required: ask your administrator to approve Jig's Teams.ManageCalls, Teams.ManageChats
        and Calendars.ReadBasic delegated permissions.
      </p>
      {connected && (
        <Button className="mt-3" disabled={busy} onClick={() => void onDisconnect()}>
          Disconnect Microsoft
        </Button>
      )}
    </Dialog>
  );
}

function Prejoin({
  meeting,
  fake,
  media,
  busy,
  onClose,
  onError,
  onJoin,
}: {
  meeting: { url: string; title: string };
  fake: boolean;
  media: MeetingMedia;
  busy: boolean;
  onClose(): void;
  onError(error: unknown): void;
  onJoin(
    meeting: { url: string; title: string },
    options: { muted: boolean; camera: boolean; language: string },
  ): Promise<void>;
}) {
  const [value, setValue] = useState(meeting);
  const [devices, setDevices] = useState<Awaited<ReturnType<MeetingMedia["prepare"]>>>();
  const [mic, setMic] = useState("");
  const [speaker, setSpeaker] = useState("");
  const [camera, setCamera] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [muted, setMuted] = useState(true);
  const [consent, setConsent] = useState(false);
  const [language, setLanguage] = useState("en-us");
  const preview = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: prepare devices once per pre-join modal; onError is a parent callback.
  useEffect(() => {
    if (!fake) void media.prepare().then(setDevices).catch(onError);
    return () => media.cancelPreview();
  }, []);
  const configure = async () => {
    await media.devices(mic, speaker, camera, cameraOn, preview.current ?? undefined);
  };
  return (
    <Dialog
      open
      title="Join Teams meeting"
      width="lg"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            busy={busy}
            disabled={!consent || !value.url || (!fake && !devices)}
            onClick={() =>
              void (async () => {
                try {
                  if (!fake) await configure();
                  await onJoin(value, { muted, camera: cameraOn, language });
                } catch (e) {
                  onError(e);
                }
              })()
            }
          >
            Join meeting
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label htmlFor="meeting-title" className="block">
          Meeting title
          <Input
            id="meeting-title"
            value={value.title}
            onChange={(e) => setValue({ ...value, title: e.target.value })}
          />
        </label>
        <label htmlFor="meeting-url" className="block">
          Teams join link
          <Input
            id="meeting-url"
            value={value.url}
            onChange={(e) => setValue({ ...value, url: e.target.value })}
          />
        </label>
        <div
          ref={preview}
          className="flex h-48 items-center justify-center overflow-hidden rounded-lg bg-surface"
        >
          {!devices && !fake ? <Spinner center /> : "Camera preview"}
        </div>
        {(
          [
            ["Microphone", mic, setMic, devices?.microphones],
            ["Speakers", speaker, setSpeaker, devices?.speakers],
            ["Camera", camera, setCamera, devices?.cameras],
          ] as const
        ).map(([label, selected, setter, choices]) => (
          <label key={label} htmlFor={`meeting-device-${label}`} className="flex items-center gap-3">
            <span className="w-24">{label}</span>
            <Select
              id={`meeting-device-${label}`}
              aria-label={label}
              value={selected}
              onChange={(e) => setter(e.target.value)}
            >
              <option value="">System default</option>
              {choices?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </label>
        ))}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={cameraOn} onChange={(e) => setCameraOn(e.target.checked)} />
          Camera on
          <Button size="sm" disabled={!devices} onClick={() => void configure().catch(onError)}>
            Preview
          </Button>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} />
          Join muted
        </label>
        <label htmlFor="meeting-language" className="flex items-center gap-3">
          <span className="w-24">Speech language</span>
          <Select
            id="meeting-language"
            aria-label="Speech language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="en-us">English (US)</option>
            <option value="en-gb">English (UK)</option>
            <option value="sv-se">Swedish</option>
            <option value="es-es">Spanish</option>
            <option value="de-de">German</option>
            <option value="fr-fr">French</option>
            <option value="nl-nl">Dutch</option>
            <option value="it-it">Italian</option>
            <option value="pt-br">Portuguese (Brazil)</option>
            <option value="ja-jp">Japanese</option>
            <option value="zh-cn">Chinese (Simplified)</option>
          </Select>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            I will inform participants that Jig saves captions as meeting notes. Joining uses Azure calling
            and incurs usage charges. No audio or video recording is saved.
          </span>
        </label>
      </div>
    </Dialog>
  );
}

function Ask({
  record,
  projects,
  busy,
  onClose,
  onAsk,
}: {
  record: MeetingRecord;
  projects: ProjectsState;
  busy: boolean;
  onClose(): void;
  onAsk(question: string, projectId?: string): Promise<void>;
}) {
  const [question, setQuestion] = useState("");
  const [context, setContext] = useState("current");
  const projectId = context === "current" ? projects.activeId : context || undefined;
  const project = projects.projects.find((p) => p.id === projectId);
  return (
    <Dialog
      open
      title="Ask Claude about this meeting"
      width="lg"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            busy={busy}
            disabled={!question.trim()}
            variant="primary"
            onClick={() => void onAsk(question, projectId)}
          >
            Ask in chat
          </Button>
        </>
      }
    >
      <label htmlFor="meeting-question" className="block">
        Question
        <Textarea
          id="meeting-question"
          rows={5}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          autoFocus
        />
      </label>
      <label htmlFor="meeting-context" className="mt-3 block">
        Project context
        <Select
          id="meeting-context"
          aria-label="Question project context"
          value={context}
          onChange={(e) => setContext(e.target.value)}
        >
          <option value="current">Current Jig project</option>
          <option value="">Meeting only</option>
          {projects.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </label>
      <div className="mt-3 flex h-8 items-center gap-2 text-sm text-muted">
        {project && <ProjectSwatch color={project.color} />}
        <span>
          {project?.name ?? "Meeting only"} · Transcript so far from {record.title}
        </span>
      </div>
      <p className="text-sm text-muted">
        Opens a normal Claude Code chat in Plan mode. The meeting keeps running. That chat retains this
        project even if you switch projects later.
      </p>
    </Dialog>
  );
}

function Review({
  record,
  projects,
  busy,
  onClose,
  onQueue,
}: {
  record: MeetingRecord;
  projects: ProjectsState;
  busy: boolean;
  onClose(): void;
  onQueue(actions: MeetingAction[], selected: string[]): Promise<void>;
}) {
  const [actions, setActions] = useState(record.actions);
  const [selected, setSelected] = useState<string[]>([]);
  const update = (id: string, patch: Partial<MeetingAction>) =>
    setActions((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  return (
    <Dialog
      open
      title="Review meeting actions"
      width="xl"
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto text-sm text-muted">
            Adds selected tasks in Plan mode and pauses the queue. Start it from Task queue.
          </span>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            busy={busy}
            disabled={!selected.length || actions.some((a) => selected.includes(a.id) && !a.projectId)}
            onClick={() => void onQueue(actions, selected)}
          >
            Add selected to queue
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted">
        Choose tasks for Claude explicitly. Other people's actions can stay in the meeting plan. Each selected
        task needs its own destination project.
      </p>
      <div className="space-y-3">
        {actions.map((a) => (
          <div key={a.id} className="rounded-lg border border-line p-3">
            <div className="flex items-center gap-3">
              <input
                aria-label={`Select ${a.title}`}
                type="checkbox"
                disabled={a.queued}
                checked={selected.includes(a.id)}
                onChange={(e) =>
                  setSelected((ids) => (e.target.checked ? [...ids, a.id] : ids.filter((id) => id !== a.id)))
                }
              />
              <Input
                aria-label="Action title"
                value={a.title}
                disabled={a.queued}
                onChange={(e) => update(a.id, { title: e.target.value })}
              />
              <span className="w-20 shrink-0 text-right text-xs text-muted">
                {a.queued ? "Queued" : a.mine ? "Your action" : "Draft"}
              </span>
            </div>
            <div className="mt-2 flex gap-3">
              <label htmlFor={`owner-${a.id}`} className="w-48 shrink-0">
                Owner
                <Input
                  id={`owner-${a.id}`}
                  disabled={a.queued}
                  value={a.owner}
                  onChange={(e) => update(a.id, { owner: e.target.value })}
                />
              </label>
              <label htmlFor={`project-${a.id}`} className="min-w-0 flex-1">
                Project
                <Select
                  id={`project-${a.id}`}
                  aria-label={`Project for ${a.title}`}
                  disabled={a.queued}
                  value={a.projectId ?? ""}
                  onChange={(e) => update(a.id, { projectId: e.target.value || undefined })}
                >
                  <option value="">Choose project…</option>
                  {projects.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            <label htmlFor={`prompt-${a.id}`} className="mt-2 block">
              Standalone task prompt
              <Textarea
                id={`prompt-${a.id}`}
                rows={3}
                disabled={a.queued}
                value={a.prompt}
                onChange={(e) => update(a.id, { prompt: e.target.value })}
              />
            </label>
            <p className="mt-2 text-xs text-muted">Evidence: {a.evidence || "Not provided"}</p>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
