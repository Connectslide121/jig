import { Check, ListChecks, Save, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import type { ChatItem, PermissionDecision, PermissionMode } from "../../../shared/engine";
import { call, errorMessage } from "../../lib/host";
import { Badge, Button, CodeBlock, cn, Markdown } from "../../ui";
import { notify } from "../../workbench/toasts";
import { providerName } from "./provider";
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
 * without asking, approve and keep being asked, or keep planning with feedback. In a meeting-notes
 * chat the plan is the notes and draft actions: approving only saves them for review in Meetings,
 * so the card says that instead (D-268).
 */
function PlanCard({ item, sessionId }: { item: PermissionItem; sessionId: string }) {
  const plan = typeof item.request.input.plan === "string" ? item.request.input.plan : "";
  const pending = item.status === "pending";
  const [feedback, setFeedback] = useState("");
  const notes = useSessions((s) => Boolean(s.metas[sessionId]?.meetingNotes));
  // ChatGPT chats' plans come through Jig's exit_plan (D-315): the card names who wrote it.
  const who = useSessions((s) => providerName(s.metas[sessionId] ?? {}));
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
        {notes ? "Meeting notes and draft actions" : `${who}'s plan`}
        {!pending && (
          <Badge tone={item.status === "denied" ? "neutral" : "success"}>
            {item.status === "denied"
              ? notes
                ? "changes asked"
                : "kept planning"
              : item.status === "cancelled"
                ? "cancelled"
                : notes
                  ? "saved for review"
                  : "approved"}
          </Badge>
        )}
      </div>
      <div className="max-h-96 overflow-y-auto rounded-md bg-raised px-3 py-1">
        <Markdown text={plan} />
      </div>
      {pending && notes && (
        <p className="text-xs text-muted">
          Saving keeps the notes and the draft actions with the meeting. Nothing is queued or started: you
          review the actions in Meetings and send the ones you want to the task queue.
        </p>
      )}
      {pending && (
        <>
          <div className="flex flex-wrap gap-2">
            {notes ? (
              <Button
                size="sm"
                variant="primary"
                icon={Save}
                onClick={() => void approve("acceptEdits")}
                data-testid="plan-approve-auto"
              >
                Save notes and actions for review
              </Button>
            ) : (
              <>
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
              </>
            )}
          </div>
          <div className="flex gap-2">
            <input
              placeholder={
                notes
                  ? `Or tell ${who} what to change in the notes…`
                  : `Or tell ${who} what to change in the plan…`
              }
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
                    ? `The user wants changes to the ${notes ? "notes" : "plan"}: ${feedback.trim()}`
                    : "The user wants to keep planning.",
                })
              }
            >
              {notes ? "Change the notes" : "Keep planning"}
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

export function PermissionCard({ item, sessionId }: { item: PermissionItem; sessionId: string }) {
  const custom = usePermissionRenderer(item.request.toolName);
  if (custom) return <AddonPermissionCard item={item} sessionId={sessionId} />;
  if (item.request.toolName === "AskUserQuestion") return <QuestionCard item={item} sessionId={sessionId} />;
  if (item.request.toolName === "ExitPlanMode") return <PlanCard item={item} sessionId={sessionId} />;
  return <ToolPermissionCard item={item} sessionId={sessionId} />;
}

function ToolPermissionCard({ item, sessionId }: { item: PermissionItem; sessionId: string }) {
  const who = useSessions((s) => providerName(s.metas[sessionId] ?? {}));
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
        <ShieldAlert className="size-4 text-warning" />
        {request.title ?? `${who} wants to use ${toolLabel(request.toolName)}`}
      </div>
      {request.description && <div className="text-xs text-muted">{request.description}</div>}
      {command ? (
        <CodeBlock code={command} lang="bash" className="my-0" />
      ) : (
        summary && <div className="font-mono text-xs text-muted">{summary}</div>
      )}
      <div className="flex flex-wrap gap-2">
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
      </div>
    </div>
  );
}
