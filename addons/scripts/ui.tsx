import {
  type AddonComponentProps,
  type AddonProject,
  type AddonScript,
  type AddonScriptGroup,
  type AddonUiContext,
  type Arrangement,
  EMPTY_ARRANGEMENT,
} from "@jig/sdk";
import {
  ArrangeList,
  Badge,
  Button,
  Empty,
  IconButton,
  Spinner,
  useProjectList,
  useRunningScripts,
  useWorkspaceList,
} from "@jig/sdk/ui";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Layers,
  ListOrdered,
  Play,
  RotateCw,
  Square,
  SquareTerminal,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Listing = { scripts: AddonScript[]; groups: AddonScriptGroup[] };

function useListings(ctx: AddonUiContext, projects: AddonProject[]) {
  const [data, setData] = useState<Record<string, Listing | { error: string }>>({});
  const [version, setVersion] = useState(0);
  const key = projects.map((p) => p.id).join(",");
  // Groups made on the dashboard, a rescan: list again.
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

/** One entry of a folder's list: a script group or a script. */
type Item = { kind: "group"; group: AddonScriptGroup } | { kind: "script"; script: AddonScript };
const itemKey = (i: Item) => (i.kind === "group" ? `g:${i.group.id}` : `s:${i.script.id}`);

/** Your arrangement of each folder's list (hidden, order, dividers), the same in every project. */
function useArrangements(ctx: AddonUiContext) {
  const [all, setAll] = useState<Record<string, Arrangement>>();
  useEffect(() => {
    const load = () =>
      void ctx.storage.get<Record<string, Arrangement>>("arrangement").then((v) => setAll(v ?? {}));
    load();
    // Claude changed the stored data.
    return ctx.on("storage", load);
  }, [ctx]);
  const set = (folder: string, next: Arrangement) =>
    setAll((current) => {
      const updated = { ...(current ?? {}), [folder]: next };
      void ctx.storage.set("arrangement", updated);
      return updated;
    });
  return [all, set] as const;
}

function FolderScripts({
  ctx,
  project,
  title,
  listing,
  arrangement,
  onArrange,
  arranging,
}: {
  ctx: AddonUiContext;
  project: AddonProject;
  title: string;
  listing?: Listing | { error: string };
  arrangement: Arrangement;
  onArrange: (next: Arrangement) => void;
  arranging: boolean;
}) {
  const [open, setOpen] = useState(true);
  const running = useRunningScripts();
  const runningIds = new Map(running.filter((r) => r.projectId === project.id).map((r) => [r.scriptId, r]));
  const items: Item[] =
    listing && "scripts" in listing
      ? [
          ...listing.groups.map((group) => ({ kind: "group" as const, group })),
          ...listing.scripts.map((script) => ({ kind: "script" as const, script })),
        ]
      : [];
  const row = (item: Item) => {
    if (item.kind === "group") {
      const g = item.group;
      return (
        <div className="group flex h-7 items-center gap-2 rounded-md pr-1 pl-5 text-sm hover:bg-hover">
          <Layers className="size-3.5 text-muted" />
          <span className="flex-1 truncate">{g.name}</span>
          {!arranging && (
            <IconButton
              icon={Play}
              size="sm"
              label={`Start ${g.name}`}
              onClick={() => void safe(ctx, g.name, () => ctx.scripts.runGroup(project.id, g.id))}
            />
          )}
        </div>
      );
    }
    const sc = item.script;
    const r = runningIds.get(sc.id);
    return (
      <div
        className="group flex h-7 items-center gap-2 rounded-md pr-1 pl-5 text-sm hover:bg-hover"
        data-testid={`scripts-addon-${sc.name}`}
      >
        <span className={r ? "size-1.5 rounded-full bg-success" : "size-1.5 rounded-full bg-line-strong"} />
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left"
          title={sc.detail ?? sc.command}
          disabled={arranging}
          onClick={() =>
            r
              ? ctx.scripts.show(r.terminalId)
              : void safe(ctx, sc.name, () => ctx.scripts.run(project.id, sc.id))
          }
        >
          {sc.folder ? <span className="text-hint">{sc.folder}/</span> : null}
          {sc.name}
        </button>
        {arranging ? null : r ? (
          <>
            <IconButton
              icon={RotateCw}
              size="sm"
              label="Restart"
              onClick={() => void safe(ctx, sc.name, () => ctx.scripts.restart(project.id, sc.id))}
            />
            <IconButton
              icon={Square}
              size="sm"
              label="Stop"
              onClick={() => void ctx.scripts.stop(project.id, sc.id)}
            />
          </>
        ) : (
          <IconButton
            icon={Play}
            size="sm"
            label="Run"
            className="opacity-0 group-hover:opacity-100"
            onClick={() => void safe(ctx, sc.name, () => ctx.scripts.run(project.id, sc.id))}
          />
        )}
      </div>
    );
  };
  return (
    <div className="mb-2">
      <button
        type="button"
        className="flex h-7 w-full items-center gap-1 px-2 text-left text-xs font-medium text-muted hover:text-fg"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <span className="flex-1 truncate">{title}</span>
        {runningIds.size > 0 && <Badge tone="success">{runningIds.size} running</Badge>}
      </button>
      {open && !listing && <Spinner size="sm" className="mx-4" />}
      {open && listing && "error" in listing && (
        <div className="px-4 text-xs text-danger">{listing.error}</div>
      )}
      {open && listing && "scripts" in listing && (
        <>
          {listing.scripts.length === 0 && <div className="px-5 text-xs text-hint">No scripts found.</div>}
          <ArrangeList
            items={items}
            keyOf={itemKey}
            arrangement={arrangement}
            onChange={onArrange}
            arranging={arranging}
            renderItem={row}
            testId={`scripts-folder-${title}`}
          />
        </>
      )}
    </div>
  );
}

/**
 * Every script Jig finds, one group per folder (workspace), whatever the active project (D-102: the
 * right side is global). Arrange: hide scripts, drag them into your order, group them with dividers.
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
  const [arrangements, setArrangement] = useArrangements(ctx);
  const [arranging, setArranging] = useState(false);
  const active = ctx.projects.active();
  const ordered = [...folders].sort((a, b) =>
    a.path === active?.path ? -1 : b.path === active?.path ? 1 : 0,
  );
  if (folders.length === 0) return <Empty icon={SquareTerminal} title="No projects" />;
  const titleOf = (p: AddonProject) => workspaces.find((w) => w.path === p.path)?.name ?? p.name;
  return (
    <div className="flex h-full flex-col" data-testid="scripts-view">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line px-2 text-xs text-muted">
        <span className="flex-1">{arranging ? "Hide, reorder and group your scripts" : "Scripts"}</span>
        <Button
          size="sm"
          variant={arranging ? "primary" : "ghost"}
          icon={arranging ? Check : ListOrdered}
          onClick={() => setArranging(!arranging)}
          data-testid="scripts-arrange"
        >
          {arranging ? "Done" : "Arrange"}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {arrangements &&
          ordered.map((p) => (
            <FolderScripts
              key={p.path}
              ctx={ctx}
              project={p}
              title={titleOf(p)}
              listing={listings[p.id]}
              arrangement={arrangements[p.path] ?? EMPTY_ARRANGEMENT}
              onArrange={(next) => setArrangement(p.path, next)}
              arranging={arranging}
            />
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

export async function runGroupMenu(ctx: AddonUiContext) {
  const project = ctx.projects.active();
  if (!project) return ctx.notify({ title: "Pick a project first", tone: "warning" });
  const { groups } = await ctx.scripts.list(project.id);
  if (groups.length === 0)
    return ctx.notify({
      title: "No script groups yet",
      message: "Create one on the project dashboard (Scripts → Group).",
      tone: "info",
    });
  ctx.menu(
    groups.map((g) => ({
      label: g.name,
      onSelect: () => void safe(ctx, g.name, () => ctx.scripts.runGroup(project.id, g.id)),
    })),
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
