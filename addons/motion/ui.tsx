import type { AddonTabProps, AddonUiContext } from "@jig/sdk";
import {
  Badge,
  Button,
  cn,
  Dialog,
  Empty,
  formatBytes,
  IconButton,
  Input,
  SectionTitle,
  Select,
  Spinner,
  Switch,
  Tabs,
  Textarea,
  useActiveProject,
  useAddon,
  useAddonEvent,
  useHostCall,
} from "@jig/sdk/ui";
import {
  Clapperboard,
  Film,
  Flag,
  Image as ImageIcon,
  List,
  MonitorPlay,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Quote,
  Type,
  X,
} from "lucide-react";
import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { MotionStatus, VideoDetail, VideoStatus, VideoSummary } from "./host";
import type { MotionStyle } from "./lib/compose";
import {
  ASPECTS,
  clock,
  MOTIONS,
  RESOLUTIONS,
  SCENE_TYPES,
  type Scene,
  type SceneType,
  type Storyboard,
  sceneId,
  timeline,
  type VideoKind,
  type VideoSettings,
} from "./lib/storyboard";
import type { Template } from "./lib/templates";

// ── shared bits ──────────────────────────────────────────────────────────────

const KIND_LABEL: Record<VideoKind, string> = {
  teaser: "Teaser",
  "whats-new": "What's new",
  walkthrough: "Walkthrough",
};
const SCENE_LABEL: Record<SceneType, string> = {
  title: "Title",
  statement: "Statement",
  feature: "Feature",
  bullets: "Bullets",
  capture: "Capture",
  outro: "Outro",
};
const SCENE_ICON: Record<SceneType, ComponentType<{ className?: string }>> = {
  title: Type,
  statement: Quote,
  feature: ImageIcon,
  bullets: List,
  capture: MonitorPlay,
  outro: Flag,
};
const STATUS: Record<
  VideoStatus,
  { label: string; tone: "neutral" | "accent" | "success" | "danger" | "info" }
> = {
  draft: { label: "Draft", tone: "neutral" },
  queued: { label: "Queued", tone: "info" },
  rendering: { label: "Rendering", tone: "accent" },
  rendered: { label: "Rendered", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
};
const RATIO: Record<string, string> = { "16:9": "16 / 9", "1:1": "1 / 1", "9:16": "9 / 16", "4:5": "4 / 5" };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function useFrameUrl(path: string | undefined, version?: string): string | undefined {
  const ctx = useAddon();
  const [url, setUrl] = useState<{ path: string; url: string }>();
  useEffect(() => {
    if (!path) return;
    let live = true;
    void ctx.frameUrl(path).then(
      (u) =>
        live &&
        setUrl({
          path,
          url: version ? `${u}${u.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}` : u,
        }),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [ctx, path, version]);
  return path && url?.path === path ? url.url : undefined;
}

/** Live render progress, from the host's `progress` events. */
const progress = new Map<string, number>();
const progressListeners = new Set<() => void>();
function useProgress(id: string): number | undefined {
  return useSyncExternalStore(
    (l) => {
      progressListeners.add(l);
      return () => progressListeners.delete(l);
    },
    () => progress.get(id),
  );
}
function useProgressFeed() {
  useAddonEvent("progress", (p) => {
    const { id, progress: value } = p as { id: string; progress: number };
    progress.set(id, value);
    for (const l of progressListeners) l();
  });
}

// ── New video (modal), opened from the top bar, the view or the action ──────

let newOpen = false;
const newListeners = new Set<() => void>();
function setNewOpen(open: boolean) {
  newOpen = open;
  for (const l of newListeners) l();
}
function useNewOpen(): boolean {
  return useSyncExternalStore(
    (l) => {
      newListeners.add(l);
      return () => newListeners.delete(l);
    },
    () => newOpen,
  );
}

export function newVideo(_ctx: AddonUiContext) {
  setNewOpen(true);
}
export function showVideos(ctx: AddonUiContext) {
  ctx.showView("videos");
}

function openVideo(ctx: AddonUiContext, projectId: string, video: { id: string; title: string }) {
  ctx.openTab("video", { projectId, id: video.id, title: video.title });
}

function NewVideoDialog({ ctx }: { ctx: AddonUiContext }) {
  const open = useNewOpen();
  const project = useActiveProject();
  const { data: list } = useHostCall<Template[]>("templates", undefined, { skip: !open });
  const { data: styleList } = useHostCall<Array<MotionStyle & { id: string }>>("styles", undefined, {
    skip: !open,
  });
  const [template, setTemplate] = useState("teaser");
  const [title, setTitle] = useState("");
  const [aspect, setAspect] = useState<VideoSettings["aspect"]>("16:9");
  const [style, setStyle] = useState("neutral");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const chosen = list?.find((t) => t.id === template);
  const close = () => {
    setNewOpen(false);
    setError(undefined);
    setTitle("");
  };
  const create = async () => {
    if (!project) return;
    setBusy(true);
    setError(undefined);
    try {
      const video = await ctx.host.call<VideoDetail>("create", {
        projectId: project.id,
        template,
        ...(title.trim() ? { title: title.trim() } : {}),
        settings: { aspect, style },
      });
      close();
      openVideo(ctx, project.id, video);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      title="New video"
      testId="motion-new"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            busy={busy}
            disabled={!project}
            onClick={create}
            data-testid="motion-new-create"
          >
            Create
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-4 *:even:col-span-3 items-center gap-x-3 gap-y-2 text-sm">
        <span className="text-muted">Start from</span>
        <Select
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          data-testid="motion-new-template"
        >
          {(list ?? [{ id: "teaser", name: "Teaser" } as Template]).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <span />
        <p className="h-10 text-xs text-muted">{chosen?.description ?? ""}</p>
        <span className="text-muted">Title</span>
        <Input
          value={title}
          placeholder={chosen?.name ?? "Video"}
          onChange={(e) => setTitle(e.target.value)}
          data-testid="motion-new-title"
        />
        <span className="text-muted">Format</span>
        <Select value={aspect} onChange={(e) => setAspect(e.target.value as VideoSettings["aspect"])}>
          {ASPECTS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
        <span className="text-muted">Style</span>
        <Select value={style} onChange={(e) => setStyle(e.target.value)}>
          {(styleList ?? [{ id: "neutral", name: "Neutral" } as MotionStyle & { id: string }]).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name ?? s.id}
            </option>
          ))}
        </Select>
      </div>
      <p className="mt-3 h-4 text-xs text-danger">{error ?? (project ? "" : "Open a project first.")}</p>
    </Dialog>
  );
}

// ── Top bar ──────────────────────────────────────────────────────────────────

export function MotionButton({ ctx }: { ctx: AddonUiContext }) {
  const project = useActiveProject();
  return (
    <>
      <button
        type="button"
        title="Motion"
        aria-label="Motion"
        data-testid="motion-topbar"
        className="no-drag inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg"
        onClick={(e) =>
          ctx.menu(
            [
              ...(project
                ? [
                    {
                      label: "New video…",
                      icon: "plus",
                      testId: "motion-menu-new",
                      onSelect: () => setNewOpen(true),
                    },
                  ]
                : []),
              {
                label: "Videos",
                icon: "film",
                testId: "motion-menu-videos",
                onSelect: () => ctx.showView("videos"),
              },
            ],
            e.currentTarget,
          )
        }
      >
        <Clapperboard className="size-4" />
      </button>
      <NewVideoDialog ctx={ctx} />
    </>
  );
}

// ── Videos view ──────────────────────────────────────────────────────────────

function StatusBadge({ video }: { video: Pick<VideoSummary, "id" | "status"> }) {
  const p = useProgress(video.id);
  const s = STATUS[video.status];
  return (
    <Badge tone={s.tone} className="w-20 justify-center tabular-nums">
      {video.status === "rendering" && p !== undefined ? `${Math.round(p * 100)}%` : s.label}
    </Badge>
  );
}

function Poster({ path, aspect, version }: { path?: string; aspect: string; version?: string }) {
  const url = useFrameUrl(path, version);
  return (
    <div className="grid aspect-video w-full place-items-center overflow-hidden rounded-md bg-sunken">
      {url ? (
        <img
          src={url}
          alt=""
          className="h-full w-full object-contain"
          style={{ aspectRatio: RATIO[aspect] }}
        />
      ) : (
        <Film className="size-6 text-hint" />
      )}
    </div>
  );
}

export function VideosView({ ctx }: { ctx: AddonUiContext }) {
  const project = useActiveProject();
  const { data, loading, reload } = useHostCall<VideoSummary[]>(
    "list",
    { projectId: project?.id ?? "" },
    { skip: !project },
  );
  useAddonEvent("changed", () => void reload());
  useProgressFeed();
  if (!project) return <Empty icon={Clapperboard} title="Open a project to see its videos" />;
  if (loading && !data) return <Spinner center />;
  if (!data?.length)
    return (
      <Empty
        icon={Clapperboard}
        title="No videos yet"
        actions={
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => setNewOpen(true)}
            data-testid="motion-empty-new"
          >
            New video
          </Button>
        }
      >
        A teaser, a what's-new clip or a walkthrough, made from HTML and rendered on this computer.
      </Empty>
    );
  return (
    <div className="@container flex h-full flex-col overflow-y-auto p-2" data-testid="motion-videos">
      <SectionTitle
        actions={<IconButton icon={Plus} label="New video" size="sm" onClick={() => setNewOpen(true)} />}
      >
        Videos
      </SectionTitle>
      <div className="grid gap-2 @max-md:grid-cols-1 @md:@max-3xl:grid-cols-2 @3xl:@max-6xl:grid-cols-3 @6xl:grid-cols-4">
        {data.map((v) => (
          <button
            type="button"
            key={v.id}
            data-testid="motion-video-card"
            data-status={v.status}
            className="flex flex-col gap-2 rounded-lg border border-line bg-raised p-2 text-left transition-colors hover:bg-hover"
            onClick={() => openVideo(ctx, project.id, v)}
            onContextMenu={(e) => {
              e.preventDefault();
              ctx.menu(
                [
                  { label: "Open", icon: "clapperboard", onSelect: () => openVideo(ctx, project.id, v) },
                  { separator: true as const },
                  {
                    label: "Delete video…",
                    icon: "trash-2",
                    danger: true,
                    onSelect: () => void removeVideo(ctx, project.id, v),
                  },
                ],
                e.nativeEvent,
              );
            }}
          >
            <Poster path={v.poster} aspect={v.aspect} version={v.updatedAt} />
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-fg">{v.title}</div>
                <div className="truncate text-xs text-muted">
                  {KIND_LABEL[v.kind]} · {v.aspect} · <span className="tabular-nums">{clock(v.seconds)}</span>
                </div>
              </div>
              <StatusBadge video={v} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

async function removeVideo(ctx: AddonUiContext, projectId: string, v: { id: string; title: string }) {
  const ok = await ctx.confirm({
    title: `Delete "${v.title}"?`,
    message: "Its storyboard, media and every render are deleted.",
    confirmLabel: "Delete",
    danger: true,
  });
  if (ok) await ctx.host.call("remove", { projectId, id: v.id });
}

// ── Video tab ────────────────────────────────────────────────────────────────

/** The element's width, followed as it changes; the ref can attach after the first render. */
function useWidth(): [(el: HTMLElement | null) => void, number] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return [setEl, width];
}

export function VideoTab({ ctx, params, tabId }: AddonTabProps) {
  const projectId = String(params.projectId ?? "");
  const id = String(params.id ?? "");
  const { data: video, error, reload } = useHostCall<VideoDetail>("get", { projectId, id });
  const [installNeeds, setInstallNeeds] = useState<MotionStatus>();
  const [editing, setEditing] = useState<number>();
  const [pane, setPane] = useState<"storyboard" | "settings">("storyboard");
  const [failure, setFailure] = useState<string>();
  const frame = useRef<{ seek: (t: number) => void } | null>(null);
  const [root, width] = useWidth();
  const wide = width >= 900;
  useProgressFeed();
  useAddonEvent("changed", (p) => {
    if ((p as { id?: string }).id === id) void reload();
  });
  useEffect(() => {
    if (video && params.title !== video.title) ctx.updateTab(tabId, { title: video.title });
  }, [ctx, tabId, video, params.title]);

  const save = useCallback(
    async (change: { storyboard?: Storyboard; settings?: Partial<VideoSettings> }) => {
      setFailure(undefined);
      try {
        await ctx.host.call("update", { projectId, id, ...change });
        await reload();
      } catch (e) {
        setFailure(message(e));
      }
    },
    [ctx, projectId, id, reload],
  );

  const render = async () => {
    setFailure(undefined);
    try {
      const r = await ctx.host.call<{ queued: true } | { needs: MotionStatus }>("render", { projectId, id });
      if ("needs" in r) setInstallNeeds(r.needs);
    } catch (e) {
      setFailure(message(e));
    }
  };

  if (error)
    return (
      <Empty icon={Clapperboard} title="This video can't be opened">
        {error}
      </Empty>
    );
  if (!video) return <Spinner center />;
  const slots = timeline(video.storyboard, video.settings).slots;

  const storyboard = (
    <StoryboardList
      video={video}
      onOpen={(i) => {
        setEditing(i);
        frame.current?.seek((slots[i]?.start ?? 0) + 0.8);
      }}
      onChange={(storyboard) => void save({ storyboard })}
    />
  );
  const settings = <SettingsPanel video={video} onChange={(settings) => void save({ settings })} />;
  const center = (
    <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      <PreviewPlayer handle={frame} video={video} />
      <Versions ctx={ctx} video={video} />
    </div>
  );

  return (
    <div ref={root} className="flex h-full min-h-0 flex-col" data-testid="motion-video-tab">
      <Header ctx={ctx} video={video} onRender={render} />
      <div className="h-5 px-3 text-xs text-danger" data-testid="motion-error">
        <span className="truncate">{failure ?? (video.status === "failed" ? video.error : "")}</span>
      </div>
      {wide ? (
        <div className="flex min-h-0 flex-1 border-t border-line">
          <div className="flex w-64 shrink-0 flex-col border-r border-line">{storyboard}</div>
          {center}
          <div className="w-72 shrink-0 overflow-y-auto border-l border-line">{settings}</div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto border-t border-line">
          <div className="p-3 pb-0">
            <PreviewPlayer handle={frame} video={video} />
          </div>
          <Tabs
            className="mt-2"
            items={[
              { id: "storyboard", label: "Storyboard" },
              { id: "settings", label: "Settings" },
            ]}
            value={pane}
            onChange={setPane}
          />
          <div className="flex flex-col">{pane === "storyboard" ? storyboard : settings}</div>
          <div className="p-3">
            <Versions ctx={ctx} video={video} />
          </div>
        </div>
      )}
      {editing !== undefined && video.storyboard.scenes[editing] && (
        <SceneSheet
          ctx={ctx}
          video={video}
          index={editing}
          onClose={() => setEditing(undefined)}
          onSave={async (storyboard) => {
            await save({ storyboard });
            setEditing(undefined);
          }}
        />
      )}
      <InstallDialog
        ctx={ctx}
        needs={installNeeds}
        onClose={() => setInstallNeeds(undefined)}
        onInstalled={() => {
          setInstallNeeds(undefined);
          void render();
        }}
      />
    </div>
  );
}

function Header({ ctx, video, onRender }: { ctx: AddonUiContext; video: VideoDetail; onRender: () => void }) {
  const p = useProgress(video.id);
  const busy = video.status === "rendering" || video.status === "queued";
  const projectId = video.projectId;
  const latest = video.renders.at(-1);
  return (
    <div className="flex flex-col">
      <div className="flex h-11 items-center gap-2 px-3">
        <Clapperboard className="size-4 shrink-0 text-muted" />
        <div className="min-w-0 flex-1 truncate text-sm">
          <span className="text-fg">{video.title}</span>
          <span className="text-muted">
            {" "}
            · {KIND_LABEL[video.kind]} · {video.settings.aspect} ·{" "}
            <span className="tabular-nums">{clock(video.seconds)}</span>
          </span>
        </div>
        <Button
          variant="primary"
          icon={Clapperboard}
          busy={busy}
          disabled={busy}
          className="w-28 justify-center"
          onClick={onRender}
          data-testid="motion-render"
        >
          {busy ? (video.status === "queued" ? "Queued" : `${Math.round((p ?? 0) * 100)}%`) : "Render"}
        </Button>
        <span className="size-7">
          {busy && (
            <IconButton
              icon={X}
              label="Cancel render"
              size="sm"
              data-testid="motion-cancel"
              onClick={() => void ctx.host.call("cancel", { projectId, id: video.id })}
            />
          )}
        </span>
        <IconButton
          icon={MoreHorizontal}
          label="More"
          size="sm"
          onClick={(e) =>
            ctx.menu(
              [
                ...(latest
                  ? [
                      {
                        label: "Play the latest render",
                        icon: "play",
                        onSelect: () => ctx.openPreview(renderFile(video, latest.n)),
                      },
                      {
                        label: "Export…",
                        icon: "download",
                        onSelect: () =>
                          void ctx.saveCopy(renderFile(video, latest.n), {
                            name: `${slug(video.title)}.mp4`,
                          }),
                      },
                      { separator: true as const },
                    ]
                  : []),
                {
                  label: "Delete video…",
                  icon: "trash-2",
                  danger: true,
                  onSelect: () => void removeVideo(ctx, projectId, video),
                },
              ],
              e.currentTarget,
            )
          }
        />
      </div>
      <div className="h-0.5 bg-sunken">
        <div
          className={cn("h-full bg-accent transition-all", !busy && "opacity-0")}
          style={{ width: `${Math.round((busy ? (p ?? 0) : 0) * 100)}%` }}
          data-testid="motion-progress"
        />
      </div>
    </div>
  );
}

const renderFile = (video: VideoDetail, n: number) => `${video.dir}/renders/${n}/video.mp4`;
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "video";

function StoryboardList({
  video,
  onOpen,
  onChange,
}: {
  video: VideoDetail;
  onOpen: (index: number) => void;
  onChange: (storyboard: Storyboard) => void;
}) {
  const ctx = useAddon();
  const { slots } = timeline(video.storyboard, video.settings);
  const scenes = video.storyboard.scenes;
  const move = (from: number, to: number) => {
    if (to < 0 || to >= scenes.length) return;
    const next = [...scenes];
    const [s] = next.splice(from, 1);
    next.splice(to, 0, s as Scene);
    onChange({ ...video.storyboard, scenes: next });
  };
  const add = (type: SceneType) => {
    const scene: Scene = {
      id: sceneId(
        SCENE_LABEL[type],
        scenes.map((s) => s.id),
      ),
      type,
      title: SCENE_LABEL[type],
    };
    onChange({ ...video.storyboard, scenes: [...scenes, scene] });
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col p-2" data-testid="motion-storyboard">
      <SectionTitle>Storyboard</SectionTitle>
      <div className="flex flex-col gap-1 overflow-y-auto">
        {scenes.map((scene, i) => {
          const Icon = SCENE_ICON[scene.type];
          return (
            <button
              type="button"
              key={scene.id}
              data-testid="motion-scene"
              className="flex h-8 shrink-0 items-center gap-2 rounded-md border border-line bg-raised px-2 text-left text-sm transition-colors hover:bg-hover"
              onClick={() => onOpen(i)}
              onContextMenu={(e) => {
                e.preventDefault();
                ctx.menu(
                  [
                    { label: "Edit…", icon: "pencil", onSelect: () => onOpen(i) },
                    { label: "Move up", icon: "arrow-up", disabled: i === 0, onSelect: () => move(i, i - 1) },
                    {
                      label: "Move down",
                      icon: "arrow-down",
                      disabled: i === scenes.length - 1,
                      onSelect: () => move(i, i + 1),
                    },
                    { separator: true as const },
                    {
                      label: "Delete scene",
                      icon: "trash-2",
                      danger: true,
                      disabled: scenes.length === 1,
                      onSelect: () =>
                        onChange({ ...video.storyboard, scenes: scenes.filter((_, j) => j !== i) }),
                    },
                  ],
                  e.nativeEvent,
                );
              }}
            >
              <span className="w-4 shrink-0 text-right text-xs text-hint tabular-nums">{i + 1}</span>
              <Icon className="size-3.5 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate text-fg">
                {scene.title || SCENE_LABEL[scene.type]}
              </span>
              <span className="w-9 shrink-0 text-right text-xs text-muted tabular-nums">
                {clock(slots[i]?.duration ?? 0)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="pt-2">
        <Button
          variant="ghost"
          size="sm"
          icon={Plus}
          data-testid="motion-add-scene"
          disabled={scenes.length >= 40}
          onClick={(e) =>
            ctx.menu(
              SCENE_TYPES.map((t) => ({ label: SCENE_LABEL[t], onSelect: () => add(t) })),
              e.currentTarget,
            )
          }
        >
          Scene
        </Button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex h-8 items-center gap-2 text-sm">
      <span className="w-20 shrink-0 text-muted">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
    </div>
  );
}

function SettingsPanel({
  video,
  onChange,
}: {
  video: VideoDetail;
  onChange: (s: Partial<VideoSettings>) => void;
}) {
  const { data: styleList } = useHostCall<Array<MotionStyle & { id: string }>>("styles");
  const s = video.settings;
  const [endText, setEndText] = useState(s.brand.endText);
  useEffect(() => setEndText(s.brand.endText), [s.brand.endText]);
  return (
    <div className="flex flex-col p-3" data-testid="motion-settings">
      <SectionTitle>Settings</SectionTitle>
      <Row label="Format">
        <Select
          className="min-w-0 flex-1"
          value={s.aspect}
          onChange={(e) => onChange({ aspect: e.target.value as VideoSettings["aspect"] })}
          data-testid="motion-aspect"
        >
          {ASPECTS.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </Select>
        <Select
          className="w-24"
          value={s.resolution}
          onChange={(e) => onChange({ resolution: e.target.value as VideoSettings["resolution"] })}
        >
          {RESOLUTIONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </Select>
      </Row>
      <Row label="Frame rate">
        <Select
          className="min-w-0 flex-1"
          value={String(s.fps)}
          onChange={(e) => onChange({ fps: Number(e.target.value) as 30 | 60 })}
        >
          <option value="30">30 fps</option>
          <option value="60">60 fps</option>
        </Select>
      </Row>
      <Row label="Style">
        <Select
          className="min-w-0 flex-1"
          value={s.style}
          onChange={(e) => onChange({ style: e.target.value })}
        >
          {(styleList ?? [{ id: s.style, name: s.style } as MotionStyle & { id: string }]).map((x) => (
            <option key={x.id} value={x.id}>
              {x.name ?? x.id}
            </option>
          ))}
        </Select>
      </Row>
      <Row label="Motion">
        <Select
          className="min-w-0 flex-1"
          value={s.motion}
          onChange={(e) => onChange({ motion: e.target.value as VideoSettings["motion"] })}
        >
          {MOTIONS.map((m) => (
            <option key={m} value={m}>
              {m[0]?.toUpperCase() + m.slice(1)}
            </option>
          ))}
        </Select>
      </Row>
      <Row label="Headline">
        <Select
          className="min-w-0 flex-1"
          value={s.type.headline}
          onChange={(e) =>
            onChange({ type: { ...s.type, headline: e.target.value as VideoSettings["type"]["headline"] } })
          }
        >
          <option value="medium">Medium</option>
          <option value="large">Large</option>
          <option value="huge">Huge</option>
        </Select>
      </Row>
      <Row label="Captions">
        <Switch
          checked={s.captions.on}
          label="Captions"
          onChange={(on) => onChange({ captions: { ...s.captions, on } })}
        />
        <Select
          className="min-w-0 flex-1"
          value={s.captions.position}
          disabled={!s.captions.on}
          onChange={(e) =>
            onChange({ captions: { ...s.captions, position: e.target.value as "bottom" | "top" } })
          }
        >
          <option value="bottom">Bottom</option>
          <option value="top">Top</option>
        </Select>
      </Row>
      <Row label="Logo">
        <Select
          className="min-w-0 flex-1"
          value={s.brand.logo}
          onChange={(e) =>
            onChange({ brand: { ...s.brand, logo: e.target.value as VideoSettings["brand"]["logo"] } })
          }
        >
          <option value="always">Always</option>
          <option value="end">End only</option>
          <option value="never">Never</option>
        </Select>
      </Row>
      <Row label="End text">
        <Input
          className="min-w-0 flex-1"
          value={endText}
          placeholder={video.title}
          onChange={(e) => setEndText(e.target.value)}
          onBlur={() => endText !== s.brand.endText && onChange({ brand: { ...s.brand, endText } })}
        />
      </Row>
    </div>
  );
}

function PreviewPlayer({
  video,
  handle,
}: {
  video: VideoDetail;
  handle: { current: { seek: (t: number) => void } | null };
}) {
  const ctx = useAddon();
  const projectId = video.projectId;
  const [path, setPath] = useState<string>();
  const [now, setNow] = useState({ t: 0, playing: false });
  const iframe = useRef<HTMLIFrameElement>(null);
  const total = video.seconds;
  const version = `${video.updatedAt}`;
  useEffect(() => {
    let live = true;
    void ctx.host.call<string>("preview", { projectId, id: video.id }).then((p) => live && setPath(p));
    return () => {
      live = false;
    };
  }, [ctx, projectId, video.id, version]);
  const url = useFrameUrl(path, version);
  const post = useCallback((m: unknown) => iframe.current?.contentWindow?.postMessage(m, "*"), []);
  useEffect(() => {
    handle.current = { seek: (t: number) => post({ motion: "seek", t }) };
  }, [handle, post]);
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== iframe.current?.contentWindow) return;
      const m = e.data as { motion?: string; t?: number; playing?: boolean };
      if (m?.motion === "time") setNow({ t: Number(m.t) || 0, playing: !!m.playing });
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, []);
  const portrait = video.settings.aspect === "9:16" || video.settings.aspect === "4:5";
  return (
    <div className="flex flex-col gap-2" data-testid="motion-preview">
      <div className="grid aspect-video w-full place-items-center overflow-hidden rounded-md bg-sunken">
        <div
          className={cn("relative", portrait ? "h-full" : "w-full")}
          style={{ aspectRatio: RATIO[video.settings.aspect] }}
        >
          {url ? (
            <iframe
              ref={iframe}
              title="Preview"
              src={url}
              sandbox="allow-scripts"
              className="absolute inset-0 h-full w-full border-0"
              data-testid="motion-preview-frame"
            />
          ) : (
            <Spinner center />
          )}
        </div>
      </div>
      <div className="flex h-7 items-center gap-2">
        <IconButton
          icon={now.playing ? Pause : Play}
          label={now.playing ? "Pause" : "Play"}
          size="sm"
          data-testid="motion-play"
          onClick={() => post({ motion: now.playing ? "pause" : "play" })}
        />
        <input
          type="range"
          min={0}
          max={total}
          step={0.05}
          value={Math.min(now.t, total)}
          aria-label="Position"
          className="min-w-0 flex-1 accent-accent"
          onChange={(e) => post({ motion: "seek", t: Number(e.target.value) })}
          data-testid="motion-scrubber"
        />
        <span className="w-20 shrink-0 text-right text-xs text-muted tabular-nums" data-testid="motion-time">
          {clock(now.t)} / {clock(total)}
        </span>
      </div>
    </div>
  );
}

function Versions({ ctx, video }: { ctx: AddonUiContext; video: VideoDetail }) {
  const projectId = video.projectId;
  const renders = [...video.renders].reverse();
  return (
    <div className="flex flex-col" data-testid="motion-versions">
      <SectionTitle>Renders</SectionTitle>
      {renders.length ? (
        renders.map((r) => (
          <button
            type="button"
            key={r.n}
            data-testid="motion-render-row"
            className="flex h-8 items-center gap-3 rounded-md px-2 text-left text-sm hover:bg-hover"
            onClick={() => ctx.openPreview(renderFile(video, r.n))}
            onContextMenu={(e) => {
              e.preventDefault();
              ctx.menu(
                [
                  { label: "Play", icon: "play", onSelect: () => ctx.openPreview(renderFile(video, r.n)) },
                  {
                    label: "Export…",
                    icon: "download",
                    onSelect: () =>
                      void ctx.saveCopy(renderFile(video, r.n), { name: `${slug(video.title)}-v${r.n}.mp4` }),
                  },
                  { separator: true as const },
                  {
                    label: "Delete this render",
                    icon: "trash-2",
                    danger: true,
                    onSelect: () => void ctx.host.call("removeRender", { projectId, id: video.id, n: r.n }),
                  },
                ],
                e.nativeEvent,
              );
            }}
          >
            <Play className="size-3.5 shrink-0 text-muted" />
            <span className="w-8 shrink-0 text-fg">v{r.n}</span>
            <span className="min-w-0 flex-1 truncate text-muted">{new Date(r.at).toLocaleString()}</span>
            <span className="w-20 shrink-0 text-right text-xs text-muted tabular-nums">
              {r.width}×{r.height}
            </span>
            <span className="w-10 shrink-0 text-right text-xs text-muted tabular-nums">
              {clock(r.seconds)}
            </span>
            <span className="w-16 shrink-0 text-right text-xs text-muted tabular-nums">
              {formatBytes(r.bytes)}
            </span>
          </button>
        ))
      ) : (
        <p className="px-2 text-xs text-muted">No renders yet. Render makes an MP4 on this computer.</p>
      )}
    </div>
  );
}

function SceneSheet({
  ctx,
  video,
  index,
  onClose,
  onSave,
}: {
  ctx: AddonUiContext;
  video: VideoDetail;
  index: number;
  onClose: () => void;
  onSave: (storyboard: Storyboard) => Promise<void>;
}) {
  const original = video.storyboard.scenes[index] as Scene;
  const [scene, setScene] = useState<Scene>(original);
  const [busy, setBusy] = useState(false);
  const projectId = video.projectId;
  const set = (change: Partial<Scene>) => setScene((s) => ({ ...s, ...change }));
  const pick = async () => {
    const [file] = await ctx.attachments.pick({ title: "Choose an image" });
    if (!file) return;
    const path = await ctx.host.call<string>("addMedia", {
      projectId,
      id: video.id,
      path: file.path,
      name: file.name,
    });
    set({ media: { path, kind: /\.(mp4|webm|mov)$/i.test(path) ? "video" : "image" } });
  };
  const save = async () => {
    setBusy(true);
    const scenes = [...video.storyboard.scenes];
    const clean: Scene = { ...scene };
    if (!clean.text) delete clean.text;
    if (!clean.voice) delete clean.voice;
    if (!clean.bullets?.length) delete clean.bullets;
    scenes[index] = clean;
    try {
      await onSave({ ...video.storyboard, scenes });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Scene ${index + 1}`}
      testId="motion-scene-sheet"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" busy={busy} onClick={save} data-testid="motion-scene-save">
            Save
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-4 *:even:col-span-3 items-start gap-x-3 gap-y-2 text-sm">
        <span className="pt-1 text-muted">Kind</span>
        <Select value={scene.type} onChange={(e) => set({ type: e.target.value as SceneType })}>
          {SCENE_TYPES.map((t) => (
            <option key={t} value={t}>
              {SCENE_LABEL[t]}
            </option>
          ))}
        </Select>
        <span className="pt-1 text-muted">Title</span>
        <Input
          value={scene.title}
          maxLength={120}
          onChange={(e) => set({ title: e.target.value })}
          data-testid="motion-scene-title"
        />
        <span className="pt-1 text-muted">Text</span>
        <Textarea
          rows={3}
          value={scene.text ?? ""}
          maxLength={600}
          onChange={(e) => set({ text: e.target.value })}
        />
        <span className="pt-1 text-muted">Bullets</span>
        <Textarea
          rows={3}
          value={(scene.bullets ?? []).join("\n")}
          placeholder="One per line (Bullets scenes)"
          onChange={(e) => set({ bullets: e.target.value.split("\n").slice(0, 6) })}
        />
        <span className="pt-1 text-muted">Media</span>
        <div className="flex h-7 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-muted">{scene.media?.path ?? "None"}</span>
          <Button size="sm" onClick={() => void pick()}>
            Choose…
          </Button>
          <Button size="sm" variant="ghost" disabled={!scene.media} onClick={() => set({ media: undefined })}>
            Remove
          </Button>
        </div>
        <span className="pt-1 text-muted">Voice script</span>
        <Textarea
          rows={2}
          value={scene.voice ?? ""}
          placeholder="What the voice says over this scene"
          onChange={(e) => set({ voice: e.target.value })}
        />
        <span className="pt-1 text-muted">Seconds</span>
        <Input
          type="number"
          min={1}
          max={60}
          step={0.5}
          className="w-24"
          value={scene.duration ?? ""}
          placeholder="Auto"
          onChange={(e) => set({ duration: e.target.value ? Number(e.target.value) : undefined })}
        />
      </div>
    </Dialog>
  );
}

function InstallDialog({
  ctx,
  needs,
  onClose,
  onInstalled,
}: {
  ctx: AddonUiContext;
  needs?: MotionStatus;
  onClose: () => void;
  onInstalled: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  useAddonEvent("install", (p) => setNote((p as { text: string }).text));
  const install = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await ctx.host.call("install");
      onInstalled();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const r = needs?.install.renderer;
  const f = needs?.install.ffmpeg;
  return (
    <Dialog
      open={!!needs}
      onClose={() => !busy && onClose()}
      title="Install what Motion renders with"
      testId="motion-install"
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            busy={busy}
            disabled={!!needs?.blocked}
            onClick={install}
            data-testid="motion-install-go"
          >
            Install
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-muted">Rendering happens on this computer, without AI. It needs, once:</p>
        {needs?.missing.includes("renderer") && r && (
          <div className="rounded-md border border-line p-2">
            <div className="text-fg">
              {r.name} {r.version} <span className="text-muted">· {r.licence}</span>
            </div>
            <div className="text-xs text-muted">
              From npm ({r.source}), checked against its pinned checksum, with the headless Chrome it renders
              with. About {r.approxMb} MB. Runs with Node.js {r.node}+.
            </div>
          </div>
        )}
        {needs?.missing.includes("ffmpeg") && f && (
          <div className="rounded-md border border-line p-2">
            <div className="text-fg">
              FFmpeg 6.0 <span className="text-muted">· {f.licence}</span>
            </div>
            <div className="text-xs text-muted">
              Two files from the ffmpeg-static release on GitHub, each checked against a pinned SHA-256. About{" "}
              {f.mb} MB. Already have FFmpeg? Set its folder in Settings → Motion instead.
            </div>
          </div>
        )}
        <div className="text-xs text-muted">
          Goes into <span className="font-mono">{needs?.dataDir}</span>
        </div>
        <p className="h-4 text-xs" data-testid="motion-install-note">
          <span className={error || needs?.blocked ? "text-danger" : "text-muted"}>
            {error ?? needs?.blocked ?? (busy ? note : "")}
          </span>
        </p>
      </div>
    </Dialog>
  );
}
