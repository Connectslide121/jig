import type { AddonComponentProps, AddonUiContext } from "@jig/sdk";
import {
  Badge,
  Button,
  cn,
  Dialog,
  Empty,
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
  Pause,
  Play,
  Plus,
  SkipForward,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import {
  counts,
  duration,
  isActive,
  isFinished,
  type PermissionMode,
  parsePrompts,
  type Queue,
  STATUS_LABEL,
  type Task,
  type TaskStatus,
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

function money(usd?: number) {
  return usd ? `$${usd.toFixed(2)}` : "";
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

/** The task queue: prompts Claude does one after another, each with its report, as a table. */

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

export function TasksView({ ctx }: AddonComponentProps) {
  const { queue, error } = useQueue();
  const [adding, setAdding] = useState<{ prompts?: string; from?: Task } | undefined>();
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
          <Button size="sm" icon={Plus} onClick={() => setAdding({})} data-testid="tasks-add">
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
          <Button size="sm" icon={Plus} onClick={() => setAdding({})}>
            Add tasks
          </Button>
        </Empty>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-2">
          <div className="flex h-6 items-center gap-2 px-2 text-2xs font-medium uppercase tracking-wide text-hint">
            <span className="w-6 shrink-0 text-right">#</span>
            <span className="min-w-0 flex-1">Task</span>
            <span className="w-28 shrink-0">Project</span>
            <span className="w-44 shrink-0">Chat</span>
            <span className="w-16 shrink-0 text-right">Follow-ups</span>
            <span className="w-12 shrink-0 text-right">Time</span>
            <span className="w-14 shrink-0 text-right">Cost</span>
            <span className="w-7 shrink-0" />
            <span className="w-28 shrink-0 text-right">Status</span>
          </div>
          {queue.tasks.map((task, i) => (
            <TaskRow
              key={task.id}
              ctx={ctx}
              task={task}
              index={i}
              projectName={projectName(task.projectId)}
              onOpen={() => setOpen(task.id)}
              onMenu={(at) => menuFor(task, at)}
            />
          ))}
        </div>
      )}
      {adding && (
        <AddDialog
          initial={adding.prompts}
          onClose={() => setAdding(undefined)}
          onSave={async (input) => {
            await call("add", { ...input, from: adding.from?.id });
            setAdding(undefined);
          }}
        />
      )}
      {editing && (
        <AddDialog
          task={editing}
          onClose={() => setEditing(undefined)}
          onSave={async (input) => {
            await call("update", {
              id: editing.id,
              prompt: input.prompts[0],
              newChat: input.newChat,
              permissionMode: input.permissionMode,
            });
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

function TaskRow({
  ctx,
  task,
  index,
  projectName,
  onOpen,
  onMenu,
}: {
  ctx: AddonUiContext;
  task: Task;
  index: number;
  projectName: string;
  onOpen: () => void;
  onMenu: (at: MouseEvent | HTMLElement) => void;
}) {
  const sub = task.report?.summary ?? task.error ?? task.answer ?? task.prompt;
  const ChatIcon = task.newChat || index === 0 ? MessageSquare : CornerDownRight;
  const followUps = task.report?.followUps.length ?? 0;
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
      className="group flex h-11 cursor-default items-center gap-2 rounded-md px-2 hover:bg-hover"
    >
      <span className="w-6 shrink-0 text-right text-xs tabular-nums text-hint">{index + 1}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-fg" title={task.prompt}>
          {task.title}
        </div>
        <div className="truncate text-xs text-muted">{sub.split("\n")[0]}</div>
      </div>
      <span className="w-28 shrink-0 truncate text-xs text-muted">{projectName}</span>
      <span className="flex w-44 shrink-0 items-center gap-1.5 text-xs">
        <ChatIcon
          className="size-3.5 shrink-0 text-hint"
          aria-label={task.newChat || index === 0 ? "Its own chat" : "Continues the chat before"}
        />
        {task.sessionId ? (
          <button
            type="button"
            data-testid={`task-chat-${task.id}`}
            className="min-w-0 truncate text-accent hover:underline"
            title="Open the chat"
            onClick={(e) => {
              e.stopPropagation();
              void ctx.openChat({ sessionId: task.sessionId });
            }}
          >
            {task.chatTitle ?? task.title}
          </button>
        ) : (
          <span className="truncate text-hint">
            {task.newChat || index === 0 ? "New chat" : "Same chat as before"}
          </span>
        )}
      </span>
      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted">{followUps || ""}</span>
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
  const facts = [projectName, duration(task), money(task.costUsd), task.addedBy ? "queued by Claude" : ""]
    .filter(Boolean)
    .join(" · ");
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
        <div className="flex items-center gap-2 text-xs text-muted">
          <Badge tone={STATUS_TONE[task.status]}>{STATUS_LABEL[task.status]}</Badge>
          <span className="truncate">{facts}</span>
        </div>
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

function AddDialog({
  task,
  initial,
  onClose,
  onSave,
}: {
  task?: Task;
  initial?: string;
  onClose: () => void;
  onSave: (input: {
    prompts: string[];
    projectId?: string;
    newChat: boolean;
    permissionMode: PermissionMode;
  }) => Promise<void>;
}) {
  const ctx = useAddon();
  const active = useActiveProject();
  const projects = useProjectList();
  const [text, setText] = useState(task?.prompt ?? initial ?? "");
  const [eachLine, setEachLine] = useState(false);
  const [projectId, setProjectId] = useState(task?.projectId ?? active?.id ?? projects[0]?.id ?? "");
  const [sameChat, setSameChat] = useState(task ? !task.newChat : false);
  const [mode, setMode] = useState<PermissionMode>(task?.permissionMode ?? "acceptEdits");
  const [busy, setBusy] = useState(false);
  const prompts = task ? (text.trim() ? [text.trim()] : []) : parsePrompts(text, eachLine);
  const save = async () => {
    if (!prompts.length || !projectId) return;
    setBusy(true);
    try {
      await onSave({ prompts, projectId, newChat: !sameChat, permissionMode: mode });
    } catch (e) {
      ctx.notify({ title: (e as Error).message, tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      width="lg"
      testId="tasks-add-dialog"
      title={task ? "Edit the task" : "Add tasks"}
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            busy={busy}
            disabled={!prompts.length || !projectId}
            onClick={() => void save()}
            data-testid="tasks-add-confirm"
          >
            {task ? "Save" : prompts.length > 1 ? `Add ${prompts.length} tasks` : "Add task"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Textarea
          autoFocus
          rows={8}
          value={text}
          placeholder={
            eachLine
              ? "One task per line"
              : "What Claude should do. Say everything it needs: it may start in a new chat."
          }
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void save();
          }}
          data-testid="tasks-add-text"
        />
        {!task && (
          <LabeledSwitch checked={eachLine} onChange={setEachLine} label="Each line is its own task" />
        )}
        <LabeledSwitch
          checked={sameChat}
          onChange={setSameChat}
          label={
            task
              ? "Continue the previous task's chat"
              : "Continue the previous task's chat (else each starts a new one)"
          }
        />
        <div className="grid grid-cols-2 gap-3">
          <label htmlFor="tasks-project" className="flex flex-col gap-1 text-xs text-muted">
            Project
            <Select
              id="tasks-project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              data-testid="tasks-add-project"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </label>
          <label htmlFor="tasks-mode" className="flex flex-col gap-1 text-xs text-muted">
            Permissions
            <Select id="tasks-mode" value={mode} onChange={(e) => setMode(e.target.value as PermissionMode)}>
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
