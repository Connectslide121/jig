import type { AddonTabProps, AddonUiContext, MenuInput } from "@jig/sdk";
import {
  Badge,
  Button,
  CountBadge,
  cn,
  Empty,
  FileIcon,
  HtmlThumbnail,
  IconButton,
  ProjectSwatch,
  SectionTitle,
  Spinner,
  Tooltip,
  useActiveProject,
  useAddon,
  useAddonEvent,
  useHostCall,
  useProjectList,
} from "@jig/sdk/ui";
import { Factory, Inbox, LayoutGrid, Lightbulb, MoreHorizontal, Play } from "lucide-react";
import { type ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import { NewIdeaDialog, openNewIdea, useNewIdea } from "./idea";
import type { BriefDoc } from "./lib/brief";
import {
  duration,
  type GraphBox,
  graphBoxes,
  kpis,
  LANES,
  type Lane,
  laneOf,
  progress,
  since,
} from "./lib/floor";
import {
  GATES,
  groupLabel,
  type InboxGroup,
  type InboxItem,
  inbox,
  mineCount,
  outputName,
  ownerName,
  trustByKind,
  waitsForMe,
} from "./lib/gates";
import { itemId, type Track } from "./lib/graph";
import { demoVersions } from "./lib/review";
import { type GateId, type Output, PENDING_IDEA, type PendingIdea, type Run, timeline } from "./lib/run";
import { isSample } from "./lib/samples";
import { OutputReview, type ReviewTarget, TrustTable } from "./outputs";
import {
  clock,
  InboxPill,
  LevelBadge,
  OutputPill,
  openInterview,
  openReview,
  openRun,
  Ring,
  RunMark,
  useAllRuns,
  useNow,
  useRuns,
} from "./parts";
import { PlanDialog } from "./plan";
import { GateSheet, InspectorDialog, StageActionDialog, StageSheet, StartDialog } from "./sheets";
import newIdea from "./tracks/new-idea.json";

/**
 * Jig factory (phase 28). Session 0: the Floor, a run's page, the inbox, the sidebar view and the top
 * bar button, showing the sample runs (D-442) until runs can be started.
 */

const TRACK = newIdea as Track;
const TRACK_NAME: Record<Run["track"], string> = {
  "new-idea": "new idea",
  "existing-product": "existing product",
  "change-request": "change request",
  tender: "tender",
};

/** The ⋯ menu's sample entries for a project. */
function sampleItems(ctx: AddonUiContext, projectId: string | undefined, hasSamples: boolean): MenuInput[] {
  if (!projectId) return [];
  return [
    hasSamples
      ? {
          label: "Remove sample runs",
          icon: "trash-2",
          testId: "factory-clear-samples",
          onSelect: () => void ctx.host.call("clearSamples", { projectId }),
        }
      : {
          label: "Load sample runs",
          icon: "sparkles",
          testId: "factory-load-samples",
          onSelect: () => void ctx.host.call("loadSamples", { projectId }),
        },
  ];
}

function LoadSamples({ projectId }: { projectId: string }) {
  const ctx = useAddon();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      disabled={busy}
      data-testid="factory-load-samples"
      onClick={async () => {
        setBusy(true);
        try {
          await ctx.host.call("loadSamples", { projectId });
        } finally {
          setBusy(false);
        }
      }}
    >
      Load sample runs
    </Button>
  );
}

function NoRuns({ projectId, onStart }: { projectId: string; onStart: () => void }) {
  return (
    <Empty
      icon={Factory}
      title="No runs yet"
      className="h-full"
      actions={
        <>
          <Button
            size="sm"
            variant="primary"
            icon={Lightbulb}
            data-testid="factory-new-idea-open"
            onClick={() => openNewIdea()}
          >
            New idea…
          </Button>
          <Button size="sm" icon={Play} data-testid="factory-start-open" onClick={onStart}>
            Start from a brief…
          </Button>
          <LoadSamples projectId={projectId} />
        </>
      }
    >
      Jig factory turns an idea into an interview, a demo and a pack of documents. Start with a new idea or
      from a brief you already have, or load the sample runs to see how it works.
    </Empty>
  );
}

// ─── Top bar ────────────────────────────────────────────────────────────────────────────────────

/** The top bar's factory button: what waits for you across projects, and the factory's menu. */
export function FactoryButton({ ctx }: { ctx: AddonUiContext }) {
  const { data } = useAllRuns();
  const active = useActiveProject();
  const count = mineCount(inbox(data ?? []));
  const idea = useNewIdea();
  usePendingIdea(ctx);
  return (
    <>
      <button
        type="button"
        title={count ? `Jig factory · ${count} waiting for you` : "Jig factory"}
        aria-label="Jig factory"
        data-testid="factory-topbar"
        className="no-drag relative inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg"
        onClick={(e) => {
          const hasSamples = (data ?? []).some((r) => r.projectId === active?.id && isSample(r.id));
          ctx.menu(
            [
              {
                label: "Floor",
                icon: "layout-grid",
                testId: "factory-menu-floor",
                onSelect: () => openFloor(ctx),
              },
              {
                label: "Inbox",
                icon: "inbox",
                badge: count ? String(count) : undefined,
                testId: "factory-menu-inbox",
                onSelect: () => openInbox(ctx),
              },
              { label: "Runs", icon: "list", onSelect: () => ctx.showView("factory") },
              ...(active
                ? [
                    {
                      label: "New idea…",
                      icon: "lightbulb",
                      testId: "factory-menu-new-idea",
                      onSelect: () => openNewIdea(),
                    },
                    {
                      label: "Start from a brief…",
                      icon: "play",
                      testId: "factory-menu-start",
                      onSelect: () => startFromBrief(ctx),
                    },
                  ]
                : []),
              { separator: true },
              ...sampleItems(ctx, active?.id, hasSamples),
            ],
            e.currentTarget,
          );
        }}
      >
        <Factory className="size-4" />
        <span className="absolute -top-0.5 -right-0.5" data-testid="factory-topbar-count">
          <CountBadge count={count} />
        </span>
      </button>
      {idea && <NewIdeaDialog ctx={ctx} prefill={idea} />}
    </>
  );
}

/** An idea from elsewhere (a meeting's ⋯ menu, through `ideaFrom`) opens New idea, then is dropped. */
function usePendingIdea(ctx: AddonUiContext) {
  const take = async () => {
    const p = await ctx.storage.get<PendingIdea | null>(PENDING_IDEA, { scope: "global" });
    if (!p) return;
    await ctx.storage.set(PENDING_IDEA, null, { scope: "global" });
    openNewIdea({ text: p.text, title: p.title, source: p.source });
  };
  useAddonEvent("new-idea", () => void take());
  useEffect(() => void take(), []);
}

export function openFloor(ctx: AddonUiContext) {
  ctx.openTab("floor", {});
}

export function openInbox(ctx: AddonUiContext) {
  ctx.openTab("inbox", {});
}

// The start modal's open state lives here, not in the tab's params (they are the tab's identity), so
// the action and the menus open it on the one Floor tab.
let startOpen = false;
const startListeners = new Set<() => void>();
function setStartOpen(open: boolean) {
  startOpen = open;
  for (const l of startListeners) l();
}
function useStartOpen(): boolean {
  return useSyncExternalStore(
    (l) => {
      startListeners.add(l);
      return () => startListeners.delete(l);
    },
    () => startOpen,
  );
}

/** Opens the Floor with the Start from a brief modal (the manifest's action and the menus). */
export function startFromBrief(ctx: AddonUiContext) {
  ctx.openTab("floor", {});
  setStartOpen(true);
}

// ─── Floor ──────────────────────────────────────────────────────────────────────────────────────

/** Every run of the active project as cards in lanes, with the KPI strip above (ui.md → Floor). */
export function FloorTab({ ctx }: AddonTabProps) {
  const project = useActiveProject();
  const { data, error } = useRuns(project?.id);
  const now = useNow();
  const starting = useStartOpen();
  const start = starting && project && (
    <StartDialog ctx={ctx} projectId={project.id} onClose={() => setStartOpen(false)} />
  );
  if (!project) return <Empty icon={Factory} title="No project" className="h-full" />;
  if (!data) return error ? <div className="p-3 text-xs text-danger">{error}</div> : <Spinner center />;
  if (!data.length)
    return (
      <>
        <NoRuns projectId={project.id} onStart={() => setStartOpen(true)} />
        {start}
      </>
    );
  const byLane = (lane: Lane) => data.filter((r) => laneOf(r) === lane);
  return (
    <div className="@container flex h-full min-h-0 flex-col" data-testid="factory-floor">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-4">
        <ProjectSwatch color={project.color} />
        <span className="min-w-0 truncate text-sm font-semibold text-fg">{project.name}</span>
        <span className="text-sm text-hint">· Floor</span>
        <span className="flex-1" />
        <Button
          size="sm"
          variant="primary"
          icon={Lightbulb}
          data-testid="factory-new-idea-open"
          onClick={() => openNewIdea()}
        >
          New idea…
        </Button>
        <Button size="sm" icon={Play} data-testid="factory-start-open" onClick={() => setStartOpen(true)}>
          Start from a brief…
        </Button>
        <IconButton
          icon={Inbox}
          size="sm"
          label="Inbox"
          data-testid="factory-floor-inbox"
          onClick={() => openInbox(ctx)}
        />
        <IconButton
          icon={MoreHorizontal}
          size="sm"
          label="More"
          data-testid="factory-floor-more"
          onClick={(e) =>
            ctx.menu(
              sampleItems(
                ctx,
                project.id,
                data.some((r) => isSample(r.id)),
              ),
              e.currentTarget,
            )
          }
        />
      </div>
      <div className="shrink-0 px-4 pt-3">
        <Kpis runs={data} />
      </div>
      {/* Wide: six lanes side by side, scrolling sideways when they don't fit. */}
      <div className="@max-3xl:hidden @3xl:flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
        {LANES.map((lane) => (
          <section
            key={lane.id}
            className="flex min-w-44 flex-1 flex-col gap-2"
            data-testid={`factory-lane-${lane.id}`}
          >
            <LaneHeader title={lane.title} count={byLane(lane.id).length} />
            <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
              {byLane(lane.id).map((r) => (
                <RunCard key={r.id} run={r} color={project.color} now={now} onOpen={() => openRun(ctx, r)} />
              ))}
            </div>
          </section>
        ))}
      </div>
      {/* Narrow: one list grouped by lane, a card per row. */}
      <div className="@3xl:hidden @max-3xl:flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {LANES.filter((lane) => byLane(lane.id).length).map((lane) => (
          <section key={lane.id} className="flex flex-col gap-2">
            <LaneHeader title={lane.title} count={byLane(lane.id).length} />
            {byLane(lane.id).map((r) => (
              <RunCard key={r.id} run={r} color={project.color} now={now} onOpen={() => openRun(ctx, r)} />
            ))}
          </section>
        ))}
      </div>
      {start}
    </div>
  );
}

function LaneHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex h-6 shrink-0 items-center gap-2 px-1">
      <span className="min-w-0 flex-1 truncate text-2xs font-semibold tracking-wide text-hint uppercase">
        {title}
      </span>
      <span className="text-2xs text-hint tabular-nums">{count}</span>
    </div>
  );
}

function Kpis({ runs }: { runs: Run[] }) {
  const k = kpis(runs);
  const tiles: Array<{ label: string; value: string; tone?: string }> = [
    { label: "Running", value: String(k.running), tone: k.running ? "text-info" : "" },
    { label: "Waiting for you", value: String(k.waitingForYou), tone: k.waitingForYou ? "text-warning" : "" },
    { label: "Idea → demo", value: k.ideaToDemo === undefined ? "–" : duration(k.ideaToDemo) },
    {
      label: "Approved as is",
      value: k.approvedAsIs === undefined ? "–" : `${Math.round(k.approvedAsIs * 100)} %`,
    },
  ];
  return (
    <div className="@max-xl:grid-cols-2 @xl:grid-cols-4 grid gap-2" data-testid="factory-kpis">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="flex h-16 min-w-0 flex-col justify-center gap-1 rounded-lg border border-line bg-raised px-3"
        >
          <span className="truncate text-2xs font-medium tracking-wide text-hint uppercase">{t.label}</span>
          <span className={cn("truncate text-lg font-semibold tabular-nums text-fg", t.tone)}>{t.value}</span>
        </div>
      ))}
    </div>
  );
}

/** A run on the Floor: three fixed lines, the whole card opens the run (ui.md → Floor). */
function RunCard({ run, color, now, onOpen }: { run: Run; color?: string; now: number; onOpen: () => void }) {
  const p = progress(run);
  const mine = waitsForMe(run);
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="factory-card"
      data-run={run.id}
      className="flex h-23 w-full shrink-0 flex-col justify-between rounded-lg border border-line bg-raised px-3 py-2.5 text-left shadow-card transition-colors hover:border-line-strong hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus"
    >
      <span className="flex min-w-0 items-center gap-2">
        <ProjectSwatch color={color} />
        <span className="min-w-0 truncate text-sm font-medium text-fg">{run.title}</span>
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <LevelBadge level={run.level} />
        <Ring value={p.value} />
        <span className="min-w-0 truncate text-xs text-muted tabular-nums">{p.label}</span>
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-hint tabular-nums">
          {since(run.createdAt, now)}
        </span>
        <span className="flex h-4 shrink-0 items-center">
          <RunMark run={run} mine={mine} />
        </span>
      </span>
    </button>
  );
}

// ─── Run page ───────────────────────────────────────────────────────────────────────────────────

/** One run: its stage graph, outputs and timeline (ui.md → Run). */
export function RunTab({ ctx, params }: AddonTabProps) {
  const projectId = typeof params.projectId === "string" ? params.projectId : "";
  const runId = typeof params.runId === "string" ? params.runId : "";
  const { data: run, error, loading, reload } = useHostCall<Run | null>("run", { projectId, runId });
  const { data: files, reload: reloadFiles } = useHostCall<Record<string, string>>("outputFiles", {
    projectId,
    runId,
  });
  useAddonEvent("changed", (p) => {
    const e = p as { runId?: string } | undefined;
    if (!e?.runId || e.runId === runId) {
      void reload();
      void reloadFiles();
    }
  });
  const projects = useProjectList();
  const now = useNow();
  const [sheet, setSheet] = useState<{ kind: "stage" | "gate"; id: string }>();
  const [action, setAction] = useState<{ mode: "rerun" | "fork"; stageId?: string }>();
  const [inspecting, setInspecting] = useState(false);
  const [planning, setPlanning] = useState(false);
  const { data: brief } = useHostCall<BriefDoc | null>("briefDoc", { projectId, runId }, { skip: !planning });
  // A modal closes after its animation: clear only the sheet it was, not one opened since.
  const closeSheet = (id: string) => setSheet((s) => (s?.id === id ? undefined : s));
  if (run === undefined || (loading && !run))
    return error ? <div className="p-3 text-xs text-danger">{error}</div> : <Spinner center />;
  if (!run) return <Empty icon={Factory} title="This run is gone" className="h-full" />;
  const project = projects.find((p) => p.id === run.projectId);
  const outputs = run.outputs.filter((o) => o.status !== "superseded");
  return (
    <div className="@container flex h-full min-h-0 flex-col" data-testid="factory-run">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-4">
        <ProjectSwatch color={project?.color} />
        <span className="min-w-0 truncate text-sm font-semibold text-fg" data-testid="factory-run-title">
          {run.title}
        </span>
        <LevelBadge level={run.level} />
        <span className="@max-xl:hidden @xl:inline min-w-0 truncate text-xs text-hint">
          {TRACK_NAME[run.track]} · branch factory/{run.slug}
        </span>
        <span className="flex-1" />
        {isSample(run.id) && <Badge tone="neutral">Sample</Badge>}
        {run.stages.some((s) => s.recipe === "plan" && s.status === "needs-you") ? (
          <Button
            size="sm"
            variant="primary"
            data-testid="factory-run-plan"
            onClick={() => setPlanning(true)}
          >
            Plan the run…
          </Button>
        ) : (
          run.state === "interview" && (
            <Button size="sm" data-testid="factory-run-interview" onClick={() => openInterview(ctx, run)}>
              Interview
            </Button>
          )
        )}
        {demoVersions(run).length > 0 && (
          <Button size="sm" data-testid="factory-run-review" onClick={() => openReview(ctx, run)}>
            Review demo
          </Button>
        )}
        <IconButton
          icon={MoreHorizontal}
          size="sm"
          label="More"
          data-testid="factory-run-more"
          onClick={(e) =>
            ctx.menu(
              [
                {
                  label: "Inspector",
                  icon: "scan-search",
                  testId: "factory-run-inspector",
                  onSelect: () => setInspecting(true),
                },
                {
                  label: "Re-run a stage…",
                  icon: "rotate-ccw",
                  testId: "factory-run-rerun",
                  onSelect: () => setAction({ mode: "rerun" }),
                },
                {
                  label: "Fork from a stage…",
                  icon: "git-fork",
                  testId: "factory-run-fork",
                  onSelect: () => setAction({ mode: "fork" }),
                },
                { separator: true },
                {
                  label: "Stop the run",
                  icon: "square",
                  testId: "factory-run-stop",
                  disabled: run.state === "done" || run.state === "stopped",
                  onSelect: async () => {
                    if (
                      await ctx.confirm({
                        title: "Stop this run?",
                        message: "Its stages stop being started. Its files, chats and branch stay.",
                        confirmLabel: "Stop",
                        danger: true,
                      })
                    )
                      void ctx.host.call("stop", { projectId, runId });
                  },
                },
              ],
              e.currentTarget,
            )
          }
        />
      </div>
      <StageGraph
        boxes={graphBoxes(run, TRACK)}
        onOpen={(b) => setSheet({ kind: b.kind === "gate" ? "gate" : "stage", id: b.id })}
      />
      <div className="@max-3xl:flex-col @3xl:flex-row flex min-h-0 flex-1 overflow-y-auto">
        <section className="@container flex min-w-0 flex-1 flex-col gap-2 p-4">
          <div className="flex h-5 items-center gap-2">
            <span className="text-2xs font-semibold tracking-wide text-hint uppercase">Outputs</span>
            <span className="text-2xs text-hint tabular-nums">{outputs.length}</span>
            <span className="flex-1" />
            <span className="truncate text-2xs text-hint">Drafts by Jig · check before you approve</span>
          </div>
          {outputs.length ? (
            <div
              className="@max-sm:grid-cols-1 @sm:@max-lg:grid-cols-2 @lg:@max-2xl:grid-cols-3 @2xl:@max-4xl:grid-cols-4 @4xl:grid-cols-5 grid gap-3"
              data-testid="factory-outputs"
            >
              {outputs.map((o) => (
                <OutputCard
                  key={o.id}
                  output={o}
                  path={files?.[o.id]}
                  now={now}
                  onOpen={() => {
                    const path = files?.[o.id];
                    if (path) ctx.openPreview(path);
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="flex h-38 items-center justify-center rounded-lg border border-dashed border-line text-xs text-hint">
              No outputs yet
            </div>
          )}
        </section>
        <aside className="@max-3xl:w-full @3xl:w-70 @3xl:border-l @max-3xl:border-t flex shrink-0 flex-col border-line py-2">
          <SectionTitle>Timeline</SectionTitle>
          <ol className="flex flex-col" data-testid="factory-timeline">
            {timeline(run, (s) => stageTitle(s.id)).map((e, i) => (
              <li key={`${e.at}-${i}`} className="flex min-h-6 items-start gap-2 px-3 py-0.5 text-xs">
                <span className="w-16 shrink-0 text-right whitespace-nowrap text-hint tabular-nums">
                  {clock(e.at, now)}
                </span>
                <span className="min-w-0 flex-1 text-muted">{e.text}</span>
              </li>
            ))}
          </ol>
          <SectionTitle>Chats</SectionTitle>
          <ul className="flex flex-col" data-testid="factory-chats">
            {run.stages
              .filter((s) => s.chatId)
              .map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="flex h-7 w-full items-center gap-2 px-3 text-left text-xs hover:bg-hover"
                    onClick={() => void ctx.openChat({ sessionId: s.chatId })}
                  >
                    <span className="w-16 shrink-0 text-right text-hint tabular-nums">{s.id}</span>
                    <span className="min-w-0 flex-1 truncate text-muted">{stageTitle(s.id)}</span>
                    <span className="w-14 shrink-0 text-right text-2xs text-hint tabular-nums">
                      {(s.chats?.length ?? 1) > 1 ? `${s.chats?.length} chats` : ""}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </aside>
      </div>
      {sheet?.kind === "stage" && (
        <StageSheet
          ctx={ctx}
          run={run}
          boxId={sheet.id}
          title={stageTitle}
          files={files}
          now={now}
          onClose={() => closeSheet(sheet.id)}
          onAction={(mode, stageId) => {
            setSheet(undefined);
            setAction({ mode, stageId });
          }}
        />
      )}
      {sheet?.kind === "gate" && (
        <GateSheet
          ctx={ctx}
          run={run}
          gateId={sheet.id as GateId}
          files={files}
          onClose={() => closeSheet(sheet.id)}
        />
      )}
      {action && (
        <StageActionDialog
          ctx={ctx}
          run={run}
          mode={action.mode}
          stageId={action.stageId}
          title={stageTitle}
          onClose={() => setAction(undefined)}
          onForked={(r) => openRun(ctx, r)}
        />
      )}
      {inspecting && <InspectorDialog run={run} now={now} onClose={() => setInspecting(false)} />}
      {planning && (
        <PlanDialog ctx={ctx} run={run} brief={brief ?? null} onClose={() => setPlanning(false)} />
      )}
    </div>
  );
}

function stageTitle(id: string): string {
  const [base = id, sub] = id.split(":");
  const item = TRACK.stages.find((s) => itemId(s) === base);
  const title = item?.title ?? base;
  return sub ? `${title}: ${sub}` : title;
}

const BOX_WORDS: Record<GraphBox["status"], string> = {
  done: "Done",
  running: "Running",
  "needs-you": "Waiting for your answer",
  waiting: "Waiting for its owner",
  changes: "Changes asked",
  failed: "Failed",
  skipped: "Skipped",
  pending: "Not yet",
};

const BOX_MARK: Record<GraphBox["status"], string> = {
  done: "bg-success",
  running: "bg-accent",
  "needs-you": "bg-warning",
  waiting: "bg-warning",
  changes: "bg-info",
  failed: "bg-danger",
  skipped: "bg-line",
  pending: "border border-line-strong",
};

/** The fixed stage-graph row: dots for stages, diamonds for gates, joined by lines. */
function StageGraph({ boxes, onOpen }: { boxes: GraphBox[]; onOpen: (box: GraphBox) => void }) {
  return (
    <div
      className="flex h-12 shrink-0 items-center overflow-x-auto border-b border-line px-4"
      data-testid="factory-graph"
    >
      {boxes.map((b, i) => (
        <span key={b.id} className="flex shrink-0 items-center">
          {i > 0 && <span className="mx-1.5 h-px w-3 bg-line" />}
          <Tooltip content={`${b.title} · ${BOX_WORDS[b.status]}`}>
            <button
              type="button"
              onClick={() => onOpen(b)}
              className="flex h-6 items-center gap-1.5 rounded-md px-1.5 hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus"
              data-testid={`factory-node-${b.id}`}
              data-status={b.status}
            >
              <span
                className={cn(
                  "size-2.5 shrink-0",
                  b.kind === "gate" ? "rotate-45 rounded-xs" : "rounded-full",
                  BOX_MARK[b.status],
                )}
              />
              <span
                className={cn(
                  "text-xs tabular-nums",
                  b.status === "pending" || b.status === "skipped" ? "text-hint" : "text-fg",
                  b.status === "skipped" && "line-through",
                )}
              >
                {b.id}
              </span>
              {b.detail && <span className="text-2xs text-muted tabular-nums">{b.detail}</span>}
            </button>
          </Tooltip>
        </span>
      ))}
    </div>
  );
}

/** An output: a picture of it, its name and age, and its status at the bottom-right edge. */
function OutputCard({
  output,
  path,
  now,
  onOpen,
}: {
  output: Output;
  path?: string;
  now: number;
  onOpen: () => void;
}) {
  const html = output.path.endsWith(".html");
  const last = output.history[output.history.length - 1];
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="factory-output"
      data-output={output.id}
      className="flex h-38 min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-raised text-left shadow-card transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-focus"
    >
      <span className="block h-22 shrink-0 overflow-hidden border-b border-line bg-surface">
        {html ? (
          <HtmlThumbnail path={path} height={88} />
        ) : (
          <span className="flex h-full items-center justify-center">
            <FileIcon path={output.path} className="size-6" />
          </span>
        )}
      </span>
      <span className="flex min-h-0 flex-1 flex-col justify-between px-2.5 py-2">
        <span className="truncate text-xs font-medium text-fg">{outputName(output)}</span>
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-2xs text-hint tabular-nums">
            {last
              ? `${last.by === "jig" ? "Jig" : last.by === "me" ? "You" : last.by} · ${since(last.at, now)}`
              : ""}
          </span>
          <OutputPill status={output.status} />
        </span>
      </span>
    </button>
  );
}

// ─── Inbox ──────────────────────────────────────────────────────────────────────────────────────

/** Everything waiting for a person across projects, grouped by gate (ui.md → Inbox). */
export function InboxTab({ ctx }: AddonTabProps) {
  const { data, error } = useAllRuns();
  const projects = useProjectList();
  const now = useNow();
  const [reviewing, setReviewing] = useState<ReviewTarget>();
  if (!data) return error ? <div className="p-3 text-xs text-danger">{error}</div> : <Spinner center />;
  const items = inbox(data);
  const trusted = trustByKind(data.flatMap((r) => r.outputs));
  const review = reviewing && (
    <OutputReview ctx={ctx} target={reviewing} onClose={() => setReviewing(undefined)} />
  );
  if (!items.length && !trusted.length)
    return (
      <>
        <Empty icon={Inbox} title="Nothing waits for a person" className="h-full">
          Gates, drafts and questions from Jig factory's runs show here, from every project.
        </Empty>
        {review}
      </>
    );
  const groups: Array<{ group: InboxGroup; items: InboxItem[] }> = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last?.group === item.group) last.items.push(item);
    else groups.push({ group: item.group, items: [item] });
  }
  const open = async (item: InboxItem) => {
    if (item.group === "G1")
      return openReview(ctx, { id: item.runId, projectId: item.projectId, title: item.runTitle });
    if (item.outputId && item.kind === "output" && item.group !== "GD")
      return setReviewing({
        projectId: item.projectId,
        runId: item.runId,
        runTitle: item.runTitle,
        outputId: item.outputId,
      });
    if (item.outputId) {
      const path = await ctx.host.call<string | null>("outputFile", {
        projectId: item.projectId,
        runId: item.runId,
        outputId: item.outputId,
      });
      if (path) return ctx.openPreview(path);
    }
    openRun(ctx, { id: item.runId, projectId: item.projectId, title: item.runTitle });
  };
  return (
    <div className="@container h-full min-h-0 overflow-y-auto" data-testid="factory-inbox">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-4">
        {groups.map(({ group, items: rows }) => (
          <section key={group} className="flex flex-col">
            <div className="flex h-7 items-center gap-2 px-2">
              <span className="min-w-0 flex-1 truncate text-2xs font-semibold tracking-wide text-hint uppercase">
                {group in GATES ? `${group} · ${groupLabel(group)}` : groupLabel(group)}
              </span>
              <span className="text-2xs text-hint tabular-nums">{rows.length}</span>
            </div>
            <div className="flex flex-col overflow-hidden rounded-lg border border-line bg-raised">
              {rows.map((item) => (
                <InboxRow
                  key={item.key}
                  item={item}
                  color={projects.find((p) => p.id === item.projectId)?.color}
                  now={now}
                  onOpen={() => void open(item)}
                />
              ))}
            </div>
          </section>
        ))}
        {!items.length && (
          <div className="flex h-9 items-center px-2 text-xs text-hint">Nothing waits for a person</div>
        )}
        <TrustTable rows={trusted} />
      </div>
      {review}
    </div>
  );
}

/** A fixed-column row: square, run, what waits, how long, owner, pill at the right edge. */
function InboxRow({
  item,
  color,
  now,
  onOpen,
}: {
  item: InboxItem;
  color?: string;
  now: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="factory-inbox-row"
      className="flex h-9 w-full min-w-0 items-center gap-3 border-b border-line px-3 text-left text-xs last:border-b-0 hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus"
    >
      <ProjectSwatch color={color} />
      <span className="@max-lg:w-24 @lg:w-40 shrink-0 truncate font-medium text-fg">{item.runTitle}</span>
      <span className="min-w-0 flex-1 truncate text-muted">{item.label}</span>
      <span className="w-20 shrink-0 text-right whitespace-nowrap text-hint tabular-nums">
        {since(item.since, now)}
      </span>
      <span className="@max-lg:hidden @lg:block w-32 shrink-0 truncate text-muted">
        {ownerName(item.owner)}
      </span>
      <span className="flex w-16 shrink-0 justify-end">
        <InboxPill item={item} />
      </span>
    </button>
  );
}

// ─── Sidebar view ───────────────────────────────────────────────────────────────────────────────

/** The compact runs list of the active project (View → Views → Jig factory). */
export function FactoryView({ ctx }: { ctx: AddonUiContext }) {
  const project = useActiveProject();
  const { data, error } = useRuns(project?.id);
  if (!project) return <Empty icon={Factory} title="No project" className="h-full" />;
  const header = (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line pr-1.5 pl-3">
      <span className="min-w-0 flex-1 truncate text-xs text-muted">{project.name}</span>
      <IconButton
        icon={LayoutGrid}
        size="sm"
        label="Floor"
        data-testid="factory-view-floor"
        onClick={() => openFloor(ctx)}
      />
      <IconButton icon={Inbox} size="sm" label="Inbox" onClick={() => openInbox(ctx)} />
      <IconButton
        icon={MoreHorizontal}
        size="sm"
        label="More"
        onClick={(e) =>
          ctx.menu(
            sampleItems(
              ctx,
              project.id,
              (data ?? []).some((r) => isSample(r.id)),
            ),
            e.currentTarget,
          )
        }
      />
    </div>
  );
  let body: ReactNode;
  if (!data) body = error ? <div className="p-3 text-xs text-danger">{error}</div> : <Spinner center />;
  else if (!data.length) body = <NoRuns projectId={project.id} onStart={() => startFromBrief(ctx)} />;
  else {
    const mine = data.filter((r) => waitsForMe(r));
    const running = data.filter((r) => !mine.includes(r) && r.state !== "done" && r.state !== "stopped");
    const done = data.filter((r) => !mine.includes(r) && (r.state === "done" || r.state === "stopped"));
    const group = (title: string, runs: Run[]) =>
      runs.length > 0 && (
        <section key={title}>
          <SectionTitle>
            {title} · {runs.length}
          </SectionTitle>
          {runs.map((r) => (
            <ViewRow
              key={r.id}
              run={r}
              color={project.color}
              mine={mine.includes(r)}
              onOpen={() => openRun(ctx, r)}
            />
          ))}
        </section>
      );
    body = (
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {group("Waiting for you", mine)}
        {group("Running", running)}
        {group("Done", done)}
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="factory-view">
      {header}
      {body}
    </div>
  );
}

function ViewRow({
  run,
  color,
  mine,
  onOpen,
}: {
  run: Run;
  color?: string;
  mine: boolean;
  onOpen: () => void;
}) {
  const p = progress(run);
  const ended = run.state === "done" || run.state === "stopped";
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="factory-view-row"
      title={`${run.title} · ${p.label}`}
      className="flex h-8 w-full min-w-0 items-center gap-2 px-3 text-left text-xs hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus"
    >
      <ProjectSwatch color={color} />
      <span className="min-w-0 flex-1 truncate text-fg">{run.title}</span>
      <LevelBadge level={run.level} />
      <span className="flex w-12 shrink-0 items-center justify-end">
        {mine || ended ? <RunMark run={run} mine={mine} /> : <Ring value={p.value} />}
      </span>
    </button>
  );
}

export { fromMessage, newIdea } from "./idea";
export { InterviewTab } from "./interview";
export { ReviewTab } from "./review";
