import type {
  AddonComponentProps,
  AddonProject,
  AddonTabProps,
  AddonUiContext,
  MenuItemInput,
} from "@jig/sdk";
import {
  Badge,
  Button,
  cn,
  Empty,
  IconButton,
  Input,
  SectionTitle,
  Spinner,
  Textarea,
  useActiveProject,
  useAddon,
  useAddonEvent,
  useHostCall,
  useProjectList,
  VirtualList,
} from "@jig/sdk/ui";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  ChevronRight,
  CloudDownload,
  Copy,
  ExternalLink,
  GitBranch,
  GitCompare,
  History,
  Minus,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DiffView } from "./DiffView";
import {
  type Branch,
  type Commit,
  commitUrl,
  type FileChange,
  type NumstatEntry,
  relativeTime,
  type Status,
} from "./lib/parse";

// ------------------------------------------------------------------------------------------------
// helpers

const short = (path: string) => path.split("/").pop() ?? path;
const folder = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

async function run(
  ctx: AddonUiContext,
  label: string,
  method: string,
  args: Record<string, unknown>,
  quiet = false,
) {
  try {
    const result = await ctx.host.call(method, args);
    if (!quiet) ctx.notify({ title: label, tone: "success" });
    return result;
  } catch (error) {
    ctx.notify({ title: `${label} failed`, message: (error as Error).message, tone: "danger" });
    return undefined;
  }
}

function useProject(projectId: unknown): AddonProject | undefined {
  const list = useProjectList();
  return list.find((p) => p.id === projectId);
}

/** Refreshes `reload` whenever git state changes in `cwd` (watcher) or the window regains focus. */
function useLiveRefresh(cwd: string | undefined, reload: () => void) {
  const ctx = useAddon();
  useEffect(() => {
    if (!cwd) return;
    void ctx.host.call("watchRepo", { cwd }).catch(() => {});
    const onFocus = () => reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [cwd, ctx, reload]);
  useAddonEvent("changed", (payload) => {
    if ((payload as { cwd?: string })?.cwd === cwd) reload();
  });
}

const KIND_LETTER: Record<FileChange["kind"], string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  renamed: "R",
  copied: "C",
  typechange: "T",
  unmerged: "U",
  untracked: "U",
};
const KIND_TONE: Record<FileChange["kind"], string> = {
  modified: "text-warning",
  added: "text-success",
  deleted: "text-danger",
  renamed: "text-info",
  copied: "text-info",
  typechange: "text-warning",
  unmerged: "text-danger",
  untracked: "text-success",
};

// ------------------------------------------------------------------------------------------------
// Sidebar view

type Group = "staged" | "unstaged" | "untracked" | "conflicted";

function FileRow({
  ctx,
  project,
  change,
  group,
  onChanged,
}: {
  ctx: AddonUiContext;
  project: AddonProject;
  change: FileChange;
  group: Group;
  onChanged: () => void;
}) {
  const cwd = project.path;
  const open = () =>
    ctx.openTab("diff", {
      projectId: project.id,
      path: change.path,
      staged: group === "staged",
      untracked: group === "untracked",
      title: short(change.path),
    });
  const stage = () => void run(ctx, "Staged", "stage", { cwd, paths: [change.path] }, true).then(onChanged);
  const unstage = () =>
    void run(ctx, "Unstaged", "unstage", { cwd, paths: [change.path] }, true).then(onChanged);
  const discard = async () => {
    const ok = await ctx.confirm({
      title:
        group === "untracked" ? `Delete ${short(change.path)}?` : `Discard changes to ${short(change.path)}?`,
      message:
        group === "untracked"
          ? "The file is not in git, so it can't be recovered."
          : "Your changes in this file are lost.",
      confirmLabel: group === "untracked" ? "Delete" : "Discard",
      danger: true,
    });
    if (ok)
      await run(
        ctx,
        "Discarded",
        "discard",
        { cwd, paths: [change.path], untracked: group === "untracked" },
        true,
      );
    onChanged();
  };
  const menu: MenuItemInput[] = [
    { label: "Open diff", icon: "file-diff", onSelect: open },
    group === "staged"
      ? { label: "Unstage", icon: "minus", onSelect: unstage }
      : { label: "Stage", icon: "plus", onSelect: stage },
    ...(group !== "staged"
      ? [
          {
            label: group === "untracked" ? "Delete file…" : "Discard changes…",
            icon: "undo-2",
            danger: true,
            onSelect: () => void discard(),
          },
        ]
      : []),
    { label: "Copy path", icon: "copy", onSelect: () => ctx.copy(change.path) },
    { label: "Open file", icon: "external-link", onSelect: () => ctx.openPath(`${cwd}/${change.path}`) },
  ];
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`git-file-${group}-${change.path}`}
      onClick={open}
      onKeyDown={(e) => e.key === "Enter" && open()}
      onContextMenu={(e) => {
        e.preventDefault();
        ctx.menu(menu, e.nativeEvent, { slot: "context.file", project, path: change.path });
      }}
      className="group flex h-6 cursor-default items-center gap-1.5 rounded-md px-2 text-xs hover:bg-hover"
      title={change.origPath ? `${change.origPath} → ${change.path}` : change.path}
    >
      <span className="min-w-0 truncate text-fg">{short(change.path)}</span>
      <span className="min-w-0 flex-1 truncate text-hint">{folder(change.path)}</span>
      <span className="hidden items-center group-hover:flex">
        {group !== "staged" && (
          <IconButton
            icon={Undo2}
            size="sm"
            label="Discard"
            onClick={(e) => (e.stopPropagation(), void discard())}
          />
        )}
        {group === "staged" ? (
          <IconButton
            icon={Minus}
            size="sm"
            label="Unstage"
            data-testid="git-unstage"
            onClick={(e) => (e.stopPropagation(), unstage())}
          />
        ) : (
          <IconButton
            icon={Plus}
            size="sm"
            label="Stage"
            data-testid="git-stage"
            onClick={(e) => (e.stopPropagation(), stage())}
          />
        )}
      </span>
      <span className={cn("w-3 shrink-0 text-center font-mono font-semibold", KIND_TONE[change.kind])}>
        {KIND_LETTER[change.kind]}
      </span>
    </div>
  );
}

function ChangeGroup({
  title,
  changes,
  group,
  project,
  onChanged,
  actions,
}: {
  title: string;
  changes: FileChange[];
  group: Group;
  project: AddonProject;
  onChanged: () => void;
  actions?: React.ReactNode;
}) {
  const ctx = useAddon();
  const [open, setOpen] = useState(true);
  if (changes.length === 0) return null;
  return (
    <div>
      <div className="group flex h-6 items-center gap-1 px-1 text-2xs font-semibold tracking-wide text-hint uppercase">
        <button
          type="button"
          className="flex flex-1 items-center gap-1 text-left"
          onClick={() => setOpen(!open)}
        >
          {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          {title}
          <span className="font-normal">{changes.length}</span>
        </button>
        {actions}
      </div>
      {open &&
        changes.map((c) => (
          <FileRow
            key={`${group}:${c.path}`}
            ctx={ctx}
            project={project}
            change={c}
            group={group}
            onChanged={onChanged}
          />
        ))}
    </div>
  );
}

function branchMenu(
  ctx: AddonUiContext,
  project: AddonProject,
  branch: Branch,
  reload: () => void,
): MenuItemInput[] {
  const cwd = project.path;
  return [
    {
      label: "History",
      icon: "history",
      onSelect: () =>
        ctx.openTab("history", { projectId: project.id, ref: branch.name, title: `History: ${branch.name}` }),
    },
    ...(!branch.current
      ? [
          {
            label: "Switch to this branch",
            icon: "git-branch",
            onSelect: () =>
              void run(ctx, `Switched to ${branch.name}`, "switchBranch", {
                cwd,
                name: branch.name,
                remote: branch.remote,
              }).then(reload),
          },
          {
            label: "Compare with current",
            icon: "git-compare",
            onSelect: () =>
              ctx.openTab("compare", {
                projectId: project.id,
                branch: branch.name,
                title: `Compare: ${branch.name}`,
              }),
          },
        ]
      : []),
    {
      label: "Create branch from here…",
      icon: "git-branch-plus",
      onSelect: async () => {
        const name = await ctx.prompt({ title: `New branch from ${branch.name}`, confirmLabel: "Create" });
        if (name) await run(ctx, `Created ${name}`, "createBranch", { cwd, name, from: branch.name });
        reload();
      },
    },
    { label: "Copy name", icon: "copy", onSelect: () => ctx.copy(branch.name) },
  ];
}

function BranchList({
  project,
  branches,
  reload,
}: {
  project: AddonProject;
  branches: Branch[];
  reload: () => void;
}) {
  const ctx = useAddon();
  const [showRemote, setShowRemote] = useState(false);
  const local = branches.filter((b) => !b.remote);
  const remote = branches.filter((b) => b.remote);
  const row = (b: Branch) => (
    <div
      key={b.ref}
      role="button"
      tabIndex={0}
      data-testid={`git-branch-${b.name}`}
      onClick={() =>
        ctx.openTab("history", { projectId: project.id, ref: b.name, title: `History: ${b.name}` })
      }
      onKeyDown={(e) => e.key === "Enter" && ctx.openTab("history", { projectId: project.id, ref: b.name })}
      onContextMenu={(e) => {
        e.preventDefault();
        ctx.menu(branchMenu(ctx, project, b, reload), e.nativeEvent);
      }}
      className="group flex h-6 cursor-default items-center gap-1.5 rounded-md px-2 text-xs hover:bg-hover"
    >
      <GitBranch className={cn("size-3.5 shrink-0", b.current ? "text-accent" : "text-hint")} />
      <span className={cn("min-w-0 flex-1 truncate", b.current ? "font-medium text-fg" : "text-fg")}>
        {b.name}
      </span>
      {b.gone && <Badge tone="warning">gone</Badge>}
      {b.ahead > 0 && <span className="text-2xs text-muted">↑{b.ahead}</span>}
      {b.behind > 0 && <span className="text-2xs text-muted">↓{b.behind}</span>}
      <IconButton
        icon={MoreHorizontal}
        size="sm"
        label="Branch options"
        className="hidden size-5 group-hover:inline-flex"
        onClick={(e) => {
          e.stopPropagation();
          ctx.menu(branchMenu(ctx, project, b, reload), e.currentTarget);
        }}
      />
    </div>
  );
  return (
    <div>
      <SectionTitle>Branches</SectionTitle>
      <div className="px-1">{local.map(row)}</div>
      {remote.length > 0 && (
        <button
          type="button"
          className="flex h-6 items-center gap-1 px-3 text-xs text-muted hover:text-fg"
          onClick={() => setShowRemote(!showRemote)}
        >
          {showRemote ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />} Remote (
          {remote.length})
        </button>
      )}
      {showRemote && <div className="px-1">{remote.map(row)}</div>}
    </div>
  );
}

function CommitBox({
  project,
  status,
  reload,
}: {
  project: AddonProject;
  status: Status;
  reload: () => void;
}) {
  const ctx = useAddon();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const staged = status.staged.length;
  const commit = async () => {
    setBusy(true);
    if (staged === 0) await run(ctx, "Staged everything", "stage", { cwd: project.path, paths: ["."] }, true);
    const ok = await run(ctx, "Committed", "commit", { cwd: project.path, message });
    setBusy(false);
    if (ok !== undefined) setMessage("");
    reload();
  };
  return (
    <div className="flex flex-col gap-1.5 px-2 pb-2">
      <Textarea
        rows={2}
        value={message}
        placeholder={`Message (commit on ${status.branch.head ?? "HEAD"})`}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && message.trim()) void commit();
        }}
        data-testid="git-commit-message"
      />
      <Button
        variant="primary"
        size="sm"
        icon={Check}
        busy={busy}
        disabled={!message.trim()}
        onClick={() => void commit()}
        data-testid="git-commit"
      >
        {staged > 0 ? `Commit ${staged} staged` : "Commit all changes"}
      </Button>
    </div>
  );
}

export function GitView({ ctx }: AddonComponentProps) {
  const project = useActiveProject();
  const cwd = project?.path;
  const st = useHostCall<Status>("status", { cwd }, { skip: !cwd || !project?.isGitRepo });
  const br = useHostCall<Branch[]>("branches", { cwd }, { skip: !cwd || !project?.isGitRepo });
  const reload = useMemo(
    () => () => {
      void st.reload();
      void br.reload();
    },
    [st.reload, br.reload],
  );
  useLiveRefresh(project?.isGitRepo ? cwd : undefined, reload);
  if (!project)
    return (
      <Empty icon={GitBranch} title="No project">
        Pick a project in the top bar.
      </Empty>
    );
  if (!project.isGitRepo) return <Empty icon={GitBranch} title={`${project.name} is not a git repository`} />;
  if (st.error) return <div className="p-3 text-xs text-danger">{st.error}</div>;
  const status = st.data;
  if (!status) return <Spinner className="m-3" />;
  const b = status.branch;
  const changes =
    status.staged.length + status.unstaged.length + status.untracked.length + status.conflicted.length;
  return (
    <div className="flex h-full flex-col" data-testid="git-view">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line px-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-sm hover:bg-hover"
          onClick={(e) => void switchBranchMenu(ctx, project, e.currentTarget, reload)}
          data-testid="git-current-branch"
          title="Switch branch"
        >
          <GitBranch className="size-4 shrink-0 text-accent" />
          <span className="truncate font-medium">{b.head ?? "—"}</span>
          {b.ahead > 0 && <span className="text-xs text-muted">↑{b.ahead}</span>}
          {b.behind > 0 && <span className="text-xs text-muted">↓{b.behind}</span>}
        </button>
        <IconButton
          icon={CloudDownload}
          size="sm"
          label="Fetch"
          onClick={() => void run(ctx, "Fetched", "fetch", { cwd }).then(reload)}
        />
        <IconButton
          icon={ArrowDownToLine}
          size="sm"
          label="Pull"
          onClick={() => void run(ctx, "Pulled", "pull", { cwd }).then(reload)}
        />
        <IconButton
          icon={ArrowUpFromLine}
          size="sm"
          label="Push"
          onClick={() => void run(ctx, "Pushed", "push", { cwd }).then(reload)}
        />
        <IconButton
          icon={History}
          size="sm"
          label="History"
          onClick={() =>
            ctx.openTab("history", {
              projectId: project.id,
              ref: b.head ?? "HEAD",
              title: `History: ${b.head ?? "HEAD"}`,
            })
          }
        />
        <IconButton icon={RefreshCw} size="sm" label="Refresh" onClick={reload} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {changes > 0 ? (
          <CommitBox project={project} status={status} reload={reload} />
        ) : (
          <div className="px-3 py-2 text-xs text-muted">No changes.</div>
        )}
        <div className="px-1">
          <ChangeGroup
            title="Conflicts"
            changes={status.conflicted}
            group="conflicted"
            project={project}
            onChanged={reload}
          />
          <ChangeGroup
            title="Staged"
            changes={status.staged}
            group="staged"
            project={project}
            onChanged={reload}
            actions={
              <IconButton
                icon={Minus}
                size="sm"
                label="Unstage all"
                onClick={() =>
                  void run(
                    ctx,
                    "Unstaged",
                    "unstage",
                    { cwd, paths: status.staged.map((c) => c.path) },
                    true,
                  ).then(reload)
                }
              />
            }
          />
          <ChangeGroup
            title="Changes"
            changes={status.unstaged}
            group="unstaged"
            project={project}
            onChanged={reload}
            actions={
              <IconButton
                icon={Plus}
                size="sm"
                label="Stage all"
                onClick={() =>
                  void run(
                    ctx,
                    "Staged",
                    "stage",
                    { cwd, paths: status.unstaged.map((c) => c.path) },
                    true,
                  ).then(reload)
                }
              />
            }
          />
          <ChangeGroup
            title="Untracked"
            changes={status.untracked}
            group="untracked"
            project={project}
            onChanged={reload}
            actions={
              <IconButton
                icon={Plus}
                size="sm"
                label="Stage all"
                onClick={() =>
                  void run(
                    ctx,
                    "Staged",
                    "stage",
                    { cwd, paths: status.untracked.map((c) => c.path) },
                    true,
                  ).then(reload)
                }
              />
            }
          />
        </div>
        {br.data && <BranchList project={project} branches={br.data} reload={reload} />}
      </div>
    </div>
  );
}

async function switchBranchMenu(
  ctx: AddonUiContext,
  project: AddonProject,
  at: HTMLElement,
  reload?: () => void,
) {
  const list = await ctx.host.call<Branch[]>("branches", { cwd: project.path });
  const local = list.filter((b) => !b.remote);
  const remote = list.filter((b) => b.remote && !local.some((l) => l.upstream === b.name));
  ctx.menu(
    [
      ...local.map((b) => ({
        label: b.name,
        checked: b.current,
        onSelect: () =>
          void (b.current
            ? undefined
            : run(ctx, `Switched to ${b.name}`, "switchBranch", { cwd: project.path, name: b.name }).then(
                reload,
              )),
      })),
      ...(remote.length
        ? [
            { separator: true as const },
            {
              label: "Remote branches",
              icon: "cloud",
              submenu: remote.map((b) => ({
                label: b.name,
                onSelect: () =>
                  void run(ctx, `Switched to ${b.name}`, "switchBranch", {
                    cwd: project.path,
                    name: b.name,
                    remote: true,
                  }).then(reload),
              })),
            },
          ]
        : []),
      { separator: true },
      {
        label: "Create branch…",
        icon: "git-branch-plus",
        onSelect: () => void createBranch(ctx).then(reload),
      },
    ],
    at,
  );
}

// ------------------------------------------------------------------------------------------------
// Status bar

export function BranchStatus({ ctx }: AddonComponentProps) {
  const project = useActiveProject();
  const st = useHostCall<Status>("status", { cwd: project?.path }, { skip: !project?.isGitRepo });
  useLiveRefresh(project?.isGitRepo ? project.path : undefined, st.reload);
  if (!project?.isGitRepo || !st.data) return null;
  const b = st.data.branch;
  return (
    <button
      type="button"
      className="flex items-center gap-1 hover:text-fg"
      onClick={() => ctx.showView("git")}
      data-testid="git-status-branch"
    >
      <GitBranch className="size-3" /> {b.head}
      {b.ahead > 0 && <span>↑{b.ahead}</span>}
      {b.behind > 0 && <span>↓{b.behind}</span>}
    </button>
  );
}

// ------------------------------------------------------------------------------------------------
// History tab

function CommitRow({ ctx, project, commit }: { ctx: AddonUiContext; project: AddonProject; commit: Commit }) {
  const open = () => ctx.openTab("commit", { projectId: project.id, hash: commit.hash, title: commit.short });
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`git-commit-${commit.short}`}
      onClick={open}
      onKeyDown={(e) => e.key === "Enter" && open()}
      onContextMenu={(e) => {
        e.preventDefault();
        ctx.menu(commitMenu(ctx, project, commit), e.nativeEvent);
      }}
      className="flex h-full cursor-default items-center gap-3 border-b border-line px-4 text-sm hover:bg-hover"
    >
      <span className="min-w-0 flex-1 truncate">
        {commit.refs?.map((r) => (
          <Badge
            key={r}
            tone={r.startsWith("tag:") ? "warning" : r.includes("/") ? "info" : "accent"}
            className="mr-1"
          >
            {r}
          </Badge>
        ))}
        {commit.subject}
      </span>
      <span className="w-36 shrink-0 truncate text-xs text-muted">{commit.author}</span>
      <span
        className="w-28 shrink-0 truncate text-xs text-muted"
        title={new Date(commit.date).toLocaleString()}
      >
        {relativeTime(commit.date)}
      </span>
      <span className="w-16 shrink-0 font-mono text-xs text-hint">{commit.short}</span>
    </div>
  );
}

function commitMenu(ctx: AddonUiContext, project: AddonProject, commit: Commit): MenuItemInput[] {
  return [
    {
      label: "Show commit",
      icon: "git-commit-horizontal",
      onSelect: () =>
        ctx.openTab("commit", { projectId: project.id, hash: commit.hash, title: commit.short }),
    },
    { label: "Copy hash", icon: "copy", onSelect: () => ctx.copy(commit.hash) },
    {
      label: "Open on the remote",
      icon: "external-link",
      onSelect: () => void openOnRemote(ctx, project, commit),
    },
  ];
}

async function openOnRemote(ctx: AddonUiContext, project: AddonProject, commit: Commit) {
  const remote = await ctx.host.call<string | undefined>("remoteUrl", { cwd: project.path });
  const url = remote && commitUrl(remote, commit.hash);
  if (url) ctx.openExternal(url);
  else ctx.notify({ title: "No GitHub or Azure DevOps remote found", tone: "warning" });
}

const PAGE = 200;

export function HistoryTab({ ctx, params }: AddonTabProps) {
  const project = useProject(params.projectId);
  const ref = String(params.ref ?? "HEAD");
  const [filter, setFilter] = useState("");
  const [applied, setApplied] = useState("");
  const [commits, setCommits] = useState<Commit[]>([]);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const load = async (reset: boolean) => {
    if (!project || loading || (done && !reset)) return;
    setLoading(true);
    try {
      const skip = reset ? 0 : commits.length;
      const page = await ctx.host.call<Commit[]>("log", {
        cwd: project.path,
        ref,
        skip,
        limit: PAGE,
        filter: applied,
      });
      setCommits((c) => (reset ? page : [...c, ...page]));
      setDone(page.length < PAGE);
      setError(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload when the branch or filter changes.
  useEffect(() => {
    setDone(false);
    void load(true);
  }, [project?.path, ref, applied]);
  useEffect(() => {
    const t = setTimeout(() => setApplied(filter), 300);
    return () => clearTimeout(t);
  }, [filter]);
  if (!project) return <Empty title="Project not found" />;
  return (
    <div className="flex h-full flex-col" data-testid="git-history">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-4">
        <History className="size-4 text-muted" />
        <span className="text-sm font-medium">{ref}</span>
        <span className="text-xs text-muted">{project.name}</span>
        <div className="flex-1" />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by message or author"
          className="w-72"
          data-testid="git-history-filter"
        />
      </div>
      {error && <div className="p-4 text-sm text-danger">{error}</div>}
      {!error && commits.length === 0 && !loading && (
        <Empty title={applied ? "No commits match" : "No commits"} />
      )}
      <VirtualList
        items={commits}
        rowHeight={32}
        className="min-h-0 flex-1"
        onEndReached={() => void load(false)}
        renderRow={(commit) => <CommitRow ctx={ctx} project={project} commit={commit} />}
      />
      {loading && <Spinner className="m-2" />}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// Commit tab

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-4">
      <span className="w-20 shrink-0 text-muted">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

export function CommitTab({ ctx, params }: AddonTabProps) {
  const project = useProject(params.projectId);
  const hash = String(params.hash ?? "");
  const { data, error } = useHostCall<{ commit: Commit; files: NumstatEntry[] }>(
    "show",
    { cwd: project?.path, hash },
    { skip: !project },
  );
  if (!project) return <Empty title="Project not found" />;
  if (error) return <div className="p-6 text-sm text-danger">{error}</div>;
  if (!data) return <Spinner className="m-6" />;
  const { commit, files } = data;
  const added = files.reduce((n, f) => n + (f.added ?? 0), 0);
  const deleted = files.reduce((n, f) => n + (f.deleted ?? 0), 0);
  return (
    <div className="h-full overflow-y-auto" data-testid="git-commit-detail">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="selectable text-lg font-semibold">{commit.subject}</h1>
            {commit.body && (
              <pre className="selectable mt-2 font-sans text-sm whitespace-pre-wrap text-muted">
                {commit.body}
              </pre>
            )}
          </div>
          <IconButton icon={Copy} label="Copy hash" onClick={() => ctx.copy(commit.hash)} />
          <IconButton
            icon={ExternalLink}
            label="Open on the remote"
            onClick={() => void openOnRemote(ctx, project, commit)}
          />
        </div>
        <div className="flex flex-col gap-1 text-sm">
          <Fact label="Author">
            <span className="selectable">
              {commit.author} <span className="text-muted">&lt;{commit.email}&gt;</span>
            </span>
          </Fact>
          <Fact label="Date">{new Date(commit.date).toLocaleString()}</Fact>
          <Fact label="Commit">
            <span className="selectable font-mono text-xs">{commit.hash}</span>
          </Fact>
          <Fact label="Parents">
            <span className="flex gap-2">
              {commit.parents.length === 0 && <span className="text-muted">none (first commit)</span>}
              {commit.parents.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="font-mono text-xs text-accent hover:underline"
                  onClick={() =>
                    ctx.openTab("commit", { projectId: project.id, hash: p, title: p.slice(0, 7) })
                  }
                >
                  {p.slice(0, 7)}
                </button>
              ))}
            </span>
          </Fact>
        </div>
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm">
            <span className="font-medium">
              {files.length} {files.length === 1 ? "file" : "files"} changed
            </span>
            <span className="text-success">+{added}</span>
            <span className="text-danger">−{deleted}</span>
          </div>
          <div className="overflow-hidden rounded-lg border border-line">
            {files.map((f) => (
              <div
                key={f.path}
                role="button"
                tabIndex={0}
                data-testid={`git-commit-file-${f.path}`}
                onClick={() =>
                  ctx.openTab("diff", {
                    projectId: project.id,
                    path: f.path,
                    commit: commit.hash,
                    title: `${short(f.path)} @ ${commit.short}`,
                  })
                }
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  ctx.openTab("diff", { projectId: project.id, path: f.path, commit: commit.hash })
                }
                onContextMenu={(e) => {
                  e.preventDefault();
                  ctx.menu(
                    [{ label: "Copy path", icon: "copy", onSelect: () => ctx.copy(f.path) }],
                    e.nativeEvent,
                    {
                      slot: "context.file",
                      project,
                      path: f.path,
                      commit: commit.hash,
                    },
                  );
                }}
                className="flex h-8 cursor-default items-center gap-2 border-b border-line px-3 text-sm last:border-b-0 hover:bg-hover"
              >
                <span className="truncate">{short(f.path)}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-hint">
                  {f.origPath ? `${f.origPath} → ` : ""}
                  {folder(f.path)}
                </span>
                {f.added === null ? (
                  <Badge>binary</Badge>
                ) : (
                  <>
                    <span className="text-xs text-success">+{f.added}</span>
                    <span className="text-xs text-danger">−{f.deleted}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// Diff tab

export function DiffTab({ ctx, params }: AddonTabProps) {
  const project = useProject(params.projectId);
  const args = {
    cwd: project?.path,
    path: String(params.path ?? ""),
    commit: params.commit as string | undefined,
    staged: Boolean(params.staged),
    untracked: Boolean(params.untracked),
  };
  const { data, error, reload } = useHostCall<{ patch: string; truncated: boolean }>("diff", args, {
    skip: !project,
  });
  useLiveRefresh(project && !args.commit ? project.path : undefined, reload);
  const [mode, setMode] = useState<"split" | "inline">("split");
  useEffect(() => {
    void ctx.storage.get<"split" | "inline">("diffMode").then((m) => m && setMode(m));
  }, [ctx]);
  const choose = (m: "split" | "inline") => {
    setMode(m);
    void ctx.storage.set("diffMode", m);
  };
  if (!project) return <Empty title="Project not found" />;
  const where = args.commit
    ? `in ${args.commit.slice(0, 7)}`
    : args.staged
      ? "staged"
      : args.untracked
        ? "new file"
        : "working copy";
  return (
    <div className="flex h-full flex-col" data-testid="git-diff">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-4">
        <span className="truncate font-mono text-sm">{args.path}</span>
        <Badge>{where}</Badge>
        {data?.truncated && <Badge tone="warning">large file: 3 lines of context</Badge>}
        <div className="flex-1" />
        <div className="flex rounded-md border border-line p-0.5">
          {(["split", "inline"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => choose(m)}
              data-testid={`git-diff-mode-${m}`}
              className={cn(
                "rounded-sm px-2 py-0.5 text-xs",
                mode === m ? "bg-active text-fg" : "text-muted hover:text-fg",
              )}
            >
              {m === "split" ? "Side by side" : "Inline"}
            </button>
          ))}
        </div>
        {!args.commit && <IconButton icon={RefreshCw} size="sm" label="Refresh" onClick={reload} />}
      </div>
      {error ? (
        <div className="p-4 text-sm text-danger">{error}</div>
      ) : !data ? (
        <Spinner className="m-4" />
      ) : (
        <DiffView patch={data.patch} path={args.path} mode={mode} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// Compare tab

export function CompareTab({ ctx, params }: AddonTabProps) {
  const project = useProject(params.projectId);
  const branch = String(params.branch ?? "");
  const { data, error } = useHostCall<{
    current: string;
    branch: string;
    onlyThere: Commit[];
    onlyHere: Commit[];
  }>("compare", { cwd: project?.path, branch }, { skip: !project });
  if (!project) return <Empty title="Project not found" />;
  if (error) return <div className="p-6 text-sm text-danger">{error}</div>;
  if (!data) return <Spinner className="m-6" />;
  const list = (title: string, commits: Commit[]) => (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 items-center gap-2 border-b border-line px-4 text-sm font-medium">
        {title} <Badge>{commits.length}</Badge>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {commits.length === 0 ? (
          <div className="p-4 text-sm text-muted">Nothing.</div>
        ) : (
          commits.map((c) => (
            <div key={c.hash} className="h-8">
              <CommitRow ctx={ctx} project={project} commit={c} />
            </div>
          ))
        )}
      </div>
    </div>
  );
  return (
    <div className="flex h-full flex-col" data-testid="git-compare">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-4 text-sm">
        <GitCompare className="size-4 text-muted" />
        <span className="font-medium">{data.current}</span> compared with{" "}
        <span className="font-medium">{data.branch}</span>
      </div>
      {list(`Only on ${data.branch} (you are behind)`, data.onlyThere)}
      {list(`Only on ${data.current} (you are ahead)`, data.onlyHere)}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// Tools-menu actions and menus

function activeRepo(ctx: AddonUiContext): AddonProject | undefined {
  const project = ctx.projects.active();
  if (!project?.isGitRepo) {
    ctx.notify({
      title: project ? `${project.name} is not a git repository` : "No project selected",
      tone: "warning",
    });
    return undefined;
  }
  return project;
}

export function showGit(ctx: AddonUiContext) {
  ctx.showView("git");
}

export async function openHistory(ctx: AddonUiContext) {
  const project = activeRepo(ctx);
  if (!project) return;
  const status = await ctx.host.call<Status>("status", { cwd: project.path });
  const ref = status.branch.head ?? "HEAD";
  ctx.openTab("history", { projectId: project.id, ref, title: `History: ${ref}` });
}

export function openProjectHistory(ctx: AddonUiContext, target: { project: AddonProject }) {
  if (!target.project.isGitRepo)
    return ctx.notify({ title: `${target.project.name} is not a git repository`, tone: "warning" });
  ctx.openTab("history", {
    projectId: target.project.id,
    ref: "HEAD",
    title: `History: ${target.project.name}`,
  });
}

export async function fetch(ctx: AddonUiContext) {
  const p = activeRepo(ctx);
  if (p) await run(ctx, "Fetched", "fetch", { cwd: p.path });
}
export async function pull(ctx: AddonUiContext) {
  const p = activeRepo(ctx);
  if (p) await run(ctx, "Pulled", "pull", { cwd: p.path });
}
export async function push(ctx: AddonUiContext) {
  const p = activeRepo(ctx);
  if (p) await run(ctx, "Pushed", "push", { cwd: p.path });
}

export async function switchBranch(ctx: AddonUiContext) {
  const p = activeRepo(ctx);
  if (!p) return;
  ctx.showView("git");
  const anchor = document.querySelector<HTMLElement>("[data-testid=git-current-branch]") ?? document.body;
  await switchBranchMenu(ctx, p, anchor);
}

export async function createBranch(ctx: AddonUiContext) {
  const p = activeRepo(ctx);
  if (!p) return;
  const name = await ctx.prompt({
    title: "Create branch",
    message: "From the current branch, and switch to it.",
    confirmLabel: "Create",
  });
  if (name) await run(ctx, `Created ${name}`, "createBranch", { cwd: p.path, name });
}
