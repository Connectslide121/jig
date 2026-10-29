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
  Badge,
  Button,
  cn,
  Empty,
  IconButton,
  Spinner,
  useProjectList,
  useRunningScripts,
  useStorage,
  useWorkspaceList,
} from "@jig/sdk/ui";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  FolderPlus,
  Layers,
  MoreHorizontal,
  Play,
  Square,
  SquareTerminal,
} from "lucide-react";
import { type MouseEvent, useEffect, useMemo, useState } from "react";
import {
  addMember,
  groupState,
  memberKey,
  moveGroup,
  newGroup,
  parseMember,
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

/** A script with the project it belongs to, and how to call it in a group or the running list. */
interface Located {
  project: AddonProject;
  script: AddonScript;
  /** "web · dev": the package and the script. */
  label: string;
}

/** Everything the view's parts share: projects, scripts, running, groups and hidden scripts. */
interface Model {
  ctx: AddonUiContext;
  running: Map<string, RunningScript>;
  find: (member: string) => Located | undefined;
  /** The script a running terminal belongs to. */
  findRun: (projectId: string, scriptId: string) => Located | undefined;
  groups: ScriptGroup[];
  setGroups: (next: ScriptGroup[]) => void;
  isHidden: (folder: string, scriptId: string) => boolean;
  toggleHide: (folder: string, scriptId: string) => void;
}

const runKey = (projectId: string, scriptId: string) => `${projectId}|${scriptId}`;

function scriptMenu(m: Model, located: Located, e: MouseEvent, group?: ScriptGroup) {
  e.preventDefault();
  const { project, script } = located;
  const { ctx } = m;
  const member = memberKey(project.path, script.id);
  const r = m.running.get(runKey(project.id, script.id));
  ctx.menu(
    [
      r
        ? { label: "Stop", icon: "square", onSelect: () => void ctx.scripts.stop(project.id, script.id) }
        : {
            label: "Run",
            icon: "play",
            onSelect: () => void safe(ctx, script.name, () => ctx.scripts.run(project.id, script.id)),
          },
      ...(r
        ? [
            {
              label: "Show its terminal",
              icon: "square-terminal",
              onSelect: () => ctx.scripts.show(r.terminalId),
            },
          ]
        : []),
      ...(script.url
        ? [
            {
              label: `Open ${script.url}`,
              icon: "external-link",
              onSelect: () => ctx.openExternal(script.url!),
            },
          ]
        : []),
      { separator: true },
      group
        ? {
            label: `Remove from ${group.name}`,
            icon: "x",
            onSelect: () => m.setGroups(removeMember(m.groups, group.id, member)),
          }
        : {
            label: "Add to group",
            icon: "layers",
            submenu: [
              ...m.groups.map((g) => ({
                label: g.name,
                checked: g.members.includes(member),
                onSelect: () => m.setGroups(addMember(m.groups, g.id, member)),
              })),
              ...(m.groups.length ? [{ separator: true as const }] : []),
              {
                label: "New group…",
                icon: "folder-plus",
                onSelect: async () => {
                  const name = await ctx.prompt({
                    title: "New group",
                    message: `With ${located.label}.`,
                    confirmLabel: "Create",
                  });
                  if (name?.trim()) m.setGroups(newGroup(m.groups, name, member));
                },
              },
            ],
          },
      ...(group
        ? []
        : [
            {
              label: m.isHidden(project.path, script.id) ? "Show it" : "Hide it",
              icon: m.isHidden(project.path, script.id) ? "eye" : "eye-off",
              onSelect: () => m.toggleHide(project.path, script.id),
            },
          ]),
    ],
    e.nativeEvent,
  );
}

/** A script as a chip: ▶ name to start; while it runs, a green ■ name that stops it. */
function ScriptChip({
  m,
  located,
  label,
  group,
  hidden,
}: {
  m: Model;
  located: Located;
  label: string;
  group?: ScriptGroup;
  hidden?: boolean;
}) {
  const { project, script } = located;
  const { ctx } = m;
  const r = m.running.get(runKey(project.id, script.id));
  return (
    <span className="inline-flex" data-testid={`scripts-addon-${script.name}`}>
      <button
        type="button"
        title={`${script.detail ?? script.command}\n${project.name}${script.folder ? ` · ${script.folder}` : ""}`}
        onClick={() =>
          r
            ? void ctx.scripts.stop(project.id, script.id)
            : void safe(ctx, script.name, () => ctx.scripts.run(project.id, script.id))
        }
        onContextMenu={(e) => scriptMenu(m, located, e, group)}
        className={cn(
          "inline-flex h-6 max-w-full items-center gap-1 truncate rounded-md border px-1.5 text-xs",
          r ? "border-success bg-success-soft text-success" : "border-line bg-surface text-fg hover:bg-hover",
          hidden && "opacity-50",
        )}
      >
        {r ? <Square className="size-3 shrink-0" /> : <Play className="size-3 shrink-0" />}
        <span className="truncate">{label}</span>
        {hidden && <EyeOff className="size-3 shrink-0 text-hint" />}
      </button>
    </span>
  );
}

/** Scripts running now, wherever they're from: open the address, show the terminal, stop. */
function RunningList({ m }: { m: Model }) {
  const runs = [...m.running.values()];
  if (runs.length === 0) return null;
  return (
    <section className="mb-3" data-testid="scripts-running">
      <div className="px-2 pb-1 text-2xs font-semibold tracking-wide text-hint uppercase">Running</div>
      {runs.map((r) => {
        const url = m.findRun(r.projectId, r.scriptId)?.script.url;
        return (
          <div
            key={r.terminalId}
            className="group flex h-7 items-center gap-2 rounded-md px-2 text-sm hover:bg-hover"
          >
            <span className="size-1.5 shrink-0 rounded-full bg-success" />
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left"
              onClick={() => m.ctx.scripts.show(r.terminalId)}
            >
              {r.title}
            </button>
            {url && (
              <IconButton
                icon={ExternalLink}
                size="sm"
                label={`Open ${url}`}
                onClick={() => m.ctx.openExternal(url)}
              />
            )}
            <IconButton
              icon={Square}
              size="sm"
              label={`Stop ${r.title}`}
              onClick={() => void m.ctx.scripts.stop(r.projectId, r.scriptId)}
            />
          </div>
        );
      })}
    </section>
  );
}

/** One of your groups: Start and Stop for all of it, its scripts as chips. */
function GroupCard({ m, group, index }: { m: Model; group: ScriptGroup; index: number }) {
  const { ctx } = m;
  const members = group.members.map((key) => ({ key, located: m.find(key) }));
  const isRunning = (key: string) => {
    const l = m.find(key);
    return !!l && m.running.has(runKey(l.project.id, l.script.id));
  };
  const { running, stopped } = groupState(group, isRunning);
  const start = () =>
    void Promise.all(
      stopped
        .map(m.find)
        .map((l) => l && safe(ctx, l.script.name, () => ctx.scripts.run(l.project.id, l.script.id))),
    );
  const stop = () =>
    void Promise.all(running.map(m.find).map((l) => l && ctx.scripts.stop(l.project.id, l.script.id)));
  const menu = (e: MouseEvent) =>
    ctx.menu(
      [
        {
          label: "Rename…",
          icon: "pencil",
          onSelect: async () => {
            const name = await ctx.prompt({
              title: "Rename group",
              initial: group.name,
              confirmLabel: "Rename",
            });
            if (name) m.setGroups(renameGroup(m.groups, group.id, name));
          },
        },
        {
          label: "Move up",
          icon: "arrow-up",
          disabled: index === 0,
          onSelect: () => m.setGroups(moveGroup(m.groups, group.id, -1)),
        },
        {
          label: "Move down",
          icon: "arrow-down",
          disabled: index === m.groups.length - 1,
          onSelect: () => m.setGroups(moveGroup(m.groups, group.id, 1)),
        },
        { separator: true },
        {
          label: "Delete group",
          icon: "trash-2",
          danger: true,
          onSelect: () => m.setGroups(removeGroup(m.groups, group.id)),
        },
      ],
      e.nativeEvent,
    );
  return (
    <div className="mb-2 rounded-md border border-line p-2" data-testid={`scripts-group-${group.name}`}>
      <div className="flex items-center gap-1.5">
        <Layers className="size-3.5 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{group.name}</span>
        {running.length > 0 && (
          <Badge tone="success">
            {running.length}/{group.members.length}
          </Badge>
        )}
        <Button
          size="sm"
          variant="ghost"
          icon={Play}
          disabled={stopped.length === 0}
          onClick={start}
          data-testid={`scripts-group-start-${group.name}`}
        >
          Start
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={Square}
          disabled={running.length === 0}
          onClick={stop}
          data-testid={`scripts-group-stop-${group.name}`}
        >
          Stop
        </Button>
        <IconButton icon={MoreHorizontal} size="sm" label={`${group.name} options`} onClick={menu} />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {members.length === 0 && (
          <span className="text-xs text-hint">Right-click a script below → Add to group.</span>
        )}
        {members.map(({ key, located }) =>
          located ? (
            <ScriptChip key={key} m={m} located={located} label={located.label} group={group} />
          ) : (
            <button
              key={key}
              type="button"
              title="This script isn't found any more. Click to remove it from the group."
              className="h-6 rounded-md border border-dashed border-line px-1.5 text-xs text-hint"
              onClick={() => m.setGroups(removeMember(m.groups, group.id, key))}
            >
              {parseMember(key).scriptId.split(":").pop()} (gone)
            </button>
          ),
        )}
      </div>
    </div>
  );
}

const TAGS: Record<PackageNode["kind"], { text: string; tone: "info" | "warning" | "neutral" }> = {
  api: { text: "API", tone: "info" },
  npm: { text: "npm", tone: "warning" },
  script: { text: "script", tone: "neutral" },
};

/** A package or project: its tag and name, then its scripts. */
function PackageRow({
  m,
  project,
  node,
  showHidden,
}: {
  m: Model;
  project: AddonProject;
  node: PackageNode;
  showHidden: boolean;
}) {
  const scripts = node.scripts.filter((s) => showHidden || !m.isHidden(project.path, s.id));
  if (scripts.length === 0) return null;
  return (
    <div className="mb-1.5 pl-6" data-testid={`scripts-package-${node.folder || node.label}`}>
      <div className="flex items-center gap-1.5 pb-0.5 text-xs">
        <Badge tone={TAGS[node.kind].tone}>{TAGS[node.kind].text}</Badge>
        <span className="truncate font-medium" title={node.folder}>
          {node.label}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {scripts.map((s) => (
          <ScriptChip
            key={s.id}
            m={m}
            located={{ project, script: s, label: `${node.label} · ${s.name}` }}
            label={s.name}
            hidden={m.isHidden(project.path, s.id)}
          />
        ))}
      </div>
    </div>
  );
}

/** A folding row of the tree: its name, a dot when something in it runs, what it holds. */
function Fold({
  label,
  open,
  onToggle,
  active,
  count,
  depth,
  testId,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  active: boolean;
  count: string;
  depth: number;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      data-testid={testId}
      className={cn(
        "flex h-7 w-full items-center gap-1 rounded-md pr-2 text-left text-sm hover:bg-hover",
        depth ? "pl-5" : "pl-1",
      )}
    >
      {open ? (
        <ChevronDown className="size-3.5 shrink-0 text-muted" />
      ) : (
        <ChevronRight className="size-3.5 shrink-0 text-muted" />
      )}
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      {active && <span className="size-1.5 shrink-0 rounded-full bg-success" />}
      <span className="shrink-0 text-2xs text-hint">{count}</span>
    </button>
  );
}

function Tree({
  m,
  project,
  tops,
  showHidden,
  expanded,
  toggle,
}: {
  m: Model;
  project: AddonProject;
  tops: TopNode[];
  showHidden: boolean;
  expanded: (key: string) => boolean;
  toggle: (key: string) => void;
}) {
  const visible = (packages: PackageNode[]) =>
    packages.filter((p) => p.scripts.some((s) => showHidden || !m.isHidden(project.path, s.id)));
  const active = (packages: PackageNode[]) =>
    packages.some((p) => p.scripts.some((s) => m.running.has(runKey(project.id, s.id))));
  const packages = (list: PackageNode[]) =>
    visible(list).map((node) => (
      <PackageRow key={node.folder} m={m} project={project} node={node} showHidden={showHidden} />
    ));
  return (
    <>
      {tops.map((top) => {
        const all = top.repos.flatMap((r) => r.packages);
        if (visible(all).length === 0) return null;
        const key = `${project.path}|${top.key}`;
        return (
          <div key={top.key}>
            <Fold
              label={top.label}
              open={expanded(key)}
              onToggle={() => toggle(key)}
              active={active(all)}
              count={countText(visible(all))}
              depth={0}
              testId={`scripts-top-${top.label}`}
            />
            {expanded(key) &&
              (top.flat
                ? packages(all)
                : top.repos.map((repo) => {
                    if (visible(repo.packages).length === 0) return null;
                    const rk = `${project.path}|${repo.key}`;
                    return (
                      <div key={repo.key}>
                        <Fold
                          label={repo.label || top.label}
                          open={expanded(rk)}
                          onToggle={() => toggle(rk)}
                          active={active(repo.packages)}
                          count={countText(visible(repo.packages))}
                          depth={1}
                          testId={`scripts-repo-${repo.label || top.label}`}
                        />
                        {expanded(rk) && <div className="pl-3">{packages(repo.packages)}</div>}
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
 * Every script Jig finds, like the scripts plugin (D-142): what runs now, your groups (Start and Stop
 * for each), then each folder as a tree of top folder → repository → package, scripts as chips.
 * Right-click a script to add it to a group or hide it. The right side is global (D-102).
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
  const active = ctx.projects.active();
  const ordered = [...folders].sort((a, b) =>
    a.path === active?.path ? -1 : b.path === active?.path ? 1 : 0,
  );

  const located = useMemo(() => {
    const map = new Map<string, Located>();
    for (const project of folders) {
      const listing = listings[project.id];
      if (!listing || !("scripts" in listing)) continue;
      for (const script of listing.scripts) {
        const pkg = script.folder ? (script.folder.split("/").pop() ?? script.folder) : project.name;
        map.set(memberKey(project.path, script.id), { project, script, label: `${pkg} · ${script.name}` });
      }
    }
    return map;
  }, [folders, listings]);

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
    isHidden: (folder, id) => (arrangements[folder]?.hidden ?? []).includes(`s:${id}`),
    toggleHide: (folder, id) =>
      void setArrangements({
        ...arrangements,
        [folder]: toggleHidden(arrangements[folder] ?? EMPTY_ARRANGEMENT, `s:${id}`),
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
  const all = trees.flatMap((t) => t.tops.flatMap((top) => top.repos.flatMap((r) => r.packages)));
  // One top folder in all: open it from the start.
  const single = trees.length === 1 && trees[0]!.tops.length === 1;
  const expanded = (key: string) => open[key] ?? single;
  const toggle = (key: string) => void setOpen({ ...open, [key]: !expanded(key) });

  if (folders.length === 0) return <Empty icon={SquareTerminal} title="No projects" />;
  return (
    <div className="flex h-full flex-col" data-testid="scripts-view">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line px-2 text-xs text-muted">
        <span className="min-w-0 flex-1 truncate">{countText(all) || "Scripts"}</span>
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
              message: "Then right-click scripts → Add to group.",
              confirmLabel: "Create",
            });
            if (name?.trim()) m.setGroups(newGroup(groups, name));
          }}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        <RunningList m={m} />
        {groups.length > 0 && (
          <section className="mb-3" data-testid="scripts-groups">
            <div className="px-2 pb-1 text-2xs font-semibold tracking-wide text-hint uppercase">Groups</div>
            {groups.map((g, i) => (
              <GroupCard key={g.id} m={m} group={g} index={i} />
            ))}
          </section>
        )}
        {trees.map((t) => (
          <section key={t.project.path} className="mb-2">
            {trees.length > 1 && (
              <div className="px-2 pb-1 text-2xs font-semibold tracking-wide text-hint uppercase">
                {t.title}
              </div>
            )}
            {!t.listing && <Spinner center />}
            {t.listing && "error" in t.listing && (
              <div className="px-4 text-xs text-danger">{t.listing.error}</div>
            )}
            {t.listing && "scripts" in t.listing && t.listing.scripts.length === 0 && (
              <div className="px-3 text-xs text-hint">No scripts found.</div>
            )}
            <Tree
              m={m}
              project={t.project}
              tops={t.tops}
              showHidden={showHidden}
              expanded={expanded}
              toggle={toggle}
            />
          </section>
        ))}
      </div>
    </div>
  );
}

function anchor() {
  return document.querySelector<HTMLElement>("[data-testid=tools-button]") ?? document.body;
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
      message: "In the Scripts view: New group, then right-click scripts → Add to group.",
      tone: "info",
    });
  const projects = ctx.projects.list();
  const startMine = async (g: ScriptGroup) => {
    for (const key of g.members) {
      const { folder, scriptId } = parseMember(key);
      const p = projects.find((x) => x.path === folder);
      if (p) await safe(ctx, g.name, () => ctx.scripts.run(p.id, scriptId));
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
