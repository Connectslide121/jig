import {
  type AddonComponentProps,
  type AddonProject,
  type AddonUiContext,
  type Arrangement,
  EMPTY_ARRANGEMENT,
} from "@jig/sdk";
import {
  ArrangeList,
  Button,
  cn,
  Empty,
  IconButton,
  Spinner,
  useAddon,
  useProjectList,
  useStorage,
} from "@jig/sdk/ui";
import {
  Check,
  ChevronDown,
  ChevronRight,
  CloudDownload,
  FolderGit2,
  GitBranch,
  ListOrdered,
  MoreHorizontal,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Commits } from "./Commits";
import type { RepoState } from "./host";
import { repoStatus, shortNames } from "./lib/names";

function ago(iso: string | undefined): string {
  if (!iso) return "never fetched";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "fetched just now";
  if (m < 60) return `fetched ${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `fetched ${h} h ago` : `fetched ${Math.round(h / 24)} days ago`;
}

/** Shared overview state so the view and the status bar make one call. */
let cache: RepoState[] | undefined;
const subscribers = new Set<(r: RepoState[]) => void>();
let inflight: Promise<void> | undefined;
function refresh(ctx: AddonUiContext) {
  inflight ??= ctx.host
    .call<RepoState[]>("overview")
    .then((r) => {
      cache = r;
      for (const s of subscribers) s(r);
    })
    .catch(() => {})
    .finally(() => {
      inflight = undefined;
    });
  return inflight;
}

function useOverview() {
  const ctx = useAddon();
  const projects = useProjectList();
  const [repos, setRepos] = useState(cache);
  const key = projects.map((p) => `${p.id}:${p.isGitRepo}`).join(",");
  useEffect(() => {
    subscribers.add(setRepos);
    void refresh(ctx);
    const onFocus = () => void refresh(ctx);
    window.addEventListener("focus", onFocus);
    const timer = setInterval(() => document.visibilityState === "visible" && void refresh(ctx), 60_000);
    return () => {
      subscribers.delete(setRepos);
      window.removeEventListener("focus", onFocus);
      clearInterval(timer);
    };
  }, [ctx, key]);
  return { repos, reload: () => refresh(ctx) };
}

async function act(ctx: AddonUiContext, label: string, method: string, path: string, extra?: object) {
  try {
    await ctx.host.call(method, { path, ...extra });
    ctx.notify({ title: label, tone: "success" });
  } catch (error) {
    ctx.notify({ title: `${label} failed`, message: (error as Error).message, tone: "danger" });
  }
  await refresh(ctx);
}

function RepoRow({
  repo,
  name,
  project,
  expanded,
  onExpand,
  arranging,
}: {
  repo: RepoState;
  name: string;
  project?: AddonProject;
  expanded: boolean;
  onExpand: (open: boolean) => void;
  arranging: boolean;
}) {
  const ctx = useAddon();
  const [syncing, setSyncing] = useState(false);
  // Work in this repository: the project it belongs to (the active one when its folder holds it)
  // becomes active with this repository in focus, and Git shows it.
  const open = async () => {
    if (!project) {
      ctx.notify({
        title: `No project uses ${repo.name.split("/")[0]} yet`,
        message: "Create a project with this folder as its default workspace to work in it from Git.",
        tone: "info",
      });
      return;
    }
    if (ctx.projects.active()?.id !== project.id) await ctx.projects.setActive(project.id);
    if (repo.repoPath) await ctx.projects.setFocusRepo(project.id, repo.repoPath);
    ctx.showView("addon.git.git");
  };
  const sync = async () => {
    setSyncing(true);
    try {
      const did = await ctx.host.call<string>("sync", { path: repo.path });
      ctx.notify({ title: `${name}: ${did}`, tone: "success" });
    } catch (error) {
      ctx.notify({ title: `Couldn't sync ${name}`, message: (error as Error).message, tone: "danger" });
    } finally {
      setSyncing(false);
      await refresh(ctx);
    }
  };
  // A repository inside a workspace is offered to other add-ons' menus as a project of its own.
  const target =
    project &&
    (repo.repoPath ? { ...project, path: repo.path, name: repo.name, isGitRepo: true, repos: [] } : project);
  const menu = (at: MouseEvent | HTMLElement) =>
    ctx.menu(
      [
        {
          label: expanded ? "Hide commits" : "Show commits",
          icon: "git-commit-horizontal",
          onSelect: () => onExpand(!expanded),
        },
        { label: "Open in Git", icon: "git-branch", onSelect: () => void open() },
        { label: "Sync (pull, then push)", icon: "refresh-cw", onSelect: () => void sync() },
        {
          label: "Fetch",
          icon: "cloud-download",
          onSelect: () => void act(ctx, `Fetched ${name}`, "fetch", repo.path),
        },
        {
          label: "Pull",
          icon: "arrow-down-to-line",
          onSelect: () => void act(ctx, `Pulled ${name}`, "pull", repo.path),
        },
        {
          label: "Push",
          icon: "arrow-up-from-line",
          onSelect: () => void act(ctx, `Pushed ${name}`, "push", repo.path),
        },
        {
          label: "New chat in this repository",
          icon: "message-square-plus",
          onSelect: () => void ctx.openChat({ projectId: project?.id, cwd: repo.path }),
        },
        { label: "Open in Explorer", icon: "folder-open", onSelect: () => ctx.openPath(repo.path) },
      ],
      at,
      target ? { slot: "context.repo", project: target } : undefined,
    );
  const status = repoStatus(repo);
  return (
    <div
      data-testid={`repo-${repo.name}`}
      onContextMenu={(e) => {
        e.preventDefault();
        menu(e.nativeEvent);
      }}
      className={cn("group flex flex-col rounded-md px-2", expanded ? "bg-hover" : "hover:bg-hover")}
    >
      <div className="relative flex h-7 items-center gap-1.5 text-sm">
        <span className="relative flex size-3 shrink-0 items-center justify-center">
          <span
            className={cn(
              "size-2 rounded-full",
              DOT[status.tone],
              !arranging && "group-hover:invisible",
              expanded && "invisible",
            )}
            title={status.label}
          />
          {!arranging &&
            (expanded ? (
              <ChevronDown className="absolute size-3.5 text-muted" />
            ) : (
              <ChevronRight className="invisible absolute size-3.5 text-muted group-hover:visible" />
            ))}
        </span>
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left font-medium"
          title={`${repo.path}\n${status.label} · ${ago(repo.lastFetch)}\nClick to show its commits`}
          onClick={() => !arranging && onExpand(!expanded)}
          aria-expanded={expanded}
          data-testid={`repo-toggle-${name}`}
        >
          {name}
        </button>
        {/* Fixed columns, so the pills and branches line up down the list (D-152). */}
        <span className="flex shrink-0 items-center" data-testid={`repo-sync-${name}`}>
          <span className="flex w-9 justify-end">
            {status.changed && (
              <button
                type="button"
                title={`${status.changed} uncommitted changes: open in Git`}
                onClick={() => void open()}
                className="flex cursor-pointer items-center gap-0.5 rounded-full bg-warning-soft px-1.5 text-2xs font-semibold text-warning tabular-nums transition-colors hover:bg-warning hover:text-on-accent"
              >
                <Pencil className="size-2.5" />
                {status.changed}
              </button>
            )}
          </span>
          <span className="ml-1 flex w-12 justify-start">
            {status.sync && (
              <button
                type="button"
                disabled={syncing}
                title={`${status.label}. Sync: pull, then push`}
                onClick={() => void sync()}
                className="cursor-pointer rounded-full bg-accent-soft px-1.5 text-2xs font-semibold whitespace-nowrap text-accent tabular-nums transition-colors hover:bg-accent hover:text-on-accent disabled:cursor-default disabled:opacity-50"
              >
                {syncing ? "…" : status.sync}
              </button>
            )}
          </span>
        </span>
        <span
          className={cn(
            "flex w-1/4 min-w-0 shrink-0 items-center gap-1 text-xs",
            repo.upstream ? "text-muted" : "text-hint",
          )}
          title={repo.upstream ? `${repo.branch} → ${repo.upstream}` : `${repo.branch ?? ""} (no upstream)`}
        >
          <button
            type="button"
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded px-1 text-left hover:bg-hover hover:text-fg"
            title={`${repo.upstream ? `${repo.branch} → ${repo.upstream}` : `${repo.branch ?? ""} (no upstream)`}\nSwitch branch`}
            onClick={(e) => !arranging && void switchBranchMenu(ctx, repo, name, e.currentTarget)}
            data-testid={`repo-branch-${name}`}
          >
            <GitBranch className="size-3 shrink-0" />
            <span className="truncate">{repo.branch ?? "—"}</span>
            <ChevronDown className="size-3 shrink-0" />
          </button>
        </span>
        <IconButton
          icon={MoreHorizontal}
          size="sm"
          label="More"
          className="invisible absolute right-0 bg-hover group-focus-within:visible group-hover:visible"
          onClick={(e) => {
            e.stopPropagation();
            menu(e.currentTarget);
          }}
        />
      </div>
      {repo.error && <div className="truncate pb-1 pl-4 text-xs text-danger">{repo.error}</div>}
      {expanded && !arranging && !repo.error && <Commits ctx={ctx} repo={repo} />}
    </div>
  );
}

async function switchBranchMenu(ctx: AddonUiContext, repo: RepoState, name: string, anchor: HTMLElement) {
  let list: Array<{ name: string; current: boolean; remote: boolean }>;
  try {
    list = await ctx.host.call("branches", { path: repo.path });
  } catch (error) {
    ctx.notify({
      title: `Couldn't list ${name}'s branches`,
      message: (error as Error).message,
      tone: "danger",
    });
    return;
  }
  const item = (b: (typeof list)[number]) => ({
    label: b.name,
    checked: b.current,
    onSelect: () => {
      if (!b.current)
        void act(ctx, `${name}: switched to ${b.name}`, "switchBranch", repo.path, {
          name: b.name,
          remote: b.remote,
        });
    },
  });
  const remote = list.filter((b) => b.remote);
  ctx.menu(
    [
      ...list.filter((b) => !b.remote).map(item),
      ...(remote.length
        ? [
            { separator: true as const },
            { label: "Remote branches", icon: "cloud", submenu: remote.map(item) },
          ]
        : []),
    ],
    anchor,
  );
}

const DOT = {
  success: "bg-success",
  accent: "bg-accent",
  warning: "bg-warning",
  danger: "bg-danger",
} as const;

/**
 * Every repository of every workspace, like the Git plugin (D-143): its short name, a sync chip
 * (pull, then push) and its branch. Arrange hides repositories, drags them into your order and adds
 * dividers (a titled one groups what follows), once for all your projects.
 */
export function ReposView({ ctx }: AddonComponentProps) {
  const { repos, reload } = useOverview();
  const projects = useProjectList();
  const [busy, setBusy] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [arrangement, setArrangement] = useStorage<Arrangement>("arrangement", EMPTY_ARRANGEMENT);
  // The repository whose commits show under its row (one at a time, like the plugin).
  const [expanded, setExpanded] = useState<string>();
  const active = projects.find((p) => p.id === ctx.projects.active()?.id);
  // The project a repository belongs to: the active one if its folder holds it, else the first one.
  const ownerOf = (r: RepoState) => {
    const folder = ctx.workspaces.list().find((w) => w.id === r.workspaceId)?.path;
    return active?.path === folder ? active : projects.find((p) => p.path === folder);
  };
  if (!repos) return <Spinner center />;
  if (repos.length === 0)
    return (
      <Empty icon={FolderGit2} title="No git repositories">
        Projects that are git repositories show up here.
      </Empty>
    );
  const names = shortNames(repos.map((r) => r.path));
  const toPush = repos.filter((r) => r.ahead).length;
  const toPull = repos.filter((r) => r.behind).length;
  const changed = repos.filter((r) => r.dirty).length;

  return (
    <div className="flex h-full flex-col" data-testid="repos-view">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line px-2 text-xs text-muted">
        <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
          <span>{repos.length} repos</span>
          {toPush > 0 && (
            <span className="text-accent" title={`${toPush} with commits to push`}>
              ↑{toPush}
            </span>
          )}
          {toPull > 0 && (
            <span className="text-accent" title={`${toPull} with commits to pull`}>
              ↓{toPull}
            </span>
          )}
          {changed > 0 && (
            <span
              className="flex items-center gap-0.5 text-warning"
              title={`${changed} with uncommitted changes`}
            >
              <Pencil className="size-3" />
              {changed}
            </span>
          )}
        </span>
        <Button
          size="sm"
          variant={arranging ? "primary" : "ghost"}
          icon={arranging ? Check : ListOrdered}
          onClick={() => setArranging(!arranging)}
          data-testid="repos-arrange"
          title="Hide repositories, reorder them, group them with dividers"
        >
          {arranging ? "Done" : "Arrange"}
        </Button>
        <IconButton
          icon={CloudDownload}
          size="sm"
          label="Fetch all"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void fetchAll(ctx).finally(() => setBusy(false));
          }}
        />
        <IconButton icon={RefreshCw} size="sm" label="Refresh" onClick={() => void reload()} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        <ArrangeList
          items={repos}
          keyOf={(r) => r.path}
          arrangement={arrangement}
          onChange={(next) => void setArrangement(next)}
          arranging={arranging}
          testId="repos-list"
          renderItem={(r) => (
            <RepoRow
              repo={r}
              name={names.get(r.path) ?? r.name}
              project={ownerOf(r)}
              expanded={expanded === r.path}
              onExpand={(open) => setExpanded(open ? r.path : undefined)}
              arranging={arranging}
            />
          )}
        />
      </div>
    </div>
  );
}

export function ReposStatus({ ctx }: AddonComponentProps) {
  const { repos } = useOverview();
  const attention = (repos ?? []).filter((r) => r.ahead > 0 || r.behind > 0);
  if (attention.length === 0) return null;
  return (
    <button
      type="button"
      className="hover:text-fg"
      onClick={() => ctx.showView("overview")}
      data-testid="repos-status"
      title={attention.map((r) => r.name).join(", ")}
    >
      {attention.length} to push/pull
    </button>
  );
}

export function showRepos(ctx: AddonUiContext) {
  ctx.showView("overview");
}

export async function fetchAll(ctx: AddonUiContext) {
  const failures = await ctx.host.call<string[]>("fetchAll");
  if (failures.length)
    ctx.notify({ title: "Some repos could not be fetched", message: failures.join("\n"), tone: "warning" });
  else ctx.notify({ title: "Fetched all repos", tone: "success" });
  await refresh(ctx);
}

export async function openInCode(ctx: AddonUiContext, target: { project: AddonProject }) {
  try {
    await ctx.host.call("openInCode", { path: target.project.path });
  } catch (error) {
    ctx.notify({ title: "Couldn't open VS Code", message: (error as Error).message, tone: "warning" });
  }
}

export function openInExplorer(ctx: AddonUiContext, target: { project: AddonProject }) {
  ctx.openPath(target.project.path);
}
