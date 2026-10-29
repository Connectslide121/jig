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
  Switch,
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
  Plus,
  RefreshCw,
  Rocket,
  Settings,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { OrgPipelines } from "./host";
import {
  effectiveOrgs,
  type OrgSettings,
  orgName,
  orgUrl,
  type Settings as PipelineSettings,
} from "./lib/orgs";
import { pipelineUrl, type Run, runState, runUrl } from "./lib/runs";

type Overview = { orgs: OrgPipelines[]; error?: string };

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
  org: string,
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
    const { run } = await ctx.host.call<{ run: Run; url: string }>("run", { org, project, id, branch, name });
    ctx.notify({
      title: `${name} started`,
      message: `Run ${run.buildNumber} on ${branch}. You'll be told when it finishes.`,
      tone: "success",
    });
  } catch (error) {
    ctx.notify({ title: `Couldn't run ${name}`, message: (error as Error).message, tone: "danger" });
  }
}

/**
 * Your arrangement of each Azure DevOps project's pipelines (hidden, order, dividers), keyed
 * `<organisation>/<project>`; arrangements from before several organisations are keyed by project.
 */
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

function PipelineRow({
  ctx,
  org,
  project,
  pl,
  arranging,
}: {
  ctx: AddonUiContext;
  org: string;
  project: string;
  pl: OrgPipelines["projects"][number]["pipelines"][number];
  arranging: boolean;
}) {
  const open = () =>
    ctx.openExternal(pl.latest ? runUrl(org, project, pl.latest.id) : pipelineUrl(org, project, pl.id));
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`pipeline-${pl.name}`}
      onClick={() => !arranging && open()}
      onKeyDown={(e) => e.key === "Enter" && open()}
      onContextMenu={(e) => {
        e.preventDefault();
        ctx.menu(
          [
            {
              label: "Run…",
              icon: "play",
              onSelect: () => void startRun(ctx, org, project, pl.id, pl.name, pl.latest?.branch),
            },
            {
              label: "Open pipeline in browser",
              icon: "external-link",
              onSelect: () => ctx.openExternal(pipelineUrl(org, project, pl.id)),
            },
            ...(pl.latest
              ? [
                  {
                    label: "Open latest run",
                    icon: "external-link",
                    onSelect: () => ctx.openExternal(runUrl(org, project, pl.latest!.id)),
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
            void startRun(ctx, org, project, pl.id, pl.name, pl.latest?.branch);
          }}
        />
        <IconButton
          icon={ExternalLink}
          size="sm"
          label="Open in browser"
          onClick={(e) => {
            e.stopPropagation();
            ctx.openExternal(pipelineUrl(org, project, pl.id));
          }}
        />
      </span>
    </div>
  );
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
  if (data.orgs.length === 0)
    return (
      <Empty icon={Rocket} title="Set up Azure DevOps">
        <p>Pipelines shows every Azure DevOps organisation your az CLI login belongs to.</p>
        {data.error && <p className="mt-1 text-warning">{data.error}</p>}
        <Button size="sm" className="mt-2" icon={Settings} onClick={() => ctx.openSettings()}>
          Set up
        </Button>
      </Empty>
    );
  const several = data.orgs.length > 1;
  return (
    <div className="flex h-full flex-col" data-testid="pipelines-view">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line px-2 text-xs text-muted">
        <span className="min-w-0 flex-1 truncate">
          {several ? `${data.orgs.length} organisations` : orgName(data.orgs[0]!.org)}
        </span>
        {loading && <Spinner size="sm" />}
        <Button
          size="sm"
          variant={arranging ? "primary" : "ghost"}
          icon={arranging ? Check : ListOrdered}
          onClick={() => setArranging(!arranging)}
          data-testid="pipelines-arrange"
          title="Hide projects or pipelines, reorder them, group them with dividers"
        >
          {arranging ? "Done" : "Arrange"}
        </Button>
        <IconButton icon={RefreshCw} size="sm" label="Refresh" onClick={() => void reload()} />
        <IconButton icon={Settings} size="sm" label="Pipelines settings" onClick={() => ctx.openSettings()} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {data.error && <div className="px-2 py-1 text-xs text-warning">{data.error}</div>}
        {data.orgs.map((o) => (
          <div key={o.org} className="mb-3" data-testid={`pipelines-org-${orgName(o.org)}`}>
            {several && (
              <div className="px-2 pt-1 pb-0.5 text-xs font-semibold text-fg">{orgName(o.org)}</div>
            )}
            {o.error && <div className="px-2 text-xs text-danger">{o.error}</div>}
            <ArrangeList
              items={o.projects}
              keyOf={(p) => p.project}
              arrangement={arrangements?.[`projects:${orgUrl(o.org).toLowerCase()}`] ?? EMPTY_ARRANGEMENT}
              onChange={(next) => setArrangement(`projects:${orgUrl(o.org).toLowerCase()}`, next)}
              arranging={arranging}
              testId={`pipelines-projects-${orgName(o.org)}`}
              renderItem={(p) => {
                const key = `${orgName(o.org)}/${p.project}`;
                return (
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
                      arrangement={arrangements?.[key] ?? arrangements?.[p.project] ?? EMPTY_ARRANGEMENT}
                      onChange={(next) => setArrangement(key, next)}
                      arranging={arranging}
                      testId={`pipelines-project-${p.project}`}
                      renderItem={(pl) => (
                        <PipelineRow
                          ctx={ctx}
                          org={o.org}
                          project={p.project}
                          pl={pl}
                          arranging={arranging}
                        />
                      )}
                    />
                  </div>
                );
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** One organisation in the settings: all its projects, or the ones you pick. */
function OrgSettingsRow({
  ctx,
  value,
  onChange,
  onRemove,
}: {
  ctx: AddonUiContext;
  value: OrgSettings;
  onChange: (next: OrgSettings) => void;
  onRemove?: () => void;
}) {
  const name = orgName(value.org);
  // What is typed in the project-names box, as typed (spaces included).
  const [text, setText] = useState((value.projects ?? []).join(", "));
  const [available, setAvailable] = useState<string[]>();
  const [busy, setBusy] = useState(false);
  const chosen = value.projects ?? [];
  const setProjects = (projects: string[]) =>
    onChange({ org: value.org, projects: projects.length ? projects : undefined });
  const load = async () => {
    setBusy(true);
    try {
      setAvailable(await ctx.host.call<string[]>("listProjects", { org: value.org }));
    } catch (error) {
      ctx.notify({ title: "Couldn't list projects", message: (error as Error).message, tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="flex flex-col gap-1 rounded-md border border-line p-3 text-sm"
      data-testid={`pipelines-org-row-${name}`}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
        <span className="text-xs text-muted">
          {chosen.length ? `${chosen.length} projects` : "All projects"}
        </span>
        <Button size="sm" variant="ghost" busy={busy} onClick={() => void load()}>
          Choose projects
        </Button>
        {onRemove && <IconButton icon={X} size="sm" label={`Remove ${name}`} onClick={onRemove} />}
      </div>
      {available ? (
        <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
          {available.map((project) => (
            <label key={project} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="accent-accent"
                checked={chosen.includes(project)}
                onChange={(e) =>
                  setProjects(e.target.checked ? [...chosen, project] : chosen.filter((x) => x !== project))
                }
              />
              {project}
            </label>
          ))}
          <span className="text-xs text-hint">None ticked = every project.</span>
        </div>
      ) : (
        <Input
          value={text}
          placeholder="All projects, or names separated by commas"
          onChange={(e) => {
            setText(e.target.value);
            setProjects(
              e.target.value
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean),
            );
          }}
          aria-label={`Projects of ${name}`}
          data-testid={`pipelines-projects-${name}`}
        />
      )}
    </div>
  );
}

export function PipelinesSettings({ ctx }: AddonComponentProps) {
  const { data, error } = useHostCall<PipelineSettings>("settings");
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PipelineSettings>();
  const [found, setFound] = useState<{ orgs?: string[]; error?: string }>({});
  const [adding, setAdding] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; message: string }>();
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);
  useEffect(() => {
    if (!form?.allOrgs || found.orgs || found.error) return;
    void ctx.host.call<string[]>("listOrgs").then(
      (orgs) => setFound({ orgs }),
      (error: Error) => setFound({ error: error.message }),
    );
  }, [ctx, form?.allOrgs, found]);
  if (error) return <div className="text-sm text-danger">{error}</div>;
  if (!form) return <Spinner className="m-3" />;
  const rows = effectiveOrgs(form, form.allOrgs ? (found.orgs ?? []) : []);
  const listed = (org: string) => form.orgs.some((o) => orgUrl(o.org).toLowerCase() === org.toLowerCase());
  const update = (next: OrgSettings) =>
    setForm({
      ...form,
      orgs: listed(next.org)
        ? form.orgs.map((o) => (orgUrl(o.org).toLowerCase() === next.org.toLowerCase() ? next : o))
        : [...form.orgs, next],
    });
  const add = () => {
    const org = orgUrl(adding);
    if (!org) return;
    if (!listed(org)) setForm({ ...form, orgs: [...form.orgs, { org }] });
    setAdding("");
  };
  const save = async () => {
    setSaving(true);
    try {
      await ctx.host.call("saveSettings", form);
      ctx.notify({ title: "Pipelines settings saved", tone: "success" });
    } catch (error) {
      setStatus({ ok: false, message: (error as Error).message });
    } finally {
      setSaving(false);
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
            busy={checking}
            onClick={async () => {
              setChecking(true);
              try {
                setStatus(await ctx.host.call<{ ok: boolean; message: string }>("check"));
              } catch (error) {
                setStatus({ ok: false, message: (error as Error).message });
              } finally {
                setChecking(false);
              }
            }}
          >
            Check Azure CLI
          </Button>
          {status && (
            <span className={cn("text-sm", status.ok ? "text-success" : "text-warning")}>
              {status.message}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm" data-testid="pipelines-all-orgs">
          <Switch
            label="Every organisation you belong to"
            checked={form.allOrgs}
            onChange={(allOrgs) => setForm({ ...form, allOrgs })}
          />
          Every organisation your az login belongs to
        </div>
        {form.allOrgs && found.error && <div className="text-xs text-warning">{found.error}</div>}
        {form.allOrgs && !found.orgs && !found.error && <Spinner size="sm" />}
        <div className="flex flex-col gap-2">
          {rows.map((o) => (
            <OrgSettingsRow
              key={o.org}
              ctx={ctx}
              value={o}
              onChange={update}
              onRemove={
                listed(o.org) && !found.orgs?.some((f) => f.toLowerCase() === o.org.toLowerCase())
                  ? () =>
                      setForm({
                        ...form,
                        orgs: form.orgs.filter((x) => orgUrl(x.org).toLowerCase() !== o.org.toLowerCase()),
                      })
                  : undefined
              }
            />
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Input
            value={adding}
            placeholder="Add an organisation: https://dev.azure.com/your-org"
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            aria-label="Organisation"
            data-testid="pipelines-org"
          />
          <Button
            size="sm"
            icon={Plus}
            disabled={!adding.trim()}
            onClick={add}
            data-testid="pipelines-add-org"
          >
            Add
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            busy={saving}
            onClick={() => void save()}
            data-testid="pipelines-save"
          >
            Save
          </Button>
          {rows.map((o) => (
            <Badge key={o.org}>{orgName(o.org)}</Badge>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function showPipelines(ctx: AddonUiContext) {
  ctx.showView("pipelines");
}

/** Tools → Run a pipeline…: a menu of every pipeline, per organisation and project. */
export async function runPipelineAction(ctx: AddonUiContext) {
  const data = await ctx.host.call<Overview>("overview");
  if (data.orgs.length === 0) return ctx.openSettings();
  const projectMenus = (o: OrgPipelines) =>
    o.projects.map((p) => ({
      label: p.project,
      submenu: p.pipelines.map((pl) => ({
        label: pl.name,
        onSelect: () => void startRun(ctx, o.org, p.project, pl.id, pl.name, pl.latest?.branch),
      })),
    }));
  ctx.menu(
    data.orgs.length === 1
      ? projectMenus(data.orgs[0]!)
      : data.orgs.map((o) => ({ label: orgName(o.org), submenu: projectMenus(o) })),
    document.querySelector<HTMLElement>("[data-testid=tools-button]") ?? document.body,
  );
}
