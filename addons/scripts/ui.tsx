import type {
  AddonComponentProps,
  AddonProject,
  AddonScript,
  AddonScriptGroup,
  AddonUiContext,
} from "@jig/sdk";
import { Badge, Empty, IconButton, Spinner, useProjectList, useRunningScripts } from "@jig/sdk/ui";
import { ChevronDown, ChevronRight, Layers, Play, RotateCw, Square, SquareTerminal } from "lucide-react";
import { useEffect, useState } from "react";

type Listing = { scripts: AddonScript[]; groups: AddonScriptGroup[] };

function useListings(ctx: AddonUiContext, projects: AddonProject[]) {
  const [data, setData] = useState<Record<string, Listing | { error: string }>>({});
  const [version, setVersion] = useState(0);
  const key = projects.map((p) => p.id).join(",");
  // Groups made on the dashboard, a rescan: list again.
  useEffect(() => ctx.scripts.onChange(() => setVersion((v) => v + 1)), [ctx]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload when the project list changes.
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

function ProjectScripts({
  ctx,
  project,
  listing,
}: {
  ctx: AddonUiContext;
  project: AddonProject;
  listing?: Listing | { error: string };
}) {
  const [open, setOpen] = useState(true);
  const running = useRunningScripts();
  const runningIds = new Map(running.filter((r) => r.projectId === project.id).map((r) => [r.scriptId, r]));
  return (
    <div className="mb-2">
      <button
        type="button"
        className="flex h-7 w-full items-center gap-1 px-2 text-left text-xs font-medium text-muted hover:text-fg"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <span className="flex-1 truncate">{project.name}</span>
        {runningIds.size > 0 && <Badge tone="success">{runningIds.size} running</Badge>}
      </button>
      {open && !listing && <Spinner size="sm" className="mx-4" />}
      {open && listing && "error" in listing && (
        <div className="px-4 text-xs text-danger">{listing.error}</div>
      )}
      {open && listing && "scripts" in listing && (
        <>
          {listing.groups.map((g) => (
            <div
              key={g.id}
              className="group flex h-7 items-center gap-2 rounded-md pr-1 pl-5 text-sm hover:bg-hover"
            >
              <Layers className="size-3.5 text-muted" />
              <span className="flex-1 truncate">{g.name}</span>
              <IconButton
                icon={Play}
                size="sm"
                label={`Start ${g.name}`}
                onClick={() => void safe(ctx, g.name, () => ctx.scripts.runGroup(project.id, g.id))}
              />
            </div>
          ))}
          {listing.scripts.length === 0 && <div className="px-5 text-xs text-hint">No scripts found.</div>}
          {listing.scripts.map((s) => {
            const r = runningIds.get(s.id);
            return (
              <div
                key={s.id}
                className="group flex h-7 items-center gap-2 rounded-md pr-1 pl-5 text-sm hover:bg-hover"
                data-testid={`scripts-addon-${s.name}`}
              >
                <span
                  className={r ? "size-1.5 rounded-full bg-success" : "size-1.5 rounded-full bg-line-strong"}
                />
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left"
                  title={s.detail ?? s.command}
                  onClick={() =>
                    r
                      ? ctx.scripts.show(r.terminalId)
                      : void safe(ctx, s.name, () => ctx.scripts.run(project.id, s.id))
                  }
                >
                  {s.folder ? <span className="text-hint">{s.folder}/</span> : null}
                  {s.name}
                </button>
                {r ? (
                  <>
                    <IconButton
                      icon={RotateCw}
                      size="sm"
                      label="Restart"
                      onClick={() => void safe(ctx, s.name, () => ctx.scripts.restart(project.id, s.id))}
                    />
                    <IconButton
                      icon={Square}
                      size="sm"
                      label="Stop"
                      onClick={() => void ctx.scripts.stop(project.id, s.id)}
                    />
                  </>
                ) : (
                  <IconButton
                    icon={Play}
                    size="sm"
                    label="Run"
                    className="opacity-0 group-hover:opacity-100"
                    onClick={() => void safe(ctx, s.name, () => ctx.scripts.run(project.id, s.id))}
                  />
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

export function ScriptsView({ ctx }: AddonComponentProps) {
  const projects = useProjectList();
  const listings = useListings(ctx, projects);
  const active = ctx.projects.active();
  const ordered = [...projects].sort((a, b) => (a.id === active?.id ? -1 : b.id === active?.id ? 1 : 0));
  if (projects.length === 0) return <Empty icon={SquareTerminal} title="No projects" />;
  return (
    <div className="h-full overflow-y-auto p-1" data-testid="scripts-view">
      {ordered.map((p) => (
        <ProjectScripts key={p.id} ctx={ctx} project={p} listing={listings[p.id]} />
      ))}
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
