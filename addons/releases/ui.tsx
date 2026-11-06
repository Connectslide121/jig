import type { AddonComponentProps, AddonTabProps, AddonUiContext } from "@jig/sdk";
import {
  Badge,
  Button,
  Card,
  cn,
  Empty,
  IconButton,
  Input,
  Markdown,
  Select,
  Spinner,
  Switch,
  Textarea,
  useAddon,
  useAddonEvent,
  useHostCall,
} from "@jig/sdk/ui";
import {
  ChevronRight,
  CircleAlert,
  Copy,
  FileCog,
  LayoutTemplate,
  MessageSquare,
  Plus,
  RefreshCw,
  Rocket,
  Sparkles,
  Tag,
  TriangleAlert,
  Wand2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RepoDetail, RepoSummary } from "./host";
import { draftChangelog } from "./lib/commits";
import { unreleasedLabel, whatsLive } from "./lib/deploys";
import { policyFromDetection } from "./lib/detect";
import { nextVersion } from "./lib/next";
import { type Draft, notesMarkdown, parseDraft, releasePrompt, setupPrompt } from "./lib/notes";
import { DEFAULT_POLICY, production, type ReleasePolicy } from "./lib/policy";
import type { Bump } from "./lib/version";

const STYLE_LABEL: Record<string, string> = {
  planned: "Planned releases",
  continuous: "Continuous",
  none: "Not tracked",
};

function when(iso?: string) {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 3600 * 1000));
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  return days < 60 ? `${days} days ago` : new Date(iso).toLocaleDateString();
}

const today = () => new Date().toISOString().slice(0, 10);

function openRepo(ctx: AddonUiContext, r: { path: string; name: string }) {
  ctx.openTab("repo", { path: r.path, name: r.name, title: `Release: ${r.name.split("/").pop()}` });
}

function useOverview() {
  const result = useHostCall<RepoSummary[]>("overview");
  useAddonEvent("changed", () => void result.reload());
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && void result.reload(), 120_000);
    return () => clearInterval(t);
  }, [result.reload]);
  return result;
}

/** Repositories with unreleased work (planned releases), for the panel's badges and the status bar. */
const toRelease = (repos: RepoSummary[]) =>
  repos.filter((r) => r.policy?.style === "planned" && r.unreleased > 0);

type CardKind = "due" | "tracked" | "setup" | "off";

/** One repository as a card: the whole card opens it (its release tab, or setting it up). */
function RepoCard({ r, kind, onOpen }: { r: RepoSummary; kind: CardKind; onOpen: () => void }) {
  const cut = r.name.lastIndexOf("/");
  const leaf = r.name.slice(cut + 1);
  const parent = cut > 0 ? r.name.slice(0, cut) : "";
  const detail = r.error
    ? r.error
    : kind === "setup"
      ? "Set up versioning"
      : kind === "off"
        ? "Not tracked"
        : r.policy?.style === "planned"
          ? unreleasedLabel(r.unreleased, r.oldest)
          : STYLE_LABEL[r.policy?.style ?? "none"];
  return (
    <button
      type="button"
      onClick={onOpen}
      title={kind === "setup" ? `Set up versioning for ${r.name}` : `Open the releases of ${r.name}`}
      data-testid={kind === "setup" ? `releases-setup-${r.name}` : `releases-repo-${r.name}`}
      className={cn(
        "group flex h-14 w-full min-w-0 items-center gap-3 rounded-lg border px-3 text-left transition-colors",
        "outline-none focus-visible:ring-1 focus-visible:ring-accent",
        kind === "setup"
          ? "border-dashed border-line hover:border-accent hover:bg-hover"
          : "border-line bg-raised shadow-card hover:border-accent hover:bg-hover",
        kind === "off" && "opacity-70 hover:opacity-100",
      )}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
          kind === "due" && "bg-accent-soft text-accent",
          kind === "tracked" && "bg-active text-muted",
          kind === "off" && "bg-active text-hint",
          kind === "setup" &&
            "border border-dashed border-line text-hint group-hover:border-accent group-hover:text-accent",
        )}
      >
        {kind === "setup" ? <Plus className="size-4" /> : <Tag className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span
            className={cn(
              "truncate text-sm font-medium",
              kind === "setup" ? "text-muted group-hover:text-fg" : "text-fg",
            )}
          >
            {leaf}
          </span>
          {parent && <span className="min-w-0 truncate text-xs text-hint">{parent}</span>}
        </span>
        <span
          className={cn(
            "block truncate text-xs",
            r.error ? "text-danger" : kind === "setup" ? "text-hint group-hover:text-accent" : "text-muted",
          )}
        >
          {detail}
        </span>
      </span>
      <span className="flex w-20 shrink-0 flex-col items-end gap-0.5">
        <span className="truncate text-xs">
          {kind === "due" || kind === "tracked" ? (
            r.latest ? (
              <span className="font-mono text-muted">{r.latest.version}</span>
            ) : (
              <span className="text-hint">No release yet</span>
            )
          ) : null}
        </span>
        {kind === "due" ? (
          <Badge tone={r.unreleased > 20 ? "warning" : "accent"}>{r.unreleased}</Badge>
        ) : (
          <ChevronRight className="size-4 text-hint opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
        )}
      </span>
    </button>
  );
}

/** A titled group of cards in a grid that adds columns as the panel widens (sidebar or bottom panel). */
function CardSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 px-1 text-2xs font-semibold tracking-wide text-hint uppercase">
        {title}
        <span className="font-normal">{count}</span>
      </h3>
      <div className="grid grid-cols-1 gap-2 @xl:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4">
        {children}
      </div>
    </section>
  );
}

/** The Releases panel (global): every repository as a card, grouped by what it needs. */
export function ReleasesView({ ctx }: AddonComponentProps) {
  const { data, error, loading, reload } = useOverview();
  if (error) return <div className="p-3 text-xs text-danger">{error}</div>;
  if (!data) return <Spinner center />;
  if (data.length === 0)
    return (
      <Empty icon={Tag} title="No git repositories">
        Add a workspace folder with repositories to version them here.
      </Empty>
    );
  const due = toRelease(data).sort((a, b) => b.unreleased - a.unreleased);
  const tracked = data.filter((r) => r.policy && r.policy.style !== "none" && !due.includes(r));
  const untracked = data.filter((r) => !r.policy);
  const off = data.filter((r) => r.policy?.style === "none");
  const card = (r: RepoSummary, kind: CardKind) => (
    <RepoCard key={r.path} r={r} kind={kind} onOpen={() => openRepo(ctx, r)} />
  );
  return (
    <div className="flex h-full flex-col" data-testid="releases-view">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line px-2 text-xs text-muted">
        <span className="min-w-0 flex-1 truncate">
          {due.length ? `${due.length} with something to release` : "Releases"}
          <span className="text-hint">
            {" "}
            · {due.length + tracked.length} tracked · {untracked.length} not set up
          </span>
        </span>
        <span className="flex size-4 items-center justify-center">{loading && <Spinner size="sm" />}</span>
        <IconButton icon={RefreshCw} size="sm" label="Refresh" onClick={() => void reload()} />
      </div>
      <div className="@container min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 p-3">
          <CardSection title="To release" count={due.length}>
            {due.map((r) => card(r, "due"))}
          </CardSection>
          <CardSection title="Tracked" count={tracked.length}>
            {tracked.map((r) => card(r, "tracked"))}
          </CardSection>
          <CardSection title="Not set up" count={untracked.length}>
            {untracked.map((r) => card(r, "setup"))}
          </CardSection>
          <CardSection title="Not tracked" count={off.length}>
            {off.map((r) => card(r, "off"))}
          </CardSection>
        </div>
      </div>
    </div>
  );
}

export function ReleasesStatus({ ctx }: AddonComponentProps) {
  const { data } = useOverview();
  const due = toRelease(data ?? []);
  if (due.length === 0) return null;
  return (
    <button
      type="button"
      className="hover:text-fg"
      onClick={() => ctx.showView("releases")}
      data-testid="releases-status"
      title={due.map((r) => `${r.name}: ${unreleasedLabel(r.unreleased, r.oldest)}`).join("\n")}
    >
      {due.length} to release
    </button>
  );
}

export function showReleases(ctx: AddonUiContext) {
  ctx.showView("releases");
}

/** One repository's releases: its policy, what's unreleased, releasing, deploys and history. */
export function ReleaseTab({ params }: AddonTabProps) {
  const ctx = useAddon();
  const path = String(params.path ?? "");
  const name = String(params.name ?? path.split(/[\\/]/).pop());
  const { data, error, reload } = useHostCall<RepoDetail>("detail", { path });
  useAddonEvent("changed", (p) => {
    if ((p as { path?: string })?.path === path) void reload();
  });
  if (error) return <div className="p-4 text-sm text-danger">{error}</div>;
  if (!data) return <Spinner center />;
  const policy = data.policy;
  return (
    <div className="h-full overflow-y-auto" data-testid="release-tab">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
        <div className="flex items-center gap-2">
          <Tag className="size-5 text-accent" />
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-fg">{name}</h1>
          {data.latest && <span className="font-mono text-sm text-muted">{data.latest.version}</span>}
          {policy && <Badge tone="neutral">{STYLE_LABEL[policy.style]}</Badge>}
          <IconButton
            icon={RefreshCw}
            size="sm"
            label="Refresh"
            onClick={() => void reload()}
            data-testid="release-refresh"
          />
        </div>
        {!policy ? (
          <SetupCard ctx={ctx} name={name} data={data} />
        ) : (
          <>
            <PolicyCard ctx={ctx} name={name} data={data} policy={policy} />
            {data.mismatch && (
              <div className="flex items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
                <TriangleAlert className="size-4 shrink-0" /> {data.mismatch}
              </div>
            )}
            {policy.style === "planned" && <PrepareCard ctx={ctx} name={name} data={data} policy={policy} />}
            {policy.style !== "none" && <DeploysCard ctx={ctx} data={data} policy={policy} />}
            {policy.style !== "none" && <HistoryCard ctx={ctx} data={data} />}
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is the child.
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      {children}
    </label>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-0.5 text-sm">
      <span className="w-36 shrink-0 text-muted">{label}</span>
      <span className="min-w-0 flex-1 text-fg">{children}</span>
    </div>
  );
}

function SetupCard({ ctx, name, data }: { ctx: AddonUiContext; name: string; data: RepoDetail }) {
  const d = data.detection;
  const save = async (policy: ReleasePolicy) => {
    try {
      await ctx.host.call("savePolicy", { path: data.path, policy });
      ctx.notify({
        title: `Saved the release policy for ${name}`,
        message: ".jig/release.json — commit it to share it with your team",
        tone: "success",
      });
    } catch (error) {
      ctx.notify({ title: "Couldn't save the policy", message: (error as Error).message, tone: "danger" });
    }
  };

  return (
    <Card className="p-4" data-testid="release-setup">
      <h2 className="mb-1 text-sm font-semibold text-fg">Set up versioning</h2>
      <p className="mb-3 text-sm text-muted">
        {d?.versioned
          ? "This repository already versions. Jig adopts what it does and changes nothing unless you ask."
          : "No versioning yet. Claude proposes rules for this repository (with reasons) and you adjust them."}
      </p>
      {d && (
        <div className="mb-3">
          <Row label="Version files">
            {d.versionFiles.length
              ? d.versionFiles.map((f) => `${f.path}${f.version ? ` (${f.version})` : ""}`).join(", ")
              : "none"}
          </Row>
          <Row label="Tags">{d.tags ? `${d.tags} (${d.tagFormat ?? "no version format"})` : "none"}</Row>
          {d.latest && <Row label="Latest release">{d.latest.tag}</Row>}
          <Row label="Changelog">{d.changelog ?? "none"}</Row>
          <Row label="Conventional commits">{Math.round(d.conventional * 100)}% of recent commits</Row>
          {d.tools.length > 0 && <Row label="Tools">{d.tools.join(", ")}</Row>}
          {d.pipelineVersioning && <Row label="Pipelines">set a version</Row>}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          icon={MessageSquare}
          data-testid="release-setup-chat"
          onClick={() =>
            void ctx.openChat({ cwd: data.path, draft: setupPrompt({ repo: name, detection: d ?? {} }) })
          }
        >
          Set up with Claude
        </Button>
        <Button
          icon={Wand2}
          data-testid="release-setup-defaults"
          title="Write .jig/release.json from what was found, without a chat"
          onClick={() => void save(d ? policyFromDetection(d) : DEFAULT_POLICY)}
        >
          {d?.versioned ? "Use what's there" : "Use the defaults"}
        </Button>
        <Button variant="ghost" onClick={() => void save({ ...DEFAULT_POLICY, style: "none" })}>
          Don't track
        </Button>
      </div>
    </Card>
  );
}

function PolicyCard({
  ctx,
  name,
  data,
  policy,
}: {
  ctx: AddonUiContext;
  name: string;
  data: RepoDetail;
  policy: ReleasePolicy;
}) {
  return (
    <Card className="p-4" data-testid="release-policy">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold text-fg">Release policy</h2>
        <Button size="sm" variant="ghost" icon={FileCog} onClick={() => ctx.openPreview(data.policyFile)}>
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={MessageSquare}
          onClick={() =>
            void ctx.openChat({
              cwd: data.path,
              draft: setupPrompt({ repo: name, detection: {}, existing: data.policyText }),
            })
          }
        >
          Change with Claude
        </Button>
      </div>
      <Row label="Style">{STYLE_LABEL[policy.style]}</Row>
      <Row label="Scheme">{policy.scheme === "calver" ? "CalVer (2026.10.1)" : "SemVer (1.4.0)"}</Row>
      <Row label="Version lives in">
        {policy.managedBy ? `${policy.managedBy} (Jig reads it)` : (policy.versionFile ?? "git tags only")}
        {data.fileVersion ? ` · ${data.fileVersion}` : ""}
      </Row>
      <Row label="Tags">{policy.tagFormat.replace("{version}", "1.2.3")}</Row>
      {policy.changelog && <Row label="Changelog">{policy.changelog.path}</Row>}
      {policy.notes?.length ? (
        <Row label="Notes for">{policy.notes.map((n) => `${n.audience} (${n.language})`).join(", ")}</Row>
      ) : null}
      {policy.commitConvention === "conventional" && (
        <Row label="Commits">Conventional Commits (Write follows it)</Row>
      )}
      {policy.environments?.length ? (
        <Row label="Environments">
          {policy.environments
            .map(
              (e) =>
                `${e.name} (${e.deploy}${e.prerelease ? `, ${e.prerelease}` : ""}${e.production ? ", production" : ""})`,
            )
            .join(", ")}
        </Row>
      ) : null}
      {policy.style === "planned" && policy.cadence && policy.cadence !== "none" && (
        <Row label="When">
          {policy.cadence === "weekly" ? "Weekly reminder" : "Before every production deploy"}
        </Row>
      )}
    </Card>
  );
}

function PrepareCard({
  ctx,
  name,
  data,
  policy,
}: {
  ctx: AddonUiContext;
  name: string;
  data: RepoDetail;
  policy: ReleasePolicy;
}) {
  const commits = data.unreleased;
  const candidates = [
    ...new Set((policy.environments ?? []).map((e) => e.prerelease).filter(Boolean)),
  ] as string[];
  const [bump, setBump] = useState<Bump>();
  const [pre, setPre] = useState("");
  const suggestion = useMemo(
    () =>
      nextVersion({
        policy,
        latest: data.latest?.version,
        fileVersion: data.fileVersion,
        commits,
        bump,
        pre: pre || undefined,
      }),
    [policy, data.latest?.version, data.fileVersion, commits, bump, pre],
  );
  const [version, setVersion] = useState(suggestion.version);
  const [changelog, setChangelog] = useState("");
  const [notes, setNotes] = useState<Draft["notes"]>([]);
  const [reason, setReason] = useState<string>();
  const [push, setPush] = useState(true);
  const [pipeline, setPipeline] = useState(true);
  const [busy, setBusy] = useState<"draft" | "release">();
  const [open, setOpen] = useState(false);
  useEffect(() => setVersion(suggestion.version), [suggestion.version]);
  // Drafted once when the section opens (you may empty it to release without a changelog entry)…
  const drafted = useRef(false);
  useEffect(() => {
    if (!open || drafted.current) return;
    drafted.current = true;
    setChangelog(draftChangelog(version, today(), commits));
  }, [open, version, commits]);
  // …and its heading follows the version.
  useEffect(() => setChangelog((c) => c.replace(/^## \[[^\]]*\]/, `## [${version}]`)), [version]);

  const draft = async () => {
    setBusy("draft");
    try {
      const answer = await ctx.ai.ask(
        releasePrompt({ repo: name, current: data.latest?.version, version, policy, commits, date: today() }),
        { cwd: data.path, feature: "releaseNotes" },
      );
      const d = parseDraft(answer);
      if (!d)
        throw new Error(
          "The answer wasn't a draft. Try again, or pick another model in Settings → AI features.",
        );
      if (d.bump && d.bump !== suggestion.bump && policy.scheme === "semver" && !suggestion.baseline)
        setBump(d.bump);
      setReason(d.reason);
      if (d.changelog) setChangelog(d.changelog);
      setNotes(d.notes);
    } catch (error) {
      ctx.notify({ title: "Couldn't draft the release", message: (error as Error).message, tone: "danger" });
    } finally {
      setBusy(undefined);
    }
  };
  const tag = policy.tagFormat.replace("{version}", version);
  const steps = [
    policy.versionFile && !policy.managedBy ? `Set ${policy.versionFile} to ${version}` : undefined,
    policy.changelog && changelog.trim() ? `Add the section to ${policy.changelog.path}` : undefined,
    (policy.versionFile && !policy.managedBy) || (policy.changelog && changelog.trim())
      ? `Commit "Release ${version}" (only those files)`
      : undefined,
    `Tag ${tag}${notes.length ? " with the notes" : ""}`,
    push ? "Push the commit and the tag" : undefined,
    push && pipeline && policy.releasePipeline
      ? `Start release pipeline ${policy.releasePipeline.id} on ${tag}`
      : undefined,
  ].filter(Boolean) as string[];
  const doRelease = async () => {
    const ok = await ctx.confirm({
      title: `Release ${version}?`,
      message: steps.map((s) => `• ${s}`).join("\n"),
      confirmLabel: "Release",
    });
    if (!ok) return;
    setBusy("release");
    try {
      const r = await ctx.host.call<{ tag: string; pushed: boolean; pushError?: string; pipeline?: string }>(
        "release",
        {
          path: data.path,
          version,
          changelog,
          notes: notesMarkdown(version, notes),
          push,
          runPipeline: Boolean(policy.releasePipeline) && push && pipeline,
        },
      );
      ctx.notify({
        title: `Released ${r.tag}`,
        message: r.pushError
          ? `Not pushed: ${r.pushError}`
          : r.pushed
            ? `Pushed with its tag.${r.pipeline ? ` Release pipeline: ${r.pipeline}` : ""}`
            : "Not pushed yet.",
        tone: r.pushError ? "warning" : "success",
      });
      setOpen(false);
      setChangelog("");
      setNotes([]);
      setReason(undefined);
      setBump(undefined);
    } catch (error) {
      ctx.notify({ title: "The release failed", message: (error as Error).message, tone: "danger" });
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <Card className="p-4" data-testid="release-unreleased">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold text-fg">
          Unreleased{" "}
          <span className="font-normal text-muted">
            · {unreleasedLabel(data.unreleasedCount, data.unreleasedSince)}
          </span>
        </h2>
        {!open && (commits.length > 0 || !data.latest) && (
          <Button
            size="sm"
            variant="primary"
            icon={Tag}
            onClick={() => setOpen(true)}
            data-testid="release-prepare"
          >
            {data.latest ? "Prepare release" : "First release"}
          </Button>
        )}
      </div>
      {!data.latest && (
        <p className="mb-2 text-sm text-muted">
          No release yet. The first one marks the starting point ({suggestion.version}, "first versioned
          release").
        </p>
      )}
      <div className="max-h-48 overflow-y-auto">
        {commits.slice(0, 50).map((c) => (
          <div key={c.hash} className="flex gap-2 py-0.5 text-sm">
            <span className="shrink-0 font-mono text-xs text-hint">{c.hash.slice(0, 7)}</span>
            {c.kind && (
              <Badge
                tone={
                  c.breaking
                    ? "danger"
                    : c.kind === "feat"
                      ? "accent"
                      : c.kind === "fix"
                        ? "success"
                        : "neutral"
                }
              >
                {c.kind}
                {c.breaking ? "!" : ""}
              </Badge>
            )}
            <span className="min-w-0 flex-1 truncate text-fg">{c.text}</span>
            {c.workItems.length > 0 && (
              <span className="shrink-0 text-xs text-muted">AB#{c.workItems.join(", AB#")}</span>
            )}
          </div>
        ))}
        {data.unreleasedCount > 50 && (
          <div className="py-1 text-xs text-hint">and {data.unreleasedCount - 50} more</div>
        )}
      </div>
      {data.pullRequests.length > 0 && (
        <div className="mt-2 border-t border-line pt-2" data-testid="release-prs">
          <div className="mb-1 text-xs font-semibold text-muted">
            Pull requests ({data.pullRequests.length})
          </div>
          {data.pullRequests.map((p) => (
            <div key={p.number} className="flex gap-2 py-0.5 text-sm">
              <Badge tone="info">#{p.number}</Badge>
              <span className="min-w-0 flex-1 truncate text-fg">{p.title}</span>
            </div>
          ))}
        </div>
      )}
      {open && (
        <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3" data-testid="release-form">
          <div className="flex flex-wrap items-end gap-2">
            <Field label={<>Version</>}>
              {" "}
              <Input
                className="w-40 font-mono"
                value={version}
                onChange={(e) => setVersion(e.target.value.trim())}
                data-testid="release-version"
              />
            </Field>
            {policy.scheme === "semver" && !suggestion.baseline && (
              <Field label={<>Bump</>}>
                {" "}
                <Select
                  className="w-28"
                  value={bump ?? suggestion.bump}
                  onChange={(e) => setBump(e.target.value as Bump)}
                >
                  <option value="major">Major</option>
                  <option value="minor">Minor</option>
                  <option value="patch">Patch</option>
                </Select>
              </Field>
            )}
            {candidates.length > 0 && policy.scheme === "semver" && (
              <Field label={<>Kind</>}>
                {" "}
                <Select className="w-44" value={pre} onChange={(e) => setPre(e.target.value)}>
                  <option value="">Release</option>
                  {candidates.map((c) => (
                    <option key={c} value={c}>
                      Candidate ({c})
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Button
              icon={Sparkles}
              disabled={busy !== undefined}
              onClick={() => void draft()}
              data-testid="release-draft"
              title="Claude suggests the bump and writes the changelog and the notes; you edit before anything is written"
            >
              {busy === "draft" ? "Drafting…" : "Draft with Claude"}
            </Button>
          </div>
          {reason && (
            <p className="flex items-start gap-1.5 text-sm text-muted" data-testid="release-reason">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-info" /> {reason}
            </p>
          )}
          {policy.changelog && (
            <Field label={<>Changelog ({policy.changelog.path})</>}>
              {" "}
              <Textarea
                rows={8}
                className="font-mono text-xs"
                value={changelog}
                onChange={(e) => setChangelog(e.target.value)}
                data-testid="release-changelog"
              />
            </Field>
          )}
          {notes.map((n, i) => (
            <Field key={`${n.audience}-${n.language}`} label={`Notes for ${n.audience} (${n.language})`}>
              <Textarea
                rows={5}
                value={n.text}
                onChange={(e) =>
                  setNotes(notes.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))
                }
                data-testid="release-notes"
              />
            </Field>
          ))}
          <div className="rounded-md bg-surface px-3 py-2 text-xs text-muted" data-testid="release-steps">
            {steps.map((s) => (
              <div key={s}>• {s}</div>
            ))}
            {data.dirty && (
              <div className="mt-1 text-warning">Other uncommitted changes stay as they are.</div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={push} onChange={setPush} label="Push" />
            {policy.releasePipeline && (
              <Switch
                checked={push && pipeline}
                disabled={!push}
                onChange={setPipeline}
                label="Start the release pipeline"
              />
            )}
            <span className="flex-1" />
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={Tag}
              disabled={!version || busy !== undefined}
              onClick={() => void doRelease()}
              data-testid="release-go"
            >
              {busy === "release" ? "Releasing…" : `Release ${version}`}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function DeploysCard({
  ctx,
  data,
  policy,
}: {
  ctx: AddonUiContext;
  data: RepoDetail;
  policy: ReleasePolicy;
}) {
  const envs = policy.environments ?? [];
  const manual = envs.filter((e) => e.deploy !== "pipeline");
  const live = whatsLive(data.deploys);
  const prod = production(policy);
  const record = async (env: string) => {
    const isProd = env === prod?.name;
    if (policy.style === "planned" && isProd && !data.headVersion) {
      const ok = await ctx.confirm({
        title: "Release first?",
        message: `The checked-out commit has no release. Record the ${env} deploy anyway?`,
        confirmLabel: "Record anyway",
      });
      if (!ok) return;
    }
    try {
      const d = await ctx.host.call<{ version?: string }>("recordDeploy", { path: data.path, env });
      ctx.notify({
        title: `Recorded: deployed to ${env}`,
        message: d.version ? `Version ${d.version}` : undefined,
        tone: "success",
      });
    } catch (error) {
      ctx.notify({ title: "Couldn't record the deploy", message: (error as Error).message, tone: "danger" });
    }
  };
  if (!envs.length && !data.deploys.length) return null;
  return (
    <Card className="p-4" data-testid="release-deploys">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold text-fg">What's live</h2>
        {manual.map((e) => (
          <Button
            key={e.name}
            size="sm"
            icon={Rocket}
            onClick={() => void record(e.name)}
            data-testid={`release-deployed-${e.name}`}
            title={
              policy.style === "continuous" && e.name === prod?.name
                ? "The deploy is the release: the checked-out commit gets the next version and a tag"
                : "Record that the checked-out commit is deployed there"
            }
          >
            Deployed to {e.name}
          </Button>
        ))}
      </div>
      {envs.map((e) => {
        const d = live[e.name];
        return (
          <Row key={e.name} label={e.name}>
            {d ? (
              <>
                <span className="font-mono">{d.version ?? d.commit.slice(0, 7)}</span>
                <span className="text-muted">
                  {" "}
                  · {when(d.at)} · {d.source === "pipeline" ? `run ${d.runId}` : "by hand"}
                </span>
                {!d.version && policy.style === "planned" && (
                  <span className="text-warning"> · no release</span>
                )}
              </>
            ) : (
              <span className="text-hint">
                {e.deploy === "manual" ? "nothing recorded yet" : "waiting for a pipeline run"}
              </span>
            )}
          </Row>
        );
      })}
    </Card>
  );
}

function HistoryCard({ ctx, data }: { ctx: AddonUiContext; data: RepoDetail }) {
  const [shown, setShown] = useState<string>();
  if (!data.releases.length) return null;
  return (
    <Card className="p-4" data-testid="release-history">
      <h2 className="mb-2 text-sm font-semibold text-fg">Releases</h2>
      {data.releases.map((r) => {
        const body = r.message.replace(/^Release [^\n]*\n*/, "").trim();
        return (
          <div key={r.tag} className="border-b border-line py-1.5 last:border-b-0">
            <div className="flex items-center gap-2 text-sm">
              <button
                type="button"
                className={cn(
                  "font-mono text-fg hover:underline",
                  !body && "cursor-default hover:no-underline",
                )}
                onClick={() => body && setShown(shown === r.tag ? undefined : r.tag)}
              >
                {r.tag}
              </button>
              <span className="flex-1 text-xs text-muted">{when(r.date)}</span>
              {body && (
                <>
                  <IconButton icon={Copy} size="sm" label="Copy the notes" onClick={() => ctx.copy(body)} />
                  <IconButton
                    icon={LayoutTemplate}
                    size="sm"
                    label="Publish the notes as a page"
                    data-testid="release-publish"
                    onClick={() =>
                      void ctx.openChat({
                        cwd: data.path,
                        draft: `Publish the release notes of ${data.path.split(/[\\/]/).pop()} ${r.tag} as a page: a clean page for the people who use it, in the notes' language. Here are the notes:\n\n${body}`,
                      })
                    }
                  />
                </>
              )}
            </div>
            {shown === r.tag && body && (
              <div className="mt-1 text-sm">
                <Markdown text={body} />
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}
