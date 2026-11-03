import type { AddonUiContext } from "@jig/sdk";
import { Button, cn, Dialog, Input, Select, Spinner, Textarea, useHostCall } from "@jig/sdk/ui";
import { ExternalLink, MessageSquarePlus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  type Board,
  type BoardColumn,
  chatDraft,
  initials,
  type WorkItemDetail,
  type WorkItemPatch,
} from "./lib/boards";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is the child.
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";

/**
 * A card, opened in Jig (D-262): everything Azure DevOps has on it, editable in place. Save sends only
 * what changed; a comment is added on its own; Delete moves it to Azure DevOps' recycle bin.
 * Fixed height, so nothing moves while it loads or saves.
 */
export function CardDialog({
  ctx,
  board,
  id,
  columns,
  columnField,
  projectId,
  onClose,
}: {
  ctx: AddonUiContext;
  board: Board;
  id: number;
  columns: BoardColumn[];
  columnField?: string;
  projectId?: string;
  onClose: () => void;
}) {
  const { data, error, reload } = useHostCall<WorkItemDetail>("item", { board, id, columnField });
  const [draft, setDraft] = useState<
    Required<Pick<WorkItemPatch, "title" | "description" | "state" | "assignedTo">> & {
      column: string;
      tags: string;
      priority: string;
      storyPoints: string;
    }
  >();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<"save" | "comment" | "delete">();
  const [failure, setFailure] = useState("");
  useEffect(() => {
    if (!data) return;
    setDraft({
      title: data.title,
      description: data.description,
      state: data.state,
      assignedTo: data.assignedTo ?? "",
      column: data.column ?? "",
      tags: data.tags.join(", "),
      priority: data.priority === undefined ? "" : String(data.priority),
      storyPoints: data.storyPoints === undefined ? "" : String(data.storyPoints),
    });
  }, [data]);

  const run = async (what: "save" | "comment" | "delete", work: () => Promise<void>) => {
    setBusy(what);
    setFailure("");
    try {
      await work();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(undefined);
    }
  };
  const patch = (): WorkItemPatch => {
    if (!data || !draft) return {};
    const p: WorkItemPatch = {};
    if (draft.title.trim() !== data.title) p.title = draft.title.trim();
    if (draft.description !== data.description) p.description = draft.description;
    if (draft.column && draft.column !== (data.column ?? "")) p.column = draft.column;
    else if (draft.state !== data.state) p.state = draft.state;
    if (draft.assignedTo.trim() !== (data.assignedTo ?? "")) p.assignedTo = draft.assignedTo.trim();
    const tags = draft.tags
      .split(/[,;]/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.join(";") !== data.tags.join(";")) p.tags = tags;
    const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
    if (num(draft.priority) !== data.priority && num(draft.priority) !== undefined)
      p.priority = num(draft.priority);
    if (num(draft.storyPoints) !== data.storyPoints && num(draft.storyPoints) !== undefined)
      p.storyPoints = num(draft.storyPoints);
    return p;
  };
  const changed = Object.keys(patch()).length > 0;
  const save = () =>
    run("save", async () => {
      await ctx.host.call("update", { board, id, patch: patch() });
      onClose();
    });
  const addComment = () =>
    run("comment", async () => {
      await ctx.host.call("update", { board, id, patch: { comment } });
      setComment("");
      await reload();
    });
  const remove = async () => {
    const yes = await ctx.confirm({
      title: `Delete #${id}?`,
      message: "It goes to the project's recycle bin in Azure DevOps, where it can be restored.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (yes)
      await run("delete", async () => {
        await ctx.host.call("remove", { board, id });
        onClose();
      });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      width="xl"
      testId="board-card-dialog"
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-muted tabular-nums">
            {data?.type ?? "Work item"} #{id}
          </span>
        </span>
      }
      footer={
        <>
          <Button
            variant="ghost"
            icon={Trash2}
            className="mr-auto text-danger"
            disabled={!data || Boolean(busy)}
            busy={busy === "delete"}
            onClick={() => void remove()}
            data-testid="board-card-delete"
          >
            Delete…
          </Button>
          <Button
            variant="ghost"
            icon={ExternalLink}
            disabled={!data}
            onClick={() => data && ctx.openExternal(data.url)}
          >
            Azure DevOps
          </Button>
          <Button
            variant="ghost"
            icon={MessageSquarePlus}
            disabled={!data}
            onClick={() => {
              if (!data) return;
              onClose();
              void ctx.openChat({ projectId, draft: chatDraft(data) });
            }}
          >
            Start a chat
          </Button>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!changed || Boolean(busy)}
            busy={busy === "save"}
            onClick={() => void save()}
            data-testid="board-card-save"
          >
            Save
          </Button>
        </>
      }
    >
      <div className="relative h-136">
        {!data || !draft ? (
          error ? (
            <p className="p-4 text-sm whitespace-pre-wrap text-danger" role="alert">
              {error}
            </p>
          ) : (
            <Spinner center />
          )
        ) : (
          <div className="flex h-full gap-5">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
              <Input
                value={draft.title}
                aria-label="Title"
                className="h-9 text-base font-semibold"
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                data-testid="board-card-title"
              />
              <Field label="Description">
                <Textarea
                  rows={7}
                  value={draft.description}
                  placeholder="No description"
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  data-testid="board-card-description"
                />
              </Field>
              {data.acceptance ? (
                <Field label="Acceptance criteria">
                  <p className="max-h-20 overflow-y-auto rounded-md bg-surface px-2 py-1.5 text-sm whitespace-pre-wrap">
                    {data.acceptance}
                  </p>
                </Field>
              ) : null}
              <div className="flex min-h-0 flex-1 flex-col gap-1.5">
                <span className="text-xs font-medium text-muted">Discussion</span>
                <div
                  className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-md border border-line p-2"
                  data-testid="board-card-comments"
                >
                  {data.comments.length === 0 ? (
                    <p className="text-xs text-hint">No comments yet.</p>
                  ) : (
                    data.comments.map((c, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: comments come in order and don't move.
                      <div key={i} className="flex gap-2 text-sm">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-2xs font-semibold text-accent">
                          {initials(c.by || "?")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-muted">
                            {c.by} · {when(c.at)}
                          </div>
                          <p className="whitespace-pre-wrap">{c.text}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={comment}
                    placeholder="Add a comment"
                    onChange={(e) => setComment(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && comment.trim() && void addComment()}
                    data-testid="board-card-comment"
                  />
                  <Button
                    disabled={!comment.trim() || Boolean(busy)}
                    busy={busy === "comment"}
                    onClick={() => void addComment()}
                  >
                    Comment
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex min-h-0 w-64 shrink-0 flex-col gap-3 overflow-y-auto">
              <Field label="Column">
                <Select
                  value={draft.column}
                  onChange={(e) => {
                    const col = columns.find((c) => c.name === e.target.value);
                    setDraft({
                      ...draft,
                      column: e.target.value,
                      state: col?.stateMappings[data.type] ?? draft.state,
                    });
                  }}
                  data-testid="board-card-column"
                >
                  {!draft.column ? <option value="">—</option> : null}
                  {columns.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="State">
                <Select value={draft.state} onChange={(e) => setDraft({ ...draft, state: e.target.value })}>
                  {data.states.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Assigned to">
                <Input
                  value={draft.assignedTo}
                  placeholder="Email or name"
                  onChange={(e) => setDraft({ ...draft, assignedTo: e.target.value })}
                />
              </Field>
              <Field label="Tags">
                <Input
                  value={draft.tags}
                  placeholder="Comma separated"
                  onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Priority">
                  <Input
                    inputMode="numeric"
                    value={draft.priority}
                    onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
                  />
                </Field>
                <Field label="Story points">
                  <Input
                    inputMode="decimal"
                    value={draft.storyPoints}
                    onChange={(e) => setDraft({ ...draft, storyPoints: e.target.value })}
                  />
                </Field>
              </div>
              <dl className="mt-1 space-y-1 border-t border-line pt-2 text-xs">
                {[
                  ["Area", data.areaPath],
                  ["Iteration", data.iteration],
                  ["Parent", data.parentId ? `#${data.parentId}` : undefined],
                  [
                    "Children",
                    data.childIds.length ? data.childIds.map((c) => `#${c}`).join(", ") : undefined,
                  ],
                  [
                    "Created",
                    data.created
                      ? `${when(data.created)}${data.createdBy ? ` · ${data.createdBy}` : ""}`
                      : undefined,
                  ],
                  ["Changed", when(data.changed)],
                ]
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <dt className="w-16 shrink-0 text-hint">{k}</dt>
                      <dd className="min-w-0 flex-1 truncate text-muted" title={v}>
                        {v}
                      </dd>
                    </div>
                  ))}
              </dl>
            </div>
          </div>
        )}
        <p
          role="alert"
          className={cn(
            "absolute right-0 -bottom-1 left-0 truncate text-xs text-danger",
            !failure && "invisible",
          )}
        >
          {failure || "."}
        </p>
      </div>
    </Dialog>
  );
}

/** A new card in a column: its title and type (the types this board shows). */
export function NewCardDialog({
  ctx,
  board,
  column,
  onClose,
}: {
  ctx: AddonUiContext;
  board: Board;
  column: BoardColumn;
  onClose: () => void;
}) {
  const types = Object.keys(column.stateMappings);
  const [type, setType] = useState(
    types.find((t) => /story|backlog item|requirement/i.test(t)) ?? types[0] ?? "Task",
  );
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const create = async () => {
    setBusy(true);
    setFailure("");
    try {
      await ctx.host.call("create", { board, type, title, column: column.name });
      onClose();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={`New card in ${column.name}`}
      testId="board-new-card"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            busy={busy}
            disabled={!title.trim()}
            onClick={() => void create()}
            data-testid="board-new-card-create"
          >
            Create
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Title">
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && title.trim() && void create()}
            data-testid="board-new-card-title"
          />
        </Field>
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <p role="alert" className={cn("h-4 text-xs text-danger", !failure && "invisible")}>
          {failure || "."}
        </p>
      </div>
    </Dialog>
  );
}
