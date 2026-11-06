import { CircleCheck, CircleSlash, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { actionHandled, actionOpen, type MeetingAction, type MeetingRecord } from "../../../shared/meetings";
import type { ProjectsState } from "../../../shared/projects";
import {
  Badge,
  Button,
  Card,
  cn,
  Dialog,
  IconButton,
  Input,
  MenuButton,
  Select,
  Spinner,
  Tabs,
  Textarea,
} from "../../ui";
import { ProjectSwatch } from "../projects/colors";
import { ActionStatus, CardLink, useActionCommands } from "./actionMenu";
import { Field } from "./dialogs";

/** The status badge in the far-right column: where it stands, or whose action it is while still to do. */
function StatusBadge({ action }: { action: MeetingAction }) {
  return (
    <span className="flex w-24 shrink-0 justify-end" data-testid="action-status">
      {action.status ? (
        <ActionStatus action={action} />
      ) : action.mine ? (
        <Badge tone="accent">Your action</Badge>
      ) : (
        <Badge>Someone else</Badge>
      )}
    </span>
  );
}

/** The action's card number in its own fixed slot, empty when it has none (D-425). */
function CardSlot({ action }: { action: MeetingAction }) {
  return (
    <span className="flex w-12 shrink-0 justify-end">{action.card && <CardLink card={action.card} />}</span>
  );
}

/**
 * Review the actions Jig drafted from a meeting (D-407): edit them, tick some and add them to the task
 * queue, or handle one at a time with the same commands as the notes' rows (D-425): run it in a chat,
 * queue it, make a board card, mark it done or dismiss it. Done and dismissed ones move to Handled,
 * where Reopen brings them back.
 */
export function Review({
  record,
  projects,
  boards,
  busy,
  onClose,
  onQueue,
}: {
  record: MeetingRecord;
  projects: ProjectsState;
  boards: boolean;
  busy: boolean;
  onClose(): void;
  onQueue(actions: MeetingAction[], selected: string[]): Promise<void>;
}) {
  const [actions, setActions] = useState(record.actions);
  const [selected, setSelected] = useState<string[]>([]);
  const [view, setView] = useState<"todo" | "handled">("todo");
  /** The last thing an action's command said (the footer's slot). */
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const update = (id: string, patch: Partial<MeetingAction>) =>
    setActions((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const commands = useActionCommands({
    record,
    actions,
    projects,
    boards,
    saveFirst: true,
    report: (text, error) => setMessage({ text, error }),
    onChanged: (next) => {
      setActions((list) => list.map((x) => (x.id === next.id ? next : x)));
      if (!actionOpen(next)) setSelected((ids) => ids.filter((id) => id !== next.id));
    },
  });
  const todo = actions.filter((a) => !actionHandled(a));
  const handled = actions.filter(actionHandled);
  const missingProject = actions.some((a) => selected.includes(a.id) && !a.projectId);
  const projectOf = (a: MeetingAction) => projects.projects.find((p) => p.id === a.projectId);

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
        Jig drafted these from the transcript — check them first. Tick tasks to add them to the queue, each to
        its own project, or use ⋯ on one: run it in a chat, make a board card, mark it done or dismiss it.
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
            Actions you mark as done or dismiss show here, and Reopen brings them back.
          </p>
        )}
        {view === "todo" &&
          todo.map((a) => {
            const picked = selected.includes(a.id);
            const locked = !actionOpen(a);
            const quick = commands.quick(a);
            return (
              <Card
                key={a.id}
                data-testid="action-card"
                className={cn("space-y-2 p-3 shadow-none", picked && "border-accent", locked && "opacity-80")}
                onContextMenu={(e) => {
                  e.preventDefault();
                  commands.rowProps(a).onContextMenu(e);
                }}
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
                  {/* The card's own actions, in a fixed slot: the quick one, then ⋯ for all of them. */}
                  <span className="flex w-15 shrink-0 items-center justify-end gap-1">
                    {commands.pending === a.id ? (
                      <span className="flex size-7 items-center justify-center">
                        <Spinner size="sm" />
                      </span>
                    ) : quick ? (
                      <IconButton
                        icon={quick.icon}
                        size="sm"
                        label={quick.label}
                        disabled={Boolean(commands.pending)}
                        onClick={(e) => quick.onClick(e.currentTarget)}
                      />
                    ) : null}
                    <MenuButton
                      label={`More for ${a.title}`}
                      entries={() => commands.menu(a)}
                      alignRight
                      className={cn(
                        "inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg",
                        commands.pending && "pointer-events-none opacity-50",
                      )}
                    >
                      <MoreHorizontal className="size-4" />
                    </MenuButton>
                  </span>
                  <CardSlot action={a} />
                  <StatusBadge action={a} />
                </div>
                <div className="flex gap-3 pr-60 pl-7">
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
                        className={cn(picked && !a.projectId && "border-danger")}
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
                <div className="space-y-2 pr-60 pl-7">
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
            const quick = commands.quick(a);
            return (
              <Card
                key={a.id}
                data-testid="action-card"
                {...commands.rowProps(a)}
                className="flex h-14 cursor-pointer items-center gap-3 px-3 shadow-none outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent"
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
                  {commands.pending === a.id ? (
                    <span className="flex size-7 items-center justify-center">
                      <Spinner size="sm" />
                    </span>
                  ) : (
                    quick && (
                      <IconButton
                        icon={quick.icon}
                        size="sm"
                        label={`${quick.label} ${a.title}`}
                        disabled={Boolean(commands.pending)}
                        onClick={(e) => {
                          e.stopPropagation();
                          quick.onClick(e.currentTarget);
                        }}
                      />
                    )
                  )}
                </span>
                <CardSlot action={a} />
                <StatusBadge action={a} />
              </Card>
            );
          })}
      </div>
      {commands.dialog}
    </Dialog>
  );
}
