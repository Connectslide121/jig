import type { AddonComponentProps, AddonUiContext } from "@jig/sdk";
import {
  Button,
  cn,
  Dialog,
  Empty,
  IconButton,
  SearchInput,
  Select,
  Spinner,
  Tabs,
  useActiveProject,
  useHostCall,
  useStorage,
} from "@jig/sdk/ui";
import {
  BookOpen,
  Bug,
  Check,
  CircleDot,
  Crown,
  Kanban,
  MoreHorizontal,
  MoveHorizontal,
  Plus,
  RefreshCw,
  SquareCheck,
  TriangleAlert,
  Trophy,
  Users,
} from "lucide-react";
import { type MouseEvent, useEffect, useMemo, useState } from "react";
import {
  type Board,
  type BoardData,
  boardTitle,
  boardUrl,
  chatDraft,
  type FoundBoard,
  initials,
  placeCards,
  type WorkItem,
} from "./lib/boards";

/** A work item type's icon and colour, the same on every board (like Azure DevOps' own colours). */
function typeLook(type: string) {
  const t = type.toLowerCase();
  if (t === "bug") return { Icon: Bug, text: "text-danger", edge: "bg-danger" };
  if (t === "task") return { Icon: SquareCheck, text: "text-warning", edge: "bg-warning" };
  if (t === "epic") return { Icon: Crown, text: "text-accent", edge: "bg-accent" };
  if (t === "feature") return { Icon: Trophy, text: "text-success", edge: "bg-success" };
  if (t.includes("story") || t.includes("backlog") || t === "requirement")
    return { Icon: BookOpen, text: "text-info", edge: "bg-info" };
  return { Icon: CircleDot, text: "text-muted", edge: "bg-line-strong" };
}

function cardMenu(
  ctx: AddonUiContext,
  item: WorkItem,
  projectId: string | undefined,
  at: MouseEvent | HTMLElement,
) {
  ctx.menu(
    [
      { label: "Open in Azure DevOps", icon: "external-link", onSelect: () => ctx.openExternal(item.url) },
      {
        label: "Start a chat about it",
        icon: "message-square-plus",
        testId: "board-item-chat",
        onSelect: () => void ctx.openChat({ projectId, draft: chatDraft(item) }),
      },
      { separator: true },
      { label: "Copy link", icon: "link", onSelect: () => ctx.copy(item.url) },
      { label: `Copy #${item.id}`, icon: "hash", onSelect: () => ctx.copy(`#${item.id}`) },
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
}: {
  ctx: AddonUiContext;
  item: WorkItem;
  /** The state this column maps the item's type to: the card shows its state only when it differs. */
  columnState?: string;
  projectId?: string;
}) {
  const { Icon, text, edge } = typeLook(item.type);
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`board-item-${item.id}`}
      title={`${item.type} #${item.id}: ${item.title}`}
      onClick={() => ctx.openExternal(item.url)}
      onKeyDown={(e) => e.key === "Enter" && ctx.openExternal(item.url)}
      onContextMenu={(e) => {
        e.preventDefault();
        cardMenu(ctx, item, projectId, e);
      }}
      className={cn(
        "group relative flex shrink-0 cursor-pointer flex-col gap-1.5 overflow-hidden rounded-md border border-line bg-elevated py-2 pr-1.5 pl-3.5 shadow-sm",
        "transition-colors hover:border-line-strong focus-visible:border-focus focus-visible:outline-none",
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
            cardMenu(ctx, item, projectId, e.currentTarget);
          }}
        />
      </div>
      <p className="line-clamp-3 pr-1 text-sm leading-snug font-medium break-words text-fg">{item.title}</p>
      <div className="flex h-5 items-center gap-1.5 pr-1 text-xs">
        {item.assignedTo ? (
          <>
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-2xs font-semibold text-accent">
              {initials(item.assignedTo)}
            </span>
            <span className="min-w-0 flex-1 truncate text-muted">{item.assignedTo}</span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-hint">Unassigned</span>
        )}
        {columnState && columnState !== item.state ? (
          <span className="shrink-0 text-hint">{item.state}</span>
        ) : null}
      </div>
    </div>
  );
}

/** One width for every column (px), set from the header's slider and kept per project. */
const COLUMN_WIDTH = { min: 200, max: 480, step: 8, initial: 288 };

/** The board: its columns side by side (scrolls sideways), each with its cards (scrolls down). */
function BoardColumns({
  ctx,
  data,
  projectId,
  stale,
  width,
}: {
  ctx: AddonUiContext;
  data: BoardData;
  projectId?: string;
  stale: boolean;
  width: number;
}) {
  const lanes = placeCards(data);
  return (
    <div className={cn("flex h-full gap-3 overflow-x-auto p-3 transition-opacity", stale && "opacity-60")}>
      {lanes.map(({ column, items }) => {
        const over = column.itemLimit > 0 && items.length > column.itemLimit;
        return (
          <section
            key={column.id}
            data-testid={`board-column-${column.name}`}
            className="flex h-full shrink-0 flex-col rounded-lg bg-hover/60"
            style={{ width }}
          >
            <header className="flex h-10 shrink-0 items-center gap-2 px-3">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{column.name}</span>
              <span className={cn("shrink-0 text-xs tabular-nums", over ? "text-warning" : "text-hint")}>
                {column.itemLimit > 0 ? `${items.length}/${column.itemLimit}` : items.length}
              </span>
            </header>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
              {items.map((item) => (
                <Card
                  key={item.id}
                  ctx={ctx}
                  item={item}
                  projectId={projectId}
                  columnState={column.stateMappings[item.type]}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function BoardBody({
  ctx,
  board,
  projectId,
  onLoading,
  width,
}: {
  ctx: AddonUiContext;
  board: Board;
  projectId?: string;
  onLoading: (loading: boolean) => void;
  width: number;
}) {
  const { data, error, loading, reload } = useHostCall<BoardData>("board", { board });
  useEffect(() => onLoading(loading), [loading, onLoading]);
  useEffect(() => {
    const again = () => void reload();
    window.addEventListener("jig-boards-refresh", again);
    return () => window.removeEventListener("jig-boards-refresh", again);
  }, [reload]);
  if (error && !data)
    return (
      <Empty icon={TriangleAlert} title="Couldn't load this board" className="h-full">
        <p className="max-w-sm text-xs whitespace-pre-wrap text-muted" data-testid="board-error">
          {error}
        </p>
        <Button size="sm" icon={RefreshCw} onClick={() => void reload()}>
          Try again
        </Button>
      </Empty>
    );
  if (!data) return <Spinner center />;
  if (data.columns.length === 0)
    return (
      <Empty icon={Kanban} title="This board has no columns" className="h-full">
        <p className="text-xs text-muted">Azure DevOps didn't return any columns for it.</p>
      </Empty>
    );
  return <BoardColumns ctx={ctx} data={data} projectId={projectId} stale={loading} width={width} />;
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
  const last = followed[followed.length - 1];
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
        <p className="max-w-sm text-xs whitespace-pre-wrap text-muted" data-testid="boards-find-error">
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
            Uses your own az login. Nothing changes in Azure DevOps.
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
  const [width, setWidth] = useStorage<number>("columnWidth", COLUMN_WIDTH.initial);
  const [selected, setSelected] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const board = boards.find((b) => b.id === selected) ?? boards[0];

  const add = (picked: Array<FoundBoard & { org: string; project: string }>) => {
    const all = [...boards];
    for (const p of picked) {
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      all.push({ id, name: "", ...p });
    }
    const teams = new Set(all.map((b) => `${b.org}/${b.project}/${b.team}`)).size;
    // Names follow the set: the team joins the name once boards of several teams are followed.
    const named = all.map((b) => ({ ...b, name: b.name || boardTitle(b, teams) }));
    void setBoards(named);
    setSelected(named[boards.length]?.id);
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
              initial: board.name,
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
              title: `Remove ${board.name}?`,
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
    <div className="flex h-full flex-col" data-testid="boards-view">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line pr-1">
        <div className="min-w-0 flex-1 overflow-x-auto">
          {board ? (
            <Tabs
              className="border-b-0"
              items={boards.map((b) => ({
                id: b.id,
                label: <span data-testid={`board-tab-${b.name}`}>{b.name}</span>,
              }))}
              value={board.id}
              onChange={setSelected}
            />
          ) : (
            <span className="px-3 text-sm text-muted">Boards</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 px-1" title="Column width">
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
            className="w-24 accent-accent disabled:opacity-40"
          />
        </div>
        <span className="flex size-7 shrink-0 items-center justify-center">
          {loading && board ? (
            <Spinner size="sm" />
          ) : (
            <IconButton
              icon={RefreshCw}
              label="Refresh"
              size="sm"
              disabled={!board}
              onClick={() => window.dispatchEvent(new Event("jig-boards-refresh"))}
            />
          )}
        </span>
        <IconButton
          icon={Plus}
          label="Add boards"
          size="sm"
          disabled={!project}
          data-testid="boards-add"
          onClick={() => setAdding(true)}
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
            key={`${board.org}/${board.project}/${board.team}/${board.boardId}`}
            ctx={ctx}
            board={board}
            projectId={project.id}
            onLoading={setLoading}
            width={width}
          />
        ) : (
          <Empty icon={Kanban} title="No boards yet" className="h-full">
            <p className="max-w-xs text-xs text-muted">
              Pick the Azure DevOps boards this project works on; each gets a tab here.
            </p>
            <Button size="sm" icon={Plus} data-testid="boards-add-first" onClick={() => setAdding(true)}>
              Add boards
            </Button>
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
