import type { AddonComponentProps, AddonUiContext } from "@jig/sdk";
import {
  Button,
  cn,
  Dialog,
  Empty,
  IconButton,
  PersonAvatar,
  SearchInput,
  Select,
  Spinner,
  Tabs,
  useActiveProject,
  useAddon,
  useAddonEvent,
  useHostCall,
  useJigEvent,
  useStorage,
} from "@jig/sdk/ui";
import {
  Building2,
  Check,
  Kanban,
  type LucideIcon,
  type LucideProps,
  MoreHorizontal,
  MoveHorizontal,
  Plus,
  RefreshCw,
  SquarePlus,
  TriangleAlert,
  Users,
} from "lucide-react";
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CardDialog, NewCardDialog } from "./cards";
import {
  type Board,
  type BoardColumn,
  type BoardData,
  boardTitle,
  boardUrl,
  chatDraft,
  type FoundBoard,
  placeCards,
  tabName,
  type WorkItem,
} from "./lib/boards";
import { type BoardState, cacheKey, mergeBoard, updatedAgo } from "./lib/cache";
import { type BoardFilter, facets, isFiltering, matches, readFilter } from "./lib/filter";
import { typeLook } from "./look";
import { FilterBar } from "./toolbar";

/** What a card can do from the board: open, chat, move, delete, copy (D-262). */
interface CardActions {
  open: (item: WorkItem) => void;
  move: (item: WorkItem, column: string) => void;
  remove: (item: WorkItem) => void;
  /** A card is being dragged (true) or was dropped (false): refreshes wait meanwhile. */
  drag: (on: boolean) => void;
  columns: string[];
}

function cardMenu(
  ctx: AddonUiContext,
  item: WorkItem,
  projectId: string | undefined,
  actions: CardActions,
  at: globalThis.MouseEvent | HTMLElement,
) {
  ctx.menu(
    [
      {
        label: "Open",
        icon: "panel-top-open",
        testId: "board-item-open",
        onSelect: () => actions.open(item),
      },
      {
        label: "Start a chat about it",
        icon: "message-square-plus",
        testId: "board-item-chat",
        onSelect: () => void ctx.openChat({ projectId, draft: chatDraft(item) }),
      },
      {
        label: "Move to",
        icon: "move-right",
        submenu: actions.columns.map((c) => ({
          label: c,
          checked: c === item.column,
          testId: `board-item-move-${c}`,
          onSelect: () => actions.move(item, c),
        })),
      },
      { separator: true },
      { label: "Open in Azure DevOps", icon: "external-link", onSelect: () => ctx.openExternal(item.url) },
      { label: "Copy link", icon: "link", onSelect: () => ctx.copy(item.url) },
      { label: `Copy #${item.id}`, icon: "hash", onSelect: () => ctx.copy(`#${item.id}`) },
      { separator: true },
      {
        label: "Delete…",
        icon: "trash-2",
        danger: true,
        testId: "board-item-delete",
        onSelect: () => actions.remove(item),
      },
    ],
    at,
  );
}

/** A card as on an Azure DevOps board: type colour on the left edge, id, title, who has it. */
function Card({
  ctx,
  item,
  columnState,
  projectId,
  actions,
  moving,
}: {
  ctx: AddonUiContext;
  item: WorkItem;
  /** The state this column maps the item's type to: the card shows its state only when it differs. */
  columnState?: string;
  projectId?: string;
  actions: CardActions;
  /** Being saved after a move: shown faint until Azure DevOps has it. */
  moving?: boolean;
}) {
  const { Icon, text, edge } = typeLook(item.type);
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      data-testid={`board-item-${item.id}`}
      title={`${item.type} #${item.id}: ${item.title}`}
      onClick={() => actions.open(item)}
      onKeyDown={(e) => e.key === "Enter" && actions.open(item)}
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-jig-card", String(item.id));
        e.dataTransfer.effectAllowed = "move";
        actions.drag(true);
      }}
      onDragEnd={() => actions.drag(false)}
      onContextMenu={(e) => {
        e.preventDefault();
        cardMenu(ctx, item, projectId, actions, e.nativeEvent);
      }}
      className={cn(
        "group relative flex shrink-0 cursor-pointer flex-col gap-1.5 overflow-hidden rounded-md border border-line bg-elevated py-2 pr-1.5 pl-3.5 shadow-sm",
        "transition-colors hover:border-line-strong focus-visible:border-focus focus-visible:outline-none",
        moving && "opacity-60",
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", edge)} />
      <div className="flex h-5 items-center gap-1.5">
        <Icon className={cn("size-3.5 shrink-0", text)} aria-label={item.type} />
        <span className="min-w-0 flex-1 truncate text-xs text-hint tabular-nums">{item.id}</span>
        <IconButton
          icon={MoreHorizontal}
          label="More"
          size="sm"
          className="invisible size-5 group-hover:visible group-focus-within:visible"
          data-testid={`board-item-more-${item.id}`}
          onClick={(e) => {
            e.stopPropagation();
            cardMenu(ctx, item, projectId, actions, e.currentTarget);
          }}
        />
      </div>
      <p className="line-clamp-3 pr-1 text-sm leading-snug font-medium break-words text-fg">{item.title}</p>
      <div className="flex h-5 items-center gap-1.5 pr-1 text-xs">
        {item.assignedTo ? (
          <span className="min-w-0 flex-1 truncate text-muted">{item.assignedTo}</span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-hint">Unassigned</span>
        )}
        {columnState && columnState !== item.state ? (
          <span className="shrink-0 text-hint">{item.state}</span>
        ) : null}
        {/* Who has it, always in the same slot at the far right (empty when nobody has it). */}
        <PersonAvatar
          name={item.assignedTo}
          email={item.assignedEmail}
          data-testid={`board-item-avatar-${item.id}`}
        />
      </div>
    </div>
  );
}

/** One width for every column (px), set from the header's slider and kept for every project and restart. */
const COLUMN_WIDTH = { min: 200, max: 480, step: 8, initial: 288 };

/**
 * The board: its columns side by side (scrolls sideways), each with its cards (scrolls down). Cards
 * drag between columns; + in a column's header adds a card there. The toolbar's search and filters
 * only hide cards (D-304): every column stays, at its width, and counts "shown/total".
 */
function BoardColumns({
  ctx,
  data,
  projectId,
  width,
  actions,
  moving,
  filter,
  me,
  onNew,
}: {
  ctx: AddonUiContext;
  data: BoardData;
  projectId?: string;
  width: number;
  actions: CardActions;
  /** Cards being moved: id → the column they go to (shown there until the board reloads). */
  moving: Record<number, string>;
  filter: BoardFilter;
  /** Your e-mail, for the @Me filter. */
  me?: string;
  onNew: (column: BoardColumn) => void;
}) {
  const [target, setTarget] = useState<string>();
  const filtering = isFiltering(filter);
  const lanes = placeCards({
    ...data,
    items: data.items.map((i) => (moving[i.id] ? { ...i, column: moving[i.id] } : i)),
  }).map((lane) => ({
    ...lane,
    shown: filtering ? lane.items.filter((i) => matches(i, filter, me)) : lane.items,
  }));
  return (
    <div className="flex h-full gap-3 overflow-x-auto p-3">
      {lanes.map(({ column, items, shown }) => {
        const over = column.itemLimit > 0 && items.length > column.itemLimit;
        return (
          <section
            key={column.id}
            data-testid={`board-column-${column.name}`}
            className={cn(
              "flex h-full shrink-0 flex-col rounded-lg border-2 bg-hover/60",
              target === column.name ? "border-accent" : "border-transparent",
            )}
            style={{ width }}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes("application/x-jig-card")) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setTarget(column.name);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setTarget(undefined);
            }}
            onDrop={(e) => {
              setTarget(undefined);
              const id = Number(e.dataTransfer.getData("application/x-jig-card"));
              const item = data.items.find((i) => i.id === id);
              if (!item) return;
              e.preventDefault();
              actions.move(item, column.name);
            }}
          >
            <header className="flex h-10 shrink-0 items-center gap-2 pr-1.5 pl-3">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{column.name}</span>
              <span
                className={cn("shrink-0 text-xs tabular-nums", over ? "text-warning" : "text-hint")}
                title={
                  filtering
                    ? `${shown.length} of ${items.length} cards match${column.itemLimit > 0 ? ` (WIP limit ${column.itemLimit})` : ""}`
                    : undefined
                }
                data-testid={`board-count-${column.name}`}
              >
                {filtering
                  ? `${shown.length}/${items.length}`
                  : column.itemLimit > 0
                    ? `${items.length}/${column.itemLimit}`
                    : items.length}
              </span>
              <IconButton
                icon={Plus}
                label={`New card in ${column.name}`}
                size="sm"
                data-testid={`board-new-${column.name}`}
                onClick={() => onNew(column)}
              />
            </header>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
              {filtering && shown.length === 0 && items.length > 0 ? (
                <p className="px-1 py-3 text-center text-xs text-hint">No cards match the filters</p>
              ) : null}
              {shown.map((item) => (
                <Card
                  key={item.id}
                  ctx={ctx}
                  item={item}
                  projectId={projectId}
                  columnState={column.stateMappings[item.type]}
                  actions={actions}
                  moving={Boolean(moving[item.id])}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** How the open board's refresh is going, for the toolbar's fixed slot. */
interface BoardStatus {
  refreshing: boolean;
  /** When the cards on screen were fetched. */
  at?: number;
  /** The last refresh failed (the cards on screen are older). */
  error?: string;
  /** The cards on screen: what the toolbar's filters offer. */
  data?: BoardData;
}

/** Cards moved here and not yet seen in their new column (`savedAt`: when Azure DevOps had the move). */
type Moving = Record<number, { column: string; savedAt?: number }>;

/**
 * A board, stale-while-revalidate (D-302): the host's cached cards at once, then a refresh in the
 * background. What lands is merged in place (unchanged cards keep their objects) and waits while a
 * card is being dragged. The spinner is only for a board with nothing cached yet.
 */
function BoardBody({
  ctx,
  board,
  projectId,
  onStatus,
  width,
  filter,
  me,
}: {
  ctx: AddonUiContext;
  board: Board;
  projectId?: string;
  onStatus: (status: BoardStatus) => void;
  width: number;
  filter: BoardFilter;
  me?: string;
}) {
  const key = cacheKey(board);
  const [view, setView] = useState<BoardState>({});
  const [own, setOwn] = useState(0);
  const [hostRefreshing, setHostRefreshing] = useState(false);
  const [open, setOpen] = useState<number>();
  const [adding, setAdding] = useState<BoardColumn>();
  const [moving, setMoving] = useState<Moving>({});
  const dragging = useRef(false);
  const held = useRef<BoardState[]>([]);
  const mounted = useRef(true);

  const apply = useCallback((s: BoardState) => {
    if (!mounted.current) return;
    if (dragging.current) {
      held.current.push(s);
      return;
    }
    setView((v) => {
      // An answer older than the one on screen (the cache arriving after a refresh) is ignored.
      const newer = !!s.data && !(v.at !== undefined && s.at !== undefined && s.at < v.at);
      const data = newer && s.data ? mergeBoard(v.data, s.data) : v.data;
      const at = newer ? (s.at ?? v.at) : v.at;
      if (s.error) return { data, at, error: s.error, signIn: s.signIn };
      if (!newer) return v;
      return data === v.data && at === v.at && !v.error ? v : { data, at };
    });
  }, []);

  const load = useCallback(async () => {
    setOwn((n) => n + 1);
    try {
      apply(await ctx.host.call<BoardState>("refreshBoard", { board }));
    } catch (e) {
      apply({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      if (mounted.current) setOwn((n) => n - 1);
    }
  }, [ctx, board, apply]);

  useEffect(() => {
    mounted.current = true;
    ctx.host.call<BoardState>("cachedBoard", { board }).then(apply, () => undefined);
    void load();
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const again = () => void load();
    window.addEventListener("jig-boards-refresh", again);
    return () => window.removeEventListener("jig-boards-refresh", again);
  }, [load]);
  // The toolbar's New card: in the board's first column.
  useEffect(() => {
    const add = () => {
      const first = view.data?.columns[0];
      if (first && !view.data?.elsewhere) setAdding(first);
    };
    window.addEventListener("jig-boards-new-card", add);
    return () => window.removeEventListener("jig-boards-new-card", add);
  }, [view.data]);
  // Every refresh of this board, whoever started it: the background, a change here or from a chat.
  useAddonEvent("board", (payload) => {
    const e = payload as BoardState & { key?: string; refreshing?: boolean };
    if (e.key !== key) return;
    if (typeof e.refreshing === "boolean") setHostRefreshing(e.refreshing);
    if (e.data || e.error) apply(e);
  });
  // A moved card shows in its new column until Azure DevOps' answer has it there.
  useEffect(() => {
    const data = view.data;
    if (!data) return;
    setMoving((m) => {
      const all = Object.entries(m);
      const keep = all.filter(([id, entry]) => {
        const item = data.items.find((i) => i.id === Number(id));
        if (!item || item.column === entry.column) return false;
        return !(entry.savedAt !== undefined && view.at !== undefined && view.at >= entry.savedAt);
      });
      return keep.length === all.length ? m : Object.fromEntries(keep);
    });
  }, [view.data, view.at]);

  const refreshing = own > 0 || hostRefreshing;
  const shownError = view.data && !view.signIn ? view.error : undefined;
  useEffect(
    () => onStatus({ refreshing, at: view.at, error: shownError, data: view.data }),
    [refreshing, view.at, shownError, view.data, onStatus],
  );

  const fail = (title: string, e: unknown) =>
    ctx.notify({ title, message: e instanceof Error ? e.message : String(e), tone: "danger" });
  const actions: CardActions = {
    open: (item) => setOpen(item.id),
    columns: view.data?.columns.map((c) => c.name) ?? [],
    drag: (on) => {
      dragging.current = on;
      if (on) return;
      const waiting = held.current;
      held.current = [];
      for (const s of waiting) apply(s);
    },
    move: (item, column) => {
      if (item.column === column) return;
      setMoving((m) => ({ ...m, [item.id]: { column } }));
      ctx.host
        .call<{ savedAt: number }>("update", { board, id: item.id, patch: { column } })
        .then(({ savedAt }) => setMoving((m) => (m[item.id] ? { ...m, [item.id]: { column, savedAt } } : m)))
        .catch((e: unknown) => {
          setMoving((m) => {
            const next = { ...m };
            delete next[item.id];
            return next;
          });
          fail(`Couldn't move #${item.id}`, e);
        });
    },
    remove: async (item) => {
      const yes = await ctx.confirm({
        title: `Delete #${item.id}?`,
        message: `"${item.title}" goes to the project's recycle bin in Azure DevOps, where it can be restored.`,
        confirmLabel: "Delete",
        danger: true,
      });
      if (yes)
        await ctx.host
          .call("remove", { board, id: item.id })
          .catch((e: unknown) => fail(`Couldn't delete #${item.id}`, e));
    },
  };
  const data = view.data;
  if (data?.elsewhere) return <InOtherTenant ctx={ctx} board={board} tenant={data.elsewhere.tenant} />;
  // Signed out or expired, or nothing to show: the board says why, as it did before the cache.
  if (view.error && (view.signIn || !data))
    return (
      <Empty
        icon={TriangleAlert}
        title="Couldn't load this board"
        className="h-full"
        actions={
          <Button size="sm" icon={RefreshCw} disabled={refreshing} onClick={() => void load()}>
            Try again
          </Button>
        }
      >
        <p className="whitespace-pre-wrap" data-testid="board-error">
          {view.error}
        </p>
      </Empty>
    );
  if (!data) return <Spinner center className="h-full" />;
  if (data.columns.length === 0)
    return (
      <Empty icon={Kanban} title="This board has no columns" className="h-full">
        Azure DevOps didn't return any columns for it.
      </Empty>
    );
  return (
    <>
      <BoardColumns
        ctx={ctx}
        data={data}
        projectId={projectId}
        width={width}
        actions={actions}
        moving={Object.fromEntries(Object.entries(moving).map(([id, m]) => [id, m.column]))}
        filter={filter}
        me={me}
        onNew={setAdding}
      />
      {open !== undefined ? (
        <CardDialog
          key={open}
          ctx={ctx}
          board={board}
          id={open}
          columns={data.columns}
          columnField={data.columnField}
          projectId={projectId}
          onClose={() => setOpen(undefined)}
          onOpenCard={setOpen}
        />
      ) : null}
      {adding ? (
        <NewCardDialog
          ctx={ctx}
          board={board}
          column={adding}
          columns={data.columns}
          onClose={() => setAdding(undefined)}
        />
      ) : null}
    </>
  );
}

/** The refresh icon, turning while the board refreshes (in the same button, so nothing moves). */
const SpinningRefresh = forwardRef<SVGSVGElement, LucideProps>(function SpinningRefresh(
  { className, ...rest },
  ref,
) {
  return <RefreshCw ref={ref} {...rest} className={cn(className, "animate-spin")} />;
}) as LucideIcon;

/** Your own az login in a sentence, with the name you gave it in Jig ("Your az login" unless renamed). */
const ownAzLogin = (label: string) =>
  label === "Your az login" ? "your own az login" : `${label} (your own az login)`;

/**
 * A board followed in another Azure tenant than the active one (D-282): in the board's own space, one
 * card that says which tenant and switches to it (the whole card is the button). A tenant that was
 * removed since can't be switched to: it says so instead.
 */
function InOtherTenant({ ctx, board, tenant }: { ctx: AddonUiContext; board: Board; tenant: string }) {
  const [switching, setSwitching] = useState(false);
  const tenants = ctx.azure.tenants();
  // Before Jig has read its tenants (just started), the board's own record speaks for it.
  const known =
    tenants.find((t) => t.key === tenant) ??
    (tenants.length
      ? undefined
      : { key: tenant, label: board.tenantLabel ?? tenant, isDefault: tenant === "default" });
  const label = known?.label ?? board.tenantLabel ?? tenant;
  const where = known?.isDefault ? ownAzLogin(label) : `tenant ${label}`;
  if (!known)
    return (
      <Empty icon={Building2} title={`In tenant ${label}`} className="h-full">
        <p data-testid="board-elsewhere">
          That tenant was removed from Jig. Add it again with the tenant avatar at the top right, or remove
          this board.
        </p>
      </Empty>
    );
  return (
    <div className="flex h-full items-center justify-center p-4">
      <button
        type="button"
        disabled={switching}
        data-testid="board-elsewhere"
        onClick={() => {
          setSwitching(true);
          ctx.azure.switchTo(tenant).catch((e: unknown) => {
            setSwitching(false);
            ctx.notify({
              title: "Couldn't switch tenants",
              message: e instanceof Error ? e.message : String(e),
              tone: "danger",
            });
          });
        }}
        className="flex w-full max-w-sm items-center gap-3 rounded-lg border border-line bg-raised p-4 text-left hover:border-line-strong hover:bg-hover disabled:cursor-default"
      >
        {/* The tenant's avatar, as in the top bar (its initials). */}
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
          {known.initials ?? <Building2 className="size-4" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-medium text-fg">In {where}</span>
          <span className="text-xs text-muted">
            {board.org} belongs to another Azure sign-in than the one Jig is using.
          </span>
        </span>
        <span className="flex w-16 shrink-0 justify-end text-sm font-medium text-accent">
          {switching ? <Spinner size="sm" /> : "Switch"}
        </span>
      </button>
    </div>
  );
}

/** Pick boards from your Azure DevOps organisations: organisation, project, then teams' boards. */
function AddBoards({
  followed,
  guess,
  onClose,
  onAdd,
}: {
  followed: Board[];
  /** The Jig project's name: the Azure DevOps project with the same name is picked first. */
  guess?: string;
  onClose: () => void;
  onAdd: (picked: Array<FoundBoard & { org: string; project: string }>) => void;
}) {
  const ctx = useAddon();
  const tenant = ctx.azure.tenant();
  const last = followed.filter((b) => (b.tenant || "default") === tenant.key).at(-1);
  const orgs = useHostCall<string[]>("orgs");
  const [org, setOrg] = useState(last?.org ?? "");
  const projects = useHostCall<string[]>("projects", { org }, { skip: !org });
  const [project, setProject] = useState(last?.project ?? "");
  const found = useHostCall<FoundBoard[]>("boards", { org, project }, { skip: !org || !project });
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!org && orgs.data?.length) setOrg(orgs.data[0] as string);
  }, [org, orgs.data]);
  useEffect(() => {
    const list = projects.data;
    if (!list?.length || list.includes(project)) return;
    const same = list.find((p) => p.toLowerCase() === guess?.toLowerCase());
    setProject(same ?? (list[0] as string));
  }, [project, projects.data, guess]);
  useEffect(() => setPicked(new Set()), [org, project]);

  const key = (b: FoundBoard) => `${b.team}\n${b.boardId}`;
  const isFollowed = (b: FoundBoard) =>
    followed.some(
      (f) => f.org === org && f.project === project && f.boardId === b.boardId && f.team === b.team,
    );
  const teams = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const by = new Map<string, FoundBoard[]>();
    for (const b of found.data ?? []) {
      if (q && !`${b.team} ${b.boardName}`.toLowerCase().includes(q)) continue;
      by.set(b.team, [...(by.get(b.team) ?? []), b]);
    }
    return [...by.entries()];
  }, [found.data, filter]);
  const toggle = (b: FoundBoard) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(key(b))) next.delete(key(b));
      else next.add(key(b));
      return next;
    });
  const chosen = (found.data ?? []).filter((b) => picked.has(key(b)));
  const failure = orgs.error ?? projects.error ?? found.error;

  let list: React.ReactNode;
  if (failure)
    list = (
      <Empty icon={TriangleAlert} title="Couldn't reach Azure DevOps" className="h-full">
        <p className="whitespace-pre-wrap" data-testid="boards-find-error">
          {failure}
        </p>
      </Empty>
    );
  else if (!found.data) list = <Spinner center />;
  else if (teams.length === 0)
    list = (
      <Empty
        icon={Kanban}
        title={filter ? "No boards match" : "No boards in this project"}
        className="h-full"
      />
    );
  else
    list = teams.map(([team, items]) => (
      <div key={team} className="flex flex-col">
        <div className="sticky top-0 z-10 flex h-8 items-center gap-2 bg-elevated px-3 text-xs font-semibold text-muted">
          <Users className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{team}</span>
        </div>
        {items.map((b) => {
          const already = isFollowed(b);
          const on = already || picked.has(key(b));
          return (
            <button
              key={key(b)}
              type="button"
              disabled={already}
              data-testid={`boards-pick-${b.team}-${b.boardName}`}
              onClick={() => toggle(b)}
              className="flex h-8 items-center gap-2.5 pr-3 pl-8 text-left text-sm hover:bg-hover disabled:cursor-default disabled:hover:bg-transparent"
            >
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-sm border",
                  on ? "border-accent bg-accent text-on-accent" : "border-line-strong",
                  already && "opacity-50",
                )}
              >
                {on ? <Check className="size-3" /> : null}
              </span>
              <Kanban className="size-4 shrink-0 text-muted" />
              <span className={cn("min-w-0 flex-1 truncate", already && "text-muted")}>{b.boardName}</span>
              <span className="w-16 shrink-0 text-right text-xs text-hint">{already ? "Added" : ""}</span>
            </button>
          );
        })}
      </div>
    ));

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add boards"
      width="lg"
      testId="boards-dialog"
      footer={
        <>
          <span className="mr-auto text-xs text-hint">
            {tenant.isDefault ? `Uses ${ownAzLogin(tenant.label)}.` : `Uses tenant ${tenant.label}.`} Nothing
            changes in Azure DevOps.
          </span>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={chosen.length === 0}
            data-testid="boards-add-picked"
            onClick={() => onAdd(chosen.map((b) => ({ ...b, org, project })))}
          >
            {chosen.length > 1 ? `Add ${chosen.length} boards` : "Add board"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-muted">Organisation</span>
            <Select
              value={org}
              disabled={!orgs.data?.length}
              data-testid="boards-org"
              onChange={(e) => {
                setOrg(e.target.value);
                setProject("");
              }}
            >
              {!orgs.data?.length ? <option value="">{orgs.error ? "None found" : "Looking…"}</option> : null}
              {(orgs.data ?? []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-muted">Project</span>
            <Select
              value={project}
              disabled={!projects.data?.length}
              data-testid="boards-project"
              onChange={(e) => setProject(e.target.value)}
            >
              {!projects.data?.length ? <option value="">{org ? "Looking…" : ""}</option> : null}
              {(projects.data ?? []).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <SearchInput
          value={filter}
          placeholder="Filter teams and boards"
          onChange={(e) => setFilter(e.target.value)}
          onClear={() => setFilter("")}
        />
        <div className="h-80 overflow-y-auto rounded-md border border-line" data-testid="boards-found">
          {list}
        </div>
      </div>
    </Dialog>
  );
}

/** The boards the active project follows: a tab per board, laid out like Azure DevOps. */
export function BoardsView({ ctx }: AddonComponentProps) {
  const project = useActiveProject();
  const [boards, setBoards] = useStorage<Board[]>("boards", []);
  const [width, setWidth] = useStorage<number>("columnWidth", COLUMN_WIDTH.initial, {
    scope: "global",
  });
  const [selected, setSelected] = useStorage<string | undefined>("selected", undefined);
  const [adding, setAdding] = useState(false);
  const [status, setStatus] = useState<BoardStatus>({ refreshing: false });
  // "updated N min ago" moves on by itself.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const board = boards.find((b) => b.id === selected) ?? boards[0];
  // Another Azure tenant (D-282): the board shows that tenant's cached cards, or where it is.
  const [tenant, setTenant] = useState(() => ctx.azure.tenant().key);
  useJigEvent("azure.tenant", (t) => {
    setTenant(t.key);
    setAdding(false);
  });
  const me = useMemo(() => {
    const user = ctx.azure.tenants().find((t) => t.key === tenant)?.user ?? ctx.azure.tenant().user;
    return user?.includes("@") ? user : undefined;
  }, [ctx, tenant]);

  // Search and filters, per board (D-304): kept in storage; the text is saved a moment after typing.
  const [filters, setFilters] = useStorage<Record<string, unknown>>("filters", {});
  const boardId = board?.id;
  const stored = useMemo(() => readFilter(boardId ? filters[boardId] : undefined), [filters, boardId]);
  const [text, setText] = useState(stored.text);
  useEffect(() => setText(stored.text), [boardId]);
  const latest = useRef({ filters, stored });
  latest.current = { filters, stored };
  const saveFilter = useCallback(
    (next: BoardFilter) => {
      if (!boardId) return;
      const all = { ...latest.current.filters, [boardId]: next };
      latest.current = { filters: all, stored: next };
      void setFilters(all);
    },
    [boardId, setFilters],
  );
  useEffect(() => {
    if (text === latest.current.stored.text) return;
    const timer = setTimeout(() => saveFilter({ ...latest.current.stored, text }), 300);
    return () => clearTimeout(timer);
  }, [text, saveFilter]);
  const filter = useMemo(() => ({ ...stored, text }), [stored, text]);
  const boardFacets = useMemo(
    () => (status.data ? facets(status.data.items, status.data.columns, stored) : undefined),
    [status.data, stored],
  );
  const searchRef = useRef<HTMLInputElement>(null);
  const hasCards = !!board && !!status.data && !status.data.elsewhere;

  const add = (picked: Array<FoundBoard & { org: string; project: string }>) => {
    const all = [...boards];
    const t = ctx.azure.tenant();
    for (const p of picked) {
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      all.push({ id, name: "", ...p, ...(t.isDefault ? {} : { tenant: t.key, tenantLabel: t.label }) });
    }
    const named = all.map((b) => ({ ...b, name: b.name || boardTitle(b) }));
    void setBoards(named);
    void setSelected(named[boards.length]?.id);
    setAdding(false);
  };
  const move = (by: number) => {
    if (!board) return;
    const i = boards.findIndex((b) => b.id === board.id);
    const next = [...boards];
    next.splice(i + by, 0, ...next.splice(i, 1));
    void setBoards(next);
  };
  const boardMenu = (at: HTMLElement) => {
    if (!board) return;
    const i = boards.findIndex((b) => b.id === board.id);
    ctx.menu(
      [
        {
          label: "Open in Azure DevOps",
          icon: "external-link",
          onSelect: () => ctx.openExternal(boardUrl(board)),
        },
        {
          label: "Rename…",
          icon: "pencil",
          testId: "board-rename",
          onSelect: async () => {
            const name = await ctx.prompt({
              title: "Rename board",
              initial: tabName(board),
              confirmLabel: "Rename",
            });
            if (name?.trim())
              void setBoards(boards.map((b) => (b.id === board.id ? { ...b, name: name.trim() } : b)));
          },
        },
        { label: "Move left", icon: "arrow-left", disabled: i <= 0, onSelect: () => move(-1) },
        {
          label: "Move right",
          icon: "arrow-right",
          disabled: i >= boards.length - 1,
          onSelect: () => move(1),
        },
        { separator: true },
        {
          label: "Remove board…",
          icon: "trash-2",
          danger: true,
          testId: "board-remove",
          onSelect: async () => {
            const yes = await ctx.confirm({
              title: `Remove ${tabName(board)}?`,
              message: "This project stops following it; nothing changes in Azure DevOps.",
              confirmLabel: "Remove",
              danger: true,
            });
            if (yes) void setBoards(boards.filter((b) => b.id !== board.id));
          },
        },
      ],
      at,
    );
  };

  return (
    <div
      className="@container flex h-full flex-col outline-none"
      data-testid="boards-view"
      tabIndex={-1}
      onKeyDown={(e) => {
        const typing = (e.target as HTMLElement).closest("input, textarea, select, [contenteditable]");
        const find = (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "f";
        if (!hasCards || !(find || (e.key === "/" && !typing))) return;
        e.preventDefault();
        e.stopPropagation();
        searchRef.current?.focus();
        searchRef.current?.select();
      }}
    >
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line pr-1">
        <div className="min-w-0 flex-1 overflow-x-auto">
          {board ? (
            <Tabs
              className="border-b-0"
              items={boards.map((b) => ({
                id: b.id,
                label: (
                  <span className="whitespace-nowrap" data-testid={`board-tab-${tabName(b)}`}>
                    {tabName(b)}
                  </span>
                ),
              }))}
              value={board.id}
              onChange={(id) => void setSelected(id)}
            />
          ) : (
            <span className="px-3 text-sm text-muted">Boards</span>
          )}
        </div>
        <div className="shrink-0 items-center gap-1.5 px-1 @max-xl:hidden @xl:flex" title="Column width">
          <MoveHorizontal className="size-3.5 text-hint" aria-hidden />
          <input
            type="range"
            aria-label="Column width"
            data-testid="boards-width"
            min={COLUMN_WIDTH.min}
            max={COLUMN_WIDTH.max}
            step={COLUMN_WIDTH.step}
            value={width}
            disabled={!board}
            onChange={(e) => void setWidth(Number(e.target.value))}
            className="jig-range w-24"
          />
        </div>
        <IconButton
          icon={Plus}
          label="Add boards"
          size="sm"
          disabled={!project}
          data-testid="boards-add"
          onClick={() => setAdding(true)}
        />
      </div>
      {/* The board's toolbar (D-304): search and filters on the left, its actions on the right. */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line pr-1 pl-2">
        <FilterBar
          ctx={ctx}
          filter={filter}
          facets={boardFacets}
          disabled={!hasCards}
          me={me}
          searchRef={searchRef}
          onText={setText}
          onChange={(change) => saveFilter(change({ ...latest.current.stored, text }))}
        />
        {/* When the cards were fetched, in a fixed slot (empty until known; hidden when narrow). */}
        <span
          className="w-28 shrink-0 truncate text-right text-xs text-hint @max-6xl:hidden @6xl:block"
          data-testid="board-updated"
        >
          {board && !status.refreshing && status.error
            ? "couldn't refresh"
            : board && status.at
              ? updatedAgo(status.at, now)
              : ""}
        </span>
        {/* Refreshing turns the icon; a failed refresh (older cards on screen) shows a warning there. */}
        <IconButton
          icon={
            board && status.refreshing ? SpinningRefresh : board && status.error ? TriangleAlert : RefreshCw
          }
          label={
            board && status.refreshing
              ? "Refreshing…"
              : board && status.error
                ? `Couldn't refresh: ${status.error}\nClick to try again.`
                : "Refresh"
          }
          size="sm"
          className={board && status.error && !status.refreshing ? "text-warning" : undefined}
          disabled={!board}
          data-testid="board-refresh"
          data-refreshing={board && status.refreshing ? "true" : undefined}
          onClick={() => window.dispatchEvent(new Event("jig-boards-refresh"))}
        />
        <IconButton
          icon={SquarePlus}
          label="New card"
          size="sm"
          disabled={!hasCards || !status.data?.columns.length}
          data-testid="board-new-card"
          onClick={() => window.dispatchEvent(new Event("jig-boards-new-card"))}
        />
        <IconButton
          icon={MoreHorizontal}
          label="Board actions"
          size="sm"
          disabled={!board}
          data-testid="board-more"
          onClick={(e) => boardMenu(e.currentTarget)}
        />
      </div>
      <div className="min-h-0 flex-1">
        {!project ? (
          <Empty icon={Kanban} title="No project open" className="h-full">
            <p className="text-xs text-muted">Boards belong to a project: open one first.</p>
          </Empty>
        ) : board ? (
          <BoardBody
            key={`${tenant}/${board.org}/${board.project}/${board.team}/${board.boardId}`}
            ctx={ctx}
            board={board}
            projectId={project.id}
            onStatus={setStatus}
            width={width}
            filter={filter}
            me={me}
          />
        ) : (
          <Empty
            icon={Kanban}
            title="No boards yet"
            className="h-full"
            actions={
              <Button size="sm" icon={Plus} data-testid="boards-add-first" onClick={() => setAdding(true)}>
                Add boards
              </Button>
            }
          >
            Pick the Azure DevOps boards this project works on; each gets a tab here.
          </Empty>
        )}
      </div>
      {adding ? (
        <AddBoards followed={boards} guess={project?.name} onClose={() => setAdding(false)} onAdd={add} />
      ) : null}
    </div>
  );
}

export function showBoards(ctx: AddonUiContext) {
  ctx.showView("boards");
}
