import type { AddonUiContext } from "@jig/sdk";
import {
  Button,
  cn,
  Dialog,
  Empty,
  FileIcon,
  formatBytes,
  Input,
  isImagePath,
  PersonAvatar,
  Select,
  Spinner,
  Tabs,
  useHostCall,
} from "@jig/sdk/ui";
import {
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  Hammer,
  Link2,
  type LucideIcon,
  MessageSquarePlus,
  Paperclip,
  Trash2,
} from "lucide-react";
import { createRef, type RefObject, useEffect, useRef, useState } from "react";
import {
  ACCEPTANCE,
  type Attachment,
  type Board,
  type BoardColumn,
  chatDraft,
  DESCRIPTION,
  type DevelopmentLink,
  downloadUrl,
  groupLinks,
  type WorkItemDetail,
  type WorkItemPatch,
} from "./lib/boards";
import { typeLook } from "./look";
import { ImageDialog, RichEditor, type RichHandlers, RichView, restoreSources, useRichImages } from "./rich";

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
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString([], { dateStyle: "medium" }) : "");

type Tab = "details" | "links" | "attachments";
type Opened = { src?: string; original?: string; name: string; bytes?: number };

/** A rich-text section of the Details tab: the field, its label and its HTML as Azure DevOps keeps it. */
interface Section {
  ref: string;
  label: string;
  html: string;
}

/**
 * A card, opened in Jig (D-262, D-342): what Azure DevOps' work item form shows, in its tabs: Details
 * (rich text with images, editable without losing them; the discussion; every field), Links (work
 * items, development, hyperlinks) and Attachments. Save sends only what changed; a comment is added on
 * its own; Delete moves it to Azure DevOps' recycle bin. Fixed height, so nothing moves while it loads.
 */
export function CardDialog({
  ctx,
  board,
  id,
  columns,
  columnField,
  projectId,
  onClose,
  onOpenCard,
}: {
  ctx: AddonUiContext;
  board: Board;
  id: number;
  columns: BoardColumn[];
  columnField?: string;
  projectId?: string;
  onClose: () => void;
  /** Opens another card (a linked work item) in this dialog's place. */
  onOpenCard?: (id: number) => void;
}) {
  const { data, error, reload } = useHostCall<WorkItemDetail>("item", { board, id, columnField });
  const [draft, setDraft] = useState<
    Required<Pick<WorkItemPatch, "title" | "state" | "assignedTo">> & {
      column: string;
      tags: string;
      priority: string;
      storyPoints: string;
    }
  >();
  const [tab, setTab] = useState<Tab>("details");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<"save" | "comment" | "delete">();
  const [failure, setFailure] = useState("");
  const [opened, setOpened] = useState<Opened>();
  /** The rich sections you've changed (their editors' HTML is read when you save). */
  const [dirty, setDirty] = useState<ReadonlySet<string>>(new Set());
  const editors = useRef(new Map<string, RefObject<HTMLDivElement | null>>());
  const editorRef = (ref: string) => {
    let r = editors.current.get(ref);
    if (!r) {
      r = createRef<HTMLDivElement>();
      editors.current.set(ref, r);
    }
    return r;
  };
  useEffect(() => {
    if (!data) return;
    setDraft({
      title: data.title,
      state: data.state,
      assignedTo: data.assignedTo ?? "",
      column: data.column ?? "",
      tags: data.tags.join(", "),
      priority: data.priority === undefined ? "" : String(data.priority),
      storyPoints: data.storyPoints === undefined ? "" : String(data.storyPoints),
    });
  }, [data]);

  const sections: Section[] = data
    ? [
        { ref: DESCRIPTION, label: "Description", html: data.descriptionHtml },
        ...(data.acceptanceHtml !== undefined
          ? [{ ref: ACCEPTANCE, label: "Acceptance criteria", html: data.acceptanceHtml }]
          : []),
        ...data.rich.map((r) => ({ ref: r.ref, label: r.label, html: r.html })),
        ...data.emptyRich.map((r) => ({ ref: r.ref, label: r.label, html: "" })),
      ]
    : [];
  const images = useRichImages(ctx, board, [
    ...sections.map((s) => s.html),
    ...(data?.comments.map((c) => c.html) ?? []),
  ]);
  const handlers: RichHandlers = {
    onImage: (image) => setOpened(image),
    onLink: (href) => ctx.openExternal(href),
  };

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
  /** The plain fields that changed (the rich sections are read from their editors on save). */
  const fieldsPatch = (): WorkItemPatch => {
    if (!data || !draft) return {};
    const p: WorkItemPatch = {};
    if (draft.title.trim() !== data.title) p.title = draft.title.trim();
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
  const patch = (): WorkItemPatch => {
    const p = fieldsPatch();
    for (const s of sections) {
      const el = editors.current.get(s.ref)?.current;
      if (!dirty.has(s.ref) || !el) continue;
      const html = restoreSources(el.innerHTML);
      if (html === s.html) continue;
      if (s.ref === DESCRIPTION) p.descriptionHtml = html;
      else if (s.ref === ACCEPTANCE) p.acceptanceHtml = html;
      else p.html = { ...p.html, [s.ref]: html };
    }
    return p;
  };
  const changed = Object.keys(fieldsPatch()).length > 0 || dirty.size > 0;
  const save = () =>
    run("save", async () => {
      const p = patch();
      if (Object.keys(p).length) await ctx.host.call("update", { board, id, patch: p });
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
  const openCard = async (other: number) => {
    if (!onOpenCard) return;
    if (
      changed &&
      !(await ctx.confirm({
        title: `Open #${other}?`,
        message: `Your changes to #${id} aren't saved and will be lost.`,
        confirmLabel: "Open without saving",
        danger: true,
      }))
    )
      return;
    onOpenCard(other);
  };
  const look = typeLook(data?.type ?? "");
  const linkCount = (data?.links.length ?? 0) + (data?.development.length ?? 0);

  return (
    <Dialog
      open
      onClose={onClose}
      width="xl"
      testId="board-card-dialog"
      title={
        <span className="flex min-w-0 items-center gap-2">
          <look.Icon className={cn("size-4 shrink-0", look.text)} aria-hidden />
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
      <div className="relative h-152">
        {!data || !draft ? (
          error ? (
            <p className="p-4 text-sm whitespace-pre-wrap text-danger" role="alert">
              {error}
            </p>
          ) : (
            <Spinner center />
          )
        ) : (
          <div className="flex h-full flex-col gap-2">
            <Input
              value={draft.title}
              aria-label="Title"
              className="h-9 shrink-0 text-base font-semibold"
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              data-testid="board-card-title"
            />
            <Tabs<Tab>
              className="-mx-4 shrink-0 px-3"
              value={tab}
              onChange={setTab}
              items={[
                { id: "details", label: "Details" },
                { id: "links", label: <TabLabel text="Links" count={linkCount} /> },
                { id: "attachments", label: <TabLabel text="Attachments" count={data.attachments.length} /> },
              ]}
            />
            <div className="min-h-0 flex-1 pt-1">
              {/* Every tab stays mounted (hidden when not shown), so edits survive switching tabs. */}
              <div className={cn("h-full gap-5", tab === "details" ? "flex" : "hidden")}>
                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
                  <div className="min-h-0 flex-1 overflow-y-auto pr-1" data-testid="board-card-details">
                    {!images.ready ? (
                      <Spinner center />
                    ) : (
                      <div className="flex flex-col gap-4">
                        {sections.map((s) => (
                          <RichEditor
                            key={s.ref}
                            ctx={ctx}
                            label={s.label}
                            html={images.prepare(s.html)}
                            editorRef={editorRef(s.ref)}
                            onDirty={() => setDirty((d) => new Set(d).add(s.ref))}
                            onRefuse={setFailure}
                            handlers={handlers}
                            testId={s.ref === DESCRIPTION ? "board-card-description" : undefined}
                          />
                        ))}
                        <section>
                          <div className="mb-1 flex h-7 items-center text-xs font-medium text-muted">
                            Discussion
                            <span className="ml-1.5 text-hint tabular-nums">
                              {data.comments.length || ""}
                            </span>
                          </div>
                          <div className="flex flex-col gap-3" data-testid="board-card-comments">
                            {data.comments.length === 0 ? (
                              <p className="text-xs text-hint">No comments yet.</p>
                            ) : (
                              data.comments.map((c, i) => (
                                <div key={i} className="flex gap-2.5">
                                  <PersonAvatar size="md" name={c.by || "?"} />
                                  <div className="min-w-0 flex-1">
                                    <div className="mb-0.5 flex items-center gap-2 text-xs">
                                      <span className="truncate font-medium text-fg">{c.by}</span>
                                      <span className="shrink-0 text-hint">{when(c.at)}</span>
                                    </div>
                                    <RichView html={images.prepare(c.html)} handlers={handlers} />
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </section>
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
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
                <SideFields
                  data={data}
                  draft={draft}
                  columns={columns}
                  onDraft={(d) => setDraft({ ...draft, ...d })}
                />
              </div>
              {tab === "links" ? (
                <LinksTab
                  ctx={ctx}
                  data={data}
                  onOpenCard={onOpenCard ? (n) => void openCard(n) : undefined}
                />
              ) : null}
              {tab === "attachments" ? (
                <AttachmentsTab
                  ctx={ctx}
                  data={data}
                  onImage={(a) => setOpened({ original: a.url, name: a.name, bytes: a.size })}
                />
              ) : null}
            </div>
          </div>
        )}
        <p
          role="alert"
          className={cn(
            "absolute right-0 -bottom-2 left-0 truncate text-xs text-danger",
            !failure && "invisible",
          )}
        >
          {failure || "."}
        </p>
      </div>
      {opened ? (
        <ImageDialog ctx={ctx} board={board} image={opened} onClose={() => setOpened(undefined)} />
      ) : null}
    </Dialog>
  );
}

function TabLabel({ text, count }: { text: string; count: number }) {
  return (
    <span className="flex items-center gap-1.5">
      {text}
      <span className="text-xs text-hint tabular-nums">{count}</span>
    </span>
  );
}

type Draft = {
  state: string;
  assignedTo: string;
  column: string;
  tags: string;
  priority: string;
  storyPoints: string;
};

/** The side column of Details: what you can change, then every other field Azure DevOps has on it. */
function SideFields({
  data,
  draft,
  columns,
  onDraft,
}: {
  data: WorkItemDetail;
  draft: Draft;
  columns: BoardColumn[];
  onDraft: (d: Partial<Draft>) => void;
}) {
  const rows: Array<[string, string | undefined]> = [
    ...data.fields.map((f): [string, string] => [f.label, f.kind === "date" ? day(f.value) : f.value]),
    ["Area", data.areaPath],
    ["Iteration", data.iteration],
    [
      "Created",
      data.created ? `${when(data.created)}${data.createdBy ? ` · ${data.createdBy}` : ""}` : undefined,
    ],
    ["Changed", when(data.changed)],
  ];
  return (
    <div className="flex min-h-0 w-72 shrink-0 flex-col gap-3 overflow-y-auto pr-1">
      <Field label="Column">
        <Select
          value={draft.column}
          onChange={(e) => {
            const col = columns.find((c) => c.name === e.target.value);
            onDraft({ column: e.target.value, state: col?.stateMappings[data.type] ?? draft.state });
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
        <Select value={draft.state} onChange={(e) => onDraft({ state: e.target.value })}>
          {data.states.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Assigned to">
        <span className="flex min-w-0 items-center gap-2">
          {/* The saved assignee's picture; while you type someone else, their initials. */}
          <PersonAvatar
            size="md"
            name={draft.assignedTo.trim()}
            email={
              draft.assignedTo.trim() === (data.assignedTo ?? "")
                ? data.assignedEmail
                : draft.assignedTo.includes("@")
                  ? draft.assignedTo.trim()
                  : undefined
            }
            data-testid="board-card-avatar"
          />
          <Input
            className="min-w-0 flex-1"
            value={draft.assignedTo}
            placeholder="Email or name"
            onChange={(e) => onDraft({ assignedTo: e.target.value })}
          />
        </span>
      </Field>
      <Field label="Tags">
        <Input
          value={draft.tags}
          placeholder="Comma separated"
          onChange={(e) => onDraft({ tags: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Priority">
          <Input
            inputMode="numeric"
            value={draft.priority}
            onChange={(e) => onDraft({ priority: e.target.value })}
          />
        </Field>
        <Field label="Story points">
          <Input
            inputMode="decimal"
            value={draft.storyPoints}
            onChange={(e) => onDraft({ storyPoints: e.target.value })}
          />
        </Field>
      </div>
      <dl className="mt-1 space-y-1 border-t border-line pt-2 text-xs" data-testid="board-card-fields">
        {rows
          .filter((r): r is [string, string] => !!r[1])
          .map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="w-28 shrink-0 truncate text-hint" title={k}>
                {k}
              </dt>
              <dd className="min-w-0 flex-1 truncate text-muted" title={v}>
                {v}
              </dd>
            </div>
          ))}
      </dl>
    </div>
  );
}

const DEV_LOOK: Record<DevelopmentLink["kind"], { Icon: LucideIcon; label: (l: DevelopmentLink) => string }> =
  {
    pullRequest: { Icon: GitPullRequest, label: (l) => `PR ${l.ref}` },
    commit: { Icon: GitCommitHorizontal, label: (l) => l.ref },
    branch: { Icon: GitBranch, label: (l) => l.ref },
    build: { Icon: Hammer, label: (l) => `Build ${l.ref}` },
    other: { Icon: Link2, label: (l) => l.ref },
  };

/** A row in Links and Attachments: the whole row is the button; slots are fixed, the status sits at the right edge. */
function Row({
  onClick,
  title,
  children,
  testId,
}: {
  onClick?: () => void;
  title?: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      title={title}
      data-testid={testId}
      className="flex h-8 w-full min-w-0 items-center gap-2.5 rounded-md px-2 text-left text-sm enabled:hover:bg-hover disabled:cursor-default"
    >
      {children}
    </button>
  );
}

function Group({ name, count, children }: { name: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mb-3">
      <h3 className="flex h-7 items-center gap-1.5 px-2 text-xs font-medium text-muted">
        {name}
        <span className="text-hint tabular-nums">{count}</span>
      </h3>
      {children}
    </section>
  );
}

/** Links like Azure DevOps' Links tab: development first, then work items by link type, hyperlinks last. */
function LinksTab({
  ctx,
  data,
  onOpenCard,
}: {
  ctx: AddonUiContext;
  data: WorkItemDetail;
  onOpenCard?: (id: number) => void;
}) {
  if (!data.links.length && !data.development.length)
    return <Empty icon={Link2} title="No links" className="h-full" />;
  return (
    <div className="h-full overflow-y-auto" data-testid="board-card-links">
      {data.development.length ? (
        <Group name="Development" count={data.development.length}>
          {data.development.map((l) => {
            const { Icon, label } = DEV_LOOK[l.kind];
            const web = l.webUrl;
            return (
              <Row
                key={l.uri}
                title={`${l.name}${l.title ? `: ${l.title}` : ""}`}
                onClick={web ? () => ctx.openExternal(web) : undefined}
              >
                <Icon className="size-4 shrink-0 text-muted" aria-label={l.name} />
                <span className="w-40 shrink-0 truncate font-mono text-xs text-muted">{label(l)}</span>
                <span className="min-w-0 flex-1 truncate">
                  {l.title ?? l.name}
                  {l.repo ? <span className="ml-2 text-xs text-hint">{l.repo}</span> : null}
                </span>
                <span className="w-24 shrink-0 truncate text-right text-xs text-muted capitalize">
                  {l.status ?? ""}
                </span>
              </Row>
            );
          })}
        </Group>
      ) : null}
      {groupLinks(data.links).map((g) => (
        <Group key={g.name} name={g.name} count={g.links.length}>
          {g.links.map((l) => {
            if (l.id === undefined)
              return (
                <Row key={l.url} title={l.comment ?? l.url} onClick={() => ctx.openExternal(l.url)}>
                  <Link2 className="size-4 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{l.comment ?? l.url}</span>
                  <span className="w-1/3 shrink-0 truncate text-right text-xs text-hint">
                    {l.comment ? l.url : ""}
                  </span>
                </Row>
              );
            const linkLook = typeLook(l.type ?? "");
            const linked = l.id;
            return (
              <Row
                key={`${l.rel}-${linked}`}
                title={`${l.type ?? "Work item"} #${linked}${l.title ? `: ${l.title}` : ""}`}
                onClick={onOpenCard ? () => onOpenCard(linked) : undefined}
                testId={`board-card-link-${linked}`}
              >
                <linkLook.Icon
                  className={cn("size-4 shrink-0", linkLook.text)}
                  aria-label={l.type ?? "Work item"}
                />
                <span className="w-14 shrink-0 text-xs text-muted tabular-nums">#{linked}</span>
                <span className="min-w-0 flex-1 truncate">{l.title ?? "(couldn't be read)"}</span>
                <span className="w-28 shrink-0 truncate text-right text-xs text-muted">{l.state ?? ""}</span>
              </Row>
            );
          })}
        </Group>
      ))}
    </div>
  );
}

/** Files attached to the card: images open in Jig, other files download in the browser. */
function AttachmentsTab({
  ctx,
  data,
  onImage,
}: {
  ctx: AddonUiContext;
  data: WorkItemDetail;
  onImage: (a: Attachment) => void;
}) {
  if (!data.attachments.length) return <Empty icon={Paperclip} title="No attachments" className="h-full" />;
  return (
    <div className="h-full overflow-y-auto" data-testid="board-card-attachments">
      {data.attachments.map((a) => (
        <Row
          key={a.url}
          title={a.comment ? `${a.name}: ${a.comment}` : a.name}
          onClick={() => (isImagePath(a.name) ? onImage(a) : ctx.openExternal(downloadUrl(a)))}
        >
          <FileIcon path={a.name} className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {a.name}
            {a.comment ? <span className="ml-2 text-xs text-hint">{a.comment}</span> : null}
          </span>
          <span className="w-20 shrink-0 text-right text-xs text-muted tabular-nums">
            {a.size !== undefined ? formatBytes(a.size) : ""}
          </span>
          <span className="w-28 shrink-0 text-right text-xs text-muted tabular-nums">{day(a.added)}</span>
        </Row>
      ))}
    </div>
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
