import { Check, ListChecks, ShieldAlert, ShieldCheck, Timer, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ChatItem, PermissionDecision, PermissionMode } from "../../../shared/engine";
import { call, errorMessage } from "../../lib/host";
import { Badge, Button, CodeBlock, cn, Markdown } from "../../ui";
import { notify } from "../../workbench/toasts";
import { QuestionCard } from "./QuestionCard";
import { useSessions } from "./store";
import { toolLabel, toolSummary } from "./ToolCard";
import { usePermissionRenderer } from "./toolRenderers";

type PermissionItem = Extract<ChatItem, { kind: "permission" }>;

async function answer(sessionId: string, requestId: string, decision: PermissionDecision) {
  try {
    await call("sessions.answerPermission", { id: sessionId, requestId, decision });
  } catch (error) {
    notify({ title: "Couldn't answer", message: errorMessage(error), tone: "warning" });
  }
}

/**
 * Claude's plan (plan mode's ExitPlanMode), as Claude Code shows it: approve and let Claude edit
 * without asking, approve and keep being asked, or keep planning with feedback.
 */
function PlanCard({ item, sessionId }: { item: PermissionItem; sessionId: string }) {
  const plan = typeof item.request.input.plan === "string" ? item.request.input.plan : "";
  const pending = item.status === "pending";
  const [feedback, setFeedback] = useState("");
  const who = "Jig";
  const approve = async (mode: PermissionMode) => {
    await call("sessions.setPermissionMode", { id: sessionId, mode }).catch(() => {});
    await answer(sessionId, item.request.requestId, { behavior: "allow" });
  };
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-md border p-3",
        pending ? "border-accent bg-accent-soft" : "border-line",
      )}
      data-testid="plan-card"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-fg">
        <ListChecks className="size-4 text-accent" />
        {`${who}'s plan`}
        {!pending && (
          <Badge tone={item.status === "denied" ? "neutral" : "success"}>
            {item.status === "denied"
              ? "kept planning"
              : item.status === "cancelled"
                ? "cancelled"
                : "approved"}
          </Badge>
        )}
      </div>
      <div className="max-h-96 overflow-y-auto rounded-md bg-raised px-3 py-1">
        <Markdown text={plan} />
      </div>
      {pending && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              icon={Check}
              onClick={() => void approve("acceptEdits")}
              data-testid="plan-approve-auto"
            >
              Approve, and accept edits
            </Button>
            <Button
              size="sm"
              icon={ShieldCheck}
              onClick={() => void approve("default")}
              data-testid="plan-approve"
            >
              Approve, ask before edits
            </Button>
          </div>
          <div className="flex gap-2">
            <input
              placeholder={`Or tell ${who} what to change in the plan…`}
              className="h-7 min-w-0 flex-1 rounded-md border border-line-strong bg-raised px-2 text-xs outline-none focus:border-focus"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              data-testid="plan-feedback"
            />
            <Button
              size="sm"
              variant="ghost"
              data-testid="plan-keep"
              onClick={() =>
                void answer(sessionId, item.request.requestId, {
                  behavior: "deny",
                  message: feedback.trim()
                    ? `The user wants changes to the plan: ${feedback.trim()}`
                    : "The user wants to keep planning.",
                })
              }
            >
              Keep planning
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** An add-on's own approval card for its tool (`chat.permissionRenderer`): it may change the input. */
function AddonPermissionCard({ item, sessionId }: { item: PermissionItem; sessionId: string }) {
  const custom = usePermissionRenderer(item.request.toolName);
  const projectId = useSessions((s) => s.metas[sessionId]?.projectId);
  if (!custom) return null;
  const { request } = item;
  return (
    <>
      {custom.render({
        request: { toolName: request.toolName, input: request.input, title: request.title },
        status: item.status,
        sessionId,
        projectId,
        respond: (decision) =>
          answer(
            sessionId,
            request.requestId,
            decision.behavior === "allow"
              ? { behavior: "allow", ...(decision.input ? { updatedInput: decision.input } : {}) }
              : decision,
          ),
      })}
    </>
  );
}

/** "a minute", "2 minutes", "30 seconds". */
function waitWords(seconds: number): string {
  if (seconds >= 60 && seconds % 60 === 0) return seconds === 60 ? "a minute" : `${seconds / 60} minutes`;
  return `${seconds} seconds`;
}

function secondsUntil(at: string): number {
  return Math.max(0, Math.ceil((Date.parse(at) - Date.now()) / 1000));
}

/** Seconds left until `at`, ticking every second (0 once it passed). */
function useSecondsLeft(at: string): number {
  const [seconds, setSeconds] = useState(() => secondsUntil(at));
  useEffect(() => {
    setSeconds(secondsUntil(at));
    const timer = setInterval(() => setSeconds(secondsUntil(at)), 1000);
    return () => clearInterval(timer);
  }, [at]);
  return seconds;
}

/**
 * "Don't ask" mode's countdown (D-336): when Jig declines the request if nobody answers. A fixed-width
 * slot with tabular figures, so nothing moves while it counts.
 */
function DeclineCountdown({ at }: { at: string }) {
  const seconds = useSecondsLeft(at);
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <span
      className="ml-auto flex w-32 shrink-0 items-center justify-end gap-1 whitespace-nowrap text-xs font-normal text-muted tabular-nums"
      title="Don't ask mode: declined automatically when nobody answers in time"
      data-testid="permission-countdown"
    >
      <Timer className="size-3.5" />
      Declines in {clock}
    </span>
  );
}

/** A request nobody answered in "Don't ask" mode: the notice Jig shows when it declines one (D-336). */
function TimedOutNotice({ item }: { item: PermissionItem }) {
  const { request } = item;
  const waited = item.declineAt ? Math.round((Date.parse(item.declineAt) - Date.parse(item.at)) / 1000) : 0;
  return (
    <div
      className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning"
      data-testid="permission-timed-out"
    >
      <TriangleAlert className="mt-px size-3.5 shrink-0" />
      <span className="selectable">
        Declined automatically in Don't ask mode: {request.title ?? request.toolName}
        {request.description ? ` (${request.description})` : ""}
        {waited > 0 ? ` (no answer within ${waitWords(waited)})` : ""}.
      </span>
    </div>
  );
}

export function PermissionCard({ item, sessionId }: { item: PermissionItem; sessionId: string }) {
  const custom = usePermissionRenderer(item.request.toolName);
  if (item.timedOut) return <TimedOutNotice item={item} />;
  if (custom)
    return item.status === "pending" && item.declineAt ? (
      <div className="flex flex-col gap-1">
        <AddonPermissionCard item={item} sessionId={sessionId} />
        <div className="flex">
          <DeclineCountdown at={item.declineAt} />
        </div>
      </div>
    ) : (
      <AddonPermissionCard item={item} sessionId={sessionId} />
    );
  if (item.request.toolName === "AskUserQuestion") return <QuestionCard item={item} sessionId={sessionId} />;
  if (item.request.toolName === "ExitPlanMode") return <PlanCard item={item} sessionId={sessionId} />;
  return <ToolPermissionCard item={item} sessionId={sessionId} />;
}

function ToolPermissionCard({ item, sessionId }: { item: PermissionItem; sessionId: string }) {
  const who = "Jig";
  const { request } = item;
  const pending = item.status === "pending";
  const summary = toolSummary(request.toolName, request.input);
  const command = typeof request.input.command === "string" ? request.input.command : undefined;
  if (!pending)
    return (
      <div className="flex items-center gap-2 text-xs text-muted">
        {item.status === "denied" || item.status === "cancelled" ? (
          <X className="size-3.5 text-danger" />
        ) : (
          <Check className="size-3.5 text-success" />
        )}
        {request.title ?? `${toolLabel(request.toolName)} ${summary}`} —{" "}
        {
          {
            allowed: "allowed",
            always: "always allowed",
            denied: "denied",
            cancelled: "cancelled",
            pending: "",
          }[item.status]
        }
      </div>
    );
  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-warning bg-warning-soft p-3"
      data-testid="permission-card"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-fg">
        <ShieldAlert className="size-4 shrink-0 text-warning" />
        {request.title ?? `${who} wants to use ${toolLabel(request.toolName)}`}
      </div>
      {request.description && <div className="text-xs text-muted">{request.description}</div>}
      {command ? (
        <CodeBlock code={command} lang="bash" className="my-0" />
      ) : (
        summary && <div className="font-mono text-xs text-muted">{summary}</div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="primary"
          icon={Check}
          data-testid="permission-allow"
          onClick={() => void answer(sessionId, request.requestId, { behavior: "allow" })}
        >
          Allow once
        </Button>
        {request.canAlwaysAllow && (
          <Button
            size="sm"
            icon={ShieldCheck}
            data-testid="permission-always"
            onClick={() => void answer(sessionId, request.requestId, { behavior: "allow", always: true })}
          >
            Always allow
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          icon={X}
          data-testid="permission-deny"
          onClick={() => void answer(sessionId, request.requestId, { behavior: "deny" })}
        >
          Deny
        </Button>
        {item.declineAt && <DeclineCountdown at={item.declineAt} />}
      </div>
    </div>
  );
}
