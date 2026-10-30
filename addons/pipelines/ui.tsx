import { type AddonComponentProps, type AddonUiContext, type Arrangement, EMPTY_ARRANGEMENT } from "@jig/sdk";
import {
  ArrangeList,
  Badge,
  Button,
  Card,
  cn,
  Dialog,
  Empty,
  IconButton,
  Input,
  Select,
  Spinner,
  Switch,
  useAddonEvent,
  useHostCall,
} from "@jig/sdk/ui";
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  CircleX,
  ExternalLink,
  FolderGit2,
  ListOrdered,
  LoaderCircle,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  SearchCheck,
  Settings,
  TriangleAlert,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Found, OrgPipelines } from "./host";
import {
  changedParams,
  isActive,
  mergeValues,
  type PipelineInfo,
  type PipelineParam,
  type PipelineRun,
  REASONS,
  type RunKind,
  runKind,
  runLabel,
  stageLine,
} from "./lib/devops";
import {
  effectiveOrgs,
  type OrgSettings,
  orgName,
  orgUrl,
  type Settings as PipelineSettings,
} from "./lib/orgs";
import { pipelineUrl, type Run, runState, runUrl } from "./lib/runs";

type Overview = { orgs: OrgPipelines[]; error?: string };

function when(iso?: string) {
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

function RunStateIcon({ run }: { run?: Run }) {
  const state = runState(run);
  if (state === "running")
    return <LoaderCircle className="size-4 shrink-0 animate-spin text-info" aria-label="Running" />;
  if (state === "queued") return <CircleDashed className="size-4 shrink-0 text-muted" aria-label="Queued" />;
  if (state === "succeeded")
    return <CircleCheck className="size-4 shrink-0 text-success" aria-label="Succeeded" />;
  if (state === "failed") return <CircleX className="size-4 shrink-0 text-danger" aria-label="Failed" />;
  if (state === "partial" || state === "canceled")
    return <TriangleAlert className="size-4 shrink-0 text-warning" aria-label={state} />;
  return <CircleDashed className="size-4 shrink-0 text-hint" aria-label="No runs" />;
}

/**
 * Your arrangement of each Azure DevOps project's pipelines (hidden, order, dividers), keyed
 * `<organisation>/<project>`; arrangements from before several organisations are keyed by project.
 */
function useArrangements(ctx: AddonUiContext) {
  const [all, setAll] = useState<Record<string, Arrangement>>();
  useEffect(() => {
    const load = () =>
      void ctx.storage.get<Record<string, Arrangement>>("arrangement").then((v) => setAll(v ?? {}));
    load();
    // Claude changed the stored data.
    return ctx.on("storage", load);
  }, [ctx]);
  const set = (project: string, next: Arrangement) =>
    setAll((current) => {
      const updated = { ...(current ?? {}), [project]: next };
      void ctx.storage.set("arrangement", updated);
      return updated;
    });
  return [all, set] as const;
}

function PipelineRow({
  ctx,
  org,
  project,
  pl,
  arranging,
  onRun,
}: {
  ctx: AddonUiContext;
  org: string;
  project: string;
  pl: OrgPipelines["projects"][number]["pipelines"][number];
  arranging: boolean;
  /** Opens the Run form under the row. */
  onRun: () => void;
}) {
  const open = () =>
    ctx.openExternal(pl.latest ? runUrl(org, project, pl.latest.id) : pipelineUrl(org, project, pl.id));
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`pipeline-${pl.name}`}
      onClick={() => !arranging && open()}
      onKeyDown={(e) => e.key === "Enter" && open()}
      onContextMenu={(e) => {
        e.preventDefault();
        ctx.menu(
          [
            {
              label: "Run…",
              icon: "play",
              onSelect: onRun,
            },
            {
              label: "Open pipeline in browser",
              icon: "external-link",
              onSelect: () => ctx.openExternal(pipelineUrl(org, project, pl.id)),
            },
            ...(pl.latest
              ? [
                  {
                    label: "Open latest run",
                    icon: "external-link",
                    onSelect: () => ctx.openExternal(runUrl(org, project, pl.latest!.id)),
                  },
                ]
              : []),
          ],
          e.nativeEvent,
        );
      }}
      className="group flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 hover:bg-hover"
    >
      <RunStateIcon run={pl.latest} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{pl.name}</div>
        <div className="truncate text-xs text-muted">
          {pl.latest
            ? `${pl.latest.branch} · ${when(pl.latest.finishTime ?? pl.latest.startTime ?? pl.latest.queueTime)}${pl.latest.requestedBy ? ` · ${pl.latest.requestedBy}` : ""}`
            : "never run"}
        </div>
      </div>
      <span className="hidden group-hover:flex group-focus-within:flex">
        <IconButton
          icon={Play}
          size="sm"
          label={`Run ${pl.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRun();
          }}
        />
        <IconButton
          icon={ExternalLink}
          size="sm"
          label="Open in browser"
          onClick={(e) => {
            e.stopPropagation();
            ctx.openExternal(pipelineUrl(org, project, pl.id));
          }}
        />
      </span>
    </div>
  );
}

const KIND_TONE: Record<RunKind, "success" | "info" | "warning" | "danger" | "neutral"> = {
  succeeded: "success",
  running: "info",
  partial: "warning",
  failed: "danger",
  other: "neutral",
};

const STAGE_TONE: Record<string, string> = {
  "✓": "text-success",
  "!": "text-warning",
  "✗": "text-danger",
  "▶": "text-info",
};

/** The run's stages as a line of marks: `Build ✓ → Deploy to staging ▶ → Smoke test ○`. */
function Stages({ run }: { run: PipelineRun }) {
  const line = stageLine(run);
  if (!line) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-1 text-2xs text-muted" data-testid="pipeline-stages">
      {line.split(" → ").map((part, i) => {
        const mark = part.slice(part.lastIndexOf(" ") + 1);
        return (
          <span key={part} className="inline-flex items-center gap-1">
            {i > 0 && <span className="text-hint">→</span>}
            <span>{part.slice(0, part.lastIndexOf(" "))}</span>
            <span className={STAGE_TONE[mark] ?? "text-hint"}>{mark}</span>
          </span>
        );
      })}
    </div>
  );
}

/** The Run form: the branch, a picker per YAML parameter, a checkbox per boolean; queued only on press. */
function RunForm({
  ctx,
  pipeline,
  last,
  onDone,
}: {
  ctx: AddonUiContext;
  pipeline: PipelineInfo;
  last?: PipelineRun | null;
  onDone: () => void;
}) {
  const { data: branchNames } = useHostCall<string[]>("branches", { key: pipeline.key });
  const [branch, setBranch] = useState(pipeline.defaultBranch);
  const [params, setParams] = useState<PipelineParam[]>(pipeline.params);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(pipeline.params.map((p) => [p.name, p.defaultValue])),
  );
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  // Like Azure DevOps' own form: the parameters are those of the YAML on the picked branch.
  useEffect(() => {
    let current = true;
    setReading(true);
    ctx.host.call<PipelineParam[] | null>("parametersAt", { key: pipeline.key, branch }).then(
      (read) => {
        if (!current) return;
        setReading(false);
        if (!read) return;
        setParams(read);
        setValues((v) => mergeValues(read, v));
      },
      () => current && setReading(false),
    );
    return () => {
      current = false;
    };
  }, [ctx, pipeline.key, branch]);
  const changed = changedParams({ params }, values);
  const queueRun = async () => {
    setBusy(true);
    try {
      const run = await ctx.host.call<{ number: string; url: string }>("queue", {
        key: pipeline.key,
        branch,
        values,
      });
      ctx.notify({
        title: `${pipeline.name} queued`,
        message: `Run ${run.number} on ${branch}. You'll be told when it finishes.`,
        tone: "success",
      });
      onDone();
    } catch (error) {
      ctx.notify({
        title: `Couldn't run ${pipeline.name}`,
        message: (error as Error).message,
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  };
  const set = (name: string, value: string) => setValues((v) => ({ ...v, [name]: value }));
  return (
    <Dialog
      open
      onClose={onDone}
      title={`Run ${pipeline.name}`}
      testId={`pipeline-form-${pipeline.name}`}
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={Play}
            busy={busy}
            onClick={() => void queueRun()}
            data-testid="pipeline-queue"
          >
            Queue run
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 text-xs text-muted">
          Branch
          <Select
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            data-testid="pipeline-branch"
            aria-label="Branch"
          >
            {(branchNames ?? [pipeline.defaultBranch]).map((b) => (
              <option key={b} value={b}>
                {b}
                {b === pipeline.defaultBranch ? " (default)" : ""}
              </option>
            ))}
          </Select>
        </div>
        {params.map((p) =>
          p.type === "boolean" ? (
            <label key={p.name} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-accent"
                checked={values[p.name] === "true"}
                onChange={(e) => set(p.name, e.target.checked ? "true" : "false")}
                data-testid={`pipeline-param-${p.name}`}
              />
              {p.label}
            </label>
          ) : (
            <div key={p.name} className="flex flex-col gap-1 text-xs text-muted">
              {p.label}
              {p.values.length ? (
                <Select
                  value={values[p.name]}
                  onChange={(e) => set(p.name, e.target.value)}
                  data-testid={`pipeline-param-${p.name}`}
                  aria-label={p.label}
                >
                  {p.values.map((v) => (
                    <option key={v} value={v}>
                      {v}
                      {v === p.defaultValue ? " (default)" : ""}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  value={values[p.name] ?? ""}
                  onChange={(e) => set(p.name, e.target.value)}
                  data-testid={`pipeline-param-${p.name}`}
                  aria-label={p.label}
                />
              )}
            </div>
          ),
        )}
        {/* One line for "reading…" and "no parameters", so the form doesn't change height. */}
        <div className="flex h-4 items-center text-xs text-hint">
          {reading ? (
            <Spinner size="sm" />
          ) : (
            !params.length &&
            (pipeline.yaml ? (
              <>
                No run-time parameters in <code className="ml-1">{pipeline.yaml}</code>
              </>
            ) : (
              "No YAML file found for this pipeline"
            ))
          )}
        </div>
        <div className="text-xs text-muted" data-testid="pipeline-summary">
          Runs <span className="text-fg">{pipeline.name}</span> on <span className="text-fg">{branch}</span>{" "}
          {changed ? `with ${changed}` : "with the defaults"}
          {last && last.branch !== branch && <span className="text-hint"> (last run: {last.branch})</span>}
        </div>
      </div>
    </Dialog>
  );
}

/** One pipeline: its state, the newest run (chip, branch, why, who, what it changed), its stages. */
function PipelineCard({
  ctx,
  pipeline,
  run,
  open,
  onOpen,
  arranging,
  loading = false,
}: {
  ctx: AddonUiContext;
  pipeline: PipelineInfo;
  run?: PipelineRun | null;
  /** The newest runs haven't come yet. */
  loading?: boolean;
  open: boolean;
  onOpen: (open: boolean) => void;
  arranging: boolean;
}) {
  const org = orgUrl(pipeline.org);
  const kind = runKind(run);
  const details = run
    ? [run.branch, REASONS[run.reason] ?? run.reason, run.by, changedParams(pipeline, run.params)].filter(
        Boolean,
      )
    : [];
  const menu = (e: React.MouseEvent) =>
    ctx.menu(
      [
        { label: "Run…", icon: "play", onSelect: () => onOpen(true) },
        ...(run
          ? [
              {
                label: "Open this run",
                icon: "external-link",
                onSelect: () => ctx.openExternal(runUrl(org, pipeline.project, run.id)),
              },
            ]
          : []),
        {
          label: "Open the pipeline",
          icon: "rocket",
          onSelect: () => ctx.openExternal(pipelineUrl(org, pipeline.project, pipeline.id)),
        },
      ],
      e.nativeEvent,
    );
  return (
    <div
      className={cn(
        "group rounded-md px-2 py-1.5",
        open ? "bg-hover" : "hover:bg-hover",
        isActive(run) && "border-l-2 border-info",
      )}
      data-testid={`pipeline-${pipeline.name}`}
      onContextMenu={(e) => {
        e.preventDefault();
        menu(e);
      }}
    >
      <div className="flex items-center gap-2">
        {loading ? (
          <LoaderCircle
            className="size-4 shrink-0 animate-spin text-hint"
            aria-label="Loading the latest run"
          />
        ) : (
          <StateIcon kind={kind} run={run} />
        )}
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-sm"
          title={run ? "Open this run in the browser" : "Open the pipeline in the browser"}
          disabled={arranging}
          onClick={() =>
            ctx.openExternal(
              run ? runUrl(org, pipeline.project, run.id) : pipelineUrl(org, pipeline.project, pipeline.id),
            )
          }
        >
          {pipeline.name}
        </button>
        <span className="shrink-0" data-testid="pipeline-chip">
          {loading ? (
            <span
              className="block h-4 w-14 animate-pulse rounded-sm bg-active"
              title="Loading the latest run"
              data-testid="pipeline-loading"
            />
          ) : (
            <Badge tone={KIND_TONE[kind]}>{runLabel(run)}</Badge>
          )}
        </span>
        {!arranging && (
          <>
            <Button
              size="sm"
              variant={open ? "primary" : "secondary"}
              icon={Play}
              onClick={() => onOpen(!open)}
              data-testid={`pipeline-run-${pipeline.name}`}
              title={`Run ${pipeline.name}…`}
            >
              Run
            </Button>
            <IconButton
              icon={MoreHorizontal}
              size="sm"
              label="More"
              className="opacity-0 group-hover:opacity-100 focus:opacity-100"
              onClick={(e) => menu(e)}
            />
          </>
        )}
      </div>
      {details.length > 0 && (
        <div className="truncate pl-6 text-xs text-muted" title={details.join(" · ")}>
          {details.join(" · ")}
        </div>
      )}
      {run && (
        <div className="pl-6">
          <Stages run={run} />
        </div>
      )}
      {open && <RunForm ctx={ctx} pipeline={pipeline} last={run} onDone={() => onOpen(false)} />}
    </div>
  );
}

function StateIcon({ kind, run }: { kind: RunKind; run?: PipelineRun | null }) {
  if (kind === "running")
    return <LoaderCircle className="size-4 shrink-0 animate-spin text-info" aria-label="Running" />;
  if (kind === "succeeded")
    return <CircleCheck className="size-4 shrink-0 text-success" aria-label="Succeeded" />;
  if (kind === "failed") return <CircleX className="size-4 shrink-0 text-danger" aria-label="Failed" />;
  if (kind === "partial")
    return <TriangleAlert className="size-4 shrink-0 text-warning" aria-label="Partly" />;
  return (
    <CircleDashed className="size-4 shrink-0 text-hint" aria-label={run ? runLabel(run) : "Never run"} />
  );
}

type Latest = { runs: Record<string, PipelineRun | null>; error?: string };

/** The newest runs, every 20 s while one runs and Jig is in front, else every minute. */
function useLatest(ctx: AddonUiContext, keys: string[]) {
  const [latest, setLatest] = useState<Latest>();
  const [loading, setLoading] = useState(false);
  const joined = keys.join("|");
  const reload = useCallback(async () => {
    // No pipelines found yet: nothing to ask, and nothing to show as loaded.
    if (!joined) return;
    setLoading(true);
    try {
      setLatest(await ctx.host.call<Latest>("latest", { keys: joined.split("|") }));
    } catch (error) {
      setLatest((l) => ({ runs: l?.runs ?? {}, error: (error as Error).message }));
    } finally {
      setLoading(false);
    }
  }, [ctx, joined]);
  useEffect(() => {
    void reload();
  }, [reload]);
  const busy = Object.values(latest?.runs ?? {}).some(isActive);
  useEffect(() => {
    const t = setInterval(
      () => document.visibilityState === "visible" && void reload(),
      busy ? 20_000 : 60_000,
    );
    return () => clearInterval(t);
  }, [reload, busy]);
  useAddonEvent("runs-changed", () => void reload());
  return { latest, loading, reload };
}

export function PipelinesView({ ctx }: AddonComponentProps) {
  const [found, setFound] = useState<Found>();
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState<string>();
  const find = useCallback(
    async (force = false) => {
      setFinding(true);
      setFindError(undefined);
      try {
        setFound(await ctx.host.call<Found>("pipelines", { force }));
      } catch (error) {
        setFindError((error as Error).message);
      } finally {
        setFinding(false);
      }
    },
    [ctx],
  );
  useEffect(() => {
    void find();
    // Pipelines created in Azure DevOps join their repository on their own.
    const t = setInterval(() => document.visibilityState === "visible" && void find(), 5 * 60_000);
    return () => clearInterval(t);
  }, [find]);
  const list = found?.pipelines ?? [];
  const { latest, loading, reload } = useLatest(
    ctx,
    list.map((p) => p.key),
  );
  const [arrangements, setArrangement] = useArrangements(ctx);
  const [arranging, setArranging] = useState(false);
  const [openForm, setOpenForm] = useState<string>();
  const [more, setMore] = useState(false);
  useAddonEvent("open-run", (key) => setOpenForm(String(key)));
  if (!found && !findError) return <Spinner center />;
  const repos = [...new Set(list.map((p) => p.repoPath))];
  const running = Object.values(latest?.runs ?? {}).filter(isActive).length;
  return (
    <div className="flex h-full flex-col" data-testid="pipelines-view">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line px-2 text-xs text-muted">
        <Rocket className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate" data-testid="pipelines-counts">
          {list.length} pipeline{list.length === 1 ? "" : "s"}
          {repos.length > 0 && ` · ${repos.length} repo${repos.length === 1 ? "" : "s"}`}
          {running > 0 && <span className="text-info"> · {running} running</span>}
        </span>
        {(loading || finding) && <Spinner size="sm" />}
        <Button
          size="sm"
          variant={arranging ? "primary" : "ghost"}
          icon={arranging ? Check : ListOrdered}
          onClick={() => setArranging(!arranging)}
          data-testid="pipelines-arrange"
          title="Hide pipelines, reorder them, group them with dividers"
        >
          {arranging ? "Done" : "Arrange"}
        </Button>
        <IconButton icon={RefreshCw} size="sm" label="Refresh runs" onClick={() => void reload()} />
        <IconButton
          icon={SearchCheck}
          size="sm"
          label="Find pipelines again"
          onClick={() => void find(true)}
          data-testid="pipelines-find"
        />
        <IconButton icon={Settings} size="sm" label="Pipelines settings" onClick={() => ctx.openSettings()} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {findError && <div className="px-2 py-1 text-xs text-danger">{findError}</div>}
        {latest?.error && <div className="px-2 py-1 text-xs text-warning">{latest.error}</div>}
        {found?.errors.map((e) => (
          <div key={e} className="px-2 py-1 text-xs text-warning">
            {e}
          </div>
        ))}
        {found && list.length === 0 && (
          <Empty icon={Rocket} title="No pipelines found">
            <p>
              Pipelines lists the Azure DevOps pipelines of the repositories in your workspaces, through your
              own az CLI.
            </p>
            <Button
              size="sm"
              className="mt-2"
              icon={SearchCheck}
              busy={finding}
              onClick={() => void find(true)}
            >
              Find pipelines again
            </Button>
          </Empty>
        )}
        {repos.map((path) => {
          const items = list.filter((p) => p.repoPath === path);
          const first = items[0]!;
          const key = `repo:${first.repoName}`;
          return (
            <section
              key={path}
              className="mb-2 rounded-lg border border-line bg-raised p-1"
              data-testid={`pipelines-repo-${first.repoName}`}
            >
              <div className="flex items-center gap-1.5 px-2 pt-1 pb-0.5">
                <FolderGit2 className="size-3.5 shrink-0 text-muted" />
                <span className="truncate text-xs font-semibold text-fg">{first.repoName}</span>
                <span className="truncate text-2xs text-hint">
                  {first.org}/{first.project}
                </span>
              </div>
              <ArrangeList
                items={items}
                keyOf={(p) => String(p.id)}
                arrangement={arrangements?.[key] ?? EMPTY_ARRANGEMENT}
                onChange={(next) => setArrangement(key, next)}
                arranging={arranging}
                testId={`pipelines-list-${first.repoName}`}
                renderItem={(p) => (
                  <PipelineCard
                    ctx={ctx}
                    pipeline={p}
                    run={latest?.runs[p.key]}
                    loading={!latest}
                    open={openForm === p.key}
                    onOpen={(o) => setOpenForm(o ? p.key : undefined)}
                    arranging={arranging}
                  />
                )}
              />
            </section>
          );
        })}
        <button
          type="button"
          className="mt-1 flex w-full items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-hover hover:text-fg"
          onClick={() => {
            // A pipeline of a checked-out repository belongs with its repository, not down here.
            if (!more) void find(true);
            setMore(!more);
          }}
          data-testid="pipelines-more"
        >
          {more ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          More pipelines in your organisations
        </button>
        {more && (
          <MorePipelines
            ctx={ctx}
            known={new Set(list.map((p) => p.key.toLowerCase()))}
            arrangements={arrangements}
            setArrangement={setArrangement}
            arranging={arranging}
          />
        )}
      </div>
    </div>
  );
}

/** The Run form of a pipeline whose repository isn't checked out: described from Azure DevOps first. */
function OtherRunForm({
  ctx,
  org,
  project,
  pl,
  onDone,
}: {
  ctx: AddonUiContext;
  org: string;
  project: string;
  pl: OrgPipelines["projects"][number]["pipelines"][number];
  onDone: () => void;
}) {
  const { data, error } = useHostCall<PipelineInfo>("describe", { org, project, id: pl.id, name: pl.name });
  if (data) return <RunForm ctx={ctx} pipeline={data} last={undefined} onDone={onDone} />;
  // A modal while it loads, so nothing in the list moves.
  return (
    <Dialog open onClose={onDone} title={`Run ${pl.name}`}>
      {error ? <div className="text-xs text-danger">{error}</div> : <Spinner center />}
    </Dialog>
  );
}

/** Every organisation's pipelines (D-125), but the ones listed above: loaded only when opened. */
function MorePipelines({
  ctx,
  known,
  arrangements,
  setArrangement,
  arranging,
}: {
  ctx: AddonUiContext;
  known: Set<string>;
  arrangements?: Record<string, Arrangement>;
  setArrangement: (key: string, next: Arrangement) => void;
  arranging: boolean;
}) {
  const { data, error } = useHostCall<Overview>("overview");
  const [openForm, setOpenForm] = useState<string>();
  if (error) return <div className="p-2 text-xs text-danger">{error}</div>;
  if (!data) return <Spinner center />;
  if (data.orgs.length === 0)
    return (
      <div className="px-2 py-1 text-xs text-muted">
        {data.error ?? "No organisations."}{" "}
        <button type="button" className="text-accent hover:underline" onClick={() => ctx.openSettings()}>
          Settings
        </button>
      </div>
    );
  const several = data.orgs.length > 1;
  return (
    <div data-testid="pipelines-more-list">
      {data.error && <div className="px-2 py-1 text-xs text-warning">{data.error}</div>}
      {data.orgs.map((o) => (
        <div key={o.org} className="mb-3" data-testid={`pipelines-org-${orgName(o.org)}`}>
          {several && <div className="px-2 pt-1 pb-0.5 text-xs font-semibold text-fg">{orgName(o.org)}</div>}
          {o.error && <div className="px-2 text-xs text-danger">{o.error}</div>}
          <ArrangeList
            items={o.projects}
            keyOf={(p) => p.project}
            arrangement={arrangements?.[`projects:${orgUrl(o.org).toLowerCase()}`] ?? EMPTY_ARRANGEMENT}
            onChange={(next) => setArrangement(`projects:${orgUrl(o.org).toLowerCase()}`, next)}
            arranging={arranging}
            testId={`pipelines-projects-${orgName(o.org)}`}
            renderItem={(p) => {
              const key = `${orgName(o.org)}/${p.project}`;
              const rest = p.pipelines.filter((pl) => !known.has(`${key}/${pl.id}`.toLowerCase()));
              return (
                <div key={p.project} className="mb-2">
                  <div className="px-2 py-1 text-2xs font-semibold tracking-wide text-hint uppercase">
                    {p.project}
                  </div>
                  {p.error && <div className="px-2 text-xs text-danger">{p.error}</div>}
                  {!p.error && rest.length === 0 && (
                    <div className="px-2 text-xs text-muted">No other pipelines.</div>
                  )}
                  <ArrangeList
                    items={rest}
                    keyOf={(pl) => String(pl.id)}
                    arrangement={arrangements?.[key] ?? arrangements?.[p.project] ?? EMPTY_ARRANGEMENT}
                    onChange={(next) => setArrangement(key, next)}
                    arranging={arranging}
                    testId={`pipelines-project-${p.project}`}
                    renderItem={(pl) => {
                      const formKey = `${key}/${pl.id}`;
                      return (
                        <>
                          <PipelineRow
                            ctx={ctx}
                            org={o.org}
                            project={p.project}
                            pl={pl}
                            arranging={arranging}
                            onRun={() => setOpenForm(openForm === formKey ? undefined : formKey)}
                          />
                          {openForm === formKey && (
                            <OtherRunForm
                              ctx={ctx}
                              org={o.org}
                              project={p.project}
                              pl={pl}
                              onDone={() => setOpenForm(undefined)}
                            />
                          )}
                        </>
                      );
                    }}
                  />
                </div>
              );
            }}
          />
        </div>
      ))}
    </div>
  );
}

/** One organisation in the settings: all its projects, or the ones you pick. */
function OrgSettingsRow({
  ctx,
  value,
  onChange,
  onRemove,
}: {
  ctx: AddonUiContext;
  value: OrgSettings;
  onChange: (next: OrgSettings) => void;
  onRemove?: () => void;
}) {
  const name = orgName(value.org);
  // What is typed in the project-names box, as typed (spaces included).
  const [text, setText] = useState((value.projects ?? []).join(", "));
  const [available, setAvailable] = useState<string[]>();
  const [busy, setBusy] = useState(false);
  const chosen = value.projects ?? [];
  const setProjects = (projects: string[]) =>
    onChange({ org: value.org, projects: projects.length ? projects : undefined });
  const load = async () => {
    setBusy(true);
    try {
      setAvailable(await ctx.host.call<string[]>("listProjects", { org: value.org }));
    } catch (error) {
      ctx.notify({ title: "Couldn't list projects", message: (error as Error).message, tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="flex flex-col gap-1 rounded-md border border-line p-3 text-sm"
      data-testid={`pipelines-org-row-${name}`}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
        <span className="text-xs text-muted">
          {chosen.length ? `${chosen.length} projects` : "All projects"}
        </span>
        <Button size="sm" variant="ghost" busy={busy} onClick={() => void load()}>
          Choose projects
        </Button>
        {onRemove && <IconButton icon={X} size="sm" label={`Remove ${name}`} onClick={onRemove} />}
      </div>
      {available ? (
        <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
          {available.map((project) => (
            <label key={project} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="accent-accent"
                checked={chosen.includes(project)}
                onChange={(e) =>
                  setProjects(e.target.checked ? [...chosen, project] : chosen.filter((x) => x !== project))
                }
              />
              {project}
            </label>
          ))}
          <span className="text-xs text-hint">None ticked = every project.</span>
        </div>
      ) : (
        <Input
          value={text}
          placeholder="All projects, or names separated by commas"
          onChange={(e) => {
            setText(e.target.value);
            setProjects(
              e.target.value
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean),
            );
          }}
          aria-label={`Projects of ${name}`}
          data-testid={`pipelines-projects-${name}`}
        />
      )}
    </div>
  );
}

export function PipelinesSettings({ ctx }: AddonComponentProps) {
  const { data, error } = useHostCall<PipelineSettings>("settings");
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PipelineSettings>();
  const [found, setFound] = useState<{ orgs?: string[]; error?: string }>({});
  const [adding, setAdding] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; message: string }>();
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);
  useEffect(() => {
    if (!form?.allOrgs || found.orgs || found.error) return;
    void ctx.host.call<string[]>("listOrgs").then(
      (orgs) => setFound({ orgs }),
      (error: Error) => setFound({ error: error.message }),
    );
  }, [ctx, form?.allOrgs, found]);
  if (error) return <div className="text-sm text-danger">{error}</div>;
  if (!form) return <Spinner center />;
  const rows = effectiveOrgs(form, form.allOrgs ? (found.orgs ?? []) : []);
  const listed = (org: string) => form.orgs.some((o) => orgUrl(o.org).toLowerCase() === org.toLowerCase());
  const update = (next: OrgSettings) =>
    setForm({
      ...form,
      orgs: listed(next.org)
        ? form.orgs.map((o) => (orgUrl(o.org).toLowerCase() === next.org.toLowerCase() ? next : o))
        : [...form.orgs, next],
    });
  const add = () => {
    const org = orgUrl(adding);
    if (!org) return;
    if (!listed(org)) setForm({ ...form, orgs: [...form.orgs, { org }] });
    setAdding("");
  };
  const save = async () => {
    setSaving(true);
    try {
      await ctx.host.call("saveSettings", form);
      ctx.notify({ title: "Pipelines settings saved", tone: "success" });
    } catch (error) {
      setStatus({ ok: false, message: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flex flex-col gap-6" data-testid="pipelines-settings">
      <div>
        <h2 className="text-lg font-semibold">Pipelines</h2>
        <p className="text-sm text-muted">Azure DevOps through your own Azure CLI. Jig stores no tokens.</p>
      </div>
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            busy={checking}
            onClick={async () => {
              setChecking(true);
              try {
                setStatus(await ctx.host.call<{ ok: boolean; message: string }>("check"));
              } catch (error) {
                setStatus({ ok: false, message: (error as Error).message });
              } finally {
                setChecking(false);
              }
            }}
          >
            Check Azure CLI
          </Button>
          {status && (
            <span className={cn("text-sm", status.ok ? "text-success" : "text-warning")}>
              {status.message}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm" data-testid="pipelines-all-orgs">
          <Switch
            label="Every organisation you belong to"
            checked={form.allOrgs}
            onChange={(allOrgs) => setForm({ ...form, allOrgs })}
          />
          Every organisation your az login belongs to
        </div>
        {form.allOrgs && found.error && <div className="text-xs text-warning">{found.error}</div>}
        {form.allOrgs && !found.orgs && !found.error && <Spinner size="sm" />}
        <div className="flex flex-col gap-2">
          {rows.map((o) => (
            <OrgSettingsRow
              key={o.org}
              ctx={ctx}
              value={o}
              onChange={update}
              onRemove={
                listed(o.org) && !found.orgs?.some((f) => f.toLowerCase() === o.org.toLowerCase())
                  ? () =>
                      setForm({
                        ...form,
                        orgs: form.orgs.filter((x) => orgUrl(x.org).toLowerCase() !== o.org.toLowerCase()),
                      })
                  : undefined
              }
            />
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Input
            value={adding}
            placeholder="Add an organisation: https://dev.azure.com/your-org"
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            aria-label="Organisation"
            data-testid="pipelines-org"
          />
          <Button
            size="sm"
            icon={Plus}
            disabled={!adding.trim()}
            onClick={add}
            data-testid="pipelines-add-org"
          >
            Add
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            busy={saving}
            onClick={() => void save()}
            data-testid="pipelines-save"
          >
            Save
          </Button>
          {rows.map((o) => (
            <Badge key={o.org}>{orgName(o.org)}</Badge>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function showPipelines(ctx: AddonUiContext) {
  ctx.showView("pipelines");
}

/** Tools → Run a pipeline…: your repositories' pipelines; picking one opens its Run form in the view. */
export async function runPipelineAction(ctx: AddonUiContext) {
  const found = await ctx.host.call<Found>("pipelines");
  ctx.showView("pipelines");
  if (found.pipelines.length === 0) return;
  const repos = [...new Set(found.pipelines.map((p) => p.repoName))];
  const item = (p: PipelineInfo) => ({
    label: p.name,
    icon: "play",
    onSelect: () => void ctx.host.call("openRunForm", { key: p.key }),
  });
  ctx.menu(
    repos.length === 1
      ? found.pipelines.map(item)
      : repos.map((r) => ({ label: r, submenu: found.pipelines.filter((p) => p.repoName === r).map(item) })),
    document.querySelector<HTMLElement>("[data-testid=tools-button]") ?? document.body,
  );
}
