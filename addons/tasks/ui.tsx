import type { AddonComponentProps, AddonPermissionProps, AddonTabProps, AddonUiContext } from "@jig/sdk";
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
  ProviderMark,
  Select,
  Spinner,
  Switch,
  Tabs,
  Textarea,
  Tooltip,
  useActiveProject,
  useAddon,
  useAddonEvent,
  useHostCall,
  usePointerDrag,
  useProjectList,
} from "@jig/sdk/ui";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleCheck,
  CircleMinus,
  CornerDownRight,
  GripVertical,
  History,
  LayoutDashboard,
  ListTodo,
  MessageSquare,
  MessageSquareReply,
  MoreHorizontal,
  Paperclip,
  Pause,
  PencilLine,
  Play,
  Plus,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { DashboardView } from "./Dashboard";
import {
  COUNT_LABEL,
  COUNT_ORDER,
  type CountKey,
  countTasks,
  countText,
  progressText,
  type QueueCounts,
  restCounts,
  sizeText,
} from "./lib/counts";
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
  setChatProvider,
  setStep,
  splitAt,
  spreadStep,
} from "./lib/draft";
import {
  type ChatGroup,
  canReportLate,
  chatGroups,
  counts,
  currentSlot,
  type DropSlot,
  dropSlots,
  duration,
  fileName,
  formatMs,
  isActive,
  isFinished,
  isReady,
  type NewTask,
  type PermissionMode,
  PROVIDER_LABEL,
  type Queue,
  type Run,
  type RunsOn,
  runOutcome,
  runProviders,
  runProvidersText,
  runsOn,
  STATUS_LABEL,
  stepTasks,
  type Task,
  type TaskFile,
  type TaskProvider,
  type TaskStatus,
  tally,
} from "./lib/tasks";
import {
  countTextClass,
  money,
  onQueueRequest,
  ProgressParts,
  STATUS_TONE,
  StatusIcon,
  takeRequestedQueue,
} from "./parts";
import { type ProviderChoice, RunsOnButton, runsOnText, SOURCE_TEXT } from "./RunsOn";

const MODES: Array<{ value: PermissionMode; label: string }> = [
  { value: "acceptEdits", label: "Accept file edits" },
  { value: "default", label: "Ask before edits" },
  { value: "plan", label: "Plan only (no changes)" },
];

/**
 * The tick that says whether Start takes a queued task (all ticked by default). `mixed` shows a group
 * with some ticked; `hidden` keeps its slot empty so the columns stay aligned.
 */
function Tick({
  checked,
  mixed = false,
  hidden = false,
  label,
  onChange,
  testId,
}: {
  checked: boolean;
  mixed?: boolean;
  hidden?: boolean;
  label: string;
  onChange: (on: boolean) => void;
  testId?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  if (hidden) return <span className="w-4 shrink-0" />;
  return (
    <span className="flex w-4 shrink-0 items-center justify-center">
      <input
        ref={ref}
        type="checkbox"
        className="size-3.5 accent-accent"
        checked={checked}
        aria-label={label}
        title={label}
        data-testid={testId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => onChange(e.target.checked)}
      />
    </span>
  );
}

/** Ticked state of a set of tasks: only queued ones count; none queued hides the tick. */
function tickState(tasks: Task[]): { ids: string[]; checked: boolean; mixed: boolean } {
  const queued = tasks.filter((t) => t.status === "queued");
  const ticked = queued.filter(isReady).length;
  return {
    ids: queued.map((t) => t.id),
    checked: queued.length > 0 && ticked === queued.length,
    mixed: ticked > 0 && ticked < queued.length,
  };
}

/**
 * The queue table's columns, shared by its header, chat rows and task rows so they line up. Each has a
 * fixed width that fits its longest value on one line ("10h 59m", "12:59 PM", "$99.99", "4 of 12
 * finished"). Narrow containers hide the detail columns first, then time and cost; the variants are on
 * both sides because plain utilities from add-on CSS win over container variants (D-297).
 */
const COL = {
  started: "@max-3xl:hidden @3xl:block w-16",
  notes: "@max-3xl:hidden @3xl:block w-12",
  followUps: "@max-3xl:hidden @3xl:block w-20",
  files: "@max-3xl:hidden @3xl:flex w-12 justify-end",
  time: "@max-xl:hidden @xl:block w-16",
  cost: "@max-xl:hidden @xl:block w-16",
  status: "w-28",
  /** Who runs the chat: always the mark, in the same place on every row (D-330). */
  provider: "flex w-4 shrink-0 items-center justify-center",
};
/** History's "Ran on": the marks alone when narrow, with the name beside them when there's room. */
const RAN_ON = "@max-xl:w-8 @xl:w-20 flex shrink-0 items-center gap-1";
/** Every value column: one line, right-aligned, digits of equal width. */
const CELL = "shrink-0 whitespace-nowrap text-right tabular-nums";

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
  labelClassName,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  label: string;
  /** E.g. hide the words in a narrow container; the switch keeps its label for screen readers. */
  labelClassName?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted" title={label}>
      <Switch checked={checked} onChange={onChange} label={label} />
      <span className={cn("truncate", labelClassName)}>{label}</span>
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
  /** Who runs the queue's new chats: its "Runs on", else the project's default (D-330). */
  provider: TaskProvider;
}

/**
 * The project whose queue the view shows: Jig's active project. Picking another in the view's project
 * menu only overrides it until the global project changes again.
 */
function useShownProject() {
  const active = useActiveProject();
  const projects = useProjectList();
  const [picked, setPicked] = useState<string>();
  const activeId = active?.id;
  // Any change of the global project takes over again: the view's own pick only overrides it.
  useEffect(() => setPicked(undefined), [activeId]);
  const id = picked && projects.some((p) => p.id === picked) ? picked : (activeId ?? projects[0]?.id);
  return { project: projects.find((p) => p.id === id), projects, pick: setPicked };
}

/** One task queue per project (each runs on its own), with its runs kept in a history. */
export function TasksView({ ctx }: AddonComponentProps) {
  const { project, projects, pick } = useShownProject();
  const [tab, setTab] = useState<"queue" | "history">("queue");
  const [run, setRun] = useState<string | undefined>();
  const projectId = project?.id;
  useEffect(() => setRun(undefined), [projectId]);
  // Loaded here: the header's "Runs on" and the Queue tab both show it.
  const { queue, error } = useQueue(projectId);
  // The dashboard asked for a project's queue: show it (now, or when this view mounts).
  useEffect(() => {
    const show = (id: string) => {
      pick(id);
      setTab("queue");
      setRun(undefined);
    };
    const asked = takeRequestedQueue();
    if (asked) show(asked);
    return onQueueRequest(() => {
      const id = takeRequestedQueue();
      if (id) show(id);
    });
  }, []);

  const showProjects = async (at: HTMLElement) => {
    const all = await ctx.host.call<QueueOverview[]>("overview").catch(() => []);
    ctx.menu(
      [
        {
          label: "All queues",
          icon: "layout-dashboard",
          testId: "tasks-project-all",
          onSelect: () => openDashboard(ctx),
        },
        { separator: true as const },
        ...projects.map((p) => {
          const o = all.find((x) => x.projectId === p.id);
          const busy = o ? o.queued + o.active : 0;
          return {
            label: p.name,
            project: p.id,
            checked: p.id === projectId,
            testId: `tasks-project-${p.name}`,
            badge: o?.needsYou ? "Needs you" : o?.running ? "Running" : busy ? `${busy} queued` : undefined,
            onSelect: () => pick(p.id),
          };
        }),
      ],
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
      {/* A container: in a narrow place the "Runs on" control shows only its mark (its slot stays). */}
      <div className="@container flex h-9 shrink-0 items-center gap-2 border-b border-line pl-1 pr-3">
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
        <IconButton
          size="sm"
          icon={LayoutDashboard}
          label="All queues"
          className="ml-auto"
          data-testid="tasks-all-queues"
          onClick={() => openDashboard(ctx)}
        />
        {/* "Runs on": who runs this queue's new chats (D-330); a fixed slot, reserved while it loads. */}
        <span className="flex @max-md:w-12 @md:w-32 shrink-0">
          {queue && (
            <RunsOnButton
              ctx={ctx}
              value={{ provider: queue.provider }}
              shown={
                queue.provider
                  ? { provider: queue.provider, from: "queue" }
                  : { provider: project.provider, from: "project" }
              }
              fallback={project.provider}
              defaultLabel="Project default"
              models={false}
              label={queue.provider ? undefined : "Default"}
              className="w-full"
              labelClassName="@max-md:hidden @md:inline"
              testId="tasks-runs-on"
              onPick={(choice) =>
                void ctx.host
                  .call("setProvider", { projectId: project.id, provider: choice.provider ?? null })
                  .catch((e: Error) => ctx.notify({ title: e.message, tone: "danger" }))
              }
            />
          )}
        </span>
        <button
          type="button"
          className="flex h-7 min-w-0 items-center gap-2 rounded-md px-2 text-sm text-fg hover:bg-hover"
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
        <QueuePanel
          key={project.id}
          ctx={ctx}
          projectId={project.id}
          projectDefault={project.provider}
          queue={queue}
          error={error}
          onHistory={() => setTab("history")}
        />
      ) : run ? (
        <RunPanel
          ctx={ctx}
          projectId={project.id}
          projectDefault={project.provider}
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
  projectDefault,
  queue,
  error,
  onHistory,
}: {
  ctx: AddonUiContext;
  projectId: string;
  /** Who runs the project's new chats when neither the task nor the queue says. */
  projectDefault: TaskProvider;
  queue: Queue | undefined;
  error?: string;
  onHistory: () => void;
}) {
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

  const putBackActive = async (task: Task) => {
    const ok = await ctx.confirm({
      title: "Put this task back in the queue?",
      message:
        "The queue stops following its chat and pauses, and the task waits as if it never ran. Its chat isn't stopped: stop it there if it's still working.",
      confirmLabel: "Put back",
    });
    if (ok) await call("reset", { ids: [task.id] });
  };
  const resetQueue = async () => {
    const ok = await ctx.confirm({
      title: "Start this queue over?",
      message:
        "Every task goes back to queued, as if it never ran: reports, times and costs are cleared and the open run leaves History. The chats that ran are kept. A chat still working isn't stopped.",
      confirmLabel: "Start over",
      danger: true,
    });
    if (ok) await call("reset");
  };

  const askReport = async (task: Task) => {
    try {
      await ctx.host.call("askReport", { projectId, id: task.id });
      ctx.notify({ title: "Asked its chat for the report", message: task.title, tone: "info" });
    } catch (e) {
      ctx.notify({ title: (e as Error).message, tone: "danger" });
    }
  };

  const menuFor = (task: Task, at: MouseEvent | HTMLElement) => {
    const queued = task.status === "queued";
    ctx.menu(
      [
        ...openEntries(ctx, task, () => setOpen(task.id)),
        ...(canReportLate(task) && task.sessionId
          ? [
              {
                label: "Ask for a report",
                icon: "message-square-reply",
                onSelect: () => void askReport(task),
              },
            ]
          : []),
        { separator: true as const },
        ...(queued
          ? [
              { label: "Edit…", icon: "pencil", onSelect: () => setEditing(task) },
              task.leftOut
                ? {
                    label: "Include when starting",
                    icon: "square-check",
                    onSelect: () => call("select", { ids: [task.id], on: true }),
                  }
                : {
                    label: "Leave out for now",
                    icon: "square",
                    onSelect: () => call("select", { ids: [task.id], on: false }),
                  },
              ...MOVES.map((m) => ({
                label: m.label,
                icon: m.icon,
                shortcut: m.shortcut,
                disabled: !canStep(queue, task, m.to),
                onSelect: () => call("move", { ids: [task.id], to: m.to }),
              })),
              { label: "Skip", icon: "skip-forward", onSelect: () => call("skip", { id: task.id }) },
            ]
          : []),
        ...(isFinished(task)
          ? [
              {
                label: "Put back in the queue",
                icon: "undo-2",
                onSelect: () => call("reset", { ids: [task.id] }),
              },
              { label: "Run again", icon: "rotate-ccw", onSelect: () => call("runAgain", { id: task.id }) },
            ]
          : []),
        ...(isActive(task)
          ? [
              {
                label: "Put back in the queue…",
                icon: "undo-2",
                onSelect: () => void putBackActive(task),
              },
            ]
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
      {/* One row: the queue's progress on the left, its size, time and cost and its controls on the
          right, a 2 px progress line along the bottom edge (D-352). In a narrow place (a sidebar) the
          size, the time, the quiet counts and the switch's words give way. */}
      <div className="@container shrink-0">
        <div className="relative flex h-10 items-center gap-3 px-3">
          {queue.tasks.length > 0 ? <QueueSummary tasks={queue.tasks} inline /> : <span className="flex-1" />}
          <div className="flex shrink-0 items-center gap-2">
            <LabeledSwitch
              checked={queue.stopOnFailure}
              onChange={(on) => void call("setStopOnFailure", { on })}
              label="Stop when a task fails"
              labelClassName="@max-3xl:hidden @3xl:inline"
            />
            <Button
              size="sm"
              icon={Plus}
              onClick={() => setAdding(true)}
              aria-label="Add tasks"
              title="Add tasks"
              data-testid="tasks-add"
            >
              <span className="@max-xl:hidden @xl:inline">Add tasks</span>
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
                disabled={!n.ready}
                title={
                  n.ready < n.queued
                    ? `Starts the ${n.ready} ticked of ${n.queued} queued tasks`
                    : "Starts the queued tasks, one after another"
                }
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
                    {
                      label: "Start over…",
                      icon: "undo-2",
                      disabled: n.queued === n.total,
                      onSelect: () => void resetQueue(),
                    },
                    { separator: true as const },
                    { label: "Past runs", icon: "history", onSelect: onHistory },
                  ],
                  e.currentTarget,
                )
              }
            />
          </div>
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
        <TaskTable
          ctx={ctx}
          queue={queue}
          projectDefault={projectDefault}
          projectName={projectName}
          onOpen={setOpen}
          onMenu={menuFor}
          onTick={(ids, on) => void call("select", { ids, on })}
          onMove={(ids, move) => void call("move", { ids, ...move })}
        />
      )}
      {adding && (
        <AddDialog
          projectId={projectId}
          onClose={() => setAdding(false)}
          onSave={async (chats, permissionMode) => {
            await queueChats(ctx, chats, permissionMode);
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
          queue={queue}
          projectDefault={projectDefault}
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
          on={runsOn(queue, openTask, projectDefault)}
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
          onAskReport={() => void askReport(openTask)}
        />
      )}
    </>
  );
}

type MoveTo = -1 | 1 | "top" | "bottom";

/** The ⋯ menu's moves; up and down are also Alt+↑/↓ on a focused row (D-307). */
const MOVES: Array<{ label: string; icon: string; shortcut?: string; to: MoveTo }> = [
  { label: "Move up", icon: "arrow-up", shortcut: "Alt+↑", to: -1 },
  { label: "Move down", icon: "arrow-down", shortcut: "Alt+↓", to: 1 },
  { label: "Move to top", icon: "arrow-up-to-line", to: "top" },
  { label: "Move to bottom", icon: "arrow-down-to-line", to: "bottom" },
];

/** Whether a move would change anything (and is allowed: only queued tasks move). */
function canStep(queue: Queue, task: Task, to: MoveTo): boolean {
  try {
    return stepTasks(queue, [task.id], to) !== queue;
  } catch {
    return false;
  }
}

const sameSlot = (a?: DropSlot, b?: DropSlot) => !!a && !!b && a.before === b.before && a.join === b.join;

/**
 * Drag and drop in the queue, handed from the table to its cards and rows. It runs on pointer events
 * (`usePointerDrag`, D-351), so the wheel and the trackpad scroll the list while a task is dragged.
 * Rows and headers mark themselves with `data-drop-task` / `data-drop-group` for the table to aim at.
 */
interface QueueDnd {
  dragging: (id: string) => boolean;
  start: (ids: string[], e: React.PointerEvent) => void;
  step: (task: Task, to: -1 | 1) => void;
  /** The row the drop line shows under (the task lands in its chat, after it). */
  lineAfter?: string;
}

/** What the pointer carries while dragging: the task's title, or its chat's and how many tasks. */
function dragLabel(queue: Queue, ids?: string[]): string {
  const first = queue.tasks.find((t) => t.id === ids?.[0]);
  if (!ids || !first) return "";
  return ids.length === 1 ? first.title : `${first.title} · ${ids.length} tasks`;
}

/** The line where a drag will land: drawn over the gap or edge, so nothing moves to make room. */
function DropLine({ at }: { at: "above" | "below" | "row" }) {
  return (
    <span
      aria-hidden
      data-testid="tasks-drop-line"
      className={cn(
        "pointer-events-none absolute inset-x-0 z-20 h-0.5 rounded-full bg-accent",
        at === "above" ? "-top-2" : at === "below" ? "-bottom-2" : "bottom-0",
      )}
    />
  );
}

/**
 * The results table: the tasks grouped by chat, under one header row. In the queue (`onMove`) queued
 * tasks drag to a new place, one task or a whole chat by its card's header (D-307); a line shows
 * where they'll land and nothing else moves until the drop.
 */
function TaskTable({
  ctx,
  queue,
  projectDefault,
  projectName,
  onOpen,
  onMenu,
  onTick,
  onMove,
}: {
  ctx: AddonUiContext;
  queue: Queue;
  projectDefault: TaskProvider;
  projectName: (id?: string) => string;
  onOpen: (id: string) => void;
  onMenu: (task: Task, at: MouseEvent | HTMLElement) => void;
  /** The queue (not a past run): ticks that include or leave out queued tasks. */
  onTick?: (ids: string[], on: boolean) => void;
  /** The queue (not a past run): moves queued tasks to a dropped slot, or a step. */
  onMove?: (ids: string[], move: { slot?: DropSlot; to?: MoveTo }) => void;
}) {
  const all = tickState(queue.tasks);
  const groups = chatGroups(queue);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<DropSlot>();
  // The slot a drop lands in, read on release (a state update may not have rendered yet).
  const targetRef = useRef<DropSlot>(undefined);
  const show = (next?: DropSlot) => {
    if (sameSlot(next, targetRef.current) || (!next && !targetRef.current)) return;
    targetRef.current = next;
    setTarget(next);
  };
  const drag = usePointerDrag<string[]>({
    scroller: scrollRef,
    onMove: (at, ids) => aimAt(at.target, at.y, ids),
    onDrop: (_, ids) => {
      if (targetRef.current) onMove?.(ids, { slot: targetRef.current });
    },
    onEnd: () => show(undefined),
  });
  const dragged = drag.active;
  // A row moved with Alt+↑/↓ keeps the focus after the queue reloads (it may be in another card now).
  const focusAfter = useRef<string>(undefined);
  useEffect(() => {
    const id = focusAfter.current;
    if (!id) return;
    focusAfter.current = undefined;
    listRef.current?.querySelector<HTMLElement>(`[data-testid="task-${id}"]`)?.focus();
  }, [queue]);

  const rest = dragged ? queue.tasks.filter((t) => !dragged.includes(t.id)) : queue.tasks;
  /**
   * The slot for where the pointer is (run on every move and after every scroll): over a row's top half
   * it goes before that task, its bottom half after it; over a card's header above the card; below the
   * last card the end of the queue; the preferred kind of slot, else the other kind there. Over the gaps
   * between cards the line stays put.
   */
  const aimAt = (under: Element | null, y: number, ids: string[]) => {
    let slots: DropSlot[];
    let here: DropSlot | undefined;
    try {
      slots = dropSlots(queue, ids);
      here = currentSlot(queue, ids);
    } catch {
      return show(undefined);
    }
    const left = queue.tasks.filter((t) => !ids.includes(t.id));
    const resolve = (prefer?: DropSlot) => {
      if (!prefer) return undefined;
      const found = [prefer, { ...prefer, join: !prefer.join }]
        .map((c) => slots.find((slot) => sameSlot(slot, c)))
        .find(Boolean);
      return found && !sameSlot(found, here) ? found : undefined;
    };
    if (!under || !scrollRef.current?.contains(under)) return show(undefined);
    const row = under.closest<HTMLElement>("[data-drop-task]");
    if (row) {
      const task = queue.tasks.find((t) => t.id === row.dataset.dropTask);
      if (!task || ids.includes(task.id)) return show(undefined);
      const box = row.getBoundingClientRect();
      if (y < box.top + box.height / 2) {
        const group = groups.find((g) => g.tasks.some((t) => t.task.id === task.id));
        const first = group?.tasks.find((t) => !ids.includes(t.task.id))?.task;
        return show(resolve({ before: task.id, join: first !== task }));
      }
      return show(resolve({ before: left[left.indexOf(task) + 1]?.id, join: true }));
    }
    const header = under.closest<HTMLElement>("[data-drop-group]");
    if (header) {
      const group = groups[Number(header.dataset.dropGroup)];
      const first = group?.tasks.find((t) => !ids.includes(t.task.id))?.task;
      return show(resolve(first && { before: first.id, join: false }));
    }
    const last = listRef.current?.lastElementChild;
    if (last && y > last.getBoundingClientRect().bottom) show(resolve({ join: false }));
  };

  // Where the line shows: under the row a task joins after, or above a card (or below the last one).
  const joinAfter = target?.join
    ? (target.before ? rest[rest.findIndex((t) => t.id === target.before) - 1] : rest[rest.length - 1])?.id
    : undefined;
  const cardBefore =
    target && !target.join && target.before
      ? groups.findIndex((g) => g.tasks.some((t) => t.task.id === target.before))
      : -1;
  const lineAtEnd = !!target && !target.join && !target.before;

  const dnd: QueueDnd | undefined = onMove && {
    dragging: (id) => !!dragged?.includes(id),
    start: (ids, e) => drag.start(e, ids),
    step: (task, to) => {
      focusAfter.current = task.id;
      onMove([task.id], { to });
    },
    lineAfter: joinAfter,
  };

  return (
    // Narrow (a sidebar): the detail columns give way first, then time and cost, then the chats' and
    // tasks' hints beside their titles; task and status stay.
    <div ref={scrollRef} className="@container min-h-0 flex-1 overflow-auto px-3 pb-3">
      {drag.ghost(dragLabel(queue, dragged))}
      <div className="sticky top-0 z-10 flex h-7 items-center gap-3 whitespace-nowrap border-x border-transparent bg-surface px-3 text-2xs font-medium uppercase tracking-wide text-hint">
        {onTick && (
          <Tick
            hidden={!all.ids.length}
            checked={all.checked}
            mixed={all.mixed}
            label={all.checked ? "Leave every queued task out" : "Include every queued task"}
            onChange={(on) => onTick(all.ids, on)}
            testId="tasks-tick-all"
          />
        )}
        <span className="w-6 shrink-0 text-right">#</span>
        <span className="min-w-0 flex-1">Task and how it went</span>
        <span className={cn(COL.started, CELL)}>Started</span>
        <span className={cn(COL.notes, CELL)}>Notes</span>
        <span className={cn(COL.followUps, CELL)}>Follow-ups</span>
        <span className={cn(COL.files, CELL)}>Files</span>
        <span className={cn(COL.time, CELL)}>Time</span>
        <span className={cn(COL.cost, CELL)}>Cost</span>
        <span className={COL.provider} title="Runs on: Claude or ChatGPT" />
        <span className="w-7 shrink-0" />
        <span className={cn(COL.status, CELL)}>Status</span>
      </div>
      <div ref={listRef} className="flex flex-col gap-3 pt-2" data-testid="tasks-list">
        {groups.map((group, gi) => (
          <div key={group.tasks[0]!.task.id} className="relative">
            {cardBefore === gi && <DropLine at="above" />}
            <ChatCard
              ctx={ctx}
              group={group}
              number={gi + 1}
              projectName={projectName(group.projectId)}
              runsOnOf={(task) => runsOn(queue, task, projectDefault)}
              onOpen={onOpen}
              onMenu={onMenu}
              onTick={onTick}
              dnd={dnd}
            />
            {lineAtEnd && gi === groups.length - 1 && <DropLine at="below" />}
          </div>
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
    <div className="@container min-h-0 flex-1 overflow-auto px-3 pb-3" data-testid="tasks-history">
      <div className="sticky top-0 z-10 flex h-7 items-center gap-3 whitespace-nowrap bg-surface px-3 text-2xs font-medium uppercase tracking-wide text-hint">
        <span className="@max-xl:w-24 shrink-0 @xl:w-40">Started</span>
        <span className="min-w-0 flex-1">Tasks</span>
        <span className="@max-3xl:hidden @3xl:block w-12 shrink-0 text-right">Done</span>
        <span className="@max-3xl:hidden @3xl:block w-12 shrink-0 text-right">Failed</span>
        <span className={cn(COL.time, CELL)}>Time</span>
        <span className={cn(COL.cost, CELL)}>Cost</span>
        <span className={RAN_ON} title="The providers its tasks ran on">
          <span className="@max-xl:hidden @xl:inline">Ran on</span>
        </span>
        <span className={cn("w-24", CELL)}>Status</span>
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
              <span className="@max-xl:w-24 shrink-0 truncate text-xs tabular-nums text-fg @xl:w-40">
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
              <span className="@max-3xl:hidden @3xl:block w-12 shrink-0 text-right text-xs tabular-nums text-muted">
                {o.done || ""}
              </span>
              <span className="@max-3xl:hidden @3xl:block w-12 shrink-0 text-right text-xs tabular-nums text-muted">
                {o.failed || ""}
              </span>
              <span className={cn(COL.time, CELL, "text-xs text-muted")}>{runTime(run)}</span>
              <span className={cn(COL.cost, CELL, "text-xs text-muted")}>{money(t.costUsd)}</span>
              <RanOn tasks={run.tasks} className={RAN_ON} testId={`tasks-run-provider-${i}`} />
              <span className="flex w-24 shrink-0 items-center justify-end gap-1.5 whitespace-nowrap">
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

/**
 * The providers a run's tasks ran on (from the tasks, never the queue's setting): one mark, or both
 * when it mixed them, the counts in the tooltip. Empty for a run from before Jig kept it.
 */
function RanOn({ tasks, className, testId }: { tasks: Task[]; className: string; testId: string }) {
  const ran = runProviders(tasks);
  const text = runProvidersText(ran);
  return (
    <span className={className} title={text ? `Ran on ${text}` : undefined} data-testid={testId}>
      {ran.counts.map((c) => (
        <ProviderMark key={c.provider} provider={c.provider} iconOnly />
      ))}
      {ran.counts.length > 0 && (
        <span className="@max-xl:hidden @xl:inline min-w-0 truncate text-xs text-muted">
          {ran.counts.length > 1 ? "Mixed" : PROVIDER_LABEL[ran.counts[0]!.provider]}
        </span>
      )}
    </span>
  );
}

/** A past run's results, as the queue showed them: read-only, with Open chat, follow-ups and Run again. */
function RunPanel({
  ctx,
  projectId,
  projectDefault,
  runId,
  onBack,
  onQueued,
}: {
  ctx: AddonUiContext;
  projectId: string;
  projectDefault: TaskProvider;
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
      <div className="@container flex h-10 shrink-0 items-center gap-2 px-3" data-testid="tasks-run">
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
          {/* At the right, beside ⋯: a provider joining while it runs grows leftward, moving nothing. */}
          <RanOn tasks={run.tasks} className="flex shrink-0 items-center gap-1" testId="tasks-run-provider" />
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
      <TaskTable
        ctx={ctx}
        queue={queue}
        projectDefault={projectDefault}
        projectName={projectName}
        onOpen={setOpen}
        onMenu={menuFor}
      />
      {openTask && (
        <TaskDialog
          ctx={ctx}
          task={openTask}
          index={run.tasks.indexOf(openTask)}
          projectName={projectName(openTask.projectId)}
          on={runsOn(queue, openTask, projectDefault)}
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

/** The full breakdown behind the strip's lead: every count (they add up), then tasks and chats. */
function Breakdown({ counts: c }: { counts: QueueCounts }) {
  const always: CountKey[] = ["done", "running", "upNext", "leftOut"];
  const row = (label: string, n: number, quiet?: boolean) => (
    <div key={label} className={cn("flex justify-between gap-8", quiet && "text-muted")}>
      <span>{label}</span>
      <span className="tabular-nums">{n}</span>
    </div>
  );
  return (
    <div className="flex w-40 flex-col gap-0.5 py-1 tabular-nums" data-testid="tasks-breakdown">
      {COUNT_ORDER.filter((k) => always.includes(k) || c.by[k]).map((k) =>
        row(COUNT_LABEL[k], c.by[k], k === "leftOut" || k === "skipped"),
      )}
      <div className="my-1 border-t border-line" />
      {row("Tasks", c.total)}
      {row("Chats", c.chats)}
      {row("Chats up next", c.chatsUpNext)}
    </div>
  );
}

/**
 * The queue's progress in one line (D-352): "5 of 6 done" (of the tasks that will run), then only the
 * counts that aren't zero, the full breakdown on hover; on the right, muted, the size, time and cost
 * of the same tasks. `inline` sits in the queue's header row (inside its `@container`, which draws the
 * progress line) and gives way as the row narrows; otherwise it's its own row with its own line.
 */
function QueueSummary({ tasks, inline }: { tasks: Task[]; inline?: boolean }) {
  const c = countTasks(tasks);
  const rest = restCounts(c);
  const dot = <span className="text-hint"> · </span>;
  const time = formatMs(c.ms);
  return (
    <>
      <div
        className={cn("flex min-w-0 items-center gap-3", inline ? "flex-1" : "relative h-10 shrink-0 px-6")}
        data-testid="tasks-summary"
      >
        <Tooltip content={<Breakdown counts={c} />}>
          <button
            type="button"
            aria-label={`${progressText(c)}. ${COUNT_ORDER.map((k) => countText(k, c.by[k])).join(", ")}. ${sizeText(c)}.`}
            className="block min-w-0 cursor-default truncate text-left text-xs tabular-nums text-muted"
            data-testid="tasks-progress"
          >
            <span className="font-semibold text-fg">{progressText(c)}</span>
            {rest.map(({ key, n }) => {
              // Narrow: only the coloured counts (running, needs you, failed) stay.
              const quiet = countTextClass(key) === "text-muted";
              return (
                <span key={key} className={cn(quiet && inline && "@max-xl:hidden @xl:inline")}>
                  {dot}
                  <span className={countTextClass(key)}>{countText(key, n)}</span>
                </span>
              );
            })}
          </button>
        </Tooltip>
        <span
          className="ml-auto shrink-0 whitespace-nowrap text-xs tabular-nums text-muted"
          data-testid="tasks-size"
        >
          <span className={cn(inline && "@max-3xl:hidden @3xl:inline")}>
            {sizeText(c)}
            {(time || c.costUsd !== undefined) && dot}
          </span>
          {time && (
            <span className={cn(inline && "@max-2xl:hidden @2xl:inline")} title="Time spent on these tasks">
              {time}
              {c.costUsd !== undefined && dot}
            </span>
          )}
          {c.costUsd !== undefined && <span title="What these tasks cost so far">{money(c.costUsd)}</span>}
        </span>
        {!inline && <ProgressLine counts={c} />}
      </div>
      {inline && <ProgressLine counts={c} />}
    </>
  );
}

/** The 2 px progress line along a strip's bottom edge: it adds no height (D-352). */
function ProgressLine({ counts }: { counts: QueueCounts }) {
  return (
    <ProgressParts
      counts={counts}
      className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-raised"
      testId="tasks-progress-line"
    />
  );
}

/** One chat of the queue: its link, project and totals, and its tasks in order. */
function ChatCard({
  ctx,
  group,
  number,
  projectName,
  runsOnOf,
  onOpen,
  onMenu,
  onTick,
  dnd,
}: {
  ctx: AddonUiContext;
  group: ChatGroup;
  number: number;
  projectName: string;
  runsOnOf: (task: Task) => RunsOn;
  onOpen: (id: string) => void;
  onMenu: (task: Task, at: MouseEvent | HTMLElement) => void;
  /** In the queue (not a past run): ticks that include or leave out queued tasks. */
  onTick?: (ids: string[], on: boolean) => void;
  /** In the queue: drag the header to move the whole chat (when all its tasks are still queued). */
  dnd?: QueueDnd;
}) {
  const tasks = group.tasks.map((t) => t.task);
  const t = tally(tasks);
  const ticks = tickState(tasks);
  const canDrag = !!dnd && tasks.every((task) => task.status === "queued");
  const ids = tasks.map((task) => task.id);
  return (
    <div
      className="overflow-hidden rounded-lg border border-line bg-raised"
      data-testid={`task-group-${number - 1}`}
    >
      <div
        title={canDrag ? "Drag to move this chat and its tasks" : undefined}
        data-testid={`task-group-header-${number - 1}`}
        data-drop-group={dnd ? number - 1 : undefined}
        onPointerDown={canDrag ? (e) => dnd.start(ids, e) : undefined}
        className={cn(
          "group flex h-9 items-center gap-3 border-b border-line px-3",
          canDrag && ids.every((id) => dnd.dragging(id)) && "opacity-40",
        )}
      >
        {onTick && (
          <Tick
            hidden={!ticks.ids.length}
            checked={ticks.checked}
            mixed={ticks.mixed}
            label={ticks.checked ? "Leave this chat's queued tasks out" : "Include this chat's queued tasks"}
            onChange={(on) => onTick(ticks.ids, on)}
            testId={`task-group-tick-${number - 1}`}
          />
        )}
        <span className="ml-2 flex size-4 shrink-0 items-center justify-center text-hint">
          <MessageSquare className={cn("size-4", canDrag && "group-hover:hidden")} />
          {canDrag && <GripVertical aria-hidden className="hidden size-4 cursor-grab group-hover:block" />}
        </span>
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
          <span className="@max-md:hidden @md:inline shrink-0 whitespace-nowrap text-xs text-hint">
            {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
            {projectName ? ` · ${projectName}` : ""}
          </span>
        </div>
        <span className={cn(COL.time, CELL, "text-xs text-muted")}>{formatMs(t.ms)}</span>
        <span className={cn(COL.cost, CELL, "text-xs text-muted")}>{money(t.costUsd)}</span>
        <ProviderSlot on={runsOnOf(tasks[0]!)} testId={`task-group-provider-${number - 1}`} />
        <span className="w-7 shrink-0" />
        <span className={cn(COL.status, CELL, "text-xs text-muted")}>{progressText(countTasks(tasks))}</span>
      </div>
      {group.tasks.map(({ task, index }) => (
        <TaskRow
          key={task.id}
          ctx={ctx}
          task={task}
          index={index}
          continues={task !== tasks[0]}
          on={runsOnOf(task)}
          onOpen={() => onOpen(task.id)}
          onMenu={(at) => onMenu(task, at)}
          onTick={onTick && ((on) => onTick([task.id], on))}
          dnd={dnd}
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
  on,
  onOpen,
  onMenu,
  onTick,
  dnd,
}: {
  ctx: AddonUiContext;
  task: Task;
  index: number;
  continues: boolean;
  /** Who runs its chat. */
  on: RunsOn;
  onOpen: () => void;
  onMenu: (at: MouseEvent | HTMLElement) => void;
  /** In the queue (not a past run): the tick that includes or leaves out a queued task. */
  onTick?: (on: boolean) => void;
  /** In the queue: a queued task drags to a new place, or moves with Alt+↑/↓. */
  dnd?: QueueDnd;
}) {
  const canDrag = !!dnd && task.status === "queued";
  const leftOut = task.status === "queued" && !!task.leftOut;
  const detail = task.report?.summary ?? task.error ?? task.answer;
  const notes = task.report?.notes.length ?? 0;
  const followUps = task.report?.followUps.length ?? 0;
  const files = task.attachments ?? [];
  const tags = [
    task.reportedLate ? "reported late" : "",
    isActive(task) && task.nudgedAt ? "asked for its report" : "",
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
      aria-keyshortcuts={canDrag ? "Alt+ArrowUp Alt+ArrowDown" : undefined}
      data-drop-task={dnd ? task.id : undefined}
      onPointerDown={canDrag ? (e) => dnd.start([task.id], e) : undefined}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
        else if (canDrag && e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
          e.preventDefault();
          dnd.step(task, e.key === "ArrowUp" ? -1 : 1);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e.nativeEvent);
      }}
      className={cn(
        "group relative flex h-16 cursor-default items-center gap-3 border-b border-line px-3 last:border-b-0 hover:bg-hover",
        dnd?.dragging(task.id) && "opacity-40",
      )}
    >
      {dnd?.lineAfter === task.id && <DropLine at="row" />}
      {onTick && (
        <Tick
          hidden={task.status !== "queued"}
          checked={!leftOut}
          label={leftOut ? "Include when starting" : "Leave out for now"}
          onChange={onTick}
          testId={`task-tick-${task.id}`}
        />
      )}
      <span
        className="flex w-6 shrink-0 items-center justify-end text-xs tabular-nums text-hint"
        title={canDrag ? "Drag to move, or Alt+↑/↓" : undefined}
      >
        <span className={cn(canDrag && "group-hover:hidden")}>{index + 1}</span>
        {canDrag && <GripVertical aria-hidden className="hidden size-3.5 cursor-grab group-hover:block" />}
      </span>
      <div className={cn("flex min-w-0 flex-1 flex-col", leftOut && "opacity-60")}>
        <div className="flex min-w-0 items-center gap-2">
          {continues && (
            <CornerDownRight className="size-3.5 shrink-0 text-hint" aria-label="Continues the chat" />
          )}
          <span className="truncate text-sm font-medium text-fg" title={task.prompt}>
            {task.title}
          </span>
          {tags.length > 0 && (
            <span className="@max-md:hidden @md:inline shrink-0 whitespace-nowrap text-2xs text-hint">
              {tags.join(" · ")}
            </span>
          )}
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
      <span className={cn(COL.started, CELL, "text-xs text-muted")}>{startedAt(task)}</span>
      <span className={cn(COL.notes, CELL, "text-xs text-muted")}>{notes || ""}</span>
      <span className={cn(COL.followUps, CELL, "text-xs text-muted")}>{followUps || ""}</span>
      <span className={cn(COL.files, CELL)}>
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
      <span className={cn(COL.time, CELL, "text-xs text-muted")}>{duration(task)}</span>
      <span className={cn(COL.cost, CELL, "text-xs text-muted")}>{money(task.costUsd)}</span>
      <ProviderSlot on={on} testId={`task-provider-${task.id}`} />
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
        className={cn(COL.status, "flex shrink-0 items-center justify-end gap-1.5 whitespace-nowrap")}
        data-testid={`task-status-${task.id}`}
      >
        {leftOut ? (
          <>
            <Badge tone="neutral">Left out</Badge>
            <CircleMinus className="size-4 shrink-0 text-hint" />
          </>
        ) : (
          <>
            {/* Reported again after it ended (D-353): a quiet mark left of the badge, so nothing moves. */}
            {task.revised && (
              <span
                className="flex shrink-0 items-center text-hint"
                title={`Reported again: was ${STATUS_LABEL[task.revised.from.outcome]}`}
                data-testid={`task-revised-${task.id}`}
              >
                <PencilLine
                  aria-label={`Revised, was ${STATUS_LABEL[task.revised.from.outcome]}`}
                  className="size-3"
                />
              </span>
            )}
            <Badge tone={STATUS_TONE[task.status]}>{STATUS_LABEL[task.status]}</Badge>
            <StatusIcon status={task.status} />
          </>
        )}
      </span>
    </div>
  );
}

/** A row's provider: the mark alone, the provider, model and where they come from in its tooltip. */
function ProviderSlot({ on, testId }: { on: RunsOn; testId: string }) {
  return (
    <span
      className={COL.provider}
      title={`Runs on ${runsOnText(on)} (${SOURCE_TEXT[on.from]})`}
      data-testid={testId}
    >
      <ProviderMark provider={on.provider} iconOnly />
    </span>
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
  on,
  onClose,
  onQueue,
  onRunAgain,
  onAskReport,
}: {
  ctx: AddonUiContext;
  task: Task;
  index: number;
  projectName: string;
  /** Who runs (or ran) its chat. */
  on: RunsOn;
  onClose: () => void;
  onQueue: (prompts: string[]) => Promise<void>;
  onRunAgain: () => Promise<void>;
  /** In the queue: ask the chat of a task that ended without a report for one (D-318). */
  onAskReport?: () => void;
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
  const facts: Array<[string, ReactNode]> = (
    [
      ["Project", projectName],
      [
        "Runs on",
        <span
          key="on"
          className="flex min-w-0 items-center gap-1"
          title={`${runsOnText(on)} (${SOURCE_TEXT[on.from]})`}
          data-testid="task-runs-on"
        >
          <ProviderMark provider={on.provider} iconOnly />
          <span className="truncate">
            {runsOnText(on)}
            {/* Its chat hit that provider's limit and carried on with this one (D-338). */}
            {task.startedOn && task.startedOn !== on.provider
              ? ` · started on ${PROVIDER_LABEL[task.startedOn]}`
              : ""}
          </span>
        </span>,
      ],
      ["Chat", task.newChat || index === 0 ? "starts a new one" : "continues the one before"],
      ["Permissions", MODES.find((m) => m.value === (task.permissionMode ?? "acceptEdits"))?.label ?? ""],
      ["Started", when(task.sentAt)],
      ["Finished", when(task.finishedAt)],
      ["Time", duration(task)],
      ["Cost", money(task.costUsd)],
      ["Queued by", task.addedBy ? "Claude, from a chat" : "you"],
    ] as Array<[string, ReactNode]>
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
          {onAskReport && task.sessionId && canReportLate(task) && (
            <Button
              size="sm"
              variant="ghost"
              icon={MessageSquareReply}
              onClick={onAskReport}
              data-testid="task-ask-report"
            >
              Ask for a report
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
          {task.reportedLate && <Badge tone="neutral">Reported late</Badge>}
          {task.revised && (
            <span
              className="text-xs text-muted"
              title={`Before: ${task.revised.from.summary}`}
              data-testid="task-revised"
            >
              Revised {when(task.revised.at)}, was {STATUS_LABEL[task.revised.from.outcome]}
            </span>
          )}
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
          <Section title="Its chat's last answer (it didn't report)">
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
  // What "Queue's choice" means in each project: its queue's "Runs on", else the project's default.
  const { data: overview } = useHostCall<QueueOverview[]>("overview");
  const queueProvider = (projectId: string): TaskProvider =>
    overview?.find((o) => o.projectId === projectId)?.provider ??
    projects.find((p) => p.id === projectId)?.provider ??
    "claude";
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
                <RunsOnButton
                  ctx={ctx}
                  value={{ provider: chat.provider, model: chat.model }}
                  shown={
                    chat.provider
                      ? { provider: chat.provider, model: chat.model, from: "task" }
                      : { provider: queueProvider(chat.projectId), from: "queue" }
                  }
                  fallback={queueProvider(chat.projectId)}
                  defaultLabel="Queue's choice"
                  models
                  label={chat.provider ? undefined : "Queue's choice"}
                  className="w-52"
                  testId={`tasks-add-runs-on-${ci}`}
                  onPick={(choice: ProviderChoice) =>
                    setChats(setChatProvider(chats, ci, choice.provider, choice.model))
                  }
                />
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
  queue,
  projectDefault,
  onClose,
  onSave,
}: {
  task: Task;
  queue: Queue;
  projectDefault: TaskProvider;
  onClose: () => void;
  onSave: (input: {
    prompt: string;
    newChat: boolean;
    permissionMode: PermissionMode;
    attachments: TaskFile[];
    /** Its own provider and model; null = the queue's choice / the provider's default (D-330). */
    provider: TaskProvider | null;
    model: string | null;
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
  const [choice, setChoice] = useState<ProviderChoice>({ provider: task.provider, model: task.model });
  const [busy, setBusy] = useState(false);
  // Who it runs on as the switch stands: the chat before it's provider when it continues that chat,
  // else its own choice or the queue's (worked out on the queue as it would be saved).
  const as = (t: Task) => ({ ...queue, tasks: queue.tasks.map((x) => (x.id === task.id ? t : x)) });
  const { provider: _p, model: _m, ...plain } = task;
  const inherited = runsOn(as({ ...plain, newChat: false }), { ...plain, newChat: false }, projectDefault);
  const queueChoice = runsOn(as({ ...plain, newChat: true }), { ...plain, newChat: true }, projectDefault);
  const shown: RunsOn = sameChat
    ? inherited
    : choice.provider
      ? { provider: choice.provider, model: choice.model, from: "task" }
      : queueChoice;
  const save = async () => {
    if (empty) return;
    setBusy(true);
    try {
      await onSave({
        prompt: text.trim(),
        newChat: !sameChat,
        permissionMode: mode,
        attachments: files,
        // A task that continues a chat runs on that chat's provider: its own choice goes.
        provider: sameChat ? null : (choice.provider ?? null),
        model: sameChat ? null : (choice.model ?? null),
      });
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
        <LabeledSwitch
          checked={sameChat}
          onChange={setSameChat}
          label="Continue the chat of the task before"
        />
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted">
            <span className="shrink-0">Runs on</span>
            <RunsOnButton
              ctx={ctx}
              value={choice}
              shown={shown}
              fallback={queueChoice.provider}
              defaultLabel="Queue's choice"
              models
              label={!sameChat && !choice.provider ? "Queue's choice" : undefined}
              disabledReason={sameChat ? "it continues the chat before, which keeps its provider" : undefined}
              className="w-52"
              testId="tasks-edit-runs-on"
              onPick={setChoice}
            />
            <span className="min-w-0 truncate text-hint" data-testid="tasks-edit-runs-on-hint">
              {sameChat ? "Same as the chat it continues" : ""}
            </span>
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

/** The all-queues dashboard: one tab (opening it again focuses it). */
function openDashboard(ctx: AddonUiContext) {
  ctx.openTab("dashboard");
}

/** Queues the Add tasks dialog's chats, each in its project's queue. */
async function queueChats(
  ctx: AddonUiContext,
  chats: Array<{ projectId: string; tasks: NewTask[] }>,
  permissionMode: PermissionMode,
): Promise<void> {
  for (const chat of chats)
    await ctx.host
      .call("add", { prompts: chat.tasks, projectId: chat.projectId, newChat: true, permissionMode })
      .catch((e: Error) => ctx.notify({ title: e.message, tone: "danger" }));
}

/** Every project's queue at a glance (the `dashboard` tab, D-326); its empty state adds tasks. */
export function DashboardTab({ ctx }: AddonTabProps) {
  const [adding, setAdding] = useState(false);
  return (
    <>
      <DashboardView ctx={ctx} onAdd={() => setAdding(true)} />
      {adding && (
        <AddDialog
          onClose={() => setAdding(false)}
          onSave={async (chats, permissionMode) => {
            await queueChats(ctx, chats, permissionMode);
            setAdding(false);
          }}
        />
      )}
    </>
  );
}

interface ReviewItem {
  key: number;
  title: string;
  prompt: string;
  newChat: boolean;
  /** Who Claude asked to run it (D-330), kept as given; checked by the add tool. */
  provider?: unknown;
  model?: unknown;
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
        ...(o.provider !== undefined ? { provider: o.provider } : {}),
        ...(o.model !== undefined ? { model: o.model } : {}),
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
        .map((i, n) => ({
          prompt: i.prompt.trim(),
          newChat: i.newChat,
          ...(i.title.trim() ? { title: i.title.trim() } : {}),
          // A task that continues a chat runs on that chat's provider: its own choice goes.
          ...((i.newChat || n === 0) && i.provider !== undefined ? { provider: i.provider } : {}),
          ...((i.newChat || n === 0) && i.model !== undefined ? { model: i.model } : {}),
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
              <div className="flex items-center gap-1">
                {/* Who Claude asked to run it, when it said (else the queue's choice). */}
                <span className="flex w-4 justify-center" data-testid={`tasks-review-provider-${i}`}>
                  {(item.provider === "claude" || item.provider === "chatgpt") && (
                    <ProviderMark provider={item.provider} iconOnly />
                  )}
                </span>
                <IconButton
                  size="sm"
                  icon={X}
                  label={`Remove task ${i + 1}`}
                  onClick={() => setItems((list) => list.filter((x) => x.key !== item.key))}
                  data-testid={`tasks-review-remove-${i}`}
                />
              </div>
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
