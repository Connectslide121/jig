import { describePermission } from "@jig/sdk";
import {
  Check,
  Copy,
  ExternalLink,
  FolderOpen,
  Mail,
  MessageSquare,
  MousePointerClick,
  Shield,
  X,
} from "lucide-react";
import { useState } from "react";
import type { BuildJob, LayoutOp } from "../../../shared/builds";
import type { DevRequestInfo, MailMethod } from "../../../shared/devRequest";
import { call, errorMessage } from "../../lib/host";
import { timeAgo } from "../../lib/time";
import { useConfig } from "../../stores/config";
import { Badge, Button, Card, CodeBlock, confirmDialog, Empty, FileIcon, Markdown, Spinner } from "../../ui";
import type { TabProps } from "../../workbench/registry";
import { workbench } from "../../workbench/store";
import { notify } from "../../workbench/toasts";
import { openPreview } from "../preview/actions";
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

const MAIL_NEXT: Record<MailMethod, (to: string, zip: string) => string> = {
  outlook: () => "A new message is open in Outlook with the request attached. Check it and press Send.",
  "apple-mail": () => "A new message is open in Mail with the request attached. Check it and press Send.",
  "xdg-email": () =>
    "A new message is open in your email app with the request attached. Check it and press Send.",
  eml: (to) => `An email to ${to} opened with the request attached. Check it and press Send.`,
  mailto: (_to, zip) =>
    `Your email app opened without the attachment: attach ${zip} from the folder that opened, then send.`,
  test: () => "The email is ready.",
};

/**
 * No slot can do this (D-074): the builder wrote a development request (D-119). One button emails
 * it to Jig's developers with a package attached: the spec, a prompt for Claude Code in Jig's
 * repository and a clickable mockup.
 */
function DevRequestPanel({ job }: { job: BuildJob }) {
  const p = job.proposal!;
  const to = useConfig((s) => s.config?.devRequests.email) || "support@sprinta.se";
  const [busy, setBusy] = useState(false);
  const [emailedAt, setEmailedAt] = useState<string>();
  const withPackage = async (use: (info: DevRequestInfo) => void | Promise<void>) => {
    try {
      await use(await call("devRequests.create", { buildId: job.id }));
    } catch (error) {
      notify({ title: "Couldn't make the request", message: errorMessage(error), tone: "danger" });
    }
  };
  const email = async () => {
    setBusy(true);
    try {
      const { info, method, to: sentTo } = await call("devRequests.email", { buildId: job.id });
      setEmailedAt(info.emailedAt);
      const zip = info.zipPath.split(/[\\/]/).pop() ?? "the zip";
      notify({
        title: "Development request ready to send",
        message: MAIL_NEXT[method](sentTo, zip),
        tone: "success",
      });
    } catch (error) {
      notify({ title: "Couldn't open an email", message: errorMessage(error), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="flex flex-col gap-3 p-4 text-sm" data-testid="build-proposal">
      <div className="flex items-center gap-2">
        <Badge tone="warning">Needs a change in Jig</Badge>
        <span className="font-medium">{p.title || "Development request"}</span>
      </div>
      <div className="text-muted">
        No add-on can do this with Jig's extension points today, and Jig doesn't change its own code. The
        builder wrote a development request: email it to Jig's developers ({to}). They build it with Claude
        Code from the attached package (a spec, a ready prompt{p.mockupHtml ? " and a clickable mockup" : ""}
        ); once it's in Jig, ask for your tool again.
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          icon={Mail}
          disabled={busy}
          onClick={() => void email()}
          data-testid="build-email-request"
        >
          Email to developers
        </Button>
        {p.mockupHtml && (
          <Button
            size="sm"
            icon={MousePointerClick}
            onClick={() => void withPackage((info) => openPreview(`${info.folder}/mockup.html`))}
            data-testid="build-open-mockup"
          >
            Open mockup
          </Button>
        )}
        <Button
          size="sm"
          icon={Copy}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(await call("devRequests.prompt", { buildId: job.id }));
              notify({
                title: "Prompt copied",
                message: "Paste it into Claude Code in your Jig clone.",
                tone: "success",
              });
            } catch (error) {
              notify({ title: "Couldn't copy", message: errorMessage(error), tone: "danger" });
            }
          }}
          data-testid="build-copy-proposal"
        >
          Copy prompt
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={FolderOpen}
          onClick={() => void withPackage((info) => call("app.showItemInFolder", { path: info.zipPath }))}
          data-testid="build-show-request"
        >
          Show package
        </Button>
        {emailedAt && <span className="text-xs text-hint">Email opened {timeAgo(emailedAt)}</span>}
      </div>
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
    </Card>
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
