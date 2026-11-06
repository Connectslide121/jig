import {
  CircleCheck,
  CircleSlash,
  EyeOff,
  MessageSquare,
  MessageSquarePlus,
  MoreHorizontal,
  RotateCcw,
} from "lucide-react";
import { useState } from "react";
import {
  actionHandled,
  actionOpen,
  type MeetingAction,
  type MeetingActionStatus,
  type MeetingRecord,
} from "../../../shared/meetings";
import type { ProjectsState } from "../../../shared/projects";
import { call, errorMessage } from "../../lib/host";
import {
  Badge,
  type BadgeTone,
  Button,
  Card,
  cn,
  Dialog,
  IconButton,
  Input,
  MenuButton,
  type MenuEntry,
  Select,
  Spinner,
  Tabs,
  Textarea,
} from "../../ui";
import { ProjectSwatch } from "../projects/colors";
import { Field } from "./dialogs";

const STATUS: Record<MeetingActionStatus, { label: string; tone: BadgeTone }> = {
  queued: { label: "Queued", tone: "info" },
  running: { label: "Running", tone: "accent" },
  done: { label: "Done", tone: "success" },
  dismissed: { label: "Dismissed", tone: "neutral" },
};

/** The status badge in the far-right column: where it stands, or whose action it is while still to do. */
function StatusBadge({ action }: { action: MeetingAction }) {
  const status = action.status && STATUS[action.status];
  return (
    <span className="flex w-24 shrink-0 justify-end" data-testid="action-status">
      {status ? (
        <Badge tone={status.tone}>{status.label}</Badge>
      ) : action.mine ? (
        <Badge tone="accent">Your action</Badge>
      ) : (
        <Badge>Someone else</Badge>
      )}
    </span>
  );
}

/**
 * Review the actions Claude drafted from a meeting (D-407): edit them, tick some and add them to the
 * task queue, or handle one at a time from its card: run it in a new chat now, mark it done or dismiss
 * it. Done and dismissed ones move to Handled, where Restore brings them back.
 */
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
  const [view, setView] = useState<"todo" | "handled">("todo");
  /** The action a card's own button is working on, and the last thing it said (the footer's slot). */
  const [pending, setPending] = useState<string>();
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  /** Actions "Run in a new chat" needed a project for: their project select shows red. */
  const [needsProject, setNeedsProject] = useState<string[]>([]);
  const update = (id: string, patch: Partial<MeetingAction>) => {
    setActions((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    if (patch.projectId) setNeedsProject((ids) => ids.filter((x) => x !== id));
  };
  const todo = actions.filter((a) => !actionHandled(a));
  const handled = actions.filter(actionHandled);
  const missingProject = actions.some((a) => selected.includes(a.id) && !a.projectId);
  const projectOf = (a: MeetingAction) => projects.projects.find((p) => p.id === a.projectId);

  /** Saves the edits first (as queuing does), then changes one action and shows what main made of it. */
  const handle = async (a: MeetingAction, change: () => Promise<MeetingAction>, done: string) => {
    setPending(a.id);
    setMessage(undefined);
    try {
      await call("meetings.actions", { id: record.id, actions });
      const next = await change();
      setActions((list) => list.map((x) => (x.id === next.id ? next : x)));
      setSelected((ids) => ids.filter((id) => id !== next.id));
      setMessage({ text: done });
    } catch (error) {
      setMessage({ text: errorMessage(error), error: true });
    } finally {
      setPending(undefined);
    }
  };
  const run = (a: MeetingAction) => {
    if (!a.projectId) {
      setNeedsProject((ids) => [...new Set([...ids, a.id])]);
      setMessage({ text: `Choose a project for “${a.title}” to run it in a new chat.`, error: true });
      return;
    }
    void handle(
      a,
      () => call("meetings.runAction", { id: record.id, actionId: a.id }),
      `Started “${a.title}” in a new chat in Plan mode.`,
    );
  };
  const setStatus = (a: MeetingAction, status: "done" | "dismissed" | "open", done: string) =>
    void handle(a, () => call("meetings.setActionStatus", { id: record.id, actionId: a.id, status }), done);
  const openChat = (sessionId: string) =>
    void call("meetings.revealChat", { sessionId }).catch((error) =>
      setMessage({ text: errorMessage(error), error: true }),
    );
  const menu = (a: MeetingAction): MenuEntry[] => [
    ...(a.status === "running" && a.sessionId
      ? [{ label: "Open the chat", icon: MessageSquare, onSelect: () => openChat(a.sessionId!) }]
      : [{ label: "Run in a new chat", icon: MessageSquarePlus, onSelect: () => run(a) }]),
    { separator: true },
    {
      label: "Mark as done",
      icon: CircleCheck,
      testId: "action-done",
      onSelect: () => setStatus(a, "done", `Marked “${a.title}” as done. It's under Handled.`),
    },
    {
      label: "Dismiss",
      icon: EyeOff,
      testId: "action-dismiss",
      onSelect: () => setStatus(a, "dismissed", `Dismissed “${a.title}”. It's under Handled.`),
    },
  ];

  const footerText = message
    ? message.text
    : missingProject
      ? "Choose a project for every selected task."
      : `${selected.length} selected · added in Plan mode; the queue stays paused until you start it.`;
  return (
    <Dialog
      open
      title="Review meeting actions"
      width="xl"
      column
      onClose={onClose}
      footer={
        <>
          <span
            className={cn(
              "mr-auto min-w-0 truncate text-xs",
              message?.error || (!message && missingProject) ? "text-danger" : "text-muted",
            )}
            data-testid="review-message"
          >
            {footerText}
          </span>
          <Button onClick={onClose}>Close</Button>
          <Button
            variant="primary"
            busy={busy}
            disabled={!selected.length || missingProject || view !== "todo"}
            onClick={() => void onQueue(actions, selected)}
          >
            Add selected to queue
          </Button>
        </>
      }
    >
      <p className="mb-2 shrink-0 text-sm text-muted">
        Claude drafted these from the transcript — check them first. Tick tasks to add them to the queue, each
        to its own project, or run one in a new chat now. Mark ones you did yourself as done, and dismiss the
        rest.
      </p>
      <Tabs
        className="mb-3 shrink-0 px-0"
        value={view}
        onChange={setView}
        items={[
          { id: "todo", label: `To do · ${todo.length}` },
          { id: "handled", label: `Handled · ${handled.length}` },
        ]}
      />
      {/* A fixed height, so switching tabs or handling an action never resizes the dialog. */}
      <div className="h-160 min-h-0 shrink space-y-3 overflow-y-auto" data-testid="review-list">
        {view === "todo" && !todo.length && (
          <p className="flex h-full items-center justify-center text-sm text-muted">
            Nothing left to do. Done and dismissed actions are under Handled.
          </p>
        )}
        {view === "handled" && !handled.length && (
          <p className="flex h-full items-center justify-center text-sm text-muted">
            Actions you mark as done or dismiss show here, and Restore brings them back.
          </p>
        )}
        {view === "todo" &&
          todo.map((a) => {
            const picked = selected.includes(a.id);
            const locked = !actionOpen(a);
            const working = pending === a.id;
            return (
              <Card
                key={a.id}
                data-testid="action-card"
                className={cn("space-y-2 p-3 shadow-none", picked && "border-accent", locked && "opacity-80")}
              >
                <div className="flex items-center gap-3">
                  <input
                    aria-label={`Select ${a.title}`}
                    type="checkbox"
                    className="size-4 shrink-0 accent-accent"
                    disabled={locked}
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
                    disabled={locked}
                    onChange={(e) => update(a.id, { title: e.target.value })}
                  />
                  {/* The card's own actions, in a fixed slot: the primary one, then ⋯ for the rarer ones. */}
                  <span className="flex w-15 shrink-0 items-center justify-end gap-1">
                    {working ? (
                      <span className="flex size-7 items-center justify-center">
                        <Spinner size="sm" />
                      </span>
                    ) : a.status === "running" && a.sessionId ? (
                      <IconButton
                        icon={MessageSquare}
                        size="sm"
                        label="Open the chat"
                        onClick={() => openChat(a.sessionId!)}
                      />
                    ) : actionOpen(a) ? (
                      <IconButton
                        icon={MessageSquarePlus}
                        size="sm"
                        label="Run in a new chat"
                        disabled={Boolean(pending)}
                        onClick={() => run(a)}
                      />
                    ) : null}
                    {a.status !== "queued" && (
                      <MenuButton
                        label={`More for ${a.title}`}
                        entries={() => menu(a)}
                        alignRight
                        className={cn(
                          "inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg",
                          pending && "pointer-events-none opacity-50",
                        )}
                      >
                        <MoreHorizontal className="size-4" />
                      </MenuButton>
                    )}
                  </span>
                  <StatusBadge action={a} />
                </div>
                <div className="flex gap-3 pr-45 pl-7">
                  <div className="w-48 shrink-0">
                    <Field id={`owner-${a.id}`} label="Owner">
                      <Input
                        id={`owner-${a.id}`}
                        disabled={locked}
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
                        className={cn(
                          (picked || needsProject.includes(a.id)) && !a.projectId && "border-danger",
                        )}
                        disabled={locked}
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
                <div className="space-y-2 pr-45 pl-7">
                  <Field id={`prompt-${a.id}`} label="Task prompt">
                    <Textarea
                      id={`prompt-${a.id}`}
                      rows={3}
                      disabled={locked}
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
        {view === "handled" &&
          handled.map((a) => {
            const project = projectOf(a);
            const Icon = a.status === "done" ? CircleCheck : CircleSlash;
            return (
              <Card
                key={a.id}
                data-testid="action-card"
                className="flex h-14 items-center gap-3 px-3 shadow-none"
              >
                <Icon className={cn("size-4 shrink-0", a.status === "done" ? "text-success" : "text-hint")} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{a.title}</span>
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    <span className="flex w-3 shrink-0 justify-center">
                      {project && <ProjectSwatch color={project.color} />}
                    </span>
                    <span className="truncate">
                      {project?.name ?? "No project"} · {a.owner || "Unknown"}
                    </span>
                  </span>
                </span>
                <span className="flex w-15 shrink-0 items-center justify-end gap-1">
                  {pending === a.id ? (
                    <span className="flex size-7 items-center justify-center">
                      <Spinner size="sm" />
                    </span>
                  ) : (
                    <IconButton
                      icon={RotateCcw}
                      size="sm"
                      label={`Restore ${a.title}`}
                      disabled={Boolean(pending)}
                      onClick={() =>
                        setStatus(
                          a,
                          "open",
                          a.sessionId
                            ? `Restored “${a.title}”; its chat is still running.`
                            : `Restored “${a.title}” to the to-do list.`,
                        )
                      }
                    />
                  )}
                </span>
                <StatusBadge action={a} />
              </Card>
            );
          })}
      </div>
    </Dialog>
  );
}
