import { type AddonComponentProps, type AddonUiContext, type Arrangement, EMPTY_ARRANGEMENT } from "@jig/sdk";
import {
  ArrangeList,
  Badge,
  Button,
  Card,
  cn,
  Empty,
  IconButton,
  Input,
  Spinner,
  useAddonEvent,
  useHostCall,
} from "@jig/sdk/ui";
import {
  Check,
  CircleCheck,
  CircleDashed,
  CircleX,
  ExternalLink,
  ListOrdered,
  LoaderCircle,
  Play,
  RefreshCw,
  Rocket,
  Settings,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { Settings as PipelineSettings, ProjectPipelines } from "./host";
import { pipelineUrl, type Run, runState, runUrl } from "./lib/runs";

type Overview = { org: string; projects: ProjectPipelines[] };

function when(iso?: string) {
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

function StateIcon({ run }: { run?: Run }) {
  const state = runState(run);
  if (state === "running")
    return <LoaderCircle className="size-4 shrink-0 animate-spin text-info" aria-label="Running" />;
  if (state === "queued") return <CircleDashed className="size-4 shrink-0 text-muted" aria-label="Queued" />;
  if (state === "succeeded")
    return <CircleCheck className="size-4 shrink-0 text-success" aria-label="Succeeded" />;
  if (state === "failed") return <CircleX className="size-4 shrink-0 text-danger" aria-label="Failed" />;
  if (state === "partial" || state === "canceled")
    return <TriangleAlert className="size-4 shrink-0 text-warning" aria-label={state} />;
  return <CircleDashed className="size-4 shrink-0 text-hint" aria-label="No runs" />;
}

async function startRun(
  ctx: AddonUiContext,
  project: string,
  id: number,
  name: string,
  defaultBranch?: string,
) {
  const branch = await ctx.prompt({
    title: `Run ${name}`,
    message: "Branch to run on:",
    initial: defaultBranch ?? "main",
    confirmLabel: "Run",
  });
  if (!branch) return;
  try {
    const { run } = await ctx.host.call<{ run: Run; url: string }>("run", { project, id, branch, name });
    ctx.notify({
      title: `${name} started`,
      message: `Run ${run.buildNumber} on ${branch}. You'll be told when it finishes.`,
      tone: "success",
    });
  } catch (error) {
    ctx.notify({ title: `Couldn't run ${name}`, message: (error as Error).message, tone: "danger" });
  }
}

/** Your arrangement of each Azure DevOps project's pipelines (hidden, order, dividers). */
function useArrangements(ctx: AddonUiContext) {
  const [all, setAll] = useState<Record<string, Arrangement>>();
  useEffect(() => {
    const load = () =>
      void ctx.storage.get<Record<string, Arrangement>>("arrangement").then((v) => setAll(v ?? {}));
    load();
    // Claude changed the stored data.
    return ctx.on("storage", load);
  }, [ctx]);
  const set = (project: string, next: Arrangement) =>
    setAll((current) => {
      const updated = { ...(current ?? {}), [project]: next };
      void ctx.storage.set("arrangement", updated);
      return updated;
    });
  return [all, set] as const;
}

export function PipelinesView({ ctx }: AddonComponentProps) {
  const { data, error, loading, reload } = useHostCall<Overview>("overview");
  const [arrangements, setArrangement] = useArrangements(ctx);
  const [arranging, setArranging] = useState(false);
  useAddonEvent("runs-changed", () => void reload());
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && void reload(), 30_000);
    return () => clearInterval(t);
  }, [reload]);
  if (error) return <div className="p-3 text-xs text-danger">{error}</div>;
  if (!data) return <Spinner className="m-3" />;
  if (!data.org || data.projects.length === 0)
    return (
      <Empty icon={Rocket} title="Set up Azure DevOps">
        <p>Choose your organisation and projects. Jig uses your own az CLI login.</p>
        <Button size="sm" className="mt-2" icon={Settings} onClick={() => ctx.openSettings()}>
          Set up
        </Button>
      </Empty>
    );
  return (
    <div className="flex h-full flex-col" data-testid="pipelines-view">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line px-2 text-xs text-muted">
        <span className="min-w-0 flex-1 truncate">{data.org.replace(/^https:\/\//, "")}</span>
        {loading && <Spinner size="sm" />}
        <Button
          size="sm"
          variant={arranging ? "primary" : "ghost"}
          icon={arranging ? Check : ListOrdered}
          onClick={() => setArranging(!arranging)}
          data-testid="pipelines-arrange"
          title="Hide pipelines, reorder them, group them with dividers"
        >
          {arranging ? "Done" : "Arrange"}
        </Button>
        <IconButton icon={RefreshCw} size="sm" label="Refresh" onClick={() => void reload()} />
        <IconButton icon={Settings} size="sm" label="Pipelines settings" onClick={() => ctx.openSettings()} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {data.projects.map((p) => (
          <div key={p.project} className="mb-2">
            <div className="px-2 py-1 text-2xs font-semibold tracking-wide text-hint uppercase">
              {p.project}
            </div>
            {p.error && <div className="px-2 text-xs text-danger">{p.error}</div>}
            {!p.error && p.pipelines.length === 0 && (
              <div className="px-2 text-xs text-muted">No pipelines.</div>
            )}
            <ArrangeList
              items={p.pipelines}
              keyOf={(pl) => String(pl.id)}
              arrangement={arrangements?.[p.project] ?? EMPTY_ARRANGEMENT}
              onChange={(next) => setArrangement(p.project, next)}
              arranging={arranging}
              testId={`pipelines-project-${p.project}`}
              renderItem={(pl) => (
                <div
                  role="button"
                  tabIndex={0}
                  data-testid={`pipeline-${pl.name}`}
                  onClick={() =>
                    !arranging &&
                    ctx.openExternal(
                      pl.latest
                        ? runUrl(data.org, p.project, pl.latest.id)
                        : pipelineUrl(data.org, p.project, pl.id),
                    )
                  }
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    ctx.openExternal(
                      pl.latest
                        ? runUrl(data.org, p.project, pl.latest.id)
                        : pipelineUrl(data.org, p.project, pl.id),
                    )
                  }
                  onContextMenu={(e) => {
                    e.preventDefault();
                    ctx.menu(
                      [
                        {
                          label: "Run…",
                          icon: "play",
                          onSelect: () => void startRun(ctx, p.project, pl.id, pl.name, pl.latest?.branch),
                        },
                        {
                          label: "Open pipeline in browser",
                          icon: "external-link",
                          onSelect: () => ctx.openExternal(pipelineUrl(data.org, p.project, pl.id)),
                        },
                        ...(pl.latest
                          ? [
                              {
                                label: "Open latest run",
                                icon: "external-link",
                                onSelect: () => ctx.openExternal(runUrl(data.org, p.project, pl.latest!.id)),
                              },
                            ]
                          : []),
                      ],
                      e.nativeEvent,
                    );
                  }}
                  className="group flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 hover:bg-hover"
                >
                  <StateIcon run={pl.latest} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{pl.name}</div>
                    <div className="truncate text-xs text-muted">
                      {pl.latest
                        ? `${pl.latest.branch} · ${when(pl.latest.finishTime ?? pl.latest.startTime ?? pl.latest.queueTime)}${pl.latest.requestedBy ? ` · ${pl.latest.requestedBy}` : ""}`
                        : "never run"}
                    </div>
                  </div>
                  <span className="hidden group-hover:flex group-focus-within:flex">
                    <IconButton
                      icon={Play}
                      size="sm"
                      label={`Run ${pl.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void startRun(ctx, p.project, pl.id, pl.name, pl.latest?.branch);
                      }}
                    />
                    <IconButton
                      icon={ExternalLink}
                      size="sm"
                      label="Open in browser"
                      onClick={(e) => {
                        e.stopPropagation();
                        ctx.openExternal(pipelineUrl(data.org, p.project, pl.id));
                      }}
                    />
                  </span>
                </div>
              )}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PipelinesSettings({ ctx }: AddonComponentProps) {
  const { data } = useHostCall<PipelineSettings>("settings");
  const [org, setOrg] = useState("");
  const [projects, setProjects] = useState<string[]>([]);
  // What is typed in the project-names box, as typed (spaces included); `projects` is parsed from it.
  const [projectsText, setProjectsText] = useState("");
  const [available, setAvailable] = useState<string[]>();
  const [status, setStatus] = useState<{ ok: boolean; message: string }>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) {
      setOrg(data.org);
      setProjects(data.projects);
      setProjectsText(data.projects.join(", "));
    }
  }, [data]);
  const save = async (next: PipelineSettings) => {
    await ctx.host.call("saveSettings", next);
    ctx.notify({ title: "Pipelines settings saved", tone: "success" });
  };
  const loadProjects = async () => {
    setBusy(true);
    try {
      setAvailable(await ctx.host.call<string[]>("listProjects", { org }));
    } catch (error) {
      ctx.notify({ title: "Couldn't list projects", message: (error as Error).message, tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-6" data-testid="pipelines-settings">
      <div>
        <h2 className="text-lg font-semibold">Pipelines</h2>
        <p className="text-sm text-muted">Azure DevOps through your own Azure CLI. Jig stores no tokens.</p>
      </div>
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => void ctx.host.call<{ ok: boolean; message: string }>("check").then(setStatus)}
          >
            Check Azure CLI
          </Button>
          {status && (
            <span className={cn("text-sm", status.ok ? "text-success" : "text-warning")}>
              {status.message}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1 text-sm">
          Organisation
          <Input
            value={org}
            placeholder="https://dev.azure.com/your-org"
            onChange={(e) => setOrg(e.target.value)}
            aria-label="Organisation"
            data-testid="pipelines-org"
          />
        </div>
        <div className="flex flex-col gap-1 text-sm">
          <div className="flex items-center gap-2">
            Projects
            <Button
              size="sm"
              variant="ghost"
              busy={busy}
              disabled={!org.trim()}
              onClick={() => void loadProjects()}
            >
              Load from Azure DevOps
            </Button>
          </div>
          {available ? (
            <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {available.map((name) => (
                <label key={name} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-accent"
                    checked={projects.includes(name)}
                    onChange={(e) =>
                      setProjects((list) =>
                        e.target.checked ? [...list, name] : list.filter((x) => x !== name),
                      )
                    }
                  />
                  {name}
                </label>
              ))}
            </div>
          ) : (
            <Input
              value={projectsText}
              placeholder="Project names, separated by commas"
              onChange={(e) => {
                setProjectsText(e.target.value);
                setProjects(
                  e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                );
              }}
              data-testid="pipelines-projects"
            />
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => void save({ org, projects })}
            data-testid="pipelines-save"
          >
            Save
          </Button>
          {projects.filter(Boolean).map((p) => (
            <Badge key={p}>{p}</Badge>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function showPipelines(ctx: AddonUiContext) {
  ctx.showView("pipelines");
}

/** Tools → Run a pipeline…: a menu of every pipeline. */
export async function runPipelineAction(ctx: AddonUiContext) {
  const data = await ctx.host.call<Overview>("overview");
  if (!data.org || data.projects.length === 0) return ctx.openSettings();
  ctx.menu(
    data.projects.map((p) => ({
      label: p.project,
      submenu: p.pipelines.map((pl) => ({
        label: pl.name,
        onSelect: () => void startRun(ctx, p.project, pl.id, pl.name, pl.latest?.branch),
      })),
    })),
    document.querySelector<HTMLElement>("[data-testid=tools-button]") ?? document.body,
  );
}
