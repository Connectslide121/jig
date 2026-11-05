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
  type NewCard,
  type TeamPaths,
  type TypeForm,
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

type Editors = Map<string, RefObject<HTMLDivElement | null>>;

/** One editor ref per rich section, made on first use and kept, so its text survives re-renders. */
function useEditors() {
  const editors = useRef<Editors>(new Map());
  const editorRef = (ref: string) => {
    let r = editors.current.get(ref);
    if (!r) {
      r = createRef<HTMLDivElement>();
      editors.current.set(ref, r);
    }
    return r;
  };
  return { editors, editorRef };
}

/** The rich sections you changed, read from their editors: images back on their attachment URLs. */
function richPatch(
  sections: Array<Pick<Section, "ref" | "html">>,
  editors: Editors,
  dirty: ReadonlySet<string>,
): Pick<WorkItemPatch, "descriptionHtml" | "acceptanceHtml" | "html"> {
  const p: Pick<WorkItemPatch, "descriptionHtml" | "acceptanceHtml" | "html"> = {};
  for (const s of sections) {
    const el = editors.get(s.ref)?.current;
    if (!dirty.has(s.ref) || !el) continue;
    const html = restoreSources(el.innerHTML);
    if (html === s.html) continue;
    if (s.ref === DESCRIPTION) p.descriptionHtml = html;
    else if (s.ref === ACCEPTANCE) p.acceptanceHtml = html;
    else p.html = { ...p.html, [s.ref]: html };
  }
  return p;
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
  const paths = useHostCall<TeamPaths>("paths", { board });
  const [draft, setDraft] = useState<FieldsDraft & { title: string }>();
  const [tab, setTab] = useState<Tab>("details");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<"save" | "comment" | "delete">();
  const [failure, setFailure] = useState("");
  const [opened, setOpened] = useState<Opened>();
  /** The rich sections you've changed (their editors' HTML is read when you save). */
  const [dirty, setDirty] = useState<ReadonlySet<string>>(new Set());
  const { editors, editorRef } = useEditors();
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
      area: data.areaPath ?? "",
      iteration: data.iteration ?? "",
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
    const tags = parseTags(draft.tags);
    if (tags.join(";") !== data.tags.join(";")) p.tags = tags;
    const priority = parseNumber(draft.priority);
    if (priority !== undefined && priority !== data.priority) p.priority = priority;
    const storyPoints = parseNumber(draft.storyPoints);
    if (storyPoints !== undefined && storyPoints !== data.storyPoints) p.storyPoints = storyPoints;
    if (draft.area && draft.area !== (data.areaPath ?? "")) p.area = draft.area;
    if (draft.iteration && draft.iteration !== (data.iteration ?? "")) p.iteration = draft.iteration;
    return p;
  };
  const patch = (): WorkItemPatch => ({ ...fieldsPatch(), ...richPatch(sections, editors.current, dirty) });
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
                  paths={paths.data}
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

/** The fields a card's form edits, as typed (D-372): the card dialog and the New card dialog share them. */
export interface FieldsDraft {
  state: string;
  assignedTo: string;
  column: string;
  tags: string;
  priority: string;
  storyPoints: string;
  area: string;
  iteration: string;
}

/** Tags as typed (comma or semicolon separated) → the list. */
const parseTags = (s: string) =>
  s
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
/** A number field as typed → its number (undefined when empty or not a number). */
const parseNumber = (s: string) => {
  const n = s.trim() === "" ? Number.NaN : Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};

/** A path picker's options: the team's, with the card's own first when it isn't one of them. */
const pathOptions = (list: string[] | undefined, current: string) =>
  current && !list?.includes(current) ? [current, ...(list ?? [])] : (list ?? []);

/**
 * The fields you edit in a card's side column, in a fixed order (D-372): Column, State, Assigned to,
 * Tags, Priority and Story points, Area and Iteration. Every control has its slot from the start: a
 * type without priority or story points shows them disabled, the path pickers hold the card's own
 * value (or "—") until the team's lists arrive.
 */
function EditFields({
  type,
  states,
  draft,
  columns,
  paths,
  numbers = { priority: true, storyPoints: true },
  saved,
  onDraft,
  testId,
}: {
  type: string;
  states: string[];
  draft: FieldsDraft;
  columns: BoardColumn[];
  paths?: TeamPaths;
  numbers?: Pick<TypeForm, "priority" | "storyPoints">;
  /** The saved assignee (their picture shows while the field still names them). */
  saved?: { assignedTo?: string; assignedEmail?: string };
  onDraft: (d: Partial<FieldsDraft>) => void;
  testId: string;
}) {
  const stateOptions = states.includes(draft.state) || !draft.state ? states : [draft.state, ...states];
  const areas = pathOptions(paths?.areas, draft.area);
  const iterations = pathOptions(paths?.iterations, draft.iteration);
  const who = draft.assignedTo.trim();
  return (
    <>
      <Field label="Column">
        <Select
          value={draft.column}
          onChange={(e) => {
            const col = columns.find((c) => c.name === e.target.value);
            onDraft({ column: e.target.value, state: col?.stateMappings[type] ?? draft.state });
          }}
          data-testid={`${testId}-column`}
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
        <Select
          value={draft.state}
          disabled={!stateOptions.length}
          onChange={(e) => onDraft({ state: e.target.value })}
          data-testid={`${testId}-state`}
        >
          {!stateOptions.length ? <option value="">—</option> : null}
          {stateOptions.map((s) => (
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
            name={who}
            email={
              who === (saved?.assignedTo ?? "") ? saved?.assignedEmail : who.includes("@") ? who : undefined
            }
            data-testid={`${testId}-avatar`}
          />
          <Input
            className="min-w-0 flex-1"
            value={draft.assignedTo}
            placeholder="Email or name"
            onChange={(e) => onDraft({ assignedTo: e.target.value })}
            data-testid={`${testId}-assigned`}
          />
        </span>
      </Field>
      <Field label="Tags">
        <Input
          value={draft.tags}
          placeholder="Comma separated"
          onChange={(e) => onDraft({ tags: e.target.value })}
          data-testid={`${testId}-tags`}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Priority">
          <Input
            inputMode="numeric"
            value={numbers.priority ? draft.priority : ""}
            disabled={!numbers.priority}
            title={numbers.priority ? undefined : `A ${type} has no priority`}
            onChange={(e) => onDraft({ priority: e.target.value })}
            data-testid={`${testId}-priority`}
          />
        </Field>
        <Field label="Story points">
          <Input
            inputMode="decimal"
            value={numbers.storyPoints ? draft.storyPoints : ""}
            disabled={!numbers.storyPoints}
            title={numbers.storyPoints ? undefined : `A ${type} has no story points`}
            onChange={(e) => onDraft({ storyPoints: e.target.value })}
            data-testid={`${testId}-points`}
          />
        </Field>
      </div>
      <Field label="Area">
        <Select
          value={draft.area}
          disabled={!areas.length}
          title={draft.area}
          onChange={(e) => onDraft({ area: e.target.value })}
          data-testid={`${testId}-area`}
        >
          {!areas.length ? <option value="">—</option> : null}
          {areas.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Iteration">
        <Select
          value={draft.iteration}
          disabled={!iterations.length}
          title={draft.iteration}
          onChange={(e) => onDraft({ iteration: e.target.value })}
          data-testid={`${testId}-iteration`}
        >
          {!iterations.length ? <option value="">—</option> : null}
          {iterations.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}

/** The side column of Details: what you can change, then every other field Azure DevOps has on it. */
function SideFields({
  data,
  draft,
  columns,
  paths,
  onDraft,
}: {
  data: WorkItemDetail;
  draft: FieldsDraft;
  columns: BoardColumn[];
  paths?: TeamPaths;
  onDraft: (d: Partial<FieldsDraft>) => void;
}) {
  const rows: Array<[string, string | undefined]> = [
    ...data.fields.map((f): [string, string] => [f.label, f.kind === "date" ? day(f.value) : f.value]),
    [
      "Created",
      data.created ? `${when(data.created)}${data.createdBy ? ` · ${data.createdBy}` : ""}` : undefined,
    ],
    ["Changed", when(data.changed)],
  ];
  return (
    <div className="flex min-h-0 w-72 shrink-0 flex-col gap-3 overflow-y-auto pr-1">
      <EditFields
        type={data.type}
        states={data.states}
        draft={draft}
        columns={columns}
        paths={paths}
        saved={data}
        onDraft={onDraft}
        testId="board-card"
      />
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

const NO_HANDLERS = (ctx: AddonUiContext): RichHandlers => ({
  onImage: () => undefined,
  onLink: (href) => ctx.openExternal(href),
});

/**
 * A new card in a column, filled in like the card's own form (D-372): the title on top, the type's rich
 * text on the left (description, acceptance criteria, repro steps… whatever the picked type has), the
 * type and the fields the card dialog edits on the right. Switching the type changes the rich sections
 * and states (text in a section both types have stays). The dialog has the card dialog's size and its
 * panes scroll, so nothing moves while the type's form or the team's paths load. Create sends it all at once.
 */
export function NewCardDialog({
  ctx,
  board,
  column,
  columns,
  onClose,
}: {
  ctx: AddonUiContext;
  board: Board;
  column: BoardColumn;
  columns: BoardColumn[];
  onClose: () => void;
}) {
  // The types this board shows, those of the column you add in first.
  const types = [...new Set([column, ...columns].flatMap((c) => Object.keys(c.stateMappings)))];
  const [type, setType] = useState(
    types.find((t) => /story|backlog item|requirement/i.test(t)) ?? types[0] ?? "Task",
  );
  const [title, setTitle] = useState("");
  const [draft, setDraft] = useState<FieldsDraft>(() => ({
    state: "",
    assignedTo: "",
    column: column.name,
    tags: "",
    priority: "",
    storyPoints: "",
    area: "",
    iteration: "",
  }));
  const [forms, setForms] = useState<Record<string, TypeForm>>({});
  const [formError, setFormError] = useState("");
  const shown = useRef<TypeForm>(undefined);
  const paths = useHostCall<TeamPaths>("paths", { board });
  const [dirty, setDirty] = useState<ReadonlySet<string>>(new Set());
  const { editors, editorRef } = useEditors();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");

  // The picked type's form, once per type; the last one stays on screen until the next arrives.
  useEffect(() => {
    if (forms[type]) return;
    let live = true;
    setFormError("");
    ctx.host.call<TypeForm>("typeForm", { board, type }).then(
      (f) => live && setForms((all) => ({ ...all, [type]: f })),
      (e: unknown) => live && setFormError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      live = false;
    };
  }, [ctx, board, type, forms]);
  const form = forms[type] ?? shown.current;
  if (forms[type]) shown.current = forms[type];
  // The state follows the column for the type; the team's area and default iteration once known.
  const columnState = columns.find((c) => c.name === draft.column)?.stateMappings[type];
  useEffect(() => {
    if (columnState) setDraft((d) => ({ ...d, state: columnState }));
  }, [columnState]);
  useEffect(() => {
    const p = paths.data;
    if (p)
      setDraft((d) => ({
        ...d,
        area: d.area || p.areas[0] || "",
        iteration: d.iteration || p.defaultIteration || "",
      }));
  }, [paths.data]);

  const ready = !!title.trim() && !busy;
  const create = async () => {
    if (!ready) return;
    setBusy(true);
    setFailure("");
    try {
      const numbers = form ?? { priority: true, storyPoints: true };
      const card: NewCard = {
        type,
        title: title.trim(),
        ...(draft.column ? { column: draft.column } : {}),
        ...(draft.state ? { state: draft.state } : {}),
        ...(draft.assignedTo.trim() ? { assignedTo: draft.assignedTo.trim() } : {}),
        ...(parseTags(draft.tags).length ? { tags: parseTags(draft.tags) } : {}),
        ...(numbers.priority && parseNumber(draft.priority) !== undefined
          ? { priority: parseNumber(draft.priority) }
          : {}),
        ...(numbers.storyPoints && parseNumber(draft.storyPoints) !== undefined
          ? { storyPoints: parseNumber(draft.storyPoints) }
          : {}),
        ...(draft.area ? { area: draft.area } : {}),
        ...(draft.iteration ? { iteration: draft.iteration } : {}),
        ...richPatch(
          (form?.rich ?? []).map((s) => ({ ref: s.ref, html: "" })),
          editors.current,
          dirty,
        ),
      };
      await ctx.host.call("create", { board, ...card });
      onClose();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const look = typeLook(type);

  return (
    <Dialog
      open
      onClose={onClose}
      width="xl"
      testId="board-new-card-dialog"
      title={
        <span className="flex min-w-0 items-center gap-2">
          <look.Icon className={cn("size-4 shrink-0", look.text)} aria-hidden />
          <span className="min-w-0 truncate">
            New {type} in {draft.column || column.name}
          </span>
        </span>
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            busy={busy}
            disabled={!ready}
            onClick={() => void create()}
            data-testid="board-new-card-create"
          >
            Create
          </Button>
        </>
      }
    >
      <div className="relative h-152">
        <div className="flex h-full flex-col gap-3">
          <Input
            autoFocus
            value={title}
            placeholder="Title"
            aria-label="Title"
            className="h-9 shrink-0 text-base font-semibold"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void create()}
            data-testid="board-new-card-title"
          />
          <div className="flex min-h-0 flex-1 gap-5">
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto pr-1" data-testid="board-new-card-details">
              {form ? (
                <div className="flex flex-col gap-4">
                  {form.rich.map((s) => (
                    <RichEditor
                      key={s.ref}
                      ctx={ctx}
                      label={s.label}
                      html=""
                      editorRef={editorRef(s.ref)}
                      onDirty={() => setDirty((d) => new Set(d).add(s.ref))}
                      onRefuse={setFailure}
                      handlers={NO_HANDLERS(ctx)}
                      testId={`board-new-card-rich-${s.label.toLowerCase().replace(/\s+/g, "-")}`}
                    />
                  ))}
                </div>
              ) : formError ? (
                <p className="p-4 text-sm whitespace-pre-wrap text-danger" role="alert">
                  {formError}
                </p>
              ) : (
                <Spinner center />
              )}
            </div>
            <div className="flex min-h-0 w-72 shrink-0 flex-col gap-3 overflow-y-auto pr-1">
              <Field label="Type">
                <Select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  data-testid="board-new-card-type"
                >
                  {types.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
              <EditFields
                type={type}
                states={form && forms[type] ? form.states : []}
                draft={draft}
                columns={columns}
                paths={paths.data}
                numbers={forms[type]}
                onDraft={(d) => setDraft((prev) => ({ ...prev, ...d }))}
                testId="board-new-card"
              />
            </div>
          </div>
        </div>
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
    </Dialog>
  );
}
