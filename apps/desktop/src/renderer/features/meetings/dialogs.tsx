import { AppWindow, Info, Mic, Monitor, PlugZap, Video, VideoOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MeetingAction, MeetingRecord, MeetingSettings } from "../../../shared/meetings";
import type { ProjectsState } from "../../../shared/projects";
import { errorMessage } from "../../lib/host";
import { Badge, Button, Card, cn, Dialog, Input, Select, Spinner, Switch, Textarea } from "../../ui";
import { ProjectSwatch } from "../projects/colors";
import { SPEECH_LANGUAGES } from "./format";
import type { MeetingMedia } from "./media";

type Devices = Awaited<ReturnType<MeetingMedia["prepare"]>>;

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-hint">{hint}</p>}
    </div>
  );
}

function DeviceSelects({
  prefix,
  devices,
  values,
  disabled,
}: {
  prefix: string;
  devices?: Devices;
  values: Array<[string, (value: string) => void]>;
  disabled?: boolean;
}) {
  const rows = [
    ["Microphone", devices?.microphones],
    ["Speakers", devices?.speakers],
    ["Camera", devices?.cameras],
  ] as const;
  return (
    <>
      {rows.map(([label, choices], index) => {
        const [value, setValue] = values[index]!;
        return (
          <Field key={label} id={`${prefix}-${label}`} label={label}>
            <Select
              id={`${prefix}-${label}`}
              aria-label={label}
              disabled={disabled}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            >
              <option value="">System default</option>
              {choices?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        );
      })}
    </>
  );
}

export function DevicePicker({
  media,
  onClose,
  onError,
}: {
  media: MeetingMedia;
  onClose(): void;
  onError(error: unknown): void;
}) {
  const [devices, setDevices] = useState<Devices>();
  const [microphone, setMicrophone] = useState("");
  const [speaker, setSpeaker] = useState("");
  const [camera, setCamera] = useState("");
  const [busy, setBusy] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: enumerate once when the user opens the picker.
  useEffect(() => {
    void media
      .prepare()
      .then((found) => {
        const now = media.selected();
        setMicrophone(now.microphone);
        setSpeaker(now.speaker);
        setCamera(now.camera);
        setDevices(found);
      })
      .catch(onError);
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
      <div className="relative space-y-3">
        <DeviceSelects
          prefix="in-call"
          devices={devices}
          disabled={!devices}
          values={[
            [microphone, setMicrophone],
            [speaker, setSpeaker],
            [camera, setCamera],
          ]}
        />
        {!devices && <Spinner center />}
      </div>
    </Dialog>
  );
}

export function Connection({
  settings,
  account,
  fake,
  busy,
  onClose,
  onSave,
  onConnect,
  onDisconnect,
}: {
  settings: MeetingSettings;
  account?: string;
  fake: boolean;
  busy: boolean;
  onClose(): void;
  onSave(value: MeetingSettings): Promise<void>;
  onConnect(value: MeetingSettings): Promise<void>;
  onDisconnect(): Promise<void>;
}) {
  const [value, setValue] = useState(settings);
  const complete = Boolean(value.tenantId.trim() && value.clientId.trim() && value.endpoint.trim());
  const fields = [
    ["tenantId", "Tenant ID", "Your Microsoft Entra directory (tenant) ID."],
    ["clientId", "Application client ID", "The app registration Jig signs in with."],
    ["endpoint", "Communication Services endpoint", "The Azure resource that places the call."],
  ] as const;
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
          <Button busy={busy} disabled={!complete} variant="primary" onClick={() => void onConnect(value)}>
            {account ? "Reconnect" : "Connect Microsoft"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Card className="flex h-12 items-center gap-3 px-3 shadow-none">
          <PlugZap className={cn("size-4 shrink-0", account || fake ? "text-success" : "text-hint")} />
          <span className="min-w-0 flex-1 truncate text-sm">
            {fake ? "Test meeting service" : account ? `Connected as ${account}` : "Not connected"}
          </span>
          {account && (
            <Button size="sm" disabled={busy} onClick={() => void onDisconnect()}>
              Disconnect
            </Button>
          )}
        </Card>
        {fields.map(([key, label, hint]) => (
          <Field key={key} id={`meeting-${key}`} label={label} hint={hint}>
            <Input
              id={`meeting-${key}`}
              className="font-mono"
              value={value[key]}
              onChange={(e) => setValue({ ...value, [key]: e.target.value })}
            />
          </Field>
        ))}
        <div className="flex gap-2 rounded-lg bg-surface p-3 text-xs text-muted">
          <Info className="mt-px size-3.5 shrink-0" />
          <div className="space-y-2">
            <p>
              Sign-in opens in your browser and your Azure CLI sign-in authorises the calling resource.
              Credentials stay in memory, so reconnect after restarting Jig. Calls incur Azure usage charges.
            </p>
            <p>
              If your organisation requires approval, ask an administrator to grant the delegated permissions{" "}
              <code className="font-mono text-fg">Teams.ManageCalls</code>,{" "}
              <code className="font-mono text-fg">Teams.ManageChats</code> and{" "}
              <code className="font-mono text-fg">Calendars.ReadBasic</code>.
            </p>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

export function Prejoin({
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
  const [devices, setDevices] = useState<Devices>();
  const [mic, setMic] = useState("");
  const [speaker, setSpeaker] = useState("");
  const [camera, setCamera] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [muted, setMuted] = useState(true);
  const [language, setLanguage] = useState("en-us");
  const [deviceLoading, setDeviceLoading] = useState(!fake);
  const [deviceAttempt, setDeviceAttempt] = useState(0);
  const [error, setError] = useState("");
  const preview = useRef<HTMLDivElement>(null);
  const reportError = (e: unknown) => {
    setError(errorMessage(e));
    onError(e);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: prepare devices once per pre-join modal; onError is a parent callback.
  useEffect(() => {
    let cancelled = false;
    if (!fake) {
      setDeviceLoading(true);
      setError("");
      void media.prepare().then(
        (value) => {
          if (!cancelled) {
            setDevices(value);
            setDeviceLoading(false);
          }
        },
        (e: unknown) => {
          if (!cancelled) {
            setDeviceLoading(false);
            reportError(e);
          }
        },
      );
    }
    return () => {
      cancelled = true;
      media.cancelPreview();
    };
  }, [deviceAttempt]);
  const configure = () => media.devices(mic, speaker, camera, cameraOn, preview.current ?? undefined);
  // The preview follows the camera switch and the chosen camera.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only camera choices change the preview.
  useEffect(() => {
    if (devices) void configure().catch(reportError);
  }, [devices, cameraOn, camera]);
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
            icon={Video}
            busy={busy}
            disabled={!value.url.trim() || (!fake && !devices)}
            onClick={() =>
              void (async () => {
                try {
                  if (!fake) await configure();
                  await onJoin(value, { muted, camera: cameraOn, language });
                } catch (e) {
                  reportError(e);
                }
              })()
            }
          >
            Join meeting
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field id="meeting-title" label="Meeting title">
            <Input
              id="meeting-title"
              value={value.title}
              onChange={(e) => setValue({ ...value, title: e.target.value })}
            />
          </Field>
          <Field id="meeting-url" label="Teams join link">
            <Input
              id="meeting-url"
              placeholder="https://teams.microsoft.com/l/meetup-join/…"
              value={value.url}
              onChange={(e) => setValue({ ...value, url: e.target.value })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="relative aspect-video overflow-hidden rounded-lg border border-line bg-canvas">
              <div ref={preview} className="absolute inset-0 *:size-full" />
              {!cameraOn && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted">
                  <VideoOff className="size-6 text-hint" />
                  {fake ? "Test service: no camera" : "Camera is off"}
                </div>
              )}
              {deviceLoading && <Spinner center />}
            </div>
            <div className="flex h-8 items-center gap-6">
              <div className="flex items-center gap-2 text-sm">
                <Video className="size-4 text-muted" />
                <span>Camera</span>
                <Switch
                  label="Camera on"
                  checked={cameraOn}
                  disabled={fake || !devices}
                  onChange={setCameraOn}
                />
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Mic className="size-4 text-muted" />
                <span>Join muted</span>
                <Switch label="Join muted" checked={muted} onChange={setMuted} />
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <DeviceSelects
              prefix="meeting-device"
              devices={devices}
              disabled={!devices}
              values={[
                [mic, setMic],
                [speaker, setSpeaker],
                [camera, setCamera],
              ]}
            />
            <Field id="meeting-language" label="Speech language">
              <Select
                id="meeting-language"
                aria-label="Speech language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {SPEECH_LANGUAGES.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
        <div className="flex h-16 items-center gap-3 overflow-hidden rounded-lg bg-surface px-3 text-xs">
          <p
            role={error ? "alert" : "status"}
            className={cn("min-w-0 flex-1 overflow-y-auto max-h-full", error ? "text-danger" : "text-muted")}
          >
            {error || (deviceLoading ? "Checking microphone, speakers and camera…" : "Ready to join.")}
          </p>
          {!fake && !devices && !deviceLoading && (
            <Button size="sm" onClick={() => setDeviceAttempt((n) => n + 1)}>
              Retry devices
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

export function ShareSources({
  sources,
  onClose,
  onPick,
}: {
  sources: Array<{ id: string; name: string; thumbnail: string }>;
  onClose(): void;
  onPick(id: string): void;
}) {
  const groups = [
    { title: "Screens", icon: Monitor, items: sources.filter((s) => s.id.startsWith("screen:")) },
    { title: "Windows", icon: AppWindow, items: sources.filter((s) => !s.id.startsWith("screen:")) },
  ].filter((g) => g.items.length);
  return (
    <Dialog open title="Share a screen or window" width="lg" column onClose={onClose}>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        {groups.map(({ title, icon: Icon, items }) => (
          <section key={title} className="space-y-2">
            <h3 className="text-2xs font-semibold tracking-wide text-hint uppercase">{title}</h3>
            <div className="grid grid-cols-3 gap-3">
              {items.map((source) => (
                <button
                  type="button"
                  key={source.id}
                  className="group rounded-lg p-1.5 text-left outline-none hover:bg-hover focus-visible:ring-1 focus-visible:ring-accent"
                  onClick={() => onPick(source.id)}
                >
                  <span className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-md border border-line bg-canvas group-hover:border-accent">
                    {source.thumbnail ? (
                      <img src={source.thumbnail} alt="" className="size-full object-contain" />
                    ) : (
                      <Icon className="size-8 text-hint" />
                    )}
                  </span>
                  <span className="mt-1.5 flex items-center gap-1.5 text-sm">
                    <Icon className="size-3.5 shrink-0 text-muted" />
                    <span className="min-w-0 truncate">{source.name}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Dialog>
  );
}

export function Ask({
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
          <span className="mr-auto text-xs text-hint">AI can make mistakes · check important details</span>
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
      <div className="space-y-4">
        <Field id="meeting-question" label="Question">
          <Textarea
            id="meeting-question"
            rows={5}
            placeholder="Would this work in the current repository? What did we decide about…?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            autoFocus
          />
        </Field>
        <Field id="meeting-context" label="Project context">
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
        </Field>
        <div className="flex h-12 items-center gap-3 rounded-lg bg-surface px-3 text-sm">
          <span className="flex w-4 shrink-0 justify-center">
            {project && <ProjectSwatch color={project.color} />}
          </span>
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium">{project?.name ?? "Meeting only"}</span>
            <span className="text-muted"> · transcript so far from {record.title}</span>
          </span>
        </div>
        <p className="text-xs text-muted">
          Opens a Claude Code chat in Plan mode; the meeting keeps running. The chat stays in this project
          even if you switch projects later.
        </p>
      </div>
    </Dialog>
  );
}

export function Review({
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
  const missingProject = actions.some((a) => selected.includes(a.id) && !a.projectId);
  return (
    <Dialog
      open
      title="Review meeting actions"
      width="xl"
      column
      onClose={onClose}
      footer={
        <>
          <span className={cn("mr-auto text-xs", missingProject ? "text-danger" : "text-muted")}>
            {missingProject
              ? "Choose a project for every selected task."
              : `${selected.length} selected · added in Plan mode; the queue stays paused until you start it.`}
          </span>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            busy={busy}
            disabled={!selected.length || missingProject}
            onClick={() => void onQueue(actions, selected)}
          >
            Add selected to queue
          </Button>
        </>
      }
    >
      <p className="mb-3 shrink-0 text-sm text-muted">
        Claude drafted these from the transcript — check them before queuing. Only the tasks you tick are
        added, each to its own project; other people's actions can stay in the notes.
      </p>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {actions.map((a) => {
          const picked = selected.includes(a.id);
          return (
            <Card
              key={a.id}
              className={cn("space-y-2 p-3 shadow-none", picked && "border-accent", a.queued && "opacity-60")}
            >
              <div className="flex items-center gap-3">
                <input
                  aria-label={`Select ${a.title}`}
                  type="checkbox"
                  className="size-4 shrink-0 accent-accent"
                  disabled={a.queued}
                  checked={picked}
                  onChange={(e) =>
                    setSelected((ids) =>
                      e.target.checked ? [...ids, a.id] : ids.filter((id) => id !== a.id),
                    )
                  }
                />
                <Input
                  aria-label="Action title"
                  className="flex-1 font-medium"
                  value={a.title}
                  disabled={a.queued}
                  onChange={(e) => update(a.id, { title: e.target.value })}
                />
                <span className="flex w-24 shrink-0 justify-end">
                  {a.queued ? (
                    <Badge tone="success">Queued</Badge>
                  ) : a.mine ? (
                    <Badge tone="accent">Your action</Badge>
                  ) : (
                    <Badge>Someone else</Badge>
                  )}
                </span>
              </div>
              <div className="flex gap-3 pr-27 pl-7">
                <div className="w-48 shrink-0">
                  <Field id={`owner-${a.id}`} label="Owner">
                    <Input
                      id={`owner-${a.id}`}
                      disabled={a.queued}
                      value={a.owner}
                      onChange={(e) => update(a.id, { owner: e.target.value })}
                    />
                  </Field>
                </div>
                <div className="min-w-0 flex-1">
                  <Field id={`project-${a.id}`} label="Project">
                    <Select
                      id={`project-${a.id}`}
                      aria-label={`Project for ${a.title}`}
                      className={cn(picked && !a.projectId && "border-danger")}
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
                  </Field>
                </div>
              </div>
              <div className="space-y-2 pr-27 pl-7">
                <Field id={`prompt-${a.id}`} label="Task prompt">
                  <Textarea
                    id={`prompt-${a.id}`}
                    rows={3}
                    disabled={a.queued}
                    value={a.prompt}
                    onChange={(e) => update(a.id, { prompt: e.target.value })}
                  />
                </Field>
                <p className="border-l-2 border-line pl-2 text-xs text-muted">
                  {a.evidence ? `“${a.evidence}”` : "No quote from the transcript"}
                </p>
              </div>
            </Card>
          );
        })}
      </div>
    </Dialog>
  );
}
