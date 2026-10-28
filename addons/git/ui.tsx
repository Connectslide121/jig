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
  Card,
  CountBadge,
  cn,
  Empty,
  FileIcon,
  IconButton,
  Input,
  isImagePath,
  SectionTitle,
  Select,
  Spinner,
  Switch,
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
  FolderSearch,
  GitBranch,
  GitCompare,
  History,
  Image as ImageIcon,
  Minus,
  MoreHorizontal,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DiffView } from "./DiffView";
import { ImageDiff } from "./ImageDiff";
import { checkPrompt, type Finding, parseFindings } from "./lib/check";
import { cleanMessage, commitMessagePrompt } from "./lib/message";

import {
  type Branch,
  type Commit,
  commitUrl,
  type FileChange,
  type NumstatEntry,
  relativeTime,
  type Status,
} from "./lib/parse";
import { type AutoFetchSettings, pollInterval } from "./lib/watch";

/** A repository-relative path made absolute (git always prints forward slashes). */
const joinPath = (root: string, relative: string) =>
  `${root.replace(/[\\/]+$/, "")}${root.includes("\\") ? "\\" : "/"}${relative.replaceAll("/", root.includes("\\") ? "\\" : "/")}`;

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

/** A repository of a workspace project, seen as a project of its own (its path and name). */
type RepoProject = AddonProject & { repoPath?: string };

function repoView(project: RepoProject, repo: { path: string; name: string }): RepoProject {
  return { ...project, path: repo.path, name: repo.name, isGitRepo: true, repos: [], repoPath: repo.path };
}

/** Tab params that point at a project, or at one repository of a workspace project. */
function where(project: RepoProject): { projectId: string; repo?: string } {
  return { projectId: project.id, ...(project.repoPath ? { repo: project.repoPath } : {}) };
}

/** The project a tab is about: the project, or one of its repositories (`params.repo`). */
function useProject(projectId: unknown, repo?: unknown): RepoProject | undefined {
  const project = useProjectList().find((p) => p.id === projectId);
  if (!project || typeof repo !== "string") return project;
  const found = project.repos.find((r) => r.path === repo);
  return found ? repoView(project, found) : undefined;
}

/**
 * Keeps a view of `cwd` current: the host watches the repository and says when it changed; the view
 * also looks again when Jig gets focus, and by itself as a safety net (rarely when the working folder
 * is watched, every few seconds where it can't be: `pollInterval`).
 */
function useLiveRefresh(cwd: string | undefined, reload: () => void) {
  const ctx = useAddon();
  useEffect(() => {
    if (!cwd) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    let gone = false;
    const start = (tree: boolean) => {
      if (gone) return;
      timer = setInterval(() => document.visibilityState === "visible" && reload(), pollInterval(tree, 1));
    };
    void ctx.host
      .call<{ tree: boolean }>("watchRepo", { cwd })
      .then((r) => start(Boolean(r?.tree)))
      .catch(() => start(false));
    const onFocus = () => reload();
    window.addEventListener("focus", onFocus);
    return () => {
      gone = true;
      window.removeEventListener("focus", onFocus);
      clearInterval(timer);
      void ctx.host.call("unwatchRepo", { cwd }).catch(() => {});
    };
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
  project: RepoProject;
  change: FileChange;
  group: Group;
  onChanged: () => void;
}) {
  const cwd = project.path;
  const open = () =>
    ctx.openTab("diff", {
      ...where(project),
      path: change.path,
      staged: group === "staged",
      untracked: group === "untracked",
      title: short(change.path),
      fileIcon: change.path,
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
    ...(change.kind === "deleted"
      ? []
      : [{ label: "Preview", icon: "eye", onSelect: () => ctx.openPreview(`${cwd}/${change.path}`) }]),
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
    {
      label: "Explain this change with Claude",
      icon: "sparkles",
      onSelect: () =>
        void ctx.openChat({
          projectId: project.id,
          cwd,
          draft: `Explain the ${group === "untracked" ? "new file" : "changes in"} ${change.path} (${
            group === "staged" ? "git diff --cached" : group === "untracked" ? "untracked" : "git diff"
          }): what changed, why it might have been done, and anything that looks risky.`,
        }),
    },
    { label: "Copy path", icon: "copy", onSelect: () => ctx.copy(change.path) },
    { label: "Open file", icon: "external-link", onSelect: () => ctx.openPath(`${cwd}/${change.path}`) },
  ];
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`git-file-${group}-${project.repoPath ? `${project.name}/` : ""}${change.path}`}
      onClick={open}
      onKeyDown={(e) => e.key === "Enter" && open()}
      onContextMenu={(e) => {
        e.preventDefault();
        ctx.menu(menu, e.nativeEvent, { slot: "context.file", project, path: change.path });
      }}
      className="group flex h-6 cursor-default items-center gap-1.5 rounded-md px-2 text-xs hover:bg-hover"
      title={change.origPath ? `${change.origPath} → ${change.path}` : change.path}
    >
      <FileIcon path={change.path} className="size-3.5" />
      <span className="min-w-0 truncate text-fg">{short(change.path)}</span>
      <span className="min-w-0 flex-1 truncate text-hint">{folder(change.path)}</span>
      <span className="hidden items-center group-focus-within:flex group-hover:flex">
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
  project: RepoProject;
  onChanged: () => void;
  actions?: React.ReactNode;
}) {
  const ctx = useAddon();
  const [open, setOpen] = useState(true);
  const [all, setAll] = useState(false);
  if (changes.length === 0) return null;
  // Thousands of files (a folder missing from .gitignore) would make the view slow: show the first
  // ones, the rest on request. Actions on the group still cover every file.
  const shown = all ? changes : changes.slice(0, LIST_LIMIT);
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
        shown.map((c) => (
          <FileRow
            key={`${group}:${c.path}`}
            ctx={ctx}
            project={project}
            change={c}
            group={group}
            onChanged={onChanged}
          />
        ))}
      {open && shown.length < changes.length && (
        <button
          type="button"
          className="px-6 py-1 text-left text-xs text-accent hover:underline"
          data-testid={`git-show-all-${group}`}
          onClick={() => setAll(true)}
        >
          Show all {changes.length} ({changes.length - shown.length} more)
        </button>
      )}
    </div>
  );
}

/** Files listed per group before "Show all". */
const LIST_LIMIT = 500;

function branchMenu(
  ctx: AddonUiContext,
  project: RepoProject,
  branch: Branch,
  reload: () => void,
): MenuItemInput[] {
  const cwd = project.path;
  return [
    {
      label: "History",
      icon: "history",
      onSelect: () =>
        ctx.openTab("history", { ...where(project), ref: branch.name, title: `History: ${branch.name}` }),
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
                ...where(project),
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
  project: RepoProject;
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
      onClick={() => ctx.openTab("history", { ...where(project), ref: b.name, title: `History: ${b.name}` })}
      onKeyDown={(e) =>
        e.key === "Enter" &&
        ctx.openTab("history", { ...where(project), ref: b.name, title: `History: ${b.name}` })
      }
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
        className="hidden size-5 group-focus-within:inline-flex group-hover:inline-flex"
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
  project: RepoProject;
  status: Status;
  reload: () => void;
}) {
  const ctx = useAddon();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [writing, setWriting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [findings, setFindings] = useState<Finding[]>();
  const staged = status.staged.length;
  const changes = staged + status.unstaged.length + status.untracked.length;
  /** Claude writes the message from the diff, in the style of the recent commits. */
  const write = async () => {
    setWriting(true);
    try {
      const c = await ctx.host.call<{ staged: boolean; diff: string; recent: string; truncated: boolean }>(
        "messageContext",
        { cwd: project.path },
      );
      if (!c.diff) {
        ctx.notify({
          title: "Nothing to describe",
          message: "There are no changes to commit.",
          tone: "warning",
        });
        return;
      }
      const answer = await ctx.ai.ask(commitMessagePrompt(c), { cwd: project.path });
      setMessage(cleanMessage(answer));
    } catch (error) {
      ctx.notify({ title: "Couldn't write the message", message: (error as Error).message, tone: "danger" });
    } finally {
      setWriting(false);
    }
  };
  /** Claude looks over the changes for things that shouldn't be committed. */
  const check = async () => {
    setChecking(true);
    try {
      const c = await ctx.host.call<{ staged: boolean; diff: string; recent: string; truncated: boolean }>(
        "messageContext",
        { cwd: project.path },
      );
      if (!c.diff) return;
      setFindings(parseFindings(await ctx.ai.ask(checkPrompt(c), { cwd: project.path })));
    } catch (error) {
      ctx.notify({ title: "Couldn't check the changes", message: (error as Error).message, tone: "danger" });
    } finally {
      setChecking(false);
    }
  };
  const claudeMenu = (anchor: HTMLElement) =>
    ctx.menu(
      [
        { label: "Check before committing", icon: "shield-check", onSelect: () => void check() },
        {
          label: "Walk me through the changes",
          icon: "map",
          onSelect: () => void ctx.ai.tour(project.path).catch(() => {}),
        },
        {
          label: "Review in a chat",
          icon: "message-square",
          onSelect: () =>
            void ctx.openChat({
              projectId: project.id,
              cwd: project.path,
              draft:
                "Review my uncommitted changes in this repository (git status, git diff and git diff --cached). Point out bugs, risky changes, missing tests and anything unfinished, most important first. Don't change any files.",
            }),
        },
      ],
      anchor,
    );
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
      <div className="flex gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          icon={Sparkles}
          busy={writing}
          disabled={changes === 0 || writing}
          onClick={() => void write()}
          title="Claude writes the message from your changes (through your Claude Code)"
          data-testid="git-write-message"
        >
          Write
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={Sparkles}
          busy={checking}
          disabled={changes === 0 || checking}
          onClick={(e) => claudeMenu(e.currentTarget)}
          title="More from Claude: check before committing, a tour of the changes, a review"
          aria-label="More from Claude"
          data-testid="git-claude-menu"
        />
        <Button
          className="flex-1"
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
      {findings && (
        <div
          className="flex flex-col gap-1 rounded-md border border-line bg-surface p-2 text-xs"
          data-testid="git-findings"
        >
          <div className="flex items-center gap-1.5">
            <ShieldCheck className={cn("size-3.5", findings.length ? "text-warning" : "text-success")} />
            <span className="flex-1 font-medium text-fg">
              {findings.length
                ? `Claude found ${findings.length} thing${findings.length === 1 ? "" : "s"} to look at`
                : "Claude found nothing to worry about"}
            </span>
            <button
              type="button"
              aria-label="Close"
              className="text-hint hover:text-fg"
              onClick={() => setFindings(undefined)}
            >
              <X className="size-3.5" />
            </button>
          </div>
          {findings.map((f, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: findings have no id.
            <div key={i} className="flex gap-1.5 pl-5">
              <span
                className={
                  f.severity === "high"
                    ? "text-danger"
                    : f.severity === "medium"
                      ? "text-warning"
                      : "text-hint"
                }
              >
                ●
              </span>
              <span className="min-w-0">
                {f.file && (
                  <span className="font-mono text-muted">
                    {f.file}
                    {f.line ? `:${f.line}` : ""}{" "}
                  </span>
                )}
                <span className="text-fg">{f.message}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The commit box and the change groups of one repository. */
function RepoChanges({
  ctx,
  project,
  status,
  reload,
}: {
  ctx: AddonUiContext;
  project: RepoProject;
  status: Status;
  reload: () => void;
}) {
  const cwd = project.path;
  const changes = changeCount(status);
  return (
    <>
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
    </>
  );
}

const changeCount = (status: Status) =>
  status.staged.length + status.unstaged.length + status.untracked.length + status.conflicted.length;

export function GitView({ ctx }: AddonComponentProps) {
  const project = useActiveProject();
  if (!project)
    return (
      <Empty icon={GitBranch} title="No project">
        Pick a project in the top bar.
      </Empty>
    );
  if (project.isGitRepo) return <RepoPanel ctx={ctx} project={project} />;
  if (project.repos.length > 0) return <WorkspaceGit ctx={ctx} project={project} />;
  return (
    <Empty icon={GitBranch} title={`${project.name} is not a git repository`}>
      <span className="flex flex-col items-center gap-2">
        No repositories were found inside it either (Jig looks two folders deep).
        <Button size="sm" icon={RefreshCw} onClick={() => void ctx.projects.rescanRepos(project.id)}>
          Look again
        </Button>
      </span>
    </Empty>
  );
}

/** One repository: branch bar, commit box, changes and branches. */
function RepoPanel({ ctx, project }: { ctx: AddonUiContext; project: RepoProject }) {
  const cwd = project.path;
  const st = useHostCall<Status>("status", { cwd });
  const br = useHostCall<Branch[]>("branches", { cwd });
  const reload = useMemo(
    () => () => {
      void st.reload();
      void br.reload();
    },
    [st.reload, br.reload],
  );
  useLiveRefresh(cwd, reload);
  if (st.error) return <div className="p-3 text-xs text-danger">{st.error}</div>;
  const status = st.data;
  if (!status) return <Spinner className="m-3" />;
  const b = status.branch;
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
              ...where(project),
              ref: b.head ?? "HEAD",
              title: `History: ${b.head ?? "HEAD"}`,
            })
          }
        />
        <IconButton icon={RefreshCw} size="sm" label="Refresh" onClick={reload} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        <RepoChanges ctx={ctx} project={project} status={status} reload={reload} />
        {br.data && <BranchList project={project} branches={br.data} reload={reload} />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// Workspace: every repository of a folder of repositories (D-075)

type RepoStatus = { cwd: string; status?: Status; error?: string };

/**
 * A workspace's live refresh: a repository that changed is looked at again on its own
 * (`reloadOne`), so many repositories cost nothing while they don't change. Focus and the safety-net
 * check reload them all, at most every 10 s on focus.
 */
function useLiveRefreshAll(cwds: string[], reloadAll: () => void, reloadOne: (cwd: string) => void) {
  const ctx = useAddon();
  const key = cwds.join("\n");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for `cwds`.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let gone = false;
    let last = Date.now();
    const all = () => {
      last = Date.now();
      reloadAll();
    };
    void Promise.all(
      cwds.map((cwd) =>
        ctx.host.call<{ tree: boolean }>("watchRepo", { cwd }).then(
          (r) => Boolean(r?.tree),
          () => false,
        ),
      ),
    ).then((trees) => {
      if (gone) return;
      const watching = trees.length > 0 && trees.every(Boolean);
      timer = setInterval(
        () => document.visibilityState === "visible" && all(),
        pollInterval(watching, cwds.length),
      );
    });
    const onFocus = () => Date.now() - last > 10_000 && all();
    window.addEventListener("focus", onFocus);
    return () => {
      gone = true;
      window.removeEventListener("focus", onFocus);
      clearInterval(timer);
      for (const cwd of cwds) void ctx.host.call("unwatchRepo", { cwd }).catch(() => {});
    };
  }, [key, ctx, reloadAll]);
  useAddonEvent("changed", (payload) => {
    const cwd = (payload as { cwd?: string })?.cwd ?? "";
    if (cwds.includes(cwd)) reloadOne(cwd);
  });
}

function repoMenu(
  ctx: AddonUiContext,
  repo: RepoProject,
  status: Status | undefined,
  reload: () => void,
): Array<MenuItemInput | { separator: true }> {
  const cwd = repo.path;
  const head = status?.branch.head ?? "HEAD";
  return [
    {
      label: "History",
      icon: "history",
      onSelect: () => ctx.openTab("history", { ...where(repo), ref: head, title: `History: ${repo.name}` }),
    },
    {
      label: "Fetch",
      icon: "cloud-download",
      onSelect: () => void run(ctx, `Fetched ${repo.name}`, "fetch", { cwd }).then(reload),
    },
    {
      label: "Pull",
      icon: "arrow-down-to-line",
      onSelect: () => void run(ctx, `Pulled ${repo.name}`, "pull", { cwd }).then(reload),
    },
    {
      label: "Push",
      icon: "arrow-up-from-line",
      onSelect: () => void run(ctx, `Pushed ${repo.name}`, "push", { cwd }).then(reload),
    },
    { separator: true },
    {
      label: "Walk me through the changes",
      icon: "map",
      onSelect: () => void ctx.ai.tour(cwd).catch(() => {}),
    },
    {
      label: "Review changes with Claude",
      icon: "sparkles",
      onSelect: () =>
        void ctx.openChat({
          projectId: repo.id,
          cwd,
          draft:
            "Review my uncommitted changes in this repository (git status, git diff and git diff --cached). Point out bugs, risky changes, missing tests and anything unfinished, most important first. Don't change any files.",
        }),
    },
    {
      label: "New chat in this repository",
      icon: "message-square-plus",
      onSelect: () => void ctx.openChat({ projectId: repo.id, cwd }),
    },
    {
      label:
        repo.focusRepo === cwd
          ? "Focused (status bar and Git actions)"
          : "Focus (status bar and Git actions)",
      icon: "crosshair",
      checked: repo.focusRepo === cwd,
      onSelect: () => void ctx.projects.setFocusRepo(repo.id, cwd),
    },
    { label: "Copy path", icon: "copy", onSelect: () => ctx.copy(cwd) },
    { label: "Open folder", icon: "folder-open", onSelect: () => ctx.openPath(cwd) },
  ];
}

function RepoSection({
  ctx,
  repo,
  entry,
  reload,
  open,
  onToggle,
}: {
  ctx: AddonUiContext;
  repo: RepoProject;
  entry: RepoStatus | undefined;
  reload: () => void;
  open: boolean;
  onToggle: () => void;
}) {
  const status = entry?.status;
  const count = status ? changeCount(status) : 0;
  const focused = repo.focusRepo === repo.path;
  const b = status?.branch;
  return (
    <div className="border-b border-line last:border-b-0" data-testid={`git-repo-${repo.name}`}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => {
          onToggle();
          if (!focused) void ctx.projects.setFocusRepo(repo.id, repo.path);
        }}
        onKeyDown={(e) => e.key === "Enter" && onToggle()}
        onContextMenu={(e) => {
          e.preventDefault();
          ctx.menu(repoMenu(ctx, repo, status, reload), e.nativeEvent, {
            slot: "context.repo",
            project: repo,
          });
        }}
        className="group flex h-8 cursor-default items-center gap-1.5 px-2 text-xs hover:bg-hover"
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0 text-hint" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-hint" />
        )}
        <span
          className={cn("min-w-0 truncate font-medium", focused ? "text-accent" : "text-fg")}
          title={repo.path}
        >
          {repo.name}
        </span>
        {b && (
          <button
            type="button"
            className="flex min-w-0 shrink items-center gap-0.5 rounded-sm px-1 text-muted hover:bg-active hover:text-fg"
            title="Switch branch"
            onClick={(e) => {
              e.stopPropagation();
              // Working with this repository's branches makes it the focus, like clicking its row.
              if (!focused) void ctx.projects.setFocusRepo(repo.id, repo.path);
              void switchBranchMenu(ctx, repo, e.currentTarget, reload);
            }}
            data-testid={`git-repo-branch-${repo.name}`}
          >
            <GitBranch className="size-3 shrink-0" />
            <span className="truncate">{b.head ?? "—"}</span>
          </button>
        )}
        {b && b.ahead > 0 && <span className="shrink-0 text-2xs text-muted">↑{b.ahead}</span>}
        {b && b.behind > 0 && <span className="shrink-0 text-2xs text-muted">↓{b.behind}</span>}
        <span className="flex-1" />
        {entry?.error && <Badge tone="danger">error</Badge>}
        {!status && !entry?.error && <Spinner size="sm" />}
        <span className="hidden items-center group-focus-within:flex group-hover:flex">
          <IconButton
            icon={MoreHorizontal}
            size="sm"
            label={`${repo.name} options`}
            onClick={(e) => {
              e.stopPropagation();
              ctx.menu(repoMenu(ctx, repo, status, reload), e.currentTarget);
            }}
          />
        </span>
        {count > 0 && <CountBadge count={count} />}
      </div>
      {open && (
        <div className="pb-1">
          {entry?.error ? (
            <div className="px-3 py-1 text-xs text-danger">{entry.error}</div>
          ) : status ? (
            <RepoChanges ctx={ctx} project={repo} status={status} reload={reload} />
          ) : null}
        </div>
      )}
    </div>
  );
}

/** A workspace project: every repository's changes in one list, changed ones first (like VS Code's Source Control). */
function WorkspaceGit({ ctx, project }: { ctx: AddonUiContext; project: AddonProject }) {
  const repos = useMemo(() => project.repos.map((r) => repoView(project, r)), [project]);
  const cwds = useMemo(() => repos.map((r) => r.path), [repos]);
  const all = useHostCall<RepoStatus[]>("statusAll", { cwds });
  // Repositories looked at again on their own since the last full load (newer than `all.data`).
  const [fresh, setFresh] = useState<Record<string, RepoStatus>>({});
  const reloadAll = all.reload;
  const reload = useMemo(
    () => () => {
      setFresh({});
      reloadAll();
    },
    [reloadAll],
  );
  const reloadOne = useMemo(
    () => (cwd: string) =>
      void ctx.host.call<Status>("status", { cwd }).then(
        (status) => setFresh((f) => ({ ...f, [cwd]: { cwd, status } })),
        (error: Error) => setFresh((f) => ({ ...f, [cwd]: { cwd, error: error.message } })),
      ),
    [ctx],
  );
  useLiveRefreshAll(cwds, reload, reloadOne);
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const byCwd = new Map([...(all.data ?? []), ...Object.values(fresh)].map((e) => [e.cwd, e]));
  const changed = (r: RepoProject) => {
    const st = byCwd.get(r.path)?.status;
    return st ? changeCount(st) > 0 || st.branch.ahead > 0 || st.branch.behind > 0 : false;
  };
  const sorted = [...repos].sort((a, b) => Number(changed(b)) - Number(changed(a)));
  const dirty = repos.filter((r) => {
    const st = byCwd.get(r.path)?.status;
    return st && changeCount(st) > 0;
  }).length;
  const fetchAll = async () => {
    setBusy(true);
    await Promise.all(cwds.map((cwd) => ctx.host.call("fetch", { cwd }).catch(() => undefined)));
    setBusy(false);
    ctx.notify({ title: `Fetched ${cwds.length} repositories`, tone: "success" });
    reload();
  };
  return (
    <div className="flex h-full flex-col" data-testid="git-workspace">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line px-2">
        <span className="min-w-0 flex-1 truncate text-sm">
          <span className="font-medium">{repos.length} repositories</span>
          <span className="text-muted">{all.data ? ` · ${dirty} with changes` : ""}</span>
        </span>
        <IconButton
          icon={CloudDownload}
          size="sm"
          label="Fetch all"
          disabled={busy}
          onClick={() => void fetchAll()}
        />
        <IconButton
          icon={FolderSearch}
          size="sm"
          label="Look for repositories again"
          onClick={() => void ctx.projects.rescanRepos(project.id)}
        />
        <IconButton icon={RefreshCw} size="sm" label="Refresh" onClick={reload} />
      </div>
      {all.error && <div className="p-3 text-xs text-danger">{all.error}</div>}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sorted.map((repo) => {
          const entry = byCwd.get(repo.path);
          const st = entry?.status;
          const auto = st ? changeCount(st) > 0 : false;
          const open = toggled[repo.path] ?? auto;
          return (
            <RepoSection
              key={repo.path}
              ctx={ctx}
              repo={repo}
              entry={entry}
              reload={reload}
              open={open}
              onToggle={() => setToggled((t) => ({ ...t, [repo.path]: !open }))}
            />
          );
        })}
      </div>
    </div>
  );
}

async function switchBranchMenu(
  ctx: AddonUiContext,
  project: RepoProject,
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
        onSelect: () => void createBranch(ctx, project).then(reload),
      },
    ],
    at,
  );
}

// ------------------------------------------------------------------------------------------------
// Status bar

export function BranchStatus({ ctx }: AddonComponentProps) {
  const project = focusOf(useActiveProject());
  const st = useHostCall<Status>("status", { cwd: project?.path }, { skip: !project });
  useLiveRefresh(project?.path, st.reload);
  if (!project || !st.data) return null;
  const b = st.data.branch;
  return (
    <button
      type="button"
      className="flex items-center gap-1 hover:text-fg"
      onClick={() => ctx.showView("git")}
      data-testid="git-status-branch"
    >
      <GitBranch className="size-3" /> {project.repoPath ? `${project.name}: ` : ""}
      {b.head}
      {b.ahead > 0 && <span>↑{b.ahead}</span>}
      {b.behind > 0 && <span>↓{b.behind}</span>}
    </button>
  );
}

// ------------------------------------------------------------------------------------------------
// History tab

function CommitRow({ ctx, project, commit }: { ctx: AddonUiContext; project: RepoProject; commit: Commit }) {
  const open = () => ctx.openTab("commit", { ...where(project), hash: commit.hash, title: commit.short });
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

function commitMenu(ctx: AddonUiContext, project: RepoProject, commit: Commit): MenuItemInput[] {
  return [
    {
      label: "Show commit",
      icon: "git-commit-horizontal",
      onSelect: () => ctx.openTab("commit", { ...where(project), hash: commit.hash, title: commit.short }),
    },
    { label: "Copy hash", icon: "copy", onSelect: () => ctx.copy(commit.hash) },
    {
      label: "Open on the remote",
      icon: "external-link",
      onSelect: () => void openOnRemote(ctx, project, commit),
    },
  ];
}

async function openOnRemote(ctx: AddonUiContext, project: RepoProject, commit: Commit) {
  const remote = await ctx.host.call<string | undefined>("remoteUrl", { cwd: project.path });
  const url = remote && commitUrl(remote, commit.hash);
  if (url) ctx.openExternal(url);
  else ctx.notify({ title: "No GitHub or Azure DevOps remote found", tone: "warning" });
}

const PAGE = 200;

export function HistoryTab({ ctx, params }: AddonTabProps) {
  const project = useProject(params.projectId, params.repo);
  const ref = String(params.ref ?? "HEAD");
  const [filter, setFilter] = useState("");
  const [applied, setApplied] = useState("");
  const [commits, setCommits] = useState<Commit[]>([]);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  // Each load has a number; a reset (new branch or filter) always runs and makes older loads stale.
  const request = useRef(0);
  const load = async (reset: boolean) => {
    if (!project || (!reset && (loading || done))) return;
    const n = ++request.current;
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
      if (n !== request.current) return;
      setCommits((c) => (reset ? page : [...c, ...page]));
      setDone(page.length < PAGE);
      setError(undefined);
    } catch (e) {
      if (n === request.current) setError((e as Error).message);
    } finally {
      if (n === request.current) setLoading(false);
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
  const project = useProject(params.projectId, params.repo);
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
                  onClick={() => ctx.openTab("commit", { ...where(project), hash: p, title: p.slice(0, 7) })}
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
                    ...where(project),
                    path: f.path,
                    commit: commit.hash,
                    title: `${short(f.path)} @ ${commit.short}`,
                    fileIcon: f.path,
                  })
                }
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  ctx.openTab("diff", {
                    ...where(project),
                    path: f.path,
                    commit: commit.hash,
                    title: `${short(f.path)} @ ${commit.short}`,
                    fileIcon: f.path,
                  })
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
                <FileIcon path={f.path} />
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
  const project = useProject(params.projectId, params.repo);
  const args = {
    cwd: project?.path,
    path: String(params.path ?? ""),
    commit: params.commit as string | undefined,
    staged: Boolean(params.staged),
    untracked: Boolean(params.untracked),
  };
  const isImage = isImagePath(args.path);
  const { data, error, reload } = useHostCall<{ patch: string; truncated: boolean }>("diff", args, {
    skip: !project || isImage,
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
        {!isImage && (
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
        )}
        {isImage && project && (
          <IconButton
            icon={ImageIcon}
            size="sm"
            label="Open the image"
            onClick={() => ctx.openImage(joinPath(project.path, args.path))}
          />
        )}
        {!args.commit && <IconButton icon={RefreshCw} size="sm" label="Refresh" onClick={reload} />}
      </div>
      {isImage ? (
        <ImageDiff
          ctx={ctx}
          cwd={project.path}
          path={args.path}
          commit={args.commit}
          staged={args.staged}
          untracked={args.untracked}
        />
      ) : error ? (
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
  const project = useProject(params.projectId, params.repo);
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

/** The repository Git actions use: the active project, or a workspace's focus repository. */
function focusOf(project: AddonProject | undefined): RepoProject | undefined {
  if (!project) return undefined;
  if (project.isGitRepo) return project;
  const repo = project.repos.find((r) => r.path === project.focusRepo);
  return repo ? repoView(project, repo) : undefined;
}

function activeRepo(ctx: AddonUiContext): RepoProject | undefined {
  const project = ctx.projects.active();
  const focus = focusOf(project);
  if (focus) return focus;
  if (project && project.repos.length > 0) {
    ctx.showView("git");
    ctx.notify({
      title: "Pick a repository first",
      message: "Click its name in the Git view.",
      tone: "info",
    });
    return undefined;
  }
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
  ctx.openTab("history", { ...where(project), ref, title: `History: ${ref}` });
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

/** Creates a branch in `repo` (the repository whose menu was used), else in the focus repository. */
export async function createBranch(ctx: AddonUiContext, repo?: RepoProject) {
  const p = repo ?? activeRepo(ctx);
  if (!p) return;
  const name = await ctx.prompt({
    title: "Create branch",
    message: "From the current branch, and switch to it.",
    confirmLabel: "Create",
  });
  if (name) await run(ctx, `Created ${name}`, "createBranch", { cwd: p.path, name });
}

// ------------------------------------------------------------------------------------------------
// Settings → Git

export function GitSettings({ ctx }: AddonComponentProps) {
  const { data, reload } = useHostCall<AutoFetchSettings>("settings");
  if (!data) return <Spinner />;
  const save = async (next: AutoFetchSettings) => {
    await ctx.host.call("saveSettings", next);
    reload();
  };
  return (
    <div className="flex flex-col gap-6" data-testid="git-settings">
      <div>
        <h2 className="text-lg font-semibold">Git</h2>
        <p className="text-sm text-muted">
          The Git view follows your repositories live: a changed file shows within about a second, and only
          the repository that changed is looked at again.
        </p>
      </div>
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Fetch in the background</div>
            <div className="text-xs text-muted">
              Fetches every repository of your projects from its remotes, one at a time, so "behind" shows new
              commits without pressing Fetch. It never asks for a login; a repository that would need one is
              skipped.
            </div>
          </div>
          <Switch
            label="Fetch in the background"
            checked={data.enabled}
            onChange={(enabled) => void save({ ...data, enabled })}
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 text-sm">Every</div>
          <Select
            value={String(data.minutes)}
            disabled={!data.enabled}
            data-testid="git-autofetch-minutes"
            onChange={(e) => void save({ ...data, minutes: Number(e.target.value) })}
          >
            {[3, 5, 10, 15, 30, 60].map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </Select>
        </div>
      </Card>
    </div>
  );
}
