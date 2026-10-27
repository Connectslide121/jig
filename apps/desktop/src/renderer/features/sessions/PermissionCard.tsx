import { Check, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import type { ChatItem, PermissionDecision } from "../../../shared/engine";
import { call, errorMessage } from "../../lib/host";
import { Badge, Button, CodeBlock, cn } from "../../ui";
import { notify } from "../../workbench/toasts";
import { toolLabel, toolSummary } from "./ToolCard";

type PermissionItem = Extract<ChatItem, { kind: "permission" }>;

interface Question {
  question: string;
  header?: string;
  multiSelect?: boolean;
  options: Array<{ label: string; description?: string }>;
}

async function answer(sessionId: string, requestId: string, decision: PermissionDecision) {
  try {
    await call("sessions.answerPermission", { id: sessionId, requestId, decision });
  } catch (error) {
    notify({ title: "Couldn't answer", message: errorMessage(error), tone: "warning" });
  }
}

/** Claude's AskUserQuestion: pick an option per question (or type your own). */
function QuestionCard({ item, sessionId }: { item: PermissionItem; sessionId: string }) {
  const questions = (item.request.input.questions ?? []) as Question[];
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const pending = item.status === "pending";
  const done = questions.every((q) => (picked[q.question]?.length ?? 0) > 0 || other[q.question]?.trim());
  const submit = () => {
    const answers = Object.fromEntries(
      questions.map((q) => [q.question, other[q.question]?.trim() || (picked[q.question] ?? []).join(", ")]),
    );
    void answer(sessionId, item.request.requestId, {
      behavior: "allow",
      updatedInput: { ...item.request.input, answers },
    });
  };
  return (
    <div
      className="flex flex-col gap-3 rounded-md border border-accent bg-accent-soft p-3"
      data-testid="question-card"
    >
      {questions.map((q) => (
        <div key={q.question} className="flex flex-col gap-1.5">
          <div className="text-sm font-medium text-fg">{q.question}</div>
          <div className="flex flex-wrap gap-1.5">
            {q.options.map((o) => {
              const on = picked[q.question]?.includes(o.label);
              return (
                <button
                  key={o.label}
                  type="button"
                  disabled={!pending}
                  title={o.description}
                  data-testid={`option-${o.label}`}
                  onClick={() =>
                    setPicked((p) => {
                      const current = p[q.question] ?? [];
                      const next = q.multiSelect
                        ? on
                          ? current.filter((x) => x !== o.label)
                          : [...current, o.label]
                        : [o.label];
                      return { ...p, [q.question]: next };
                    })
                  }
                  className={cn(
                    "rounded-md border px-2 py-1 text-left text-xs",
                    on
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line-strong bg-raised text-fg hover:bg-hover",
                  )}
                >
                  <div className="font-medium">{o.label}</div>
                  {o.description && (
                    <div className={cn("text-2xs", on ? "text-on-accent" : "text-muted")}>
                      {o.description}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {pending && (
            <input
              placeholder="Or type your own answer…"
              className="h-7 rounded-md border border-line-strong bg-raised px-2 text-xs outline-none focus:border-focus"
              value={other[q.question] ?? ""}
              onChange={(e) => setOther((o) => ({ ...o, [q.question]: e.target.value }))}
            />
          )}
        </div>
      ))}
      {pending ? (
        <div className="flex gap-2">
          <Button size="sm" variant="primary" disabled={!done} onClick={submit} data-testid="question-submit">
            Answer
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void answer(sessionId, item.request.requestId, {
                behavior: "deny",
                message: "The user skipped the question.",
              })
            }
          >
            Skip
          </Button>
        </div>
      ) : (
        <Badge>{item.status === "denied" ? "skipped" : "answered"}</Badge>
      )}
    </div>
  );
}

export function PermissionCard({ item, sessionId }: { item: PermissionItem; sessionId: string }) {
  if (item.request.toolName === "AskUserQuestion") return <QuestionCard item={item} sessionId={sessionId} />;
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
        {request.title ?? `Claude wants to use ${toolLabel(request.toolName)}`}
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
