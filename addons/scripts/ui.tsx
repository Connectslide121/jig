import {
  type AddonComponentProps,
  type AddonProject,
  type AddonScript,
  type AddonScriptGroup,
  type AddonUiContext,
  type Arrangement,
  EMPTY_ARRANGEMENT,
  type RunningScript,
  toggleHidden,
} from "@jig/sdk";
import {
  Button,
  cn,
  Empty,
  IconButton,
  SearchInput,
  Spinner,
  useProjectList,
  useRunningScripts,
  useStorage,
  useWorkspaceList,
} from "@jig/sdk/ui";
import {
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  FileCode,
  Folder,
  FolderGit2,
  FolderPlus,
  Layers,
  type LucideIcon,
  MoreHorizontal,
  Package,
  Play,
  Server,
  Square,
  SquareTerminal,
} from "lucide-react";
import { type MouseEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import {
  addMember,
  memberKey,
  moveGroup,
  newGroup,
  removeGroup,
  removeMember,
  renameGroup,
  type ScriptGroup,
} from "./lib/groups";
import { countText, type PackageNode, relativeRepos, scriptTree, type TopNode } from "./lib/tree";

type Listing = { scripts: AddonScript[]; groups: AddonScriptGroup[] };

function useListings(ctx: AddonUiContext, projects: AddonProject[]) {
  const [data, setData] = useState<Record<string, Listing | { error: string }>>({});
  const [version, setVersion] = useState(0);
  const key = projects.map((p) => p.id).join(",");
  // A rescan, a group made on the dashboard: list again.
  useEffect(() => ctx.scripts.onChange(() => setVersion((v) => v + 1)), [ctx]);
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      projects.map(async (p) => {
        try {
          return [p.id, await ctx.scripts.list(p.id)] as const;
        } catch (error) {
          return [p.id, { error: (error as Error).message }] as const;
        }
      }),
    ).then((entries) => {
      if (!cancelled) setData(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [ctx, key, version]);
  return data;
}

async function safe(ctx: AddonUiContext, label: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (error) {
    ctx.notify({ title: `${label} failed`, message: (error as Error).message, tone: "danger" });
  }
}

/** A script with the project it belongs to, and where it lives (package and top folder). */
interface Located {
  project: AddonProject;
  script: AddonScript;
  /** Its package (folder name), e.g. "SavClient". */
  pkg: string;
  /** Its top folder (e.g. "Certumhub"), for context. */
  where: string;
}

/** Everything the view's parts share: running scripts, groups and hidden scripts. */
interface Model {
  ctx: AddonUiContext;
  running: Map<string, RunningScript>;
  find: (member: string) => Located | undefined;
  findRun: (projectId: string, scriptId: string) => Located | undefined;
  groups: ScriptGroup[];
  setGroups: (next: ScriptGroup[]) => void;
  isHidden: (l: Located) => boolean;
  toggleHide: (l: Located) => void;
}

const runKey = (projectId: string, scriptId: string) => `${projectId}|${scriptId}`;
const isRunning = (m: Model, l: Located) => m.running.has(runKey(l.project.id, l.script.id));
const run = (m: Model, l: Located) =>
  safe(m.ctx, l.script.name, () => m.ctx.scripts.run(l.project.id, l.script.id));
const stop = (m: Model, l: Located) => m.ctx.scripts.stop(l.project.id, l.script.id);

/** The add-to-group submenu for a script: your groups (ticked when it's in), and New group…. */
function groupSubmenu(m: Model, l: Located) {
  const member = memberKey(l.project.path, l.script.id);
  return [
    ...m.groups.map((g) => ({
      label: g.name,
      checked: g.members.includes(member),
      onSelect: () =>
        m.setGroups(
          g.members.includes(member)
            ? removeMember(m.groups, g.id, member)
            : addMember(m.groups, g.id, member),
        ),
    })),
    ...(m.groups.length ? [{ separator: true as const }] : []),
    {
      label: "New group…",
      icon: "folder-plus",
      onSelect: async () => {
        const name = await m.ctx.prompt({
          title: "New group",
          message: `Starting with ${l.pkg} · ${l.script.name}.`,
          confirmLabel: "Create",
        });
        if (name?.trim()) m.setGroups(newGroup(m.groups, name, member));
      },
    },
  ];
}

function scriptMenu(m: Model, l: Located, e: MouseEvent, inGroup?: ScriptGroup) {
  e.preventDefault();
  e.stopPropagation();
  const r = m.running.get(runKey(l.project.id, l.script.id));
  m.ctx.menu(
    [
      r
        ? { label: "Stop", icon: "square", onSelect: () => void stop(m, l) }
        : { label: "Run", icon: "play", onSelect: () => void run(m, l) },
      ...(r
        ? [
            {
              label: "Show its terminal",
              icon: "square-terminal",
              onSelect: () => m.ctx.scripts.show(r.terminalId),
            },
          ]
        : []),
      ...(l.script.url
        ? [
            {
              label: `Open ${l.script.url}`,
              icon: "external-link",
              onSelect: () => m.ctx.openExternal(l.script.url!),
            },
          ]
        : []),
      { separator: true },
      inGroup
        ? {
            label: `Remove from ${inGroup.name}`,
            icon: "x",
            onSelect: () =>
              m.setGroups(removeMember(m.groups, inGroup.id, memberKey(l.project.path, l.script.id))),
          }
        : { label: "Add to group", icon: "layers", submenu: groupSubmenu(m, l) },
      ...(inGroup
        ? []
        : [
            {
              label: m.isHidden(l) ? "Show it" : "Hide it",
              icon: m.isHidden(l) ? "eye" : "eye-off",
              onSelect: () => m.toggleHide(l),
            },
          ]),
    ],
    e.nativeEvent,
  );
}

/** ▶ to start, a green ■ to stop: the one button every script row has. */
function RunButton({ m, l }: { m: Model; l: Located }) {
  const on = isRunning(m, l);
  return (
    <button
      type="button"
      aria-label={on ? `Stop ${l.script.name}` : `Run ${l.script.name}`}
      title={on ? "Stop" : "Run"}
      onClick={(e) => {
        e.stopPropagation();
        void (on ? stop(m, l) : run(m, l));
      }}
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-md transition-colors",
        on
          ? "bg-success-soft text-success hover:bg-success hover:text-on-accent"
          : "text-muted hover:bg-accent-soft hover:text-accent",
      )}
    >
      {on ? <Square className="size-3 fill-current" /> : <Play className="size-3.5 fill-current" />}
    </button>
  );
}

/**
 * One script: run/stop, its name, what it runs (dimmed) or where it lives, and ⋯ on hover for add to
 * a group, hide and the rest. Right-click opens the same menu.
 */
function ScriptRow({
  m,
  l,
  context,
  inGroup,
  indent = 0,
}: {
  m: Model;
  l: Located;
  /** Show where it lives (groups, the running list, filter results) instead of its command. */
  context?: boolean;
  inGroup?: ScriptGroup;
  indent?: number;
}) {
  const hidden = !inGroup && m.isHidden(l);
  const on = isRunning(m, l);
  return (
    <div
      className={cn(
        "group flex h-7 items-center gap-1.5 rounded-md pr-1 hover:bg-hover",
        hidden && "opacity-50",
      )}
      style={{ paddingLeft: 4 + indent * 14 }}
      onContextMenu={(e) => scriptMenu(m, l, e, inGroup)}
      data-testid={`scripts-addon-${l.script.name}`}
    >
      <RunButton m={m} l={l} />
      <span className={cn("shrink-0 text-sm text-fg", on && "font-medium")}>{l.script.name}</span>
      <span
        className={cn("min-w-0 flex-1 truncate text-xs", context ? "text-muted" : "font-mono text-hint")}
        title={`${l.script.command}\n${l.project.name}${l.script.folder ? ` · ${l.script.folder}` : ""}`}
      >
        {context ? `${l.pkg} · ${l.where}` : (l.script.detail ?? l.script.command)}
      </span>
      {hidden && <EyeOff className="size-3 shrink-0 text-hint" />}
      <span className="invisible flex shrink-0 items-center group-hover:visible group-focus-within:visible">
        {l.script.url && on && (
          <IconButton
            icon={ExternalLink}
            size="sm"
            label={`Open ${l.script.url}`}
            onClick={() => m.ctx.openExternal(l.script.url!)}
          />
        )}
        <IconButton
          icon={MoreHorizontal}
          size="sm"
          label={`${l.script.name} options`}
          data-testid="script-options"
          onClick={(e) => scriptMenu(m, l, e, inGroup)}
        />
      </span>
    </div>
  );
}

function Section({
  title,
  children,
  testId,
  fold,
}: {
  title: string;
  children: ReactNode;
  testId?: string;
  /** A section you can fold away: its state and how to flip it. */
  fold?: { open: boolean; onToggle: () => void };
}) {
  const heading = <span className="text-2xs font-semibold tracking-wide text-hint uppercase">{title}</span>;
  return (
    <section className="mb-4" data-testid={testId}>
      {fold ? (
        <button
          type="button"
          onClick={fold.onToggle}
          aria-expanded={fold.open}
          data-testid={testId ? `${testId}-fold` : undefined}
          className="flex w-full items-center gap-1.5 rounded-md px-1 pb-1.5 text-left hover:text-fg"
        >
          <ChevronRight
            className={cn("size-3.5 shrink-0 text-hint transition-transform", fold.open && "rotate-90")}
          />
          {heading}
          <span className="h-px flex-1 bg-line" />
        </button>
      ) : (
        <div className="flex items-center gap-2 px-1 pb-1.5">
          {heading}
          <span className="h-px flex-1 bg-line" />
        </div>
      )}
      {(!fold || fold.open) && children}
    </section>
  );
}

/** Scripts running now, wherever they're from. */
function RunningList({ m }: { m: Model }) {
  const runs = [...m.running.values()];
  if (runs.length === 0) return null;
  return (
    <Section title={`Running · ${runs.length}`} testId="scripts-running">
      <div className="rounded-lg border border-success bg-success-soft p-1">
        {runs.map((r) => {
          const l = m.findRun(r.projectId, r.scriptId);
          return l ? (
            <ScriptRow key={r.terminalId} m={m} l={l} context />
          ) : (
            <div key={r.terminalId} className="flex h-7 items-center gap-2 px-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{r.title}</span>
              <IconButton
                icon={Square}
                size="sm"
                label={`Stop ${r.title}`}
                onClick={() => void m.ctx.scripts.stop(r.projectId, r.scriptId)}
              />
            </div>
          );
        })}
      </div>
    </Section>
  );
}

/** A group: Start / Stop for all of it, its scripts as rows. Yours, or a project's (dashboard). */
function GroupCard({
  m,
  name,
  members,
  testId,
  from,
  menu,
  group,
  open,
  onToggle,
}: {
  m: Model;
  name: string;
  members: Array<{ key: string; l?: Located }>;
  testId: string;
  /** For a project's group: the project whose dashboard it was made on. */
  from?: string;
  menu?: (e: MouseEvent) => void;
  group?: ScriptGroup;
  /** Folded to its header unless open. */
  open: boolean;
  onToggle: () => void;
}) {
  const found = members.flatMap((x) => (x.l ? [x.l] : []));
  const startable = found.filter((l) => !isRunning(m, l));
  const running = found.filter((l) => isRunning(m, l));
  const all = found.length > 0 && running.length === found.length;
  const id = testId.replace("scripts-group-", "");
  return (
    <div className="mb-2 rounded-lg border border-line bg-surface" data-testid={testId}>
      <div className={cn("flex items-center gap-2 px-2 py-1.5", open && "border-b border-line")}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${open ? "Fold" : "Unfold"} ${name}`}
          data-testid={`scripts-group-fold-${id}`}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronRight
            className={cn("size-3.5 shrink-0 text-hint transition-transform", open && "rotate-90")}
          />
          <Layers className={cn("size-4 shrink-0", running.length ? "text-success" : "text-muted")} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{name}</div>
            <div className="truncate text-2xs text-hint">
              {running.length ? `${running.length} of ${found.length} running` : `${found.length} scripts`}
              {from ? ` · ${from}'s dashboard group` : ""}
            </div>
          </div>
        </button>
        {!all && (
          <Button
            size="sm"
            variant="primary"
            icon={Play}
            disabled={startable.length === 0}
            onClick={() => void Promise.all(startable.map((l) => run(m, l)))}
            data-testid={`scripts-group-start-${id}`}
          >
            {running.length ? "Start the rest" : "Start"}
          </Button>
        )}
        {running.length > 0 && (
          <Button
            size="sm"
            icon={Square}
            onClick={() => void Promise.all(running.map((l) => stop(m, l)))}
            data-testid={`scripts-group-stop-${id}`}
          >
            Stop
          </Button>
        )}
        {menu && <IconButton icon={MoreHorizontal} size="sm" label={`${name} options`} onClick={menu} />}
      </div>
      {open && (
        <div className="p-1">
          {members.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-hint">Add scripts: a script's ⋯ → Add to group.</div>
          )}
          {members.map(({ key, l }) =>
            l ? (
              <ScriptRow key={key} m={m} l={l} context inGroup={group} />
            ) : (
              <div key={key} className="flex h-7 items-center gap-2 px-2 text-xs text-hint">
                <span className="min-w-0 flex-1 truncate">{key.split(":").pop()} — not found any more</span>
                {group && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => m.setGroups(removeMember(m.groups, group.id, key))}
                  >
                    Remove
                  </Button>
                )}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

const KINDS: Record<PackageNode["kind"], { icon: LucideIcon; tone: string; text: string }> = {
  api: { icon: Server, tone: "text-info", text: "API" },
  npm: { icon: Package, tone: "text-warning", text: "npm" },
  script: { icon: FileCode, tone: "text-muted", text: "script" },
};

/** A folding row of the tree: a top folder or a repository. */
function Fold({
  icon: Icon,
  label,
  open,
  onToggle,
  active,
  count,
  indent,
  testId,
}: {
  icon: LucideIcon;
  label: string;
  open: boolean;
  onToggle: () => void;
  active: boolean;
  count: string;
  indent: number;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      data-testid={testId}
      aria-expanded={open}
      className="flex h-7 w-full items-center gap-1.5 rounded-md pr-2 text-left hover:bg-hover"
      style={{ paddingLeft: 4 + indent * 14 }}
    >
      <ChevronRight className={cn("size-3.5 shrink-0 text-hint transition-transform", open && "rotate-90")} />
      <Icon className="size-4 shrink-0 text-muted" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
      {active && (
        <span className="size-2 shrink-0 rounded-full bg-success" title="Something here is running" />
      )}
      <span className="shrink-0 text-2xs text-hint">{count}</span>
    </button>
  );
}

/** A package or project: its kind and name, then its scripts as rows. */
function PackageBlock({
  m,
  node,
  locate,
  showHidden,
  indent,
}: {
  m: Model;
  node: PackageNode;
  locate: (s: AddonScript) => Located;
  showHidden: boolean;
  indent: number;
}) {
  const scripts = node.scripts.map(locate).filter((l) => showHidden || !m.isHidden(l));
  if (scripts.length === 0) return null;
  const kind = KINDS[node.kind];
  return (
    <div className="mb-1" data-testid={`scripts-package-${node.folder || node.label}`}>
      <div className="flex h-6 items-center gap-1.5 pr-2 text-xs" style={{ paddingLeft: 8 + indent * 14 }}>
        <kind.icon className={cn("size-3.5 shrink-0", kind.tone)} />
        <span className="truncate font-medium text-muted" title={node.folder}>
          {node.label}
        </span>
        <span className={cn("shrink-0 text-2xs uppercase", kind.tone)}>{kind.text}</span>
      </div>
      {scripts.map((l) => (
        <ScriptRow key={l.script.id} m={m} l={l} indent={indent + 1} />
      ))}
    </div>
  );
}

function Tree({
  m,
  tops,
  locate,
  showHidden,
  expanded,
  toggle,
  prefix,
}: {
  m: Model;
  tops: TopNode[];
  locate: (s: AddonScript) => Located;
  showHidden: boolean;
  expanded: (key: string) => boolean;
  toggle: (key: string) => void;
  prefix: string;
}) {
  const visible = (packages: PackageNode[]) =>
    packages.filter((p) => p.scripts.some((s) => showHidden || !m.isHidden(locate(s))));
  const active = (packages: PackageNode[]) =>
    packages.some((p) => p.scripts.some((s) => isRunning(m, locate(s))));
  const blocks = (list: PackageNode[], indent: number) =>
    visible(list).map((node) => (
      <PackageBlock
        key={node.folder}
        m={m}
        node={node}
        locate={locate}
        showHidden={showHidden}
        indent={indent}
      />
    ));
  return (
    <>
      {tops.map((top) => {
        const all = top.repos.flatMap((r) => r.packages);
        if (visible(all).length === 0) return null;
        const key = `${prefix}|${top.key}`;
        return (
          <div key={top.key}>
            <Fold
              icon={top.flat ? FolderGit2 : Folder}
              label={top.label}
              open={expanded(key)}
              onToggle={() => toggle(key)}
              active={active(all)}
              count={countText(visible(all))}
              indent={0}
              testId={`scripts-top-${top.label}`}
            />
            {expanded(key) &&
              (top.flat
                ? blocks(all, 1)
                : top.repos.map((repo) => {
                    if (visible(repo.packages).length === 0) return null;
                    const rk = `${prefix}|${repo.key}`;
                    return (
                      <div key={repo.key}>
                        <Fold
                          icon={FolderGit2}
                          label={repo.label || top.label}
                          open={expanded(rk)}
                          onToggle={() => toggle(rk)}
                          active={active(repo.packages)}
                          count={countText(visible(repo.packages))}
                          indent={1}
                          testId={`scripts-repo-${repo.label || top.label}`}
                        />
                        {expanded(rk) && blocks(repo.packages, 2)}
                      </div>
                    );
                  }))}
          </div>
        );
      })}
    </>
  );
}

/**
 * Every script Jig finds, structured like the scripts plugin (D-142, D-146): a filter, what runs now,
 * your groups with Start / Stop (and each project's dashboard groups), then every script by top
 * folder → repository → package, as rows with what they run. The right side is global (D-102).
 */
export function ScriptsView({ ctx }: AddonComponentProps) {
  const projects = useProjectList();
  const workspaces = useWorkspaceList();
  // One project per folder lists its scripts (several projects can share a workspace).
  const folders = useMemo(() => {
    const seen = new Map<string, AddonProject>();
    for (const p of projects) if (!seen.has(p.path)) seen.set(p.path, p);
    return [...seen.values()];
  }, [projects]);
  const listings = useListings(ctx, folders);
  const runningList = useRunningScripts();
  const [groups, setGroups] = useStorage<ScriptGroup[]>("groups", []);
  // Hidden scripts, per folder (the arrangement the view kept before groups).
  const [arrangements, setArrangements] = useStorage<Record<string, Arrangement>>("arrangement", {});
  const [open, setOpen] = useStorage<Record<string, boolean>>("expanded", {});
  const [showHidden, setShowHidden] = useState(false);
  const [query, setQuery] = useState("");
  const active = ctx.projects.active();
  const ordered = [...folders].sort((a, b) =>
    a.path === active?.path ? -1 : b.path === active?.path ? 1 : 0,
  );

  const located = useMemo(() => {
    const map = new Map<string, Located>();
    for (const project of folders) {
      const listing = listings[project.id];
      if (!listing || !("scripts" in listing)) continue;
      const title = workspaces.find((w) => w.path === project.path)?.name ?? project.name;
      for (const script of listing.scripts) {
        const pkg = script.folder ? (script.folder.split("/").pop() ?? script.folder) : title;
        const top = script.folder ? (script.folder.split("/")[0] ?? title) : title;
        map.set(memberKey(project.path, script.id), {
          project,
          script,
          pkg,
          where: top === pkg ? title : top,
        });
      }
    }
    return map;
  }, [folders, listings, workspaces]);

  const m: Model = {
    ctx,
    running: new Map(runningList.map((r) => [runKey(r.projectId, r.scriptId), r])),
    find: (member) => located.get(member),
    findRun: (projectId, scriptId) => {
      const project = folders.find((p) => p.id === projectId);
      return project ? located.get(memberKey(project.path, scriptId)) : undefined;
    },
    groups,
    setGroups: (next) => void setGroups(next),
    isHidden: (l) => (arrangements[l.project.path]?.hidden ?? []).includes(`s:${l.script.id}`),
    toggleHide: (l) =>
      void setArrangements({
        ...arrangements,
        [l.project.path]: toggleHidden(arrangements[l.project.path] ?? EMPTY_ARRANGEMENT, `s:${l.script.id}`),
      }),
  };

  const trees = ordered.map((project) => {
    const listing = listings[project.id];
    const workspace = workspaces.find((w) => w.path === project.path);
    const repos = relativeRepos(project.path, workspace?.repos ?? [], workspace?.isGitRepo ?? false);
    const title = workspace?.name ?? project.name;
    return {
      project,
      listing,
      title,
      tops: listing && "scripts" in listing ? scriptTree(listing.scripts, repos, title) : [],
    };
  });
  const allPackages = trees.flatMap((t) => t.tops.flatMap((top) => top.repos.flatMap((r) => r.packages)));
  // One top folder in all: open it from the start.
  const single = trees.length === 1 && trees[0]!.tops.length === 1;
  const expanded = (key: string) => open[key] ?? single;
  const toggle = (key: string) => void setOpen({ ...open, [key]: !expanded(key) });

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = words.length
    ? [...located.values()].filter((l) => {
        const text =
          `${l.script.name} ${l.pkg} ${l.where} ${l.script.folder} ${l.script.command}`.toLowerCase();
        return words.every((w) => text.includes(w)) && (showHidden || !m.isHidden(l));
      })
    : [];

  const groupMenu = (g: ScriptGroup, index: number) => (e: MouseEvent) =>
    ctx.menu(
      [
        {
          label: "Rename…",
          icon: "pencil",
          onSelect: async () => {
            const name = await ctx.prompt({ title: "Rename group", initial: g.name, confirmLabel: "Rename" });
            if (name) m.setGroups(renameGroup(groups, g.id, name));
          },
        },
        {
          label: "Move up",
          icon: "arrow-up",
          disabled: index === 0,
          onSelect: () => m.setGroups(moveGroup(groups, g.id, -1)),
        },
        {
          label: "Move down",
          icon: "arrow-down",
          disabled: index === groups.length - 1,
          onSelect: () => m.setGroups(moveGroup(groups, g.id, 1)),
        },
        { separator: true },
        {
          label: "Delete group",
          icon: "trash-2",
          danger: true,
          onSelect: () => m.setGroups(removeGroup(groups, g.id)),
        },
      ],
      e.nativeEvent,
    );
  // Groups made on a project's dashboard show here too, so every group has Start and Stop.
  const projectGroups = ordered.flatMap((project) => {
    const listing = listings[project.id];
    return listing && "groups" in listing ? listing.groups.map((g) => ({ project, g })) : [];
  });

  if (folders.length === 0) return <Empty icon={SquareTerminal} title="No projects" />;
  return (
    <div className="flex h-full flex-col" data-testid="scripts-view">
      <div className="flex shrink-0 flex-col gap-1.5 border-b border-line p-2">
        <div className="flex items-center gap-1">
          <span className="min-w-0 flex-1 truncate text-xs text-muted">
            {countText(allPackages) || "Scripts"}
          </span>
          <IconButton
            icon={showHidden ? Eye : EyeOff}
            size="sm"
            label={showHidden ? "Leave hidden scripts out" : "Show hidden scripts"}
            active={showHidden}
            onClick={() => setShowHidden(!showHidden)}
            data-testid="scripts-show-hidden"
          />
          <IconButton
            icon={FolderPlus}
            size="sm"
            label="New group"
            data-testid="scripts-new-group"
            onClick={async () => {
              const name = await ctx.prompt({
                title: "New group",
                message: "Then add scripts to it from their ⋯ menu (Add to group).",
                confirmLabel: "Create",
              });
              if (name?.trim()) m.setGroups(newGroup(groups, name));
            }}
          />
        </div>
        <SearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery("")}
          onKeyDown={(e) => e.key === "Escape" && setQuery("")}
          placeholder="Filter scripts"
          data-testid="scripts-filter"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {words.length ? (
          <Section title={`${matches.length} found`} testId="scripts-matches">
            {matches.length === 0 && <div className="px-2 text-xs text-hint">No script matches.</div>}
            {matches.slice(0, 200).map((l) => (
              <ScriptRow key={memberKey(l.project.path, l.script.id)} m={m} l={l} context />
            ))}
          </Section>
        ) : (
          <>
            <RunningList m={m} />
            {(groups.length > 0 || projectGroups.length > 0) && (
              <Section title="Groups" testId="scripts-groups">
                {groups.map((g, i) => (
                  <GroupCard
                    key={g.id}
                    m={m}
                    name={g.name}
                    group={g}
                    members={g.members.map((key) => ({ key, l: m.find(key) }))}
                    testId={`scripts-group-${g.name}`}
                    menu={groupMenu(g, i)}
                    open={open[`group:${g.id}`] ?? false}
                    onToggle={() =>
                      void setOpen({ ...open, [`group:${g.id}`]: !(open[`group:${g.id}`] ?? false) })
                    }
                  />
                ))}
                {projectGroups.map(({ project, g }) => (
                  <GroupCard
                    key={`${project.id}:${g.id}`}
                    m={m}
                    name={g.name}
                    from={project.name}
                    members={g.scriptIds.map((id) => ({
                      key: id,
                      l: located.get(memberKey(project.path, id)),
                    }))}
                    testId={`scripts-group-${g.name}`}
                    open={open[`group:${project.id}:${g.id}`] ?? false}
                    onToggle={() =>
                      void setOpen({
                        ...open,
                        [`group:${project.id}:${g.id}`]: !(open[`group:${project.id}:${g.id}`] ?? false),
                      })
                    }
                  />
                ))}
              </Section>
            )}
            <Section
              title="All scripts"
              testId="scripts-all"
              fold={{
                open: open["section:all"] ?? true,
                onToggle: () => void setOpen({ ...open, "section:all": !(open["section:all"] ?? true) }),
              }}
            >
              {trees.map((t) => (
                <div key={t.project.path} className="mb-2">
                  {trees.length > 1 && (
                    <div className="px-2 pb-1 text-xs font-medium text-muted">{t.title}</div>
                  )}
                  {!t.listing && <Spinner center />}
                  {t.listing && "error" in t.listing && (
                    <div className="px-2 text-xs text-danger">{t.listing.error}</div>
                  )}
                  {t.listing && "scripts" in t.listing && t.listing.scripts.length === 0 && (
                    <div className="px-2 text-xs text-hint">No scripts found.</div>
                  )}
                  <Tree
                    m={m}
                    tops={t.tops}
                    locate={(s) => located.get(memberKey(t.project.path, s.id))!}
                    showHidden={showHidden}
                    expanded={expanded}
                    toggle={toggle}
                    prefix={t.project.path}
                  />
                </div>
              ))}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function anchor() {
  return document.querySelector<HTMLElement>("[data-testid=goto-button]") ?? document.body;
}

export async function runScriptMenu(ctx: AddonUiContext) {
  const project = ctx.projects.active();
  if (!project) return ctx.notify({ title: "Pick a project first", tone: "warning" });
  const { scripts } = await ctx.scripts.list(project.id);
  if (scripts.length === 0)
    return ctx.notify({ title: `No scripts found in ${project.name}`, tone: "warning" });
  ctx.menu(
    scripts.map((s) => ({
      label: s.folder ? `${s.folder}: ${s.name}` : s.name,
      onSelect: () => void safe(ctx, s.name, () => ctx.scripts.run(project.id, s.id)),
    })),
    anchor(),
  );
}

/** Tools → Start a script group…: your groups from the Scripts view, then the project's own. */
export async function runGroupMenu(ctx: AddonUiContext) {
  const mine = (await ctx.storage.get<ScriptGroup[]>("groups")) ?? [];
  const project = ctx.projects.active();
  const theirs = project ? (await ctx.scripts.list(project.id)).groups : [];
  if (mine.length === 0 && theirs.length === 0)
    return ctx.notify({
      title: "No script groups yet",
      message: "In the Scripts view: New group, then add scripts from their ⋯ menu.",
      tone: "info",
    });
  const projects = ctx.projects.list();
  const startMine = async (g: ScriptGroup) => {
    for (const key of g.members) {
      const at = key.indexOf("|");
      const p = projects.find((x) => x.path === key.slice(0, at));
      if (p) await safe(ctx, g.name, () => ctx.scripts.run(p.id, key.slice(at + 1)));
    }
  };
  ctx.menu(
    [
      ...mine.map((g) => ({ label: g.name, icon: "layers", onSelect: () => void startMine(g) })),
      ...theirs.map((g) => ({
        label: `${g.name} (${project!.name})`,
        onSelect: () => void safe(ctx, g.name, () => ctx.scripts.runGroup(project!.id, g.id)),
      })),
    ],
    anchor(),
  );
}

export function stopScriptMenu(ctx: AddonUiContext) {
  const running = ctx.scripts.running();
  if (running.length === 0) return ctx.notify({ title: "No scripts are running" });
  ctx.menu(
    running.map((r) => ({
      label: r.title,
      icon: "square",
      onSelect: () => void ctx.scripts.stop(r.projectId, r.scriptId),
    })),
    anchor(),
  );
}
