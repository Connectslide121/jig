import { describePermission } from "@jig/sdk";
import { Check, ExternalLink, MessageSquare, Shield, X } from "lucide-react";
import { useState } from "react";
import type { BuildJob, LayoutOp } from "../../../shared/builds";
import { call, errorMessage } from "../../lib/host";
import { Badge, Button, Card, CodeBlock, confirmDialog, Empty, FileIcon, Markdown, Spinner } from "../../ui";
import type { TabProps } from "../../workbench/registry";
import { workbench } from "../../workbench/store";
import { notify } from "../../workbench/toasts";
import { KIND_TEXT, STATUS_TEXT, STATUS_TONE, useBuilds } from "./store";

function describeOp(op: LayoutOp): string {
  const view = op.view?.replace(/^addon\.([^.]+)\./, "$1: ").replace(/^jig\./, "") ?? "";
  if (op.op === "move")
    return `Move ${view} to the ${op.region} ${op.region === "bottom" ? "panel" : "sidebar"}`;
  if (op.op === "hide") return `Hide ${view}`;
  if (op.op === "show") return `Show ${view}`;
  if (op.op === "resize") return `Make the ${op.region} region ${op.size}px`;
  return `${op.op === "collapse" ? "Collapse" : "Expand"} the ${op.region} region`;
}

export async function acceptBuild(job: BuildJob): Promise<void> {
  const protectedFiles = job.app?.protectedFiles ?? [];
  if (
    protectedFiles.length &&
    !(await confirmDialog({
      title: "Accept a change to protected files?",
      message: `This change touches Jig's launcher or builder core:\n${protectedFiles.join("\n")}\n\nIf it is wrong, Jig may not restart properly (the launcher then falls back to the previous build).`,
      confirmLabel: "Accept protected change",
      danger: true,
    }))
  )
    return;
  try {
    await call("builds.accept", { id: job.id, confirmProtected: protectedFiles.length > 0 });
    notify({
      title: job.app ? "Accepted — Jig restarts with the change" : "Accepted",
      message: job.summary,
      tone: "success",
    });
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
          onClick={() => workbench.openTab("jig.chat", { sessionId: job.sessionId })}
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

/** Level 3: the proposal, the worktree's checks, the preview instance and the changed files. */
function AppChangePanel({ job }: { job: BuildJob }) {
  const app = job.app!;
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, failure: string) => {
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      notify({ title: failure, message: errorMessage(error), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Card className="flex flex-col gap-2 p-4 text-sm" data-testid="app-change">
        <div className="font-medium text-warning">
          This needs a change to Jig's own source code (level 3).
        </div>
        {app.reason && (
          <div>
            <span className="text-muted">Why no slot can do it: </span>
            <span className="selectable">{app.reason}</span>
          </div>
        )}
        {app.plan && (
          <div>
            <span className="text-muted">Plan: </span>
            <span className="selectable">{app.plan}</span>
          </div>
        )}
        <div className="text-muted">
          The builder works in a git worktree of {app.repo || "Jig's repository"}, runs its checks, and you
          try the result in a separate preview window before anything changes. Accept merges it and restarts
          Jig; if the new build doesn't start, Jig falls back to the previous one.
        </div>
        {app.stage === "proposed" && job.status !== "discarded" && (
          <div>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => void run(() => call("builds.startAppChange", { id: job.id }), "Couldn't start")}
              data-testid="build-start-app"
            >
              Let the builder change Jig's code
            </Button>
          </div>
        )}
        {app.stage === "preview" && job.status === "preview" && (
          <div className="flex items-center gap-2">
            <Button
              icon={ExternalLink}
              disabled={busy || app.previewRunning}
              onClick={() =>
                void run(() => call("builds.openPreview", { id: job.id }), "Couldn't open the preview")
              }
              data-testid="build-open-preview"
            >
              {app.previewRunning ? "Preview instance is open" : "Open preview instance"}
            </Button>
            <span className="text-xs text-hint">
              Uses a copy of your Jig home; your real data isn't touched.
            </span>
          </div>
        )}
        {app.stage === "accepted" && app.restartPending && (
          <div className="text-success">Accepted. Restart Jig to use the change.</div>
        )}
      </Card>
      {app.protectedFiles?.length ? (
        <Card className="p-3 text-sm text-danger" data-testid="app-protected">
          Touches protected files (launcher / builder core): {app.protectedFiles.join(", ")}. Accept asks you
          to confirm explicitly.
        </Card>
      ) : null}
      {app.checks && (
        <Card className="p-3 text-sm">
          <div className="flex items-center gap-2">
            <Badge tone={app.checks.ok ? "success" : "danger"}>
              {app.checks.ok ? "Checks pass" : "Checks fail"}
            </Badge>
            <span className="text-xs text-hint">{new Date(app.checks.at).toLocaleString()}</span>
          </div>
          <details className="mt-2">
            <summary className="cursor-default text-xs text-muted">Output</summary>
            <CodeBlock code={app.checks.output || "(no output)"} />
          </details>
        </Card>
      )}
      {app.files?.length ? (
        <Card className="overflow-hidden" data-testid="build-files">
          <div className="border-b border-line px-3 py-2 text-sm font-medium">{app.files.length} files</div>
          {app.files.map((path) => (
            <FileRow key={path} job={job} path={path} />
          ))}
        </Card>
      ) : null}
    </>
  );
}

/** One build: what was asked, what the builder decided, the changes, and Accept / Discard. */
export function BuildTab({ params }: TabProps) {
  const job = useBuilds((s) => s.jobs.find((j) => j.id === params.buildId));
  if (!job) return <Empty title="Build not found" />;
  return (
    <div className="h-full overflow-y-auto" data-testid="build-tab">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge tone={STATUS_TONE[job.status]}>{STATUS_TEXT[job.status]}</Badge>
              {job.kind && <Badge>{KIND_TEXT[job.kind]}</Badge>}
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
        {job.app && <AppChangePanel job={job} />}
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
