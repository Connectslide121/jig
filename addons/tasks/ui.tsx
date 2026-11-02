import type { AddonComponentProps, AddonPermissionProps, AddonUiContext } from "@jig/sdk";
import {
  Attachments,
  Badge,
  Button,
  cn,
  Dialog,
  Empty,
  FileIcon,
  IconButton,
  Input,
  Markdown,
  ProjectSwatch,
  Select,
  Spinner,
  Switch,
  Tabs,
  Textarea,
  useActiveProject,
  useAddon,
  useAddonEvent,
  useHostCall,
  useProjectList,
} from "@jig/sdk/ui";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleHelp,
  CircleMinus,
  CircleX,
  CornerDownRight,
  History,
  ListTodo,
  LoaderCircle,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pause,
  Play,
  Plus,
  SkipForward,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import {
  addFiles,
  addStep,
  type DraftChat,
  draftChat,
  draftTasks,
  mergeUp,
  moveChat,
  moveStep,
  pastedList,
  removeFile,
  removeStep,
  setChatProject,
  setStep,
  splitAt,
  spreadStep,
} from "./lib/draft";
import {
  type ChatGroup,
  chatGroups,
  counts,
  duration,
  fileName,
  formatMs,
  isActive,
  isFinished,
  type NewTask,
  type PermissionMode,
  type Queue,
  type Run,
  runOutcome,
  STATUS_LABEL,
  type Task,
  type TaskFile,
  type TaskStatus,
  tally,
} from "./lib/tasks";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const STATUS_TONE: Record<TaskStatus, Tone> = {
  queued: "neutral",
  running: "info",
  needs_you: "warning",
  done: "success",
  partial: "warning",
  failed: "danger",
  blocked: "warning",
  no_report: "neutral",
  error: "danger",
  skipped: "neutral",
};

const MODES: Array<{ value: PermissionMode; label: string }> = [
  { value: "acceptEdits", label: "Accept file edits" },
  { value: "default", label: "Ask before edits" },
  { value: "plan", label: "Plan only (no changes)" },
];

function StatusIcon({ status }: { status: TaskStatus }) {
  const c = "size-4 shrink-0";
  if (status === "running") return <LoaderCircle className={cn(c, "animate-spin text-info")} />;
  if (status === "needs_you") return <CircleAlert className={cn(c, "text-warning")} />;
  if (status === "done") return <CircleCheck className={cn(c, "text-success")} />;
  if (status === "partial") return <CircleDot className={cn(c, "text-warning")} />;
  if (status === "failed" || status === "error") return <CircleX className={cn(c, "text-danger")} />;
  if (status === "blocked") return <CircleMinus className={cn(c, "text-warning")} />;
  if (status === "no_report") return <CircleHelp className={cn(c, "text-muted")} />;
  if (status === "skipped") return <SkipForward className={cn(c, "text-hint")} />;
  return <CircleDashed className={cn(c, "text-hint")} />;
}

/** A cost, $0.00 included; a dash when there's none yet (a task that hasn't finished). */
function money(usd?: number) {
  return usd === undefined ? "—" : `$${usd.toFixed(2)}`;
}

/** Opens a task's file the way the chat does: images in the image viewer, documents in Preview. */
function openFile(ctx: AddonUiContext, file: TaskFile) {
  if ((file.kind ?? "image") === "image") ctx.openImage(file.path);
  else ctx.openPreview(file.path);
}

/** Menu entries that open a task's files, one per file. */
const fileEntries = (ctx: AddonUiContext, files: TaskFile[]) =>
  files.map((f) => ({
    label: fileName(f),
    icon: (f.kind ?? "image") === "image" ? "image" : "file-text",
    onSelect: () => openFile(ctx, f),
  }));

/** Files dropped or pasted (not text): kept for the task. True when there were files. */
function takeFiles(ctx: AddonUiContext, list: FileList, then: (files: TaskFile[]) => void): boolean {
  if (list.length === 0) return false;
  void ctx.attachments.add(list).then(then);
  return true;
}

/** File lines that fit beside the 3-row prompt; with more, the last line is "+N more" (a menu). */
const FILE_LINES = 3;

/**
 * A task's files in the Add tasks form: a fixed box beside the prompt (so nothing moves), one file per
 * line, never a scrollbar. Empty, it's a drop zone that also picks files on click.
 */
function TaskFiles({
  files,
  onPick,
  onDrop,
  onRemove,
  testId,
}: {
  files: TaskFile[];
  onPick: () => void;
  onDrop: (list: FileList) => boolean;
  onRemove: (file: TaskFile) => void;
  testId: string;
}) {
  const ctx = useAddon();
  const shown = files.length > FILE_LINES ? files.slice(0, FILE_LINES - 1) : files;
  const hidden = files.slice(shown.length);
  return (
    <div
      role="group"
      aria-label="Task attachments"
      className="flex h-20 w-56 shrink-0 flex-col gap-1"
      onDragOver={(e) => {
        if ([...e.dataTransfer.items].some((i) => i.kind === "file")) e.preventDefault();
      }}
      onDrop={(e) => {
        if (onDrop(e.dataTransfer.files)) e.preventDefault();
      }}
      data-testid={testId}
    >
      {files.length === 0 ? (
        <button
          type="button"
          className="flex h-full w-full items-center justify-center gap-2 rounded border border-dashed border-line px-3 text-xs text-hint hover:border-accent hover:text-accent"
          onClick={onPick}
        >
          <Paperclip className="size-3.5 shrink-0" />
          Paste, drop or attach files
        </button>
      ) : (
        <>
          {shown.map((file) => (
            <div
              key={file.path}
              className="flex h-6 shrink-0 items-center rounded border border-line bg-raised"
              data-testid="chat-attachment"
            >
              <button
                type="button"
                className="flex h-full min-w-0 flex-1 items-center gap-1 px-1.5 text-xs hover:text-accent"
                title={`Open ${fileName(file)}`}
                onClick={() => openFile(ctx, file)}
              >
                <FileIcon path={fileName(file)} className="size-3.5 shrink-0" />
                <span className="truncate">{fileName(file)}</span>
              </button>
              <IconButton
                size="sm"
                icon={X}
                label={`Remove ${fileName(file)}`}
                onClick={() => onRemove(file)}
              />
            </div>
          ))}
          {hidden.length > 0 && (
            <button
              type="button"
              className="flex h-6 shrink-0 items-center gap-1 rounded border border-line px-1.5 text-xs text-muted hover:text-accent"
              onClick={(e) =>
                ctx.menu(
                  hidden.map((file) => ({
                    label: fileName(file),
                    icon: (file.kind ?? "image") === "image" ? "image" : "file-text",
                    submenu: [
                      { label: "Open", icon: "external-link", onSelect: () => openFile(ctx, file) },
                      { label: "Remove", icon: "x", danger: true, onSelect: () => onRemove(file) },
                    ],
                  })),
                  e.currentTarget,
                )
              }
              data-testid="tasks-add-more-files"
            >
              <Plus className="size-3.5 shrink-0" />
              {hidden.length} more
            </button>
          )}
        </>
      )}
    </div>
  );
}
/** A project's queue, kept current: it reloads when the host says it changed. */
function useQueue(projectId: string | undefined) {
  const { data, reload, error } = useHostCall<Queue>("list", { projectId }, { skip: !projectId });
  useAddonEvent("changed", (payload) => {
    const changed = (payload as { projectId?: string } | undefined)?.projectId;
    if (!changed || changed === projectId) void reload();
  });
  // Running tasks' times tick.
  const [, setNow] = useState(0);
  const running = data?.tasks.some(isActive);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [running]);
  return { queue: data, error };
}

/** A switch with its label beside it (the base `Switch` only names itself for screen readers). */
function LabeledSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <Switch checked={checked} onChange={onChange} label={label} />
      <span className="truncate">{label}</span>
    </div>
  );
}

interface QueueOverview {
  projectId: string;
  queued: number;
  active: number;
  needsYou: number;
  running: boolean;
  runs: number;
}

/**
 * The project whose queue the view shows: the active project, until you pick another in the view's
 * project menu (switching the active project brings it back to that one).
 */
function useShownProject() {
  const active = useActiveProject();
  const projects = useProjectList();
  const [picked, setPicked] = useState<{ forActive?: string; id: string }>();
  const id =
    picked && picked.forActive === active?.id && projects.some((p) => p.id === picked.id)
      ? picked.id
      : (active?.id ?? projects[0]?.id);
  return {
    project: projects.find((p) => p.id === id),
    projects,
    pick: (projectId: string) => setPicked({ forActive: active?.id, id: projectId }),
  };
}

/** One task queue per project (each runs on its own), with its runs kept in a history. */
export function TasksView({ ctx }: AddonComponentProps) {
  const { project, projects, pick } = useShownProject();
  const [tab, setTab] = useState<"queue" | "history">("queue");
  const [run, setRun] = useState<string | undefined>();
  const projectId = project?.id;
  useEffect(() => setRun(undefined), [projectId]);

  const showProjects = async (at: HTMLElement) => {
    const all = await ctx.host.call<QueueOverview[]>("overview").catch(() => []);
    ctx.menu(
      projects.map((p) => {
        const o = all.find((x) => x.projectId === p.id);
        const busy = o ? o.queued + o.active : 0;
        return {
          label: p.name,
          project: p.id,
          checked: p.id === projectId,
          testId: `tasks-project-${p.name}`,
          badge: o?.needsYou ? "needs you" : o?.running ? "running" : busy ? `${busy} queued` : undefined,
          onSelect: () => pick(p.id),
        };
      }),
      at,
    );
  };

  if (!project)
    return (
      <Empty icon={ListTodo} title="No projects yet" className="h-full">
        <div className="max-w-sm text-xs text-muted">Add a project; each project has its own task queue.</div>
      </Empty>
    );

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="tasks-view">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line pl-1 pr-3">
        <Tabs
          className="border-b-0 px-1"
          items={[
            { id: "queue", label: "Queue" },
            { id: "history", label: "History" },
          ]}
          value={tab}
          onChange={(t) => {
            setTab(t);
            setRun(undefined);
          }}
        />
        <button
          type="button"
          className="ml-auto flex h-7 min-w-0 items-center gap-2 rounded-md px-2 text-sm text-fg hover:bg-hover"
          title="Each project has its own task queue: show another"
          data-testid="tasks-project"
          onClick={(e) => void showProjects(e.currentTarget)}
        >
          <ProjectSwatch color={project.color} />
          <span className="truncate">{project.name}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted" />
        </button>
      </div>
      {tab === "queue" ? (
        <QueuePanel key={project.id} ctx={ctx} projectId={project.id} onHistory={() => setTab("history")} />
      ) : run ? (
        <RunPanel
          ctx={ctx}
          projectId={project.id}
          runId={run}
          onBack={() => setRun(undefined)}
          onQueued={() => setTab("queue")}
        />
      ) : (
        <HistoryPanel key={project.id} projectId={project.id} onOpen={setRun} />
      )}
    </div>
  );
}

/** The task menu's entries shared by the queue and past runs. */
function openEntries(ctx: AddonUiContext, task: Task, onDetails: () => void) {
  return [
    { label: "Details", icon: "panel-top-open", onSelect: onDetails },
    ...(task.attachments?.length
      ? [{ label: "Files", icon: "paperclip", submenu: fileEntries(ctx, task.attachments) }]
      : []),
    ...(task.sessionId
      ? [
          {
            label: "Open chat",
            icon: "message-square",
            onSelect: () => ctx.openChat({ sessionId: task.sessionId }),
          },
        ]
      : []),
  ];
}

/** The project's queue: prompts Claude does one after another, each with its report, as a table. */
function QueuePanel({
  ctx,
  projectId,
  onHistory,
}: {
  ctx: AddonUiContext;
  projectId: string;
  onHistory: () => void;
}) {
  const { queue, error } = useQueue(projectId);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Task | undefined>();
  const [open, setOpen] = useState<string | undefined>();
  const projects = useProjectList();
  const call = (method: string, args?: Record<string, unknown>) =>
    ctx.host
      .call(method, { projectId, ...args })
      .catch((e: Error) => ctx.notify({ title: e.message, tone: "danger" }));

  if (!queue) return error ? <div className="p-3 text-xs text-danger">{error}</div> : <Spinner center />;
  const n = counts(queue);
  const projectName = (id?: string) => projects.find((p) => p.id === id)?.name ?? "";
  const openTask = queue.tasks.find((t) => t.id === open);

  const menuFor = (task: Task, at: MouseEvent | HTMLElement) => {
    const i = queue.tasks.indexOf(task);
    const queued = task.status === "queued";
    ctx.menu(
      [
        ...openEntries(ctx, task, () => setOpen(task.id)),
        { separator: true as const },
        ...(queued
          ? [
              { label: "Edit…", icon: "pencil", onSelect: () => setEditing(task) },
              {
                label: "Move up",
                icon: "arrow-up",
                disabled: i === 0,
                onSelect: () => call("move", { id: task.id, delta: -1 }),
              },
              {
                label: "Move down",
                icon: "arrow-down",
                disabled: i === queue.tasks.length - 1,
                onSelect: () => call("move", { id: task.id, delta: 1 }),
              },
              { label: "Skip", icon: "skip-forward", onSelect: () => call("skip", { id: task.id }) },
            ]
          : []),
        ...(isFinished(task)
          ? [{ label: "Run again", icon: "rotate-ccw", onSelect: () => call("runAgain", { id: task.id }) }]
          : []),
        ...(!isActive(task)
          ? [
              {
                label: "Remove",
                icon: "trash-2",
                danger: true,
                onSelect: () => call("remove", { id: task.id }),
              },
            ]
          : []),
      ],
      at,
    );
  };

  return (
    <>
      <div className="flex h-10 shrink-0 items-center gap-2 px-3">
        <span className="min-w-0 truncate text-xs text-muted" data-testid="tasks-counts">
          {n.total ? `${n.queued} queued · ${n.finished} of ${n.total} finished` : ""}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <LabeledSwitch
            checked={queue.stopOnFailure}
            onChange={(on) => void call("setStopOnFailure", { on })}
            label="Stop when a task fails"
          />
          <Button size="sm" icon={Plus} onClick={() => setAdding(true)} data-testid="tasks-add">
            Add tasks
          </Button>
          {queue.running ? (
            <Button size="sm" icon={Pause} onClick={() => void call("pause")} data-testid="tasks-pause">
              Pause
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              icon={Play}
              disabled={!n.queued}
              onClick={() => void call("start")}
              data-testid="tasks-start"
            >
              Start
            </Button>
          )}
          <IconButton
            size="sm"
            icon={MoreHorizontal}
            label="More"
            onClick={(e) =>
              ctx.menu(
                [
                  {
                    label: "Clear finished tasks",
                    icon: "list-x",
                    disabled: !n.finished,
                    onSelect: () => void call("clearFinished"),
                  },
                  { label: "Past runs", icon: "history", onSelect: onHistory },
                ],
                e.currentTarget,
              )
            }
          />
        </div>
      </div>
      {queue.tasks.length === 0 ? (
        <Empty icon={ListTodo} title="No tasks queued" className="flex-1">
          <div className="max-w-sm text-xs text-muted">
            Add prompts and press Start: Claude does them one after another, each in its own chat or
            continuing the one before, and reports how each went here. Claude can queue tasks too (ask it in a
            chat, e.g. "queue a task for each spec in docs/"). Every run is kept in History.
          </div>
          <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>
            Add tasks
          </Button>
        </Empty>
      ) : (
        <>
          <QueueSummary tasks={queue.tasks} />
          <TaskTable ctx={ctx} queue={queue} projectName={projectName} onOpen={setOpen} onMenu={menuFor} />
        </>
      )}
      {adding && (
        <AddDialog
          projectId={projectId}
          onClose={() => setAdding(false)}
          onSave={async (chats, permissionMode) => {
            for (const chat of chats)
              await call("add", {
                prompts: chat.tasks,
                projectId: chat.projectId,
                newChat: true,
                permissionMode,
              });
            const elsewhere = [...new Set(chats.map((c) => c.projectId))].filter((id) => id !== projectId);
            if (elsewhere.length)
              ctx.notify({
                title: `Also queued in ${elsewhere.map(projectName).join(", ")}`,
                message: "Each project has its own queue: pick it at the top of this view.",
                tone: "info",
              });
            setAdding(false);
          }}
        />
      )}
      {editing && (
        <EditDialog
          task={editing}
          onClose={() => setEditing(undefined)}
          onSave={async (input) => {
            await call("update", { id: editing.id, ...input });
            setEditing(undefined);
          }}
        />
      )}
      {openTask && (
        <TaskDialog
          ctx={ctx}
          task={openTask}
          index={queue.tasks.indexOf(openTask)}
          projectName={projectName(openTask.projectId)}
          onClose={() => setOpen(undefined)}
          onQueue={async (prompts) => {
            await call("add", { prompts, newChat: true, from: openTask.id });
            ctx.notify({
              title: `Queued ${prompts.length} follow-up${prompts.length === 1 ? "" : "s"}`,
              tone: "success",
            });
          }}
          onRunAgain={async () => {
            await call("runAgain", { id: openTask.id });
            setOpen(undefined);
          }}
        />
      )}
    </>
  );
}

/** The results table: the tasks grouped by chat, under one header row. */
function TaskTable({
  ctx,
  queue,
  projectName,
  onOpen,
  onMenu,
}: {
  ctx: AddonUiContext;
  queue: Queue;
  projectName: (id?: string) => string;
  onOpen: (id: string) => void;
  onMenu: (task: Task, at: MouseEvent | HTMLElement) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
      <div className="sticky top-0 z-10 flex h-7 items-center gap-3 whitespace-nowrap border-x border-transparent bg-surface px-3 text-2xs font-medium uppercase tracking-wide text-hint">
        <span className="w-6 shrink-0 text-right">#</span>
        <span className="min-w-0 flex-1">Task and how it went</span>
        <span className="w-16 shrink-0 text-right">Started</span>
        <span className="w-12 shrink-0 text-right">Notes</span>
        <span className="w-20 shrink-0 text-right">Follow-ups</span>
        <span className="w-12 shrink-0 text-right">Files</span>
        <span className="w-12 shrink-0 text-right">Time</span>
        <span className="w-14 shrink-0 text-right">Cost</span>
        <span className="w-7 shrink-0" />
        <span className="w-28 shrink-0 text-right">Status</span>
      </div>
      <div className="flex flex-col gap-3">
        {chatGroups(queue).map((group, gi) => (
          <ChatCard
            key={group.tasks[0]!.task.id}
            ctx={ctx}
            group={group}
            number={gi + 1}
            projectName={projectName(group.projectId)}
            onOpen={onOpen}
            onMenu={onMenu}
          />
        ))}
      </div>
    </div>
  );
}

const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";

/** How long a run took: its tasks' times added up. */
function runTime(run: Run): string {
  const t = tally(run.tasks);
  return formatMs(t.ms);
}

/** The project's past runs, newest first: when, how it went, time and cost. Each opens its results. */
function HistoryPanel({ projectId, onOpen }: { projectId: string; onOpen: (runId: string) => void }) {
  const { data: runs, reload, error } = useHostCall<Run[]>("history", { projectId });
  useAddonEvent("changed", (payload) => {
    const changed = (payload as { projectId?: string } | undefined)?.projectId;
    if (!changed || changed === projectId) void reload();
  });
  if (!runs) return error ? <div className="p-3 text-xs text-danger">{error}</div> : <Spinner center />;
  if (!runs.length)
    return (
      <Empty icon={History} title="No runs yet" className="flex-1">
        <div className="max-w-sm text-xs text-muted">
          Every time this project's queue runs, its tasks and reports are kept here, so you can come back to
          the results later.
        </div>
      </Empty>
    );
  return (
    <div className="min-h-0 flex-1 overflow-auto px-3 pb-3" data-testid="tasks-history">
      <div className="sticky top-0 z-10 flex h-7 items-center gap-3 whitespace-nowrap bg-surface px-3 text-2xs font-medium uppercase tracking-wide text-hint">
        <span className="w-40 shrink-0">Started</span>
        <span className="min-w-0 flex-1">Tasks</span>
        <span className="w-12 shrink-0 text-right">Done</span>
        <span className="w-12 shrink-0 text-right">Failed</span>
        <span className="w-12 shrink-0 text-right">Time</span>
        <span className="w-14 shrink-0 text-right">Cost</span>
        <span className="w-24 shrink-0 text-right">Status</span>
      </div>
      <div className="overflow-hidden rounded-lg border border-line bg-raised">
        {runs.map((run, i) => {
          const o = runOutcome(run);
          const t = tally(run.tasks);
          const titles = run.tasks.map((task) => task.title).join(" · ");
          return (
            <button
              key={run.id}
              type="button"
              data-testid={`tasks-run-${i}`}
              onClick={() => onOpen(run.id)}
              className="flex h-12 w-full items-center gap-3 border-b border-line px-3 text-left last:border-b-0 hover:bg-hover"
            >
              <span className="w-40 shrink-0 truncate text-xs tabular-nums text-fg">
                {when(run.startedAt)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-xs text-fg">
                  {o.total} {o.total === 1 ? "task" : "tasks"}
                </span>
                <span className="truncate text-xs text-muted" title={titles}>
                  {titles}
                </span>
              </span>
              <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted">{o.done || ""}</span>
              <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted">
                {o.failed || ""}
              </span>
              <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted">{runTime(run)}</span>
              <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted">
                {money(t.costUsd)}
              </span>
              <span className="flex w-24 shrink-0 items-center justify-end gap-1.5">
                {run.finishedAt ? (
                  o.failed ? (
                    <Badge tone="danger">{o.failed} failed</Badge>
                  ) : (
                    <Badge tone="success">Finished</Badge>
                  )
                ) : (
                  <Badge tone="info">Open</Badge>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A past run's results, as the queue showed them: read-only, with Open chat, follow-ups and Run again. */
function RunPanel({
  ctx,
  projectId,
  runId,
  onBack,
  onQueued,
}: {
  ctx: AddonUiContext;
  projectId: string;
  runId: string;
  onBack: () => void;
  onQueued: () => void;
}) {
  const { data: runs, reload } = useHostCall<Run[]>("history", { projectId });
  useAddonEvent("changed", () => void reload());
  const [open, setOpen] = useState<string | undefined>();
  const projects = useProjectList();
  const projectName = (id?: string) => projects.find((p) => p.id === id)?.name ?? "";
  if (!runs) return <Spinner center />;
  const run = runs.find((r) => r.id === runId);
  if (!run)
    return (
      <Empty icon={History} title="This run is no longer in the history" className="flex-1">
        <Button size="sm" icon={ArrowLeft} onClick={onBack}>
          All runs
        </Button>
      </Empty>
    );
  const queue: Queue = { tasks: run.tasks, running: false, stopOnFailure: false, seq: 0 };
  const openTask = run.tasks.find((t) => t.id === open);
  const again = async (task: Task) => {
    await ctx.host
      .call("runFromHistory", { projectId, runId, id: task.id })
      .then(() => ctx.notify({ title: "Queued again", message: task.title, tone: "success" }))
      .catch((e: Error) => ctx.notify({ title: e.message, tone: "danger" }));
  };
  const menuFor = (task: Task, at: MouseEvent | HTMLElement) =>
    ctx.menu(
      [
        ...openEntries(ctx, task, () => setOpen(task.id)),
        { separator: true as const },
        { label: "Run again", icon: "rotate-ccw", onSelect: () => void again(task) },
      ],
      at,
    );
  return (
    <>
      <div className="flex h-10 shrink-0 items-center gap-2 px-3" data-testid="tasks-run">
        <IconButton
          size="sm"
          icon={ArrowLeft}
          label="All runs"
          onClick={onBack}
          data-testid="tasks-run-back"
        />
        <span className="min-w-0 truncate text-sm text-fg">Run of {when(run.startedAt)}</span>
        <span className="shrink-0 text-xs text-muted">{run.finishedAt ? "" : "· still going"}</span>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <IconButton
            size="sm"
            icon={MoreHorizontal}
            label="More"
            onClick={(e) =>
              ctx.menu(
                [
                  {
                    label: "Queue every task again",
                    icon: "rotate-ccw",
                    onSelect: async () => {
                      for (const task of run.tasks)
                        await ctx.host
                          .call("runFromHistory", { projectId, runId, id: task.id })
                          .catch(() => {});
                      onQueued();
                    },
                  },
                  { separator: true as const },
                  {
                    label: "Remove from history",
                    icon: "trash-2",
                    danger: true,
                    disabled: !run.finishedAt,
                    onSelect: async () => {
                      if (
                        await ctx.confirm({
                          title: "Remove this run from the history?",
                          message: "Its reports and files are deleted. The chats stay.",
                          confirmLabel: "Remove",
                          danger: true,
                        })
                      )
                        await ctx.host
                          .call("forgetRun", { projectId, runId })
                          .then(onBack)
                          .catch((err: Error) => ctx.notify({ title: err.message, tone: "danger" }));
                    },
                  },
                ],
                e.currentTarget,
              )
            }
          />
        </div>
      </div>
      <QueueSummary tasks={run.tasks} />
      <TaskTable ctx={ctx} queue={queue} projectName={projectName} onOpen={setOpen} onMenu={menuFor} />
      {openTask && (
        <TaskDialog
          ctx={ctx}
          task={openTask}
          index={run.tasks.indexOf(openTask)}
          projectName={projectName(openTask.projectId)}
          onClose={() => setOpen(undefined)}
          onQueue={async (prompts) => {
            await ctx.host
              .call("add", { projectId, prompts, newChat: true })
              .catch((e: Error) => ctx.notify({ title: e.message, tone: "danger" }));
            ctx.notify({
              title: `Queued ${prompts.length} follow-up${prompts.length === 1 ? "" : "s"}`,
              tone: "success",
            });
          }}
          onRunAgain={async () => {
            await again(openTask);
            setOpen(undefined);
          }}
        />
      )}
    </>
  );
}

const SUMMARY_ORDER: TaskStatus[] = [
  "done",
  "partial",
  "failed",
  "blocked",
  "error",
  "no_report",
  "running",
  "needs_you",
  "queued",
  "skipped",
];

/** The whole queue at a glance: a bar of how the tasks went, counts per status, time and cost. */
function QueueSummary({ tasks }: { tasks: Task[] }) {
  const t = tally(tasks);
  return (
    <div className="flex h-12 shrink-0 items-center gap-4 px-6" data-testid="tasks-summary">
      <div className="flex h-1.5 w-40 shrink-0 overflow-hidden rounded-full bg-raised">
        {SUMMARY_ORDER.map((status) =>
          t.byStatus[status] ? (
            <div
              key={status}
              className={BAR[STATUS_TONE[status]]}
              style={{ width: `${((t.byStatus[status] ?? 0) / tasks.length) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden text-xs text-muted">
        {SUMMARY_ORDER.filter((status) => t.byStatus[status]).map((status) => (
          <span key={status} className="flex shrink-0 items-center gap-1">
            <StatusIcon status={status} />
            <span className="tabular-nums text-fg">{t.byStatus[status]}</span>
            {STATUS_LABEL[status].toLowerCase()}
          </span>
        ))}
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted">
        {[formatMs(t.ms), money(t.costUsd)].filter(Boolean).join(" · ")}
      </span>
    </div>
  );
}

const BAR: Record<Tone, string> = {
  neutral: "bg-line",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

/** One chat of the queue: its link, project and totals, and its tasks in order. */
function ChatCard({
  ctx,
  group,
  number,
  projectName,
  onOpen,
  onMenu,
}: {
  ctx: AddonUiContext;
  group: ChatGroup;
  number: number;
  projectName: string;
  onOpen: (id: string) => void;
  onMenu: (task: Task, at: MouseEvent | HTMLElement) => void;
}) {
  const tasks = group.tasks.map((t) => t.task);
  const t = tally(tasks);
  return (
    <div
      className="overflow-hidden rounded-lg border border-line bg-raised"
      data-testid={`task-group-${number - 1}`}
    >
      <div className="flex h-9 items-center gap-3 border-b border-line px-3">
        <MessageSquare className="ml-2 size-4 shrink-0 text-hint" />
        <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
          {group.sessionId ? (
            <button
              type="button"
              data-testid={`task-group-chat-${number - 1}`}
              className="min-w-0 truncate font-medium text-accent hover:underline"
              title="Open the chat"
              onClick={() => void ctx.openChat({ sessionId: group.sessionId })}
            >
              {group.chatTitle ?? tasks[0]!.title}
            </button>
          ) : (
            <span
              className="min-w-0 truncate font-medium text-fg"
              title="Its chat starts when its first task runs"
            >
              {tasks[0]!.title}
            </span>
          )}
          <span className="shrink-0 text-xs text-hint">
            {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
            {projectName ? ` · ${projectName}` : ""}
          </span>
        </div>
        <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted">{formatMs(t.ms)}</span>
        <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted">{money(t.costUsd)}</span>
        <span className="w-7 shrink-0" />
        <span className="w-28 shrink-0 text-right text-xs tabular-nums text-muted">
          {t.finished} of {tasks.length} finished
        </span>
      </div>
      {group.tasks.map(({ task, index }) => (
        <TaskRow
          key={task.id}
          ctx={ctx}
          task={task}
          index={index}
          continues={task !== tasks[0]}
          onOpen={() => onOpen(task.id)}
          onMenu={(at) => onMenu(task, at)}
        />
      ))}
    </div>
  );
}

const startedAt = (task: Task) =>
  task.sentAt ? new Date(task.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

function TaskRow({
  ctx,
  task,
  index,
  continues,
  onOpen,
  onMenu,
}: {
  ctx: AddonUiContext;
  task: Task;
  index: number;
  continues: boolean;
  onOpen: () => void;
  onMenu: (at: MouseEvent | HTMLElement) => void;
}) {
  const detail = task.report?.summary ?? task.error ?? task.answer;
  const notes = task.report?.notes.length ?? 0;
  const followUps = task.report?.followUps.length ?? 0;
  const files = task.attachments ?? [];
  const tags = [
    continues ? "same chat" : "",
    task.addedBy ? "queued by Claude" : "",
    task.from ? "a follow-up" : "",
    task.permissionMode === "plan"
      ? "plan only"
      : task.permissionMode === "default"
        ? "asks before edits"
        : "",
  ].filter(Boolean);
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`task-${task.id}`}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e.nativeEvent);
      }}
      className="group flex h-16 cursor-default items-center gap-3 border-b border-line px-3 last:border-b-0 hover:bg-hover"
    >
      <span className="w-6 shrink-0 text-right text-xs tabular-nums text-hint">{index + 1}</span>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 items-center gap-2">
          {continues && (
            <CornerDownRight className="size-3.5 shrink-0 text-hint" aria-label="Continues the chat" />
          )}
          <span className="truncate text-sm font-medium text-fg" title={task.prompt}>
            {task.title}
          </span>
          {tags.length > 0 && <span className="shrink-0 text-2xs text-hint">{tags.join(" · ")}</span>}
        </div>
        <div
          className={cn(
            "line-clamp-2 text-xs",
            !task.report && task.error ? "text-danger" : detail ? "text-muted" : "text-hint",
          )}
        >
          {detail ?? task.prompt}
        </div>
      </div>
      <span className="w-16 shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-muted">
        {startedAt(task)}
      </span>
      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted">{notes || ""}</span>
      <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted">{followUps || ""}</span>
      <span className="flex w-12 shrink-0 justify-end">
        {files.length > 0 && (
          <button
            type="button"
            title={`Open a file: ${files.map(fileName).join(", ")}`}
            data-testid={`task-files-${task.id}`}
            className="flex h-6 items-center gap-1 rounded-md px-1 text-xs tabular-nums text-muted hover:bg-surface hover:text-accent"
            onClick={(e) => {
              e.stopPropagation();
              if (files.length === 1) openFile(ctx, files[0]!);
              else ctx.menu(fileEntries(ctx, files), e.currentTarget);
            }}
          >
            <Paperclip className="size-3.5" />
            {files.length}
          </button>
        )}
      </span>
      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted">{duration(task)}</span>
      <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted">{money(task.costUsd)}</span>
      <span className="w-7 shrink-0">
        <IconButton
          size="sm"
          icon={MoreHorizontal}
          label="Task actions"
          className="opacity-0 group-hover:opacity-100 focus:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onMenu(e.currentTarget);
          }}
        />
      </span>
      <span
        className="flex w-28 shrink-0 items-center justify-end gap-1.5"
        data-testid={`task-status-${task.id}`}
      >
        <Badge tone={STATUS_TONE[task.status]}>{STATUS_LABEL[task.status]}</Badge>
        <StatusIcon status={task.status} />
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-2xs font-medium uppercase tracking-wide text-hint">{title}</div>
      {children}
    </div>
  );
}

function TaskDialog({
  ctx,
  task,
  index,
  projectName,
  onClose,
  onQueue,
  onRunAgain,
}: {
  ctx: AddonUiContext;
  task: Task;
  index: number;
  projectName: string;
  onClose: () => void;
  onQueue: (prompts: string[]) => Promise<void>;
  onRunAgain: () => Promise<void>;
}) {
  const report = task.report;
  const [queued, setQueued] = useState<Set<number>>(new Set());
  // Buttons stay enabled once used (a disabled button drops the focus, and Escape with it).
  const queue = async (indexes: number[]) => {
    if (!indexes.length) return;
    const prompts = indexes.map((i) => report!.followUps[i]!);
    await onQueue(prompts);
    setQueued(new Set([...queued, ...indexes]));
  };
  const when = (iso?: string) =>
    iso ? new Date(iso).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "";
  const facts: Array<[string, string]> = (
    [
      ["Project", projectName],
      ["Chat", task.newChat || index === 0 ? "starts a new one" : "continues the one before"],
      ["Permissions", MODES.find((m) => m.value === (task.permissionMode ?? "acceptEdits"))?.label ?? ""],
      ["Started", when(task.sentAt)],
      ["Finished", when(task.finishedAt)],
      ["Time", duration(task)],
      ["Cost", money(task.costUsd)],
      ["Queued by", task.addedBy ? "Claude, from a chat" : "you"],
    ] as Array<[string, string]>
  ).filter(([, v]) => v);
  return (
    <Dialog
      open
      onClose={onClose}
      width="lg"
      testId="task-details"
      title={
        <span className="flex min-w-0 items-center gap-2">
          <StatusIcon status={task.status} />
          <span className="truncate">
            {index + 1}. {task.title}
          </span>
        </span>
      }
      footer={
        <>
          {task.sessionId && (
            <Button
              size="sm"
              variant="ghost"
              icon={MessageSquare}
              onClick={() => {
                void ctx.openChat({ sessionId: task.sessionId });
                onClose();
              }}
              data-testid="task-open-chat"
            >
              Open chat
            </Button>
          )}
          {isFinished(task) && (
            <Button size="sm" variant="ghost" onClick={() => void onRunAgain()}>
              Run again
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONE[task.status]}>{STATUS_LABEL[task.status]}</Badge>
        </div>
        <div className="grid grid-cols-4 gap-x-4 gap-y-2 rounded-md bg-surface p-3" data-testid="task-facts">
          {facts.map(([label, value]) => (
            <div key={label} className="flex min-w-0 flex-col">
              <span className="text-2xs uppercase tracking-wide text-hint">{label}</span>
              <span className="truncate text-xs text-fg">{value}</span>
            </div>
          ))}
        </div>
        {task.attachments?.length ? (
          <Section title="Files sent with the prompt">
            <div data-testid="task-files">
              <Attachments files={task.attachments} />
            </div>
          </Section>
        ) : null}
        {report && (
          <Section title="Summary">
            <div className="text-sm" data-testid="task-summary">
              <Markdown text={report.summary} />
            </div>
          </Section>
        )}
        {task.error && (
          <Section title="Error">
            <div className="text-sm text-danger">{task.error}</div>
          </Section>
        )}
        {!report && task.answer && (
          <Section title="Claude's last answer (it didn't report)">
            <div className="text-sm">
              <Markdown text={task.answer} />
            </div>
          </Section>
        )}
        {report && report.notes.length > 0 && (
          <Section title="To know">
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-fg">
              {report.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </Section>
        )}
        {report && report.followUps.length > 0 && (
          <Section title="Follow-ups">
            <div className="flex flex-col gap-1">
              {report.followUps.map((f, i) => (
                <div key={f} className="flex items-center gap-2 rounded-md bg-surface px-2 py-1">
                  <span className="min-w-0 flex-1 text-sm text-fg">{f}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={queued.has(i) ? CircleCheck : Plus}
                    aria-disabled={queued.has(i)}
                    className="w-28 shrink-0 justify-center"
                    onClick={() => !queued.has(i) && void queue([i])}
                    data-testid={`task-followup-${i}`}
                  >
                    {queued.has(i) ? "Queued" : "Add to queue"}
                  </Button>
                </div>
              ))}
              {report.followUps.length > 1 && (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Plus}
                    aria-disabled={queued.size === report.followUps.length}
                    onClick={() =>
                      void queue(report.followUps.map((_, i) => i).filter((i) => !queued.has(i)))
                    }
                  >
                    Add all to the queue
                  </Button>
                </div>
              )}
            </div>
          </Section>
        )}
        <Section title="Prompt">
          <div className="whitespace-pre-wrap rounded-md bg-surface p-2 text-sm text-fg">{task.prompt}</div>
        </Section>
      </div>
    </Dialog>
  );
}

/**
 * Add tasks: chats, each with its tasks in order — one field per task. A chat's first task starts it
 * and the next ones continue in the same chat. Pasting a list into an empty field makes a task of
 * each item; pasting, dropping or attaching files sends them with the task. Files kept but not queued
 * (cancelled, removed) are deleted.
 */
function AddDialog({
  projectId: chosenProject,
  onClose,
  onSave,
}: {
  onClose: () => void;
  projectId?: string;
  onSave: (chats: Array<{ projectId: string; tasks: NewTask[] }>, mode: PermissionMode) => Promise<void>;
}) {
  const ctx = useAddon();
  const active = useActiveProject();
  const projects = useProjectList();
  const firstProject = chosenProject ?? active?.id ?? projects[0]?.id ?? "";
  const [chats, setChats] = useState<DraftChat[]>(() => [draftChat(firstProject)]);
  const [mode, setMode] = useState<PermissionMode>("acceptEdits");
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState<string>();
  const [kept, setKept] = useState<string[]>([]);
  const planned = draftTasks(chats).filter((c) => c.projectId);
  const total = planned.reduce((n, c) => n + c.tasks.length, 0);
  const discard = (paths: string[]) =>
    paths.length && void ctx.host.call("discard", { paths }).catch(() => {});
  const cancel = () => {
    discard(kept);
    onClose();
  };
  const attach = (ci: number, si: number, files: TaskFile[]) => {
    if (!files.length) return;
    setKept((k) => [...k, ...files.map((f) => f.path)]);
    setChats((cs) => addFiles(cs, ci, si, files));
  };
  const save = async () => {
    if (!total) return;
    setBusy(true);
    try {
      await onSave(planned, mode);
      const queued = new Set(
        planned.flatMap((c) => c.tasks.flatMap((t) => (t.attachments ?? []).map((a) => a.path))),
      );
      discard(kept.filter((p) => !queued.has(p)));
    } catch (e) {
      ctx.notify({ title: (e as Error).message, tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const addChat = () => {
    const chat = draftChat(chats[chats.length - 1]?.projectId ?? firstProject);
    setChats([...chats, chat]);
    setFocus(chat.steps[0]!.id);
  };
  const addTask = (ci: number) => {
    const next = addStep(chats, ci);
    setChats(next);
    setFocus(next[ci]!.steps[next[ci]!.steps.length - 1]!.id);
  };
  const chatMenu = (ci: number, at: HTMLElement) =>
    ctx.menu(
      [
        {
          label: "Continue the chat before",
          icon: "corner-left-up",
          disabled: ci === 0,
          onSelect: () => setChats(mergeUp(chats, ci)),
        },
        {
          label: "Move up",
          icon: "arrow-up",
          disabled: ci === 0,
          onSelect: () => setChats(moveChat(chats, ci, -1)),
        },
        {
          label: "Move down",
          icon: "arrow-down",
          disabled: ci === chats.length - 1,
          onSelect: () => setChats(moveChat(chats, ci, 1)),
        },
        { separator: true as const },
        {
          label: "Remove the chat and its tasks",
          icon: "trash-2",
          danger: true,
          disabled: chats.length === 1,
          onSelect: () => setChats(chats.filter((_, i) => i !== ci)),
        },
      ],
      at,
    );
  const taskMenu = (ci: number, si: number, at: HTMLElement) => {
    const steps = chats[ci]!.steps.length;
    ctx.menu(
      [
        {
          label: "Start a new chat from here",
          icon: "message-square-plus",
          disabled: si === 0,
          onSelect: () => setChats(splitAt(chats, ci, si)),
        },
        {
          label: "Move up",
          icon: "arrow-up",
          disabled: si === 0,
          onSelect: () => setChats(moveStep(chats, ci, si, -1)),
        },
        {
          label: "Move down",
          icon: "arrow-down",
          disabled: si === steps - 1,
          onSelect: () => setChats(moveStep(chats, ci, si, 1)),
        },
        { separator: true as const },
        {
          label: "Remove",
          icon: "trash-2",
          danger: true,
          disabled: chats.length === 1 && steps === 1,
          onSelect: () => setChats(removeStep(chats, ci, si)),
        },
      ],
      at,
    );
  };
  return (
    <Dialog
      open
      onClose={cancel}
      width="xl"
      column
      testId="tasks-add-dialog"
      title="Add tasks"
      footer={
        <>
          <span className="mr-auto min-w-0 self-center truncate text-xs text-muted">
            Ctrl+Enter to add · Paste lists or files
          </span>
          <label htmlFor="tasks-mode" className="flex shrink-0 items-center gap-2 text-xs text-muted">
            Permissions
            <Select
              id="tasks-mode"
              className="w-44"
              value={mode}
              onChange={(e) => setMode(e.target.value as PermissionMode)}
            >
              {MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </label>
          <Button size="sm" variant="ghost" onClick={cancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            busy={busy}
            disabled={!total}
            onClick={() => void save()}
            data-testid="tasks-add-confirm"
          >
            {total > 1
              ? `Add ${total} tasks${planned.length > 1 ? ` in ${planned.length} chats` : ""}`
              : "Add task"}
          </Button>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <p className="truncate text-xs text-muted" data-testid="tasks-add-hint">
          Tasks run in order. Tasks in the same chat share context.
        </p>
        <div className="flex min-h-96 flex-1 flex-col gap-3 overflow-y-auto" data-testid="tasks-add-chats">
          {chats.map((chat, ci) => (
            <div
              key={chat.id}
              className="shrink-0 rounded-lg border border-line bg-surface"
              data-testid={`tasks-add-chat-${ci}`}
            >
              <div className="flex h-9 items-center gap-2 border-b border-line pl-3 pr-1">
                <MessageSquare className="size-4 shrink-0 text-hint" />
                <span className="text-sm font-medium text-fg">Chat {ci + 1}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-hint">
                  {chat.steps.length} {chat.steps.length === 1 ? "task" : "tasks"} · a new chat
                </span>
                <Select
                  aria-label="Project"
                  className="w-40"
                  value={chat.projectId}
                  onChange={(e) => setChats(setChatProject(chats, ci, e.target.value))}
                  data-testid={`tasks-add-project-${ci}`}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
                <IconButton
                  size="sm"
                  icon={MoreHorizontal}
                  label="Chat actions"
                  onClick={(e) => chatMenu(ci, e.currentTarget)}
                  data-testid={`tasks-add-chat-menu-${ci}`}
                />
              </div>
              <div className="flex flex-col gap-1 p-2">
                {chat.steps.map((step, si) => (
                  <div key={step.id} data-testid={`tasks-add-row-${ci}-${si}`}>
                    <div className="flex h-20 items-start gap-2">
                      <span className="flex h-8 w-6 shrink-0 items-center justify-end text-xs tabular-nums text-hint">
                        {si === 0 ? (
                          <MessageSquare className="size-3.5" />
                        ) : (
                          <CornerDownRight className="size-3.5" />
                        )}
                      </span>
                      <Textarea
                        rows={3}
                        autoFocus={step.id === focus || (!focus && ci === 0 && si === 0)}
                        className="h-20 min-w-0 flex-1 resize-none"
                        value={step.text}
                        placeholder={si === 0 ? "What should Claude do?" : "Then, in the same chat…"}
                        onChange={(e) => setChats(setStep(chats, ci, si, e.target.value))}
                        onPaste={(e) => {
                          if (takeFiles(ctx, e.clipboardData.files, (f) => attach(ci, si, f))) {
                            e.preventDefault();
                            return;
                          }
                          if (step.text.trim()) return;
                          const items = pastedList(e.clipboardData.getData("text"));
                          if (!items) return;
                          e.preventDefault();
                          setChats(spreadStep(chats, ci, si, items));
                        }}
                        onDragOver={(e) => {
                          if ([...e.dataTransfer.items].some((i) => i.kind === "file")) e.preventDefault();
                        }}
                        onDrop={(e) => {
                          if (takeFiles(ctx, e.dataTransfer.files, (f) => attach(ci, si, f)))
                            e.preventDefault();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void save();
                        }}
                        data-testid={`tasks-add-text-${ci}-${si}`}
                      />
                      <TaskFiles
                        files={step.files}
                        onPick={() => void ctx.attachments.pick().then((f) => attach(ci, si, f))}
                        onDrop={(list) => takeFiles(ctx, list, (f) => attach(ci, si, f))}
                        onRemove={(file) => setChats(removeFile(chats, ci, si, file.path))}
                        testId={`tasks-add-files-${ci}-${si}`}
                      />
                      <div className="flex h-20 shrink-0 flex-col gap-1">
                        <IconButton
                          size="sm"
                          icon={Paperclip}
                          label="Attach files"
                          onClick={() => void ctx.attachments.pick().then((f) => attach(ci, si, f))}
                          data-testid={`tasks-add-attach-${ci}-${si}`}
                        />
                        <IconButton
                          size="sm"
                          icon={MoreHorizontal}
                          label="Task actions"
                          onClick={(e) => taskMenu(ci, si, e.currentTarget)}
                          data-testid={`tasks-add-task-menu-${ci}-${si}`}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <div className="pl-8">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={CornerDownRight}
                    onClick={() => addTask(ci)}
                    data-testid={`tasks-add-step-${ci}`}
                  >
                    Then, in this chat…
                  </Button>
                </div>
              </div>
            </div>
          ))}
          <div className="shrink-0">
            <Button size="sm" icon={Plus} onClick={addChat} data-testid="tasks-add-chat">
              New chat with tasks
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/** Edit a queued task: its prompt and files, whether it starts a new chat, its permissions. */
function EditDialog({
  task,
  onClose,
  onSave,
}: {
  task: Task;
  onClose: () => void;
  onSave: (input: {
    prompt: string;
    newChat: boolean;
    permissionMode: PermissionMode;
    attachments: TaskFile[];
  }) => Promise<void>;
}) {
  const ctx = useAddon();
  const [text, setText] = useState(task.prompt);
  const [files, setFiles] = useState<TaskFile[]>(task.attachments ?? []);
  // Files added here: deleted again unless saved (the task's own go when the host sees them unused).
  const [added, setAdded] = useState<string[]>([]);
  const attach = (more: TaskFile[]) => {
    setAdded((a) => [...a, ...more.map((f) => f.path)]);
    setFiles((list) => [...list, ...more.filter((f) => !list.some((g) => g.path === f.path))]);
  };
  const discard = (paths: string[]) =>
    paths.length && void ctx.host.call("discard", { paths }).catch(() => {});
  const cancel = () => {
    discard(added);
    onClose();
  };
  const empty = !text.trim() && !files.length;
  const [sameChat, setSameChat] = useState(!task.newChat);
  const [mode, setMode] = useState<PermissionMode>(task.permissionMode ?? "acceptEdits");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (empty) return;
    setBusy(true);
    try {
      await onSave({ prompt: text.trim(), newChat: !sameChat, permissionMode: mode, attachments: files });
      discard(added.filter((p) => !files.some((f) => f.path === p)));
    } catch (e) {
      ctx.notify({ title: (e as Error).message, tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={cancel}
      width="lg"
      testId="tasks-edit-dialog"
      title="Edit the task"
      footer={
        <>
          <Button
            size="sm"
            variant="ghost"
            icon={Paperclip}
            className="mr-auto"
            onClick={() => void ctx.attachments.pick().then(attach)}
          >
            Attach files
          </Button>
          <Button size="sm" variant="ghost" onClick={cancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            busy={busy}
            disabled={empty}
            onClick={() => void save()}
            data-testid="tasks-edit-confirm"
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Textarea
          autoFocus
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            if (takeFiles(ctx, e.clipboardData.files, attach)) e.preventDefault();
          }}
          onDragOver={(e) => {
            if ([...e.dataTransfer.items].some((i) => i.kind === "file")) e.preventDefault();
          }}
          onDrop={(e) => {
            if (takeFiles(ctx, e.dataTransfer.files, attach)) e.preventDefault();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void save();
          }}
        />
        <div className="min-h-16">
          {files.length > 0 ? (
            <Attachments files={files} onRemove={(f) => setFiles(files.filter((g) => g.path !== f.path))} />
          ) : (
            <div className="flex h-16 items-center justify-center rounded-md border border-dashed border-line text-xs text-hint">
              Paste, drop or attach images and files to send with the task
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <LabeledSwitch
              checked={sameChat}
              onChange={setSameChat}
              label="Continue the chat of the task before"
            />
          </div>
          <label htmlFor="tasks-edit-mode" className="flex shrink-0 items-center gap-2 text-xs text-muted">
            Permissions
            <Select
              id="tasks-edit-mode"
              className="w-44"
              value={mode}
              onChange={(e) => setMode(e.target.value as PermissionMode)}
            >
              {MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </div>
    </Dialog>
  );
}

export function showTasks(ctx: AddonUiContext) {
  ctx.showView("tasks");
}

interface ReviewItem {
  key: number;
  title: string;
  prompt: string;
  newChat: boolean;
}

/** The tasks Claude asked to queue, as the add tool got them (strings or `{ title, prompt, newChat }`). */
function reviewItems(input: Record<string, unknown>): ReviewItem[] {
  const sameChat = input.sameChat === true;
  return (Array.isArray(input.tasks) ? input.tasks : []).flatMap((item, key): ReviewItem[] => {
    if (typeof item === "string")
      return item.trim() ? [{ key, title: "", prompt: item, newChat: !sameChat }] : [];
    if (!item || typeof item !== "object") return [];
    const o = item as Record<string, unknown>;
    const prompt = typeof o.prompt === "string" ? o.prompt : "";
    if (!prompt.trim()) return [];
    return [
      {
        key,
        title: typeof o.title === "string" ? o.title : "",
        prompt,
        newChat: typeof o.newChat === "boolean" ? o.newChat : !sameChat,
      },
    ];
  });
}

/**
 * Claude asks to queue tasks (`addon_tasks_add`): the plan as an editable list before it goes in the
 * queue. Change a title or prompt, drop a task, pick the project, then queue them, or say no.
 */
export function ReviewTasks({ request, status, projectId: chatProject, respond }: AddonPermissionProps) {
  const projects = useProjectList();
  const [items, setItems] = useState(() => reviewItems(request.input));
  const named = typeof request.input.project === "string" ? request.input.project.trim().toLowerCase() : "";
  const [projectId, setProjectId] = useState(
    () =>
      projects.find((p) => p.id === request.input.project || p.name.toLowerCase() === named)?.id ??
      chatProject ??
      projects[0]?.id ??
      "",
  );
  const [startNow, setStartNow] = useState(request.input.start === true);
  const [busy, setBusy] = useState(false);
  const count = items.filter((i) => i.prompt.trim()).length;
  const project = projects.find((p) => p.id === projectId);

  if (status !== "pending")
    return (
      <div className="flex items-center gap-2 text-xs text-muted" data-testid="tasks-review-done">
        {status === "denied" || status === "cancelled" ? (
          <X className="size-3.5 text-danger" />
        ) : (
          <CircleCheck className="size-3.5 text-success" />
        )}
        Queue tasks — {status === "denied" ? "not queued" : status === "cancelled" ? "cancelled" : "queued"}
      </div>
    );

  const set = (key: number, change: Partial<ReviewItem>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...change } : i)));
  const answer = async (allow: boolean) => {
    setBusy(true);
    try {
      if (!allow) {
        await respond({ behavior: "deny", message: "The user chose not to queue these tasks." });
        return;
      }
      const tasks = items
        .filter((i) => i.prompt.trim())
        .map((i) => ({
          prompt: i.prompt.trim(),
          newChat: i.newChat,
          ...(i.title.trim() ? { title: i.title.trim() } : {}),
        }));
      await respond({
        behavior: "allow",
        input: { tasks, ...(projectId ? { project: projectId } : {}), start: startNow },
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-accent bg-accent-soft p-3"
      data-testid="tasks-review"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-fg">
        <ListTodo className="size-4 shrink-0 text-accent" />
        <span className="min-w-0 truncate">
          Claude wants to queue {count === 1 ? "a task" : `${count} tasks`}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {project && <ProjectSwatch color={project.color} />}
          <Select
            aria-label="Project"
            className="w-40"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            data-testid="tasks-review-project"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="flex max-h-96 flex-col overflow-y-auto rounded-md border border-line bg-raised">
        {items.map((item, i) => (
          <div
            key={item.key}
            className="flex items-start gap-2 border-b border-line p-2 last:border-b-0"
            data-testid={`tasks-review-${i}`}
          >
            <span className="w-5 shrink-0 pt-1 text-right text-xs tabular-nums text-hint">{i + 1}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Input
                aria-label={`Title of task ${i + 1}`}
                placeholder="Title (from the prompt when empty)"
                value={item.title}
                onChange={(e) => set(item.key, { title: e.target.value })}
                data-testid={`tasks-review-title-${i}`}
              />
              <Textarea
                aria-label={`Prompt of task ${i + 1}`}
                rows={2}
                value={item.prompt}
                onChange={(e) => set(item.key, { prompt: e.target.value })}
                data-testid={`tasks-review-prompt-${i}`}
              />
            </div>
            <div className="flex w-32 shrink-0 flex-col items-end gap-1">
              <IconButton
                size="sm"
                icon={X}
                label={`Remove task ${i + 1}`}
                onClick={() => setItems((list) => list.filter((x) => x.key !== item.key))}
                data-testid={`tasks-review-remove-${i}`}
              />
              {i > 0 && (
                <LabeledSwitch
                  checked={!item.newChat}
                  onChange={(on) => set(item.key, { newChat: !on })}
                  label="Same chat"
                />
              )}
            </div>
          </div>
        ))}
        {!items.length && <div className="p-3 text-xs text-muted">No tasks left to queue.</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="primary"
          icon={Check}
          disabled={!count || !projectId || busy}
          onClick={() => void answer(true)}
          data-testid="tasks-review-allow"
        >
          {count === 1 ? "Queue the task" : `Queue ${count} tasks`}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={X}
          disabled={busy}
          onClick={() => void answer(false)}
          data-testid="tasks-review-deny"
        >
          Don't queue
        </Button>
        <div className="ml-auto">
          <LabeledSwitch checked={startNow} onChange={setStartNow} label="Start the queue right away" />
        </div>
      </div>
    </div>
  );
}
