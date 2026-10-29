import type { AddonComponentProps, AddonProject, AddonUiContext } from "@jig/sdk";
import { Badge, cn, Empty, IconButton, Spinner, useAddon, useProjectList } from "@jig/sdk/ui";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CloudDownload,
  FolderGit2,
  MoreHorizontal,
  RefreshCw,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { RepoState } from "./host";

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
    const timer = setInterval(() => void refresh(ctx), 60_000);
    return () => {
      subscribers.delete(setRepos);
      window.removeEventListener("focus", onFocus);
      clearInterval(timer);
    };
  }, [ctx, key]);
  return { repos, reload: () => refresh(ctx) };
}

async function act(ctx: AddonUiContext, label: string, method: string, path: string) {
  try {
    await ctx.host.call(method, { path });
    ctx.notify({ title: label, tone: "success" });
  } catch (error) {
    ctx.notify({ title: `${label} failed`, message: (error as Error).message, tone: "danger" });
  }
  await refresh(ctx);
}

function RepoRow({ repo, project }: { repo: RepoState; project?: AddonProject }) {
  const ctx = useAddon();
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
  // A repository inside a workspace is offered to other add-ons' menus as a project of its own.
  const target =
    project &&
    (repo.repoPath ? { ...project, path: repo.path, name: repo.name, isGitRepo: true, repos: [] } : project);
  const menu = (at: MouseEvent | HTMLElement) =>
    ctx.menu(
      [
        { label: "Open in Git", icon: "git-branch", onSelect: () => void open() },
        {
          label: "Fetch",
          icon: "cloud-download",
          onSelect: () => void act(ctx, `Fetched ${repo.name}`, "fetch", repo.path),
        },
        {
          label: "Pull",
          icon: "arrow-down-to-line",
          onSelect: () => void act(ctx, `Pulled ${repo.name}`, "pull", repo.path),
        },
        {
          label: "Push",
          icon: "arrow-up-from-line",
          onSelect: () => void act(ctx, `Pushed ${repo.name}`, "push", repo.path),
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
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`repo-${repo.name}`}
      onClick={() => void open()}
      onKeyDown={(e) => e.key === "Enter" && void open()}
      onContextMenu={(e) => {
        e.preventDefault();
        menu(e.nativeEvent);
      }}
      className="group flex cursor-default flex-col gap-0.5 rounded-md px-2 py-1.5 hover:bg-hover"
    >
      <div className="flex items-center gap-1.5 text-sm">
        <span className="min-w-0 flex-1 truncate font-medium">{repo.name}</span>
        {repo.dirty > 0 && <Badge tone="warning">{repo.dirty} changed</Badge>}
        {repo.ahead > 0 && <Badge tone="info">↑{repo.ahead}</Badge>}
        {repo.behind > 0 && <Badge tone="accent">↓{repo.behind}</Badge>}
        <span className="hidden items-center group-hover:flex">
          <IconButton
            icon={CloudDownload}
            size="sm"
            label="Fetch"
            onClick={(e) => {
              e.stopPropagation();
              void act(ctx, `Fetched ${repo.name}`, "fetch", repo.path);
            }}
          />
          <IconButton
            icon={ArrowDownToLine}
            size="sm"
            label="Pull"
            onClick={(e) => {
              e.stopPropagation();
              void act(ctx, `Pulled ${repo.name}`, "pull", repo.path);
            }}
          />
          <IconButton
            icon={ArrowUpFromLine}
            size="sm"
            label="Push"
            onClick={(e) => {
              e.stopPropagation();
              void act(ctx, `Pushed ${repo.name}`, "push", repo.path);
            }}
          />
          <IconButton
            icon={MoreHorizontal}
            size="sm"
            label="More"
            onClick={(e) => {
              e.stopPropagation();
              menu(e.currentTarget);
            }}
          />
        </span>
      </div>
      <div className={cn("flex gap-2 text-xs", repo.error ? "text-danger" : "text-muted")}>
        {repo.error ? (
          <span className="truncate">{repo.error}</span>
        ) : (
          <>
            <span className="truncate">{repo.branch ?? "—"}</span>
            {!repo.upstream && repo.branch && <span className="text-hint">no upstream</span>}
            <span className="ml-auto shrink-0 text-hint">{ago(repo.lastFetch)}</span>
          </>
        )}
      </div>
    </div>
  );
}

export function ReposView({ ctx }: AddonComponentProps) {
  const { repos, reload } = useOverview();
  const projects = useProjectList();
  const [busy, setBusy] = useState(false);
  const active = projects.find((p) => p.id === ctx.projects.active()?.id);
  // The project a repository belongs to: the active one if its folder holds it, else the first one.
  const ownerOf = (r: RepoState) => {
    const folder = ctx.workspaces.list().find((w) => w.id === r.workspaceId)?.path;
    return active?.path === folder ? active : projects.find((p) => p.path === folder);
  };
  if (!repos) return <Spinner className="m-3" />;
  if (repos.length === 0)
    return (
      <Empty icon={FolderGit2} title="No git repositories">
        Projects that are git repositories show up here.
      </Empty>
    );
  return (
    <div className="flex h-full flex-col" data-testid="repos-view">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line px-2 text-xs text-muted">
        <span className="flex-1">{repos.length} repositories</span>
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
        {repos.map((r) => (
          <RepoRow key={r.path} repo={r} project={ownerOf(r)} />
        ))}
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
