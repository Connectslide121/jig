import type { AddonComponentProps, AddonProject, AddonScript, AddonTabProps, AddonUiContext } from "@jig/sdk";
import {
  Badge,
  Button,
  Card,
  cn,
  Empty,
  IconButton,
  Input,
  ProviderMark,
  Select,
  Spinner,
  Textarea,
  useActiveProject,
  useAddon,
  useAddonEvent,
  useHostCall,
} from "@jig/sdk/ui";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Circle,
  CircleCheck,
  CircleX,
  ClipboardCheck,
  Clock,
  Cloud,
  FileCode,
  GitBranch,
  Hourglass,
  ListChecks,
  LoaderCircle,
  type LucideIcon,
  MessageSquare,
  Pencil,
  Play,
  Plus,
  Rocket,
  SkipForward,
  Square,
  SquareTerminal,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { modelShort, runsOnText } from "../shared/providers";
import { RunsOnButton } from "../shared/RunsOn";
import {
  cloudPrompt,
  draftWorkflow,
  effectiveMode,
  markStep,
  newRun,
  newStep,
  nextStep,
  type Run,
  STEP_KINDS,
  type Step,
  type StepKind,
  type StepMode,
  type StepStatus,
  stepRunsOn,
  type Trigger,
  triggerLabel,
  type Workflow,
  withRunsOn,
} from "./lib/workflow";

const MODE_LABEL: Record<StepMode, string> = {
  manual: "You do it",
  auto: "Jig does it",
  ask: "Ask me first",
};

/** One icon per kind of step, the same wherever steps are shown. */
const STEP_ICON: Record<StepKind, LucideIcon> = {
  check: ClipboardCheck,
  command: SquareTerminal,
  script: FileCode,
  pipeline: Rocket,
  claude: MessageSquare,
  wait: Hourglass,
};

/** How it starts: by hand, on a schedule, or after an event. */
function triggerIcon(t: Trigger): LucideIcon {
  if (t.kind === "schedule") return Clock;
  if (t.kind === "push") return GitBranch;
  if (t.kind === "pipeline") return Rocket;
  return Play;
}

type LastRun = Pick<Run, "status" | "startedAt" | "finishedAt">;

function ago(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days} day${days === 1 ? "" : "s"} ago` : new Date(iso).toLocaleDateString();
}

const RUN_LABEL: Record<LastRun["status"], string> = {
  done: "Done",
  failed: "Failed",
  running: "Running",
  stopped: "Stopped",
};

/**
 * One workflow as a card: the whole card opens it; Run starts it. Its steps show as their icons
 * (at most 8, then +n), with how it starts and how the last run went in fixed places.
 */
function WorkflowCard({
  wf,
  last,
  onOpen,
  onRun,
}: {
  wf: Workflow;
  last?: LastRun;
  onOpen: () => void;
  onRun: () => void;
}) {
  const Trigger = triggerIcon(wf.trigger);
  const shown = wf.steps.slice(0, 8);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        onOpen();
      }}
      title={`Open ${wf.name}`}
      data-testid={`workflow-${wf.name}`}
      className={cn(
        "group flex min-w-0 cursor-pointer flex-col gap-2 rounded-lg border border-line bg-raised p-3 text-left shadow-card transition-colors",
        "outline-none hover:border-accent hover:bg-hover focus-visible:ring-1 focus-visible:ring-accent",
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
          <ListChecks className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-fg">{wf.name}</span>
          <span className="block truncate text-xs text-muted">{wf.goal?.trim() || "No description"}</span>
        </span>
        <IconButton
          icon={Play}
          size="sm"
          label={`Run ${wf.name}`}
          data-testid={`workflow-run-${wf.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRun();
          }}
        />
      </div>
      <div className="flex h-5 min-w-0 items-center gap-1 text-hint">
        {shown.map((s) => {
          const Icon = STEP_ICON[s.kind];
          return (
            <span
              key={s.id}
              title={s.title || s.kind}
              className="flex size-5 items-center justify-center rounded-sm bg-active"
            >
              <Icon className="size-3" />
            </span>
          );
        })}
        {wf.steps.length > shown.length && <span className="text-xs">+{wf.steps.length - shown.length}</span>}
        <span className="ml-1 truncate text-xs">
          {wf.steps.length} step{wf.steps.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex min-w-0 items-center gap-3 border-t border-line pt-2 text-xs">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-muted">
          <Trigger className="size-3.5 shrink-0" />
          <span className="truncate">{triggerLabel(wf.trigger)}</span>
        </span>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1.5",
            !last && "text-hint",
            last?.status === "done" && "text-success",
            last?.status === "failed" && "text-danger",
            (last?.status === "running" || last?.status === "stopped") && "text-muted",
          )}
          title={last ? `Last run started ${new Date(last.startedAt).toLocaleString()}` : undefined}
        >
          {last ? (
            <>
              {RUN_LABEL[last.status]} · {ago(last.finishedAt ?? last.startedAt)}
              <StatusIcon
                status={
                  last.status === "done"
                    ? "done"
                    : last.status === "failed"
                      ? "failed"
                      : last.status === "running"
                        ? "running"
                        : "skipped"
                }
              />
            </>
          ) : (
            <>
              Never run
              <Circle className="size-4 shrink-0" />
            </>
          )}
        </span>
      </div>
    </div>
  );
}

function StepKindIcon({ kind }: { kind: StepKind }) {
  const Icon = STEP_ICON[kind];
  return (
    <span
      title={STEP_KINDS.find((k) => k.kind === kind)?.label}
      className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-active text-hint"
    >
      <Icon className="size-3" />
    </span>
  );
}

/** What a step does, readable without opening the editor: the command, the script, the message… */
function StepDetail({ step, scriptName }: { step: Step; scriptName: (id?: string) => string | undefined }) {
  const box = "ml-20 rounded-md bg-surface px-2 py-1.5 text-xs text-muted";
  if (step.kind === "command" && step.command)
    return (
      <div className={cn(box, "font-mono")} data-testid="step-detail">
        {step.command}
        {step.cwd && <span className="block text-hint">in {step.cwd}</span>}
      </div>
    );
  if (step.kind === "script" && step.scriptId)
    return (
      <div className={box} data-testid="step-detail">
        Runs the script <span className="font-mono text-fg">{scriptName(step.scriptId)}</span>
      </div>
    );
  if (step.kind === "pipeline" && step.pipeline)
    return (
      <div className={box} data-testid="step-detail">
        Pipeline {step.pipeline.id} in {step.pipeline.org}/{step.pipeline.project}
        {step.pipeline.branch ? ` on ${step.pipeline.branch}` : ""}
      </div>
    );
  if (step.kind === "claude" && step.prompt?.trim())
    return (
      <div
        className={cn(box, "selectable leading-relaxed whitespace-pre-wrap text-fg")}
        data-testid="step-detail"
      >
        {step.prompt.trim()}
      </div>
    );
  return null;
}

/**
 * An AI step's own provider and model (D-412), before who does it: the provider's mark and the model's
 * short name. Nothing for the default, so a step that follows Jig's default reads as before.
 */
function StepRunsOnBadge({ step }: { step: Step }) {
  const on = stepRunsOn(step);
  if (!on) return null;
  return (
    <span
      className="flex h-5 shrink-0 items-center gap-1 rounded-md border border-line px-1.5 text-xs text-muted"
      title={`Runs in a new chat on ${runsOnText(on)}`}
      data-testid="step-runs-on-badge"
    >
      <ProviderMark provider={on.provider} iconOnly />
      {on.model ? modelShort(on.model) : null}
    </span>
  );
}

function anchor() {
  return document.querySelector<HTMLElement>("[data-testid=goto-button]") ?? document.body;
}

function openWorkflow(ctx: AddonUiContext, wf: Workflow, run = false) {
  ctx.openTab("workflow", { projectId: wf.projectId, id: wf.id, title: wf.name, run });
}

function newWorkflow(ctx: AddonUiContext, project: AddonProject) {
  const wf = draftWorkflow({ name: "New workflow", steps: [] }, project.id);
  ctx.openTab("workflow", { projectId: project.id, draft: wf, title: "New workflow", edit: true });
}

/** The project's workflows (left: it follows the active project, D-102). */
export function WorkflowsView({ ctx }: AddonComponentProps) {
  const project = useActiveProject();
  const { data, reload } = useHostCall<Workflow[]>(
    "list",
    { projectId: project?.id ?? "" },
    { skip: !project },
  );
  const { data: last, reload: reloadRuns } = useHostCall<Record<string, LastRun>>(
    "lastRuns",
    { projectId: project?.id ?? "" },
    { skip: !project },
  );
  useAddonEvent("changed", () => {
    void reload();
    void reloadRuns();
  });
  useAddonEvent("runs", () => void reloadRuns());
  if (!project)
    return (
      <Empty icon={ListChecks} title="No project">
        Pick a project to see its workflows.
      </Empty>
    );
  if (!data) return <Spinner center />;
  return (
    <div className="flex h-full flex-col" data-testid="workflows-view">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line px-2 text-xs text-muted">
        <span className="min-w-0 flex-1 truncate">
          {project.name}
          <span className="text-hint">
            {" "}
            · {data.length} workflow{data.length === 1 ? "" : "s"}
          </span>
        </span>
        <IconButton
          icon={Plus}
          size="sm"
          label="New workflow"
          onClick={() => newWorkflow(ctx, project)}
          data-testid="workflow-new"
        />
      </div>
      <div className="@container min-h-0 flex-1 overflow-y-auto">
        {data.length === 0 ? (
          <Empty icon={ListChecks} title="No workflows yet">
            A workflow is a list of steps you repeat — a release, a deploy, a morning routine. Jig can do the
            steps it can, ask first, or leave them to you. Suggestions draft them from what you do.
          </Empty>
        ) : (
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-2 p-3 @xl:grid-cols-2 @4xl:grid-cols-3">
            {data.map((wf) => (
              <WorkflowCard
                key={wf.id}
                wf={wf}
                last={last?.[wf.id]}
                onOpen={() => openWorkflow(ctx, wf)}
                onRun={() => openWorkflow(ctx, wf, true)}
              />
            ))}
            <button
              type="button"
              onClick={() => newWorkflow(ctx, project)}
              className={cn(
                "group flex min-h-28 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line p-3 text-xs text-hint transition-colors",
                "outline-none hover:border-accent hover:text-accent focus-visible:ring-1 focus-visible:ring-accent",
              )}
              data-testid="workflow-new-card"
            >
              <Plus className="size-4" />
              New workflow
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function showWorkflows(ctx: AddonUiContext) {
  ctx.showView("workflows");
}

export function newWorkflowAction(ctx: AddonUiContext) {
  const project = ctx.projects.active();
  if (!project) return ctx.notify({ title: "Pick a project first", tone: "warning" });
  newWorkflow(ctx, project);
}

export async function runWorkflowMenu(ctx: AddonUiContext) {
  const project = ctx.projects.active();
  if (!project) return ctx.notify({ title: "Pick a project first", tone: "warning" });
  const list = await ctx.host.call<Workflow[]>("list", { projectId: project.id });
  if (!list.length) return ctx.notify({ title: `No workflows in ${project.name} yet`, tone: "info" });
  ctx.menu(
    list.map((wf) => ({ label: wf.name, icon: "play", onSelect: () => openWorkflow(ctx, wf, true) })),
    anchor(),
  );
}

function StatusIcon({ status }: { status?: StepStatus }) {
  if (status === "done") return <CircleCheck className="size-4 shrink-0 text-success" />;
  if (status === "failed") return <CircleX className="size-4 shrink-0 text-danger" />;
  if (status === "running") return <LoaderCircle className="size-4 shrink-0 animate-spin text-info" />;
  if (status === "skipped") return <SkipForward className="size-4 shrink-0 text-hint" />;
  return <Circle className="size-4 shrink-0 text-hint" />;
}

/** One workflow: run it step by step, or edit it. A draft (from a suggestion) opens in edit mode. */
export function WorkflowTab({ params, tabId }: AddonTabProps) {
  const ctx = useAddon();
  const projectId = String(params.projectId ?? "");
  const project = ctx.projects.list().find((p) => p.id === projectId);
  const [wf, setWf] = useState<Workflow>();
  const [editing, setEditing] = useState(Boolean(params.edit || params.draft));
  const [scripts, setScripts] = useState<AddonScript[]>([]);

  useEffect(() => {
    const raw = params.draft as (Partial<Workflow> & { steps?: unknown[] }) | undefined;
    if (raw) {
      // A draft from a suggestion: { name, goal, steps: string[] }; or a new one (a Workflow).
      setWf(
        raw.id && Array.isArray(raw.steps) && typeof raw.steps[0] !== "string"
          ? (raw as Workflow)
          : draftWorkflow(
              { name: raw.name, goal: raw.goal, steps: raw.steps as string[] },
              projectId || (ctx.projects.active()?.id ?? ""),
            ),
      );
      return;
    }
    void ctx.host
      .call<Workflow[]>("list", { projectId })
      .then((all) => setWf(all.find((w) => w.id === params.id)));
  }, [ctx, params.draft, params.id, projectId]);
  useEffect(() => {
    if (project) void ctx.scripts.list(project.id).then((r) => setScripts(r.scripts));
  }, [ctx, project]);
  // Claude changed the stored workflows: show the new version (not while you edit it).
  const reloadStored = () => {
    if (editing || !params.id) return;
    void ctx.host
      .call<Workflow[]>("list", { projectId })
      .then((all) => setWf(all.find((w) => w.id === params.id)));
  };
  useAddonEvent("storage", reloadStored);
  // …or with the Workflows tools (addon_workflows_save).
  useAddonEvent("changed", (payload) => {
    if ((payload as { projectId?: string } | undefined)?.projectId === projectId) reloadStored();
  });

  if (!wf) return <Spinner center />;
  return (
    <div className="h-full overflow-y-auto" data-testid="workflow-tab" data-tab={tabId}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
        {editing ? (
          <Editor
            ctx={ctx}
            project={project}
            initial={wf}
            scripts={scripts}
            onSaved={(saved) => {
              setWf(saved);
              setEditing(false);
              // The tab is named after the workflow, and reopens the stored one (not the draft).
              ctx.updateTab(tabId, {
                id: saved.id,
                projectId: saved.projectId,
                title: saved.name,
                draft: undefined,
                edit: undefined,
              });
            }}
            onCancel={() => (params.draft ? undefined : setEditing(false))}
          />
        ) : (
          <Runner
            ctx={ctx}
            wf={wf}
            project={project}
            scripts={scripts}
            autostart={Boolean(params.run)}
            onEdit={() => setEditing(true)}
          />
        )}
      </div>
    </div>
  );
}

function Runner({
  ctx,
  wf,
  project,
  scripts,
  autostart,
  onEdit,
}: {
  ctx: AddonUiContext;
  wf: Workflow;
  project?: AddonProject;
  scripts: AddonScript[];
  autostart: boolean;
  onEdit: () => void;
}) {
  const [run, setRun] = useState<Run>();
  const [busy, setBusy] = useState(false);
  const { data: history, reload } = useHostCall<Run[]>("runs", { id: wf.id });
  useAddonEvent("runs", () => void reload());
  const folder = project?.path ?? "";

  const update = async (next: Run) => {
    setRun(next);
    await ctx.host.call("saveRun", { run: next });
  };
  const start = async () => update(newRun(wf));
  useEffect(() => {
    if (autostart) void start();
  }, []);

  /** Does a step (Jig's part) and records the result. */
  const doStep = async (current: Run, step: Step) => {
    setBusy(true);
    let state = markStep(current, step.id, "running");
    setRun(state);
    try {
      let result: { ok: boolean; output: string };
      if (step.kind === "command")
        result = await ctx.host.call("runCommand", { command: step.command ?? "", cwd: step.cwd || folder });
      else if (step.kind === "pipeline" && step.pipeline)
        result = await ctx.host.call("runPipeline", { pipeline: step.pipeline });
      else if (step.kind === "script" && step.scriptId && project) {
        await ctx.scripts.run(project.id, step.scriptId);
        result = { ok: true, output: "Started in a terminal." };
      } else if (step.kind === "claude" && stepRunsOn(step) && project) {
        // Its own provider or model (D-412): the host starts the chat on it; open it like sendToChat does.
        const r = await ctx.host.call<{ ok: boolean; output: string; sessionId?: string }>("startStepChat", {
          step,
          projectId: project.id,
        });
        if (r.sessionId) await ctx.openChat({ sessionId: r.sessionId });
        result = r;
      } else if (step.kind === "claude") {
        await ctx.sendToChat(step.prompt ?? step.title, { send: true });
        result = { ok: true, output: "Sent to a new chat." };
      } else result = { ok: false, output: "This step has nothing to run." };
      state = markStep(state, step.id, result.ok ? "done" : "failed", result.output);
    } catch (error) {
      state = markStep(state, step.id, "failed", (error as Error).message);
    } finally {
      setBusy(false);
    }
    await update(state);
    return state;
  };

  // Auto steps run by themselves, one after another.
  useEffect(() => {
    if (!run || busy) return;
    const next = nextStep(wf, run);
    if (next?.mode === "auto" && run.steps.find((s) => s.id === next.step.id)?.status === "pending")
      void doStep(run, next.step);
  });

  const next = run ? nextStep(wf, run) : undefined;
  const scriptName = (id?: string) => scripts.find((s) => s.id === id)?.name ?? id;
  return (
    <>
      <div className="flex items-center gap-2">
        <ListChecks className="size-5 text-accent" />
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-fg">{wf.name}</h1>
        <Badge tone="neutral">{triggerLabel(wf.trigger)}</Badge>
        <IconButton icon={Pencil} size="sm" label="Edit" onClick={onEdit} data-testid="workflow-edit" />
      </div>
      {wf.goal && <p className="-mt-2 text-sm text-muted">{wf.goal}</p>}
      <Card className="flex flex-col p-2" data-testid="workflow-steps">
        {wf.steps.length === 0 && <p className="p-2 text-sm text-muted">No steps yet: Edit to add some.</p>}
        {wf.steps.map((s, i) => {
          const r = run?.steps.find((x) => x.id === s.id);
          const isNext = next?.step.id === s.id;
          const mode = effectiveMode(s);
          return (
            <div
              key={s.id}
              className={cn("flex flex-col gap-1 rounded-md px-2 py-1.5", isNext && "bg-hover")}
              data-testid="workflow-step"
            >
              <div className="flex items-center gap-2">
                <StatusIcon status={r?.status} />
                <span className="w-5 shrink-0 text-xs text-hint">{i + 1}.</span>
                <StepKindIcon kind={s.kind} />
                <span className="min-w-0 flex-1 truncate text-sm text-fg">
                  {s.title || STEP_KINDS.find((k) => k.kind === s.kind)?.label}
                </span>
                <StepRunsOnBadge step={s} />
                <Badge tone={mode === "auto" ? "accent" : mode === "ask" ? "info" : "neutral"}>
                  {MODE_LABEL[mode]}
                </Badge>
              </div>
              <StepDetail step={s} scriptName={scriptName} />
              {isNext && run && !busy && (
                <div className="ml-11 flex gap-2">
                  {mode === "manual" ? (
                    <Button
                      size="sm"
                      variant="primary"
                      icon={Check}
                      onClick={() => void update(markStep(run, s.id, "done"))}
                      data-testid="step-done"
                    >
                      {s.kind === "wait" ? "Continue" : "Done"}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      icon={Play}
                      onClick={() => void doStep(run, s)}
                      data-testid="step-run"
                    >
                      {r?.status === "failed" ? "Try again" : "Run it"}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={SkipForward}
                    onClick={() => void update(markStep(run, s.id, "skipped"))}
                    data-testid="step-skip"
                  >
                    Skip
                  </Button>
                </div>
              )}
              {r?.output && (
                <pre
                  className="ml-11 max-h-40 overflow-auto rounded-md bg-surface p-2 font-mono text-xs whitespace-pre-wrap text-muted"
                  data-testid="step-output"
                >
                  {r.output}
                </pre>
              )}
            </div>
          );
        })}
      </Card>
      <div className="flex flex-wrap items-center gap-2">
        {run?.status !== "running" ? (
          <Button
            variant="primary"
            icon={Play}
            onClick={() => void start()}
            disabled={!wf.steps.length}
            data-testid="workflow-run"
          >
            {run ? "Run again" : "Run"}
          </Button>
        ) : (
          <Button
            icon={Square}
            onClick={() => void update({ ...run, status: "stopped", finishedAt: new Date().toISOString() })}
          >
            Stop
          </Button>
        )}
        {run && run.status !== "running" && (
          <span
            className={cn("text-sm", run.status === "done" ? "text-success" : "text-danger")}
            data-testid="workflow-result"
          >
            {run.status === "done" ? "Done." : run.status === "failed" ? "A step failed." : "Stopped."}
          </span>
        )}
        <span className="flex-1" />
        <Button
          variant="ghost"
          icon={FileCode}
          title="Write it as a Claude Code skill in the project (.claude/skills), so Claude can do it from any chat"
          onClick={async () => {
            try {
              const file = await ctx.host.call<string>("exportSkill", {
                workflow: wf,
                folder: project?.path ?? "",
              });
              ctx.notify({ title: "Saved as a skill", message: file, tone: "success" });
              ctx.openPreview(file);
            } catch (error) {
              ctx.notify({
                title: "Couldn't save the skill",
                message: (error as Error).message,
                tone: "danger",
              });
            }
          }}
          data-testid="workflow-skill"
        >
          Export as skill
        </Button>
        <Button
          variant="ghost"
          icon={Cloud}
          title="Make it a Claude Code routine or an Azure DevOps pipeline, so it runs without Jig"
          onClick={() => void ctx.openChat({ projectId: wf.projectId, draft: cloudPrompt(wf) })}
        >
          Move to the cloud
        </Button>
      </div>
      {history && history.length > 0 && (
        <Card className="p-3" data-testid="workflow-history">
          <h2 className="mb-1 text-sm font-semibold text-fg">Runs</h2>
          {history.slice(0, 10).map((r) => (
            <div key={r.id} className="flex gap-2 text-sm">
              <StatusIcon
                status={
                  r.status === "done"
                    ? "done"
                    : r.status === "failed"
                      ? "failed"
                      : r.status === "running"
                        ? "running"
                        : "skipped"
                }
              />
              <span className="flex-1 text-muted">{new Date(r.startedAt).toLocaleString()}</span>
              <span className="text-xs text-hint">
                {r.by === "schedule" ? "on schedule" : r.by === "event" ? "on an event" : "by you"}
              </span>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

function Editor({
  ctx,
  project,
  initial,
  scripts,
  onSaved,
  onCancel,
}: {
  ctx: AddonUiContext;
  project?: AddonProject;
  initial: Workflow;
  scripts: AddonScript[];
  onSaved: (wf: Workflow) => void;
  onCancel: () => void;
}) {
  const [wf, setWf] = useState(initial);
  const set = (patch: Partial<Workflow>) => setWf({ ...wf, ...patch });
  const setStep = (id: string, patch: Partial<Step>) =>
    set({ steps: wf.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const move = (i: number, d: number) => {
    const steps = [...wf.steps];
    const [s] = steps.splice(i, 1);
    steps.splice(i + d, 0, s!);
    set({ steps });
  };
  const trigger = wf.trigger;
  const setTrigger = (t: Trigger) => set({ trigger: t });
  return (
    <div className="flex flex-col gap-3" data-testid="workflow-editor">
      <Input
        className="text-base font-semibold"
        value={wf.name}
        onChange={(e) => set({ name: e.target.value })}
        data-testid="workflow-name"
        aria-label="Name"
      />
      <Textarea
        rows={2}
        placeholder="What it is for (optional)"
        value={wf.goal ?? ""}
        onChange={(e) => set({ goal: e.target.value })}
        aria-label="What it is for"
      />
      {wf.steps.map((s, i) => (
        <Card key={s.id} className="flex flex-col gap-2 p-3" data-testid="workflow-edit-step">
          <div className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-xs text-hint">{i + 1}.</span>
            <Select
              className="w-56"
              value={s.kind}
              aria-label="Kind"
              onChange={(e) => {
                const kind = e.target.value as StepKind;
                setStep(s.id, {
                  kind,
                  mode: kind === "check" || kind === "wait" ? "manual" : s.mode === "manual" ? "ask" : s.mode,
                  // Only an AI step has a provider of its own.
                  ...(kind === "claude" ? {} : { provider: undefined, model: undefined }),
                });
              }}
            >
              {STEP_KINDS.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.label}
                </option>
              ))}
            </Select>
            {STEP_KINDS.find((k) => k.kind === s.kind)?.canRun && (
              <Select
                className="w-36"
                value={s.mode}
                aria-label="Who does it"
                onChange={(e) => setStep(s.id, { mode: e.target.value as StepMode })}
                data-testid="step-mode"
              >
                <option value="ask">Ask me first</option>
                <option value="auto">Jig does it</option>
                <option value="manual">I do it</option>
              </Select>
            )}
            {s.kind === "claude" && (
              <RunsOnButton
                ctx={ctx}
                value={{ provider: s.provider, model: s.model }}
                shown={
                  stepRunsOn(s)
                    ? { ...stepRunsOn(s)!, from: "step" }
                    : { provider: project?.provider ?? "claude", from: "project" }
                }
                fallback={project?.provider ?? "claude"}
                defaultLabel="Default"
                models
                label={stepRunsOn(s) ? undefined : "Default"}
                className="w-44 border-line-strong bg-raised"
                testId="step-runs-on"
                testPrefix="workflow"
                onPick={(choice) =>
                  set({ steps: wf.steps.map((x) => (x.id === s.id ? withRunsOn(x, choice) : x)) })
                }
              />
            )}
            <span className="flex-1" />
            <IconButton icon={ArrowUp} size="sm" label="Up" disabled={i === 0} onClick={() => move(i, -1)} />
            <IconButton
              icon={ArrowDown}
              size="sm"
              label="Down"
              disabled={i === wf.steps.length - 1}
              onClick={() => move(i, 1)}
            />
            <IconButton
              icon={Trash2}
              size="sm"
              label="Remove the step"
              onClick={() => set({ steps: wf.steps.filter((x) => x.id !== s.id) })}
            />
          </div>
          <Input
            placeholder="What this step is"
            value={s.title}
            onChange={(e) => setStep(s.id, { title: e.target.value })}
            aria-label="Step"
            data-testid="step-title"
          />
          {s.kind === "command" && (
            <div className="flex gap-2">
              <Input
                className="flex-1 font-mono"
                placeholder="git pull"
                value={s.command ?? ""}
                onChange={(e) => setStep(s.id, { command: e.target.value })}
                aria-label="Command"
                data-testid="step-command"
              />
              <Input
                className="w-56 font-mono"
                placeholder="Folder (default: the project)"
                value={s.cwd ?? ""}
                onChange={(e) => setStep(s.id, { cwd: e.target.value || undefined })}
                aria-label="Folder"
              />
            </div>
          )}
          {s.kind === "script" && (
            <Select
              value={s.scriptId ?? ""}
              aria-label="Script"
              onChange={(e) => setStep(s.id, { scriptId: e.target.value })}
            >
              <option value="">Pick a script…</option>
              {scripts.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.folder ? `${x.folder}: ${x.name}` : x.name}
                </option>
              ))}
            </Select>
          )}
          {s.kind === "pipeline" && (
            <PipelineFields
              value={s.pipeline}
              onChange={(pipeline) =>
                setStep(s.id, { pipeline: { ...pipeline, branch: s.pipeline?.branch } })
              }
            />
          )}
          {s.kind === "claude" && (
            // Tall enough to read a real instruction without scrolling a two-line box; fixed, so
            // typing never moves the steps below.
            <Textarea
              rows={10}
              className="resize-y"
              placeholder="What to ask"
              value={s.prompt ?? ""}
              onChange={(e) => setStep(s.id, { prompt: e.target.value })}
              aria-label="Message to the AI"
            />
          )}
        </Card>
      ))}
      <div className="flex gap-2">
        <Button
          icon={Plus}
          onClick={() => set({ steps: [...wf.steps, newStep("check")] })}
          data-testid="workflow-add-step"
        >
          Add a step
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        When:
        <Select
          className="w-48"
          value={trigger.kind === "schedule" ? trigger.every : trigger.kind}
          aria-label="When"
          onChange={(e) => {
            const v = e.target.value;
            if (v === "none") setTrigger({ kind: "none" });
            else if (v === "push") setTrigger({ kind: "push" });
            else if (v === "pipeline")
              setTrigger({ kind: "pipeline", pipeline: { org: "", project: "", id: 0 }, result: "any" });
            else
              setTrigger({
                kind: "schedule",
                every: v as "day" | "weekday" | "week",
                time: trigger.kind === "schedule" ? trigger.time : "09:00",
                day: trigger.kind === "schedule" ? trigger.day : 1,
              });
          }}
          data-testid="workflow-trigger"
        >
          <option value="none">By hand</option>
          <option value="day">Every day</option>
          <option value="weekday">Weekdays</option>
          <option value="week">Once a week</option>
          <option value="push">After you push</option>
          <option value="pipeline">When a pipeline finishes</option>
        </Select>
        {trigger.kind === "push" && (
          <Input
            className="w-40"
            placeholder="Any branch you're on"
            value={trigger.branch ?? ""}
            onChange={(e) => setTrigger({ kind: "push", branch: e.target.value || undefined })}
            aria-label="Branch"
            data-testid="workflow-trigger-branch"
          />
        )}
        {trigger.kind === "pipeline" && (
          <Select
            className="w-32"
            value={trigger.result ?? "any"}
            aria-label="Outcome"
            onChange={(e) =>
              setTrigger({ ...trigger, result: e.target.value as "any" | "succeeded" | "failed" })
            }
            data-testid="workflow-trigger-result"
          >
            <option value="any">Any outcome</option>
            <option value="succeeded">Succeeded</option>
            <option value="failed">Failed</option>
          </Select>
        )}
        {trigger.kind === "pipeline" && (
          <div className="basis-full">
            <PipelineFields
              value={trigger.pipeline}
              onChange={(pipeline) => setTrigger({ ...trigger, pipeline })}
            />
          </div>
        )}
        {trigger.kind === "schedule" && trigger.every === "week" && (
          <Select
            className="w-32"
            value={String(trigger.day ?? 1)}
            aria-label="Day"
            onChange={(e) => setTrigger({ ...trigger, day: Number(e.target.value) })}
          >
            {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, i) => (
              <option key={d} value={String(i)}>
                {d}
              </option>
            ))}
          </Select>
        )}
        {trigger.kind === "schedule" && (
          <Input
            type="time"
            className="w-28"
            value={trigger.time}
            onChange={(e) => setTrigger({ ...trigger, time: e.target.value })}
            aria-label="Time"
          />
        )}
        {trigger.kind !== "none" && <span className="text-xs text-hint">while Jig is open</span>}
      </div>
      <div className="flex gap-2">
        <Button
          variant="primary"
          icon={Check}
          disabled={!wf.name.trim()}
          onClick={async () => onSaved(await ctx.host.call<Workflow>("save", { workflow: wf }))}
          data-testid="workflow-save"
        >
          Save
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <span className="flex-1" />
        <Button
          variant="ghost"
          icon={Trash2}
          onClick={async () => {
            if (await ctx.confirm({ title: `Delete ${wf.name}?`, danger: true, confirmLabel: "Delete" })) {
              await ctx.host.call("remove", { projectId: wf.projectId, id: wf.id });
              ctx.notify({ title: `Deleted ${wf.name}` });
            }
          }}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}

/** A pipeline the Pipelines add-on found in a checked-out repository (its `pipelines` export). */
interface FoundPipeline {
  key: string;
  org: string;
  project: string;
  id: number;
  name: string;
  repoName: string;
}
type StepPipeline = { org: string; project: string; id: number };

/** The organisation's name, from a name or a URL (`https://dev.azure.com/org`, `org.visualstudio.com`). */
function orgName(org: string): string {
  const t = org.trim().replace(/\/+$/, "");
  return (
    /dev\.azure\.com\/([^/]+)/i.exec(t)?.[1] ??
    /^https?:\/\/([^./]+)\.visualstudio\.com/i.exec(t)?.[1] ??
    t
  ).toLowerCase();
}
const samePipeline = (a: StepPipeline, b: StepPipeline) =>
  a.id === b.id && orgName(a.org) === orgName(b.org) && a.project.toLowerCase() === b.project.toLowerCase();
const OTHER = "__other__";

/**
 * An Azure DevOps pipeline (a step to start, or a trigger to wait for): picked from your pipelines,
 * the ones the Pipelines add-on finds in your checked-out repositories, grouped by repository. One
 * that isn't there is typed in (organisation, project, id) in the same row; so is every pipeline
 * when the Pipelines add-on is off.
 */
function PipelineFields({
  value,
  onChange,
}: {
  value?: StepPipeline;
  onChange: (pipeline: StepPipeline) => void;
}) {
  const ctx = useAddon();
  const v = { org: value?.org ?? "", project: value?.project ?? "", id: value?.id ?? 0 };
  const [found, setFound] = useState<FoundPipeline[] | null>();
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    let live = true;
    ctx.addons
      .call<{ pipelines: FoundPipeline[] }>("pipelines", "pipelines", {})
      .then((r) => live && setFound(r.pipelines))
      .catch(() => live && setFound(null));
    return () => {
      live = false;
    };
  }, [ctx]);
  const current = v.id ? found?.find((p) => samePipeline(p, v)) : undefined;
  if (found === null || typing || (found?.length === 0 && !v.id))
    return (
      <div className="flex gap-2">
        <Input
          className="flex-1"
          placeholder="https://dev.azure.com/org"
          value={v.org}
          onChange={(e) => onChange({ ...v, org: e.target.value })}
          aria-label="Organisation"
        />
        <Input
          className="w-40"
          placeholder="Project"
          value={v.project}
          onChange={(e) => onChange({ ...v, project: e.target.value })}
          aria-label="Azure DevOps project"
        />
        <Input
          className="w-24"
          placeholder="Id"
          value={v.id ? String(v.id) : ""}
          onChange={(e) => onChange({ ...v, id: Number(e.target.value) || 0 })}
          aria-label="Pipeline id"
        />
        {found && found.length > 0 && (
          <IconButton icon={ListChecks} label="Pick from your pipelines" onClick={() => setTyping(false)} />
        )}
      </div>
    );
  const repos = [...new Set((found ?? []).map((p) => p.repoName))];
  return (
    <Select
      value={current?.key ?? (v.id ? "saved" : "")}
      disabled={found === undefined}
      aria-label="Pipeline"
      data-testid="step-pipeline"
      onChange={(e) => {
        if (e.target.value === OTHER) return setTyping(true);
        const p = found?.find((x) => x.key === e.target.value);
        if (p)
          onChange({
            org: p.org.startsWith("http") ? p.org : `https://dev.azure.com/${p.org}`,
            project: p.project,
            id: p.id,
          });
      }}
    >
      {found === undefined ? (
        <option value="">Finding your pipelines…</option>
      ) : (
        <>
          {!current && !v.id && <option value="">Pick a pipeline…</option>}
          {!current && v.id > 0 && (
            <option value="saved">
              {orgName(v.org)} / {v.project} · pipeline {v.id}
            </option>
          )}
          {repos.map((repo) => (
            <optgroup key={repo} label={repo}>
              {found
                .filter((p) => p.repoName === repo)
                .map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name}
                  </option>
                ))}
            </optgroup>
          ))}
          <option value={OTHER}>Another pipeline (type it in)…</option>
        </>
      )}
    </Select>
  );
}
