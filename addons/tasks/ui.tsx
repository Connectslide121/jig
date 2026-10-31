import type { AddonComponentProps, AddonUiContext } from "@jig/sdk";
import {
  Attachments,
  Badge,
  Button,
  cn,
  Dialog,
  Empty,
  FileIcon,
  IconButton,
  Markdown,
  Select,
  Spinner,
  Switch,
  Textarea,
  useActiveProject,
  useAddon,
  useAddonEvent,
  useHostCall,
  useProjectList,
} from "@jig/sdk/ui";
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleHelp,
  CircleMinus,
  CircleX,
  CornerDownRight,
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

/** The queue, kept current: it reloads when the host says it changed. */
function useQueue() {
  const { data, reload, error } = useHostCall<Queue>("list");
  useAddonEvent("changed", () => void reload());
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

/** The task queue: prompts Claude does one after another, each with its report, as a table. */
export function TasksView({ ctx }: AddonComponentProps) {
  const { queue, error } = useQueue();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Task | undefined>();
  const [open, setOpen] = useState<string | undefined>();
  const projects = useProjectList();
  const call = (method: string, args?: unknown) =>
    ctx.host.call(method, args).catch((e: Error) => ctx.notify({ title: e.message, tone: "danger" }));

  if (!queue) return error ? <div className="p-3 text-xs text-danger">{error}</div> : <Spinner center />;
  const n = counts(queue);
  const projectName = (id?: string) => projects.find((p) => p.id === id)?.name ?? "";
  const openTask = queue.tasks.find((t) => t.id === open);

  const menuFor = (task: Task, at: MouseEvent | HTMLElement) => {
    const i = queue.tasks.indexOf(task);
    const queued = task.status === "queued";
    ctx.menu(
      [
        { label: "Details", icon: "panel-top-open", onSelect: () => setOpen(task.id) },
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
    <div className="flex h-full min-h-0 flex-col" data-testid="tasks-view">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <ListTodo className="size-4 shrink-0 text-muted" />
        <span className="text-sm font-medium text-fg">Task queue</span>
        <span className="truncate text-xs text-muted" data-testid="tasks-counts">
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
            chat, e.g. "queue a task for each spec in docs/").
          </div>
          <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>
            Add tasks
          </Button>
        </Empty>
      ) : (
        <>
          <QueueSummary tasks={queue.tasks} />
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
                  onOpen={setOpen}
                  onMenu={menuFor}
                />
              ))}
            </div>
          </div>
        </>
      )}
      {adding && (
        <AddDialog
          onClose={() => setAdding(false)}
          onSave={async (chats, permissionMode) => {
            for (const chat of chats)
              await call("add", {
                prompts: chat.tasks,
                projectId: chat.projectId,
                newChat: true,
                permissionMode,
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
            await call("add", { prompts, projectId: openTask.projectId, newChat: true, from: openTask.id });
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
    </div>
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
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (chats: Array<{ projectId: string; tasks: NewTask[] }>, mode: PermissionMode) => Promise<void>;
}) {
  const ctx = useAddon();
  const active = useActiveProject();
  const projects = useProjectList();
  const firstProject = active?.id ?? projects[0]?.id ?? "";
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
      width="lg"
      column
      testId="tasks-add-dialog"
      title="Add tasks"
      footer={
        <>
          <span className="mr-auto text-xs text-muted">
            Ctrl+Enter adds them · paste a list for a task per item · paste or drop files
          </span>
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
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-xs text-muted">
            Claude does the tasks in order. Each chat's first task starts a new chat; the next ones continue
            in it, so they can build on what it did.
          </p>
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
        </div>
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
                    <div className="flex h-9 items-center gap-2">
                      <span className="flex h-7 w-6 shrink-0 items-center justify-end text-xs tabular-nums text-hint">
                        {si === 0 ? (
                          <MessageSquare className="size-3.5" />
                        ) : (
                          <CornerDownRight className="size-3.5" />
                        )}
                      </span>
                      <Textarea
                        rows={1}
                        autoFocus={step.id === focus || (!focus && ci === 0 && si === 0)}
                        className="h-9 min-w-0 flex-1 resize-none"
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
                      <div
                        role="group"
                        className="flex h-9 w-40 shrink-0 items-center gap-1 overflow-x-scroll overflow-y-hidden"
                        aria-label="Task attachments"
                        data-testid={`tasks-add-files-${ci}-${si}`}
                      >
                        {step.files.map((file) => (
                          <div
                            key={file.path}
                            className="flex h-7 w-36 shrink-0 items-center rounded border border-line bg-raised"
                            data-testid="chat-attachment"
                          >
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-center gap-1 px-1 text-xs hover:text-accent"
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
                              onClick={() => setChats(removeFile(chats, ci, si, file.path))}
                            />
                          </div>
                        ))}
                      </div>
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
