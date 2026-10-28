import { describePermission } from "@jig/sdk";
import { Check, ExternalLink, FileDiff, MessageSquare, Shield, X } from "lucide-react";
import { useState } from "react";
import type { BuildJob, LayoutOp } from "../../../shared/builds";
import { call, errorMessage } from "../../lib/host";
import { Badge, Button, Card, CodeBlock, confirmDialog, Empty, Markdown, Spinner } from "../../ui";
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
  added: number;
  deleted: number;
  status: string;
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
        <FileDiff className="size-3.5 text-muted" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{path}</span>
        <Badge tone={status === "added" ? "success" : status === "deleted" ? "danger" : "warning"}>
          {status}
        </Badge>
        <span className="text-xs text-success">+{added}</span>
        <span className="text-xs text-danger">−{deleted}</span>
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
        {job.kind === "app" && (
          <Card className="p-3 text-sm">
            <div className="font-medium text-warning">
              This needs a change to Jig's own source code (level 3).
            </div>
            <div className="mt-1 text-muted">
              Self-modification is the last resort; it runs in a separate preview instance (see the Builds
              documentation).
            </div>
          </Card>
        )}
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
