import { describePermission } from "@jig/sdk";
import {
  Check,
  Copy,
  ExternalLink,
  FolderOpen,
  Mail,
  Maximize2,
  MessageSquare,
  RefreshCw,
  Shield,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { BuildJob, LayoutOp } from "../../../shared/builds";
import type { DevRequestStatus } from "../../../shared/devRequest";
import { call, errorMessage } from "../../lib/host";
import { timeAgo } from "../../lib/time";
import {
  Badge,
  Button,
  Card,
  CodeBlock,
  confirmDialog,
  Empty,
  FileIcon,
  Markdown,
  Spinner,
  Textarea,
} from "../../ui";
import type { TabProps } from "../../workbench/registry";
import { notify } from "../../workbench/toasts";
import { openPreview } from "../preview/actions";
import { openBuilderChat } from "./BuildDialog";
import { kindText, STATUS_TEXT, STATUS_TONE, useAddonName, useBuilds } from "./store";

function describeOp(op: LayoutOp): string {
  const view = op.view?.replace(/^addon\.([^.]+)\./, "$1: ").replace(/^jig\./, "") ?? "";
  if (op.op === "move")
    return `Move ${view} to the ${op.region} ${op.region === "bottom" ? "panel" : "sidebar"}`;
  if (op.op === "below") return `Show ${view} in the lower half of the sidebar with ${op.host}`;
  if (op.op === "hide") return `Hide ${view}`;
  if (op.op === "show") return `Show ${view}`;
  if (op.op === "resize") return `Make the ${op.region} region ${op.size}px`;
  if (op.op === "save") return `Save the layout as "${op.name}"`;
  if (op.op === "use") return `Switch to the layout "${op.name}"`;
  return `${op.op === "collapse" ? "Collapse" : "Expand"} the ${op.region} region`;
}

export async function acceptBuild(job: BuildJob): Promise<void> {
  try {
    await call("builds.accept", { id: job.id });
    notify({ title: "Accepted", message: job.summary, tone: "success" });
  } catch (error) {
    notify({ title: "Couldn't accept", message: errorMessage(error), tone: "danger" });
  }
}

export async function discardBuild(job: BuildJob): Promise<void> {
  if (
    !(await confirmDialog({
      title: "Discard this build?",
      message: "Nothing it made is kept.",
      confirmLabel: "Discard",
      danger: true,
    }))
  )
    return;
  await call("builds.discard", { id: job.id }).catch((e) =>
    notify({ title: "Couldn't discard", message: errorMessage(e), tone: "danger" }),
  );
}

export function BuildActions({ job, size = "md" }: { job: BuildJob; size?: "sm" | "md" }) {
  return (
    <div className="flex flex-wrap gap-2">
      {job.status === "preview" && (
        <Button
          size={size}
          variant="primary"
          icon={Check}
          onClick={() => void acceptBuild(job)}
          data-testid="build-accept"
        >
          Accept
        </Button>
      )}
      {(job.status === "preview" ||
        job.status === "working" ||
        job.status === "needs_you" ||
        job.status === "failed") && (
        <Button
          size={size}
          variant="ghost"
          icon={X}
          onClick={() => void discardBuild(job)}
          data-testid="build-discard"
        >
          Discard
        </Button>
      )}
      {job.sessionId && (
        <Button
          size={size}
          icon={MessageSquare}
          onClick={() => job.sessionId && openBuilderChat(job.sessionId)}
        >
          Builder chat
        </Button>
      )}
    </div>
  );
}

function FileRow({
  job,
  path,
  added,
  deleted,
  status,
}: {
  job: BuildJob;
  path: string;
  added?: number;
  deleted?: number;
  status?: string;
}) {
  const [patch, setPatch] = useState<string>();
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-line last:border-b-0">
      <button
        type="button"
        className="flex h-8 w-full items-center gap-2 px-3 text-left text-sm hover:bg-hover"
        onClick={() => {
          setOpen(!open);
          if (!patch)
            void call("builds.diff", { id: job.id, path })
              .then(setPatch)
              .catch(() => setPatch(""));
        }}
      >
        <FileIcon path={path} className="size-3.5" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{path}</span>
        {status && (
          <Badge tone={status === "added" ? "success" : status === "deleted" ? "danger" : "warning"}>
            {status}
          </Badge>
        )}
        {added !== undefined && <span className="text-xs text-success">+{added}</span>}
        {deleted !== undefined && <span className="text-xs text-danger">−{deleted}</span>}
      </button>
      {open && (
        <div className="px-3 pb-2">
          {patch === undefined ? (
            <Spinner size="sm" />
          ) : (
            <CodeBlock code={patch || "(no diff)"} lang="diff" />
          )}
        </div>
      )}
    </div>
  );
}

/** The request's clickable demo, live in a sandboxed frame (never same-origin: it can't reach Jig). */
function RequestDemo({ job }: { job: BuildJob }) {
  const [demo, setDemo] = useState<{ url: string; path: string }>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let current = true;
    void (async () => {
      try {
        const info = await call("devRequests.create", { buildId: job.id });
        const path = `${info.folder}/mockup.html`;
        const preview = await call("files.preview", { path });
        if (current && preview.url) setDemo({ url: `${preview.url}?v=${job.revision ?? 1}`, path });
      } catch (e) {
        if (current) setError(errorMessage(e));
      }
    })();
    return () => {
      current = false;
    };
  }, [job.id, job.revision]);
  if (error) return <div className="text-xs text-danger">The demo couldn't open: {error}</div>;
  if (!demo) return <Spinner center />;
  return (
    <div className="flex flex-col gap-1.5">
      <iframe
        key={demo.url}
        title="Demo of the request"
        src={demo.url}
        sandbox="allow-scripts allow-forms"
        className="h-96 w-full rounded-md border border-line bg-canvas"
        data-testid="dev-demo"
      />
      <div className="flex items-center gap-2 text-xs text-hint">
        <span className="flex-1">A mockup to show the idea: click around. It isn't the real thing yet.</span>
        <Button size="sm" variant="ghost" icon={Maximize2} onClick={() => openPreview(demo.path)}>
          Open in a tab
        </Button>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 font-medium">
        <span className="flex size-5 items-center justify-center rounded-full bg-active text-xs">{n}</span>
        {title}
      </div>
      <div className="flex flex-col gap-2 pl-7">{children}</div>
    </div>
  );
}

/**
 * No slot can do this (D-074): the builder wrote a development request (D-119). You try its demo,
 * ask for changes until it's right (the builder writes a new version), confirm it, and only then
 * email it to Jig's developers: the package is saved in Downloads for you to attach (D-123).
 */
function DevRequestPanel({ job }: { job: BuildJob }) {
  const p = job.proposal!;
  const [status, setStatus] = useState<DevRequestStatus>();
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const working = job.status === "working";
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new version needs confirming again.
  useEffect(() => {
    void call("devRequests.status", { buildId: job.id })
      .then(setStatus)
      .catch(() => {});
  }, [job.id, job.revision, job.updatedAt]);
  const act = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      notify({ title: label, message: errorMessage(error), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const revise = () =>
    act("Couldn't send your changes", async () => {
      await call("builds.reviseRequest", { id: job.id, feedback });
      setFeedback("");
    });
  const approve = () =>
    act("Couldn't confirm", async () => setStatus(await call("devRequests.approve", { buildId: job.id })));
  const email = () =>
    act("Couldn't open an email", async () => {
      const { info, savedTo, to } = await call("devRequests.email", { buildId: job.id });
      setStatus((s) => s && { ...s, emailedAt: info.emailedAt });
      const zip = savedTo.split(/[\\/]/).pop() ?? "the zip";
      notify({
        title: "Attach the package and send",
        message: `A new email to ${to} is open. Attach ${zip}: it's in your Downloads folder, shown in the window that opened.`,
        tone: "success",
      });
    });
  const to = status?.to ?? "Jig's developers";
  return (
    <Card className="flex flex-col gap-4 p-4 text-sm" data-testid="build-proposal">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Badge tone="warning">Needs a change in Jig</Badge>
          <span className="font-medium">{p.title || "Development request"}</span>
          {(job.revision ?? 1) > 1 && (
            <span data-testid="dev-version">
              <Badge>Version {job.revision}</Badge>
            </span>
          )}
        </div>
        <div className="text-muted">
          No add-on can do this with what Jig offers today, and Jig doesn't change its own code. The builder
          wrote a request for Jig's developers. Try it, change it until it's what you want, then send it.
        </div>
      </div>

      {working && (
        <div className="flex items-center gap-2 rounded-md bg-accent-soft p-2" data-testid="dev-working">
          <Spinner />
          The builder is updating the request with your changes…
        </div>
      )}

      <Step n={1} title="Try it">
        {p.mockupHtml ? (
          <RequestDemo job={job} />
        ) : (
          <div className="text-muted">This request has no demo; read what it asks for below.</div>
        )}
        <details className="rounded-md border border-line p-2" data-testid="dev-spec">
          <summary className="cursor-pointer text-muted">What will be requested</summary>
          <div className="mt-2 flex flex-col gap-2">
            {p.userStory && <div className="selectable italic text-muted">{p.userStory}</div>}
            {p.reason && (
              <div>
                <span className="text-muted">Why an add-on can't do it: </span>
                <span className="selectable">{p.reason}</span>
              </div>
            )}
            {p.proposal && <Markdown text={p.proposal} />}
            {p.addonPlan && (
              <div>
                <div className="text-muted">Then, as an add-on:</div>
                <Markdown text={p.addonPlan} />
              </div>
            )}
            {p.acceptance?.length ? (
              <div>
                <div className="text-muted">Done when:</div>
                <ul className="list-disc pl-5">
                  {p.acceptance.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </details>
      </Step>

      <Step n={2} title="Is this what you want?">
        <Textarea
          rows={2}
          value={feedback}
          placeholder="What should be different? E.g. “show the build number too”, “it should be in the status bar”…"
          onChange={(e) => setFeedback(e.target.value)}
          disabled={working}
          data-testid="dev-feedback"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            icon={RefreshCw}
            disabled={working || busy || !feedback.trim()}
            onClick={() => void revise()}
            data-testid="dev-revise"
          >
            Change the request
          </Button>
          {status?.approved ? (
            <span data-testid="dev-approved">
              <Badge tone="success">Confirmed: this is what you want</Badge>
            </span>
          ) : (
            <Button
              size="sm"
              icon={Check}
              disabled={working || busy || !status}
              onClick={() => void approve()}
              data-testid="dev-approve"
            >
              This is what I want
            </Button>
          )}
        </div>
      </Step>

      <Step n={3} title="Send it">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            icon={Mail}
            disabled={working || busy || !status?.approved}
            onClick={() => void email()}
            data-testid="build-email-request"
          >
            Email to developers
          </Button>
          <span className="text-xs text-muted">
            {status?.approved
              ? `Saves the package (spec, prompt for Claude Code, demo) in your Downloads folder and opens a new email to ${to}: attach the package, then send.`
              : "Confirm the request first (step 2)."}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            icon={Copy}
            onClick={() =>
              void act("Couldn't copy", async () => {
                await navigator.clipboard.writeText(await call("devRequests.prompt", { buildId: job.id }));
                notify({
                  title: "Prompt copied",
                  message: "Paste it into Claude Code in your Jig clone.",
                  tone: "success",
                });
              })
            }
            data-testid="build-copy-proposal"
          >
            Copy prompt
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={FolderOpen}
            onClick={() =>
              void act("Couldn't show the package", async () => {
                const info = await call("devRequests.create", { buildId: job.id });
                await call("app.showItemInFolder", { path: info.zipPath });
              })
            }
            data-testid="build-show-request"
          >
            Show package
          </Button>
          {status?.emailedAt && (
            <span className="text-xs text-hint" data-testid="dev-emailed">
              Email opened {timeAgo(status.emailedAt)}
            </span>
          )}
        </div>
      </Step>
    </Card>
  );
}

/** One build: what was asked, what the builder decided, the changes, and Accept / Discard. */
export function BuildTab({ params }: TabProps) {
  const job = useBuilds((s) => s.jobs.find((j) => j.id === params.buildId));
  const addonName = useAddonName(job?.addonId);
  if (!job) return <Empty title="Build not found" />;
  return (
    <div className="h-full overflow-y-auto" data-testid="build-tab">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge tone={STATUS_TONE[job.status]}>{STATUS_TEXT[job.status]}</Badge>
              {job.kind && (
                <Badge tone={job.addonId ? "accent" : undefined}>
                  <span data-testid="build-kind">{kindText(job, addonName)}</span>
                </Badge>
              )}
              {job.level && <Badge>level {job.level}</Badge>}
            </div>
            <h1 className="selectable mt-2 text-lg font-semibold">{job.goal || "Build"}</h1>
          </div>
          {job.status === "working" && <Spinner />}
        </div>
        <BuildActions job={job} />
        {job.status === "needs_you" && job.kind !== "app" && (
          <Card className="p-3 text-sm text-warning">
            The builder is waiting. Open its chat to answer or ask it to continue.
          </Card>
        )}
        {job.proposal && <DevRequestPanel job={job} />}
        {job.summary && (
          <Card className="p-4">
            <Markdown text={job.summary} />
          </Card>
        )}
        {job.staged?.layoutOps?.length ? (
          <Card className="p-4 text-sm">
            <div className="mb-2 font-medium">Layout changes</div>
            <ul className="list-disc pl-5">
              {job.staged.layoutOps.map((op, i) => (
                <li key={i}>{describeOp(op)}</li>
              ))}
            </ul>
          </Card>
        ) : null}
        {job.staged?.settings && (
          <Card className="p-4 text-sm">
            <div className="mb-2 font-medium">Settings changes</div>
            <CodeBlock code={JSON.stringify(job.staged.settings, null, 2)} lang="json" />
          </Card>
        )}
        {job.permissions?.length ? (
          <Card className="flex flex-wrap items-center gap-2 p-3 text-sm">
            <Shield className="size-4 text-muted" /> The add-on may:
            {job.permissions.map((p) => (
              <Badge key={p} tone="info">
                {describePermission(p)}
              </Badge>
            ))}
          </Card>
        ) : null}
        {job.files?.length ? (
          <Card className="overflow-hidden" data-testid="build-files">
            <div className="border-b border-line px-3 py-2 text-sm font-medium">{job.files.length} files</div>
            {job.files.map((f) => (
              <FileRow key={f.path} job={job} {...f} />
            ))}
          </Card>
        ) : null}
        {job.problems?.length ? (
          <Card className="p-3 font-mono text-xs whitespace-pre-wrap text-danger selectable">
            {job.problems.join("\n")}
          </Card>
        ) : null}
        {job.error && <Card className="p-3 text-sm text-danger">{job.error}</Card>}
        <details className="text-xs text-muted">
          <summary className="cursor-default">Log</summary>
          <div className="mt-2 flex flex-col gap-1">
            {job.log.map((l, i) => (
              <div
                key={i}
                className={
                  l.tone === "danger"
                    ? "text-danger"
                    : l.tone === "warning"
                      ? "text-warning"
                      : l.tone === "success"
                        ? "text-success"
                        : ""
                }
              >
                {new Date(l.at).toLocaleTimeString()} — {l.text}
              </div>
            ))}
          </div>
        </details>
        <div className="flex gap-2 text-xs text-hint">
          <ExternalLink className="size-3.5" /> Origin: {job.origin}
          {job.worktree && <span className="selectable font-mono">· {job.worktree}</span>}
        </div>
      </div>
    </div>
  );
}
