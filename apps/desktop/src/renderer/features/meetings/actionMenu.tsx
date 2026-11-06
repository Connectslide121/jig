import {
  CircleCheck,
  ExternalLink,
  EyeOff,
  Kanban,
  ListPlus,
  type LucideIcon,
  MessageSquare,
  MessageSquarePlus,
  MoreHorizontal,
  RotateCcw,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import {
  actionHandled,
  actionOpen,
  type MeetingAction,
  type MeetingActionStatus,
  type MeetingCardForm,
  type MeetingRecord,
} from "../../../shared/meetings";
import type { ProjectsState } from "../../../shared/projects";
import { call, errorMessage } from "../../lib/host";
import {
  Badge,
  type BadgeTone,
  Button,
  cn,
  Dialog,
  IconButton,
  Input,
  type MenuEntry,
  openMenu,
  openMenuAt,
  Select,
  Spinner,
  Textarea,
} from "../../ui";
import { notify } from "../../workbench/toasts";
import { ProjectSwatch } from "../projects/colors";
import { Field } from "./dialogs";

const STATUS: Record<MeetingActionStatus, { label: string; tone: BadgeTone }> = {
  queued: { label: "Queued", tone: "info" },
  running: { label: "Running", tone: "accent" },
  done: { label: "Done", tone: "success" },
  dismissed: { label: "Dismissed", tone: "neutral" },
};

/** Where an action stands, as a badge (nothing while it's still to do). */
export function ActionStatus({ action }: { action: Pick<MeetingAction, "status"> }) {
  const status = action.status && STATUS[action.status];
  return status ? <Badge tone={status.tone}>{status.label}</Badge> : null;
}

/** The action's board card, as its number: opens the work item in Azure DevOps (D-425). */
export function CardLink({ card }: { card: NonNullable<MeetingAction["card"]> }) {
  return (
    <button
      type="button"
      className="truncate text-xs text-accent tabular-nums hover:underline"
      title={`Open card #${card.id} (${card.board}) in Azure DevOps`}
      data-testid="action-card-link"
      onClick={(e) => {
        e.stopPropagation();
        void call("app.openExternal", { url: card.url }).catch(() => undefined);
      }}
    >
      #{card.id}
    </button>
  );
}

/**
 * A row's right edge (D-425): where the action stands, and on hover (or keyboard focus) its quick
 * action and ⋯ in the same fixed slot, so nothing moves. A spinner while one of them works.
 */
export function ActionTools({
  action,
  commands,
}: {
  action: MeetingAction;
  commands: ReturnType<typeof useActionCommands>;
}) {
  const quick = commands.quick(action);
  return (
    <span className="relative flex h-5 w-20 shrink-0 items-center justify-end">
      {commands.pending === action.id ? (
        <Spinner size="sm" />
      ) : (
        <>
          <span
            className="flex items-center group-focus-within:invisible group-hover:invisible"
            data-testid="action-status"
          >
            <ActionStatus action={action} />
          </span>
          <span className="invisible absolute inset-y-0 right-0 flex items-center gap-0.5 group-focus-within:visible group-hover:visible">
            {quick && (
              <IconButton
                size="sm"
                icon={quick.icon}
                label={quick.label}
                disabled={Boolean(commands.pending)}
                onClick={(e) => {
                  e.stopPropagation();
                  quick.onClick(e.currentTarget);
                }}
              />
            )}
            <IconButton
              size="sm"
              icon={MoreHorizontal}
              label={`More for ${action.title}`}
              disabled={Boolean(commands.pending)}
              onClick={(e) => {
                e.stopPropagation();
                openMenuAt(e.currentTarget, commands.menu(action), true);
              }}
            />
          </span>
        </>
      )}
    </span>
  );
}

/** The one action a row offers on hover, beside ⋯ (D-425). */
export interface QuickAction {
  label: string;
  icon: LucideIcon;
  onClick(at: HTMLElement): void;
}

/**
 * What you can do with a meeting's actions, the same from the notes and the Review dialog (D-425):
 * Run in a chat, Queue, Create card…, Mark as done, Dismiss, and Reopen for handled ones. `actions` is
 * the list as you see it (Review's, with its edits: `saveFirst` saves them before anything happens).
 */
export function useActionCommands({
  record,
  actions = record.actions,
  projects,
  boards,
  saveFirst = false,
  report = (text, error) =>
    notify(error ? { tone: "danger", title: text } : { tone: "success", title: text }),
  onChanged,
}: {
  record: MeetingRecord;
  actions?: MeetingAction[];
  projects: ProjectsState;
  boards: boolean;
  saveFirst?: boolean;
  report?(text: string, error?: boolean): void;
  onChanged?(action: MeetingAction): void;
}) {
  const [pending, setPending] = useState<string>();
  const [carding, setCarding] = useState<MeetingAction>();

  const work = async (
    a: MeetingAction,
    change: (list: MeetingAction[]) => Promise<MeetingAction>,
    done: (next: MeetingAction) => string,
  ) => {
    setPending(a.id);
    try {
      if (saveFirst) await call("meetings.actions", { id: record.id, actions });
      const next = await change(actions);
      onChanged?.(next);
      report(done(next));
    } catch (error) {
      report(errorMessage(error), true);
    } finally {
      setPending(undefined);
    }
  };
  /** Gives the action a project first when it has none (picked from a submenu), then does `then`. */
  const withProject = async (list: MeetingAction[], a: MeetingAction, projectId: string) => {
    if (a.projectId === projectId) return a;
    const next = { ...a, projectId };
    await call("meetings.actions", { id: record.id, actions: list.map((x) => (x.id === a.id ? next : x)) });
    onChanged?.(next);
    return next;
  };
  const run = (a: MeetingAction, projectId: string) =>
    void work(
      a,
      async (list) => {
        await withProject(list, a, projectId);
        return call("meetings.runAction", { id: record.id, actionId: a.id });
      },
      () => `Started “${a.title}” in a new chat in Plan mode.`,
    );
  const queue = (a: MeetingAction, projectId: string) =>
    void work(
      a,
      async (list) => {
        const next = await withProject(list, a, projectId);
        await call("meetings.queue", { id: record.id, actionIds: [a.id] });
        return { ...next, status: "queued" as const };
      },
      () => `Added “${a.title}” to the task queue, paused until you start it.`,
    );
  const setStatus = (a: MeetingAction, status: "done" | "dismissed" | "open") =>
    void work(
      a,
      () => call("meetings.setActionStatus", { id: record.id, actionId: a.id, status }),
      (next) =>
        status === "done"
          ? `Marked “${a.title}” as done.`
          : status === "dismissed"
            ? `Dismissed “${a.title}”.`
            : next.status === "running"
              ? `Reopened “${a.title}”; its chat is still running.`
              : `Reopened “${a.title}”.`,
    );
  const openChat = (sessionId: string) =>
    void call("meetings.revealChat", { sessionId }).catch((error) => report(errorMessage(error), true));

  /** Run and Queue go to the action's project, or ask for one in a submenu. */
  const inProject = (
    label: string,
    icon: LucideIcon,
    testId: string,
    a: MeetingAction,
    go: (a: MeetingAction, projectId: string) => void,
  ): MenuEntry =>
    a.projectId
      ? { label, icon, testId, onSelect: () => go(a, a.projectId!) }
      : {
          label,
          icon,
          testId,
          disabled: !projects.projects.length,
          submenu: [
            { heading: "In project" },
            ...projects.projects.map((p) => ({
              label: p.name,
              leading: <ProjectSwatch color={p.color} />,
              testId: `${testId}-${p.id}`,
              onSelect: () => go(a, p.id),
            })),
          ],
        };

  const menu = (a: MeetingAction): MenuEntry[] => {
    const open = actionOpen(a);
    const handled = actionHandled(a);
    return [
      ...(a.status === "running" && a.sessionId
        ? [{ label: "Open the chat", icon: MessageSquare, onSelect: () => openChat(a.sessionId!) }]
        : []),
      ...(open
        ? [
            inProject("Run in a chat", MessageSquarePlus, "action-run", a, run),
            inProject("Queue", ListPlus, "action-queue", a, queue),
          ]
        : []),
      ...(boards && !a.card && (open || a.status === "running")
        ? [
            {
              label: "Create card…",
              icon: Kanban,
              testId: "action-create-card",
              onSelect: () => setCarding(a),
            },
          ]
        : []),
      ...(a.card
        ? [
            {
              label: `Open card #${a.card.id}`,
              icon: ExternalLink,
              onSelect: () => void call("app.openExternal", { url: a.card!.url }).catch(() => undefined),
            },
          ]
        : []),
      ...(open || a.status === "running"
        ? [
            { separator: true as const },
            {
              label: "Mark as done",
              icon: CircleCheck,
              testId: "action-done",
              onSelect: () => setStatus(a, "done"),
            },
            {
              label: "Dismiss",
              icon: EyeOff,
              testId: "action-dismiss",
              onSelect: () => setStatus(a, "dismissed"),
            },
          ]
        : []),
      ...(handled
        ? [
            {
              label: "Reopen",
              icon: RotateCcw,
              testId: "action-reopen",
              onSelect: () => setStatus(a, "open"),
            },
          ]
        : []),
    ];
  };

  /** The row's hover action: run it (open), its chat (running), or reopen it (handled). */
  const quick = (a: MeetingAction): QuickAction | undefined => {
    if (a.status === "running" && a.sessionId)
      return { label: "Open the chat", icon: MessageSquare, onClick: () => openChat(a.sessionId!) };
    if (actionOpen(a))
      return {
        label: "Run in a chat",
        icon: MessageSquarePlus,
        onClick: (at) => {
          if (a.projectId) run(a, a.projectId);
          else openMenuAt(at, [inProject("Run in a chat", MessageSquarePlus, "action-run", a, run)], true);
        },
      };
    if (actionHandled(a)) return { label: "Reopen", icon: RotateCcw, onClick: () => setStatus(a, "open") };
    return undefined;
  };

  /** A row's click or right-click: its menu where the pointer is (Enter: under the row). */
  const rowProps = (a: MeetingAction) => ({
    role: "button" as const,
    tabIndex: 0,
    "aria-label": `Actions for ${a.title}`,
    onClick: (e: React.MouseEvent) => openMenu(menu(a), { x: e.clientX, y: e.clientY }),
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      openMenu(menu(a), { x: e.clientX, y: e.clientY });
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      openMenuAt(e.currentTarget, menu(a));
    },
  });

  const dialog: ReactNode = carding ? (
    <CardDialog
      record={record}
      action={actions.find((a) => a.id === carding.id) ?? carding}
      projects={projects}
      onClose={() => setCarding(undefined)}
      onCreated={(next) => {
        setCarding(undefined);
        onChanged?.(next);
        report(`Made card #${next.card?.id} for “${next.title}”.`);
      }}
    />
  ) : null;

  return { pending, menu, quick, rowProps, dialog, setStatus, run, openChat };
}

/**
 * Create card… (D-425): an Azure DevOps card for a meeting action on a board its project follows in
 * the Boards add-on. The type starts as the board's backlog type, the description as the prompt, the
 * evidence and the meeting, and the assignee as the owner when Azure DevOps knows them for sure.
 * Everything stays editable; nothing moves while the boards and the assignee load.
 */
export function CardDialog({
  record,
  action,
  projects,
  onClose,
  onCreated,
}: {
  record: MeetingRecord;
  action: MeetingAction;
  projects: ProjectsState;
  onClose(): void;
  onCreated(action: MeetingAction): void;
}) {
  const [projectId, setProjectId] = useState(action.projectId ?? projects.projects[0]?.id ?? "");
  const [boardId, setBoardId] = useState<string>();
  const [form, setForm] = useState<MeetingCardForm>();
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState("");
  const [title, setTitle] = useState(action.title);
  const [description, setDescription] = useState<string>();
  const [assignedTo, setAssignedTo] = useState("");
  /** Who the lookup found, or that it found nobody (shown under the field until you edit it). */
  const [found, setFound] = useState<{ name?: string } | undefined>();
  const [assigneeEdited, setAssigneeEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");

  // biome-ignore lint/correctness/useExhaustiveDependencies: looked up again only for another project or board.
  useEffect(() => {
    if (!projectId) return;
    let live = true;
    setLoading(true);
    setFailure("");
    call("meetings.cardForm", {
      id: record.id,
      actionId: action.id,
      projectId,
      ...(boardId ? { boardId } : {}),
    }).then(
      (f) => {
        if (!live) return;
        setForm(f);
        setLoading(false);
        setDescription((d) => d ?? f.description);
        const board = f.boards.find((b) => b.id === f.boardId);
        if (!boardId && f.boardId) setBoardId(f.boardId);
        setType((t) => (board?.types.includes(t) ? t : (board?.type ?? board?.types[0] ?? "")));
        if (!assigneeEdited) {
          setAssignedTo(f.assignedTo ?? "");
          setFound({ name: f.assigneeName });
        }
      },
      (e: unknown) => {
        if (!live) return;
        setLoading(false);
        setFailure(errorMessage(e));
      },
    );
    return () => {
      live = false;
    };
  }, [record.id, action.id, projectId, boardId]);

  const board = form?.boards.find((b) => b.id === boardId);
  const noBoards = Boolean(form && !loading && !form.boards.length);
  const project = projects.projects.find((p) => p.id === projectId);
  const ready = Boolean(board && !board.problem && type && title.trim() && !busy && !loading);
  const create = async () => {
    if (!ready || !board) return;
    setBusy(true);
    setFailure("");
    try {
      onCreated(
        await call("meetings.createCard", {
          id: record.id,
          actionId: action.id,
          projectId,
          boardId: board.id,
          type,
          title: title.trim(),
          description: description ?? "",
          ...(assignedTo.trim() ? { assignedTo: assignedTo.trim() } : {}),
        }),
      );
    } catch (e) {
      setFailure(errorMessage(e));
      setBusy(false);
    }
  };
  const owner = action.mine ? "you" : action.owner.trim();
  const assigneeHint = assigneeEdited
    ? " "
    : loading
      ? " "
      : found?.name
        ? action.mine
          ? `You in Azure DevOps (${found.name})`
          : `Found ${found.name} in Azure DevOps`
        : owner && !/^unknown$/i.test(owner)
          ? `No single match for ${owner} in Azure DevOps: left unassigned`
          : "Nobody named in the meeting: left unassigned";

  return (
    <Dialog
      open
      title="Create card"
      width="lg"
      onClose={onClose}
      testId="action-card-dialog"
      footer={
        <>
          <span className="mr-auto min-w-0 truncate text-xs text-danger" title={failure || undefined}>
            {failure}
          </span>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={busy} disabled={!ready} onClick={() => void create()}>
            Create card
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field id="card-project" label="Project">
            <Select
              id="card-project"
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setBoardId(undefined);
                setForm(undefined);
              }}
            >
              {!projectId && <option value="">Choose project…</option>}
              {projects.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="card-board" label="Board">
            {/* A picker only when the project follows several boards; the slot keeps its size. */}
            <Select
              id="card-board"
              value={boardId ?? ""}
              disabled={loading || !form || form.boards.length < 2}
              onChange={(e) => setBoardId(e.target.value)}
            >
              {!form?.boards.length && <option value="">{noBoards ? "No boards" : ""}</option>}
              {form?.boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {/* One fixed hint line under the pickers: loading, no boards (with the way to Boards), or the board's problem. */}
        <div className="-mt-2 flex h-4 items-center gap-2 text-xs" data-testid="card-board-note">
          {loading ? (
            <Spinner size="sm" />
          ) : noBoards ? (
            <>
              <span className="min-w-0 truncate text-hint">
                {project?.name ?? "This project"} follows no Azure DevOps boards yet.
              </span>
              <button
                type="button"
                className="shrink-0 text-accent hover:underline"
                onClick={() => void call("meetings.showBoards", { projectId }).catch(() => undefined)}
              >
                Open Boards
              </button>
            </>
          ) : board?.problem ? (
            <span className="min-w-0 truncate text-danger" title={board.problem}>
              {board.problem}
            </span>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field id="card-type" label="Type">
            <Select
              id="card-type"
              value={type}
              disabled={!board?.types.length}
              onChange={(e) => setType(e.target.value)}
            >
              {!board?.types.length && <option value="" />}
              {board?.types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <div className="space-y-1">
            <label htmlFor="card-assignee" className="block text-sm font-medium">
              Assigned to
            </label>
            <Input
              id="card-assignee"
              value={assignedTo}
              placeholder="Unassigned"
              onChange={(e) => {
                setAssigneeEdited(true);
                setAssignedTo(e.target.value);
              }}
            />
            <p
              className="h-4 truncate text-xs text-hint"
              data-testid="card-assignee-hint"
              title={assigneeHint}
            >
              {assigneeHint}
            </p>
          </div>
        </div>
        <Field id="card-title" label="Title">
          <Input id="card-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field id="card-description" label="Description">
          <Textarea
            id="card-description"
            rows={8}
            className={cn(description === undefined && "opacity-60")}
            value={description ?? ""}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
      </div>
    </Dialog>
  );
}
