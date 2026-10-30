import { Check, ChevronLeft, ChevronRight, CircleHelp } from "lucide-react";
import { useRef, useState } from "react";
import type { ChatItem, PermissionDecision } from "../../../shared/engine";
import { call, errorMessage } from "../../lib/host";
import { Badge, Button, cn } from "../../ui";
import { notify } from "../../workbench/toasts";
import {
  answerFor,
  answersOf,
  type Choice,
  EMPTY_CHOICE,
  isAnswered,
  pick,
  type Question,
  splitRecommended,
  toggleOther,
} from "./question";

type PermissionItem = Extract<ChatItem, { kind: "permission" }>;

async function answer(sessionId: string, requestId: string, decision: PermissionDecision) {
  try {
    await call("sessions.answerPermission", { id: sessionId, requestId, decision });
  } catch (error) {
    notify({ title: "Couldn't answer", message: errorMessage(error), tone: "warning" });
  }
}

/** The mark before an option: a circle for one choice, a square for several. */
function Mark({ on, multi }: { on: boolean; multi: boolean }) {
  return (
    <span
      className={cn(
        "mt-0.5 flex size-4 shrink-0 items-center justify-center border",
        multi ? "rounded-sm" : "rounded-full",
        on ? "border-accent bg-accent text-on-accent" : "border-line-strong bg-raised",
      )}
      aria-hidden
    >
      {on && <Check className="size-3" strokeWidth={3} />}
    </span>
  );
}

/**
 * Claude's AskUserQuestion, one question at a time (D-161): a strip of the steps, the question with
 * its options as rows (one choice or several, "Other…" with its own field), Back and Next, and the
 * answers go to Claude together at the last step.
 */
export function QuestionCard({ item, sessionId }: { item: PermissionItem; sessionId: string }) {
  const questions = (item.request.input.questions ?? []) as Question[];
  const [step, setStep] = useState(0);
  const [choices, setChoices] = useState<Choice[]>(() => questions.map(() => EMPTY_CHOICE));
  const otherField = useRef<HTMLInputElement>(null);
  const pending = item.status === "pending";
  const q = questions[step];
  const choice = choices[step] ?? EMPTY_CHOICE;
  const last = step === questions.length - 1;
  const change = (next: Choice) => setChoices((all) => all.map((c, i) => (i === step ? next : c)));
  const submit = () =>
    void answer(sessionId, item.request.requestId, {
      behavior: "allow",
      updatedInput: { ...item.request.input, answers: answersOf(questions, choices) },
    });
  const skip = () =>
    void answer(sessionId, item.request.requestId, {
      behavior: "deny",
      message: "The user skipped the question.",
    });

  if (!pending)
    return (
      <div
        className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-3"
        data-testid="question-card"
      >
        <div className="flex items-center gap-2 text-xs text-muted">
          <CircleHelp className="size-3.5" />
          <span className="flex-1">Claude asked</span>
          <Badge>{item.status === "denied" ? "skipped" : "answered"}</Badge>
        </div>
        {item.status !== "denied" &&
          questions.map((question, i) => (
            <div key={question.question} className="text-xs">
              <span className="text-muted">{question.header ?? question.question} · </span>
              <span className="text-fg">{answerFor(question, choices[i]) || "—"}</span>
            </div>
          ))}
      </div>
    );
  if (!q) return null;
  const multi = Boolean(q.multiSelect);
  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-accent bg-surface p-4 shadow-card"
      data-testid="question-card"
    >
      <div className="flex items-center gap-2 text-xs text-muted">
        <CircleHelp className="size-4 text-accent" />
        <span className="flex-1 font-medium text-fg">Claude has a question</span>
        {questions.length > 1 && (
          <span data-testid="question-step">
            {step + 1} of {questions.length}
          </span>
        )}
      </div>
      {questions.length > 1 && (
        <div className="flex gap-1.5">
          {questions.map((question, i) => (
            <button
              key={question.question}
              type="button"
              onClick={() => setStep(i)}
              title={question.question}
              className="group flex min-w-0 flex-1 flex-col gap-1 text-left"
              data-testid={`question-tab-${i}`}
            >
              <span
                className={cn(
                  "h-1 rounded-full",
                  i === step ? "bg-accent" : isAnswered(question, choices[i]) ? "bg-success" : "bg-active",
                )}
              />
              <span
                className={cn("truncate text-2xs", i === step ? "text-fg" : "text-muted group-hover:text-fg")}
              >
                {question.header ?? `Question ${i + 1}`}
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="text-sm font-medium text-fg">{q.question}</div>
      <div className="flex flex-col gap-1.5" role="group" aria-label={multi ? "Choose any" : "Choose one"}>
        {q.options.map((o) => {
          const on = choice.picked.includes(o.label);
          const { label, recommended } = splitRecommended(o.label);
          return (
            <button
              key={o.label}
              type="button"
              aria-pressed={on}
              data-testid={`option-${o.label}`}
              onClick={() => change(pick(q, choice, o.label))}
              className={cn(
                "flex items-start gap-2.5 rounded-md border px-3 py-2 text-left transition-colors",
                on
                  ? "border-accent bg-accent-soft"
                  : "border-line bg-raised hover:border-line-strong hover:bg-hover",
              )}
            >
              <Mark on={on} multi={multi} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-medium text-fg">
                  {label}
                  {recommended && <Badge tone="accent">Recommended</Badge>}
                </span>
                {o.description && <span className="mt-0.5 block text-xs text-muted">{o.description}</span>}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={choice.otherOn}
          data-testid="option-other"
          onClick={() => {
            change(toggleOther(q, choice));
            if (!choice.otherOn) setTimeout(() => otherField.current?.focus(), 0);
          }}
          className={cn(
            "flex items-start gap-2.5 rounded-md border px-3 py-2 text-left transition-colors",
            choice.otherOn
              ? "border-accent bg-accent-soft"
              : "border-line bg-raised hover:border-line-strong hover:bg-hover",
          )}
        >
          <Mark on={choice.otherOn} multi={multi} />
          <span className="min-w-0 flex-1 text-sm font-medium text-fg">Something else…</span>
        </button>
        {choice.otherOn && (
          <input
            ref={otherField}
            placeholder="Your own answer"
            aria-label="Your own answer"
            className="h-8 rounded-md border border-line-strong bg-raised px-2.5 text-sm outline-none focus:border-focus"
            value={choice.other}
            onChange={(e) => change({ ...choice, other: e.target.value })}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || !isAnswered(q, choice)) return;
              if (last) submit();
              else setStep(step + 1);
            }}
            data-testid="question-other"
          />
        )}
      </div>
      <div className="flex items-center gap-2">
        {step > 0 && (
          <Button
            size="sm"
            variant="ghost"
            icon={ChevronLeft}
            onClick={() => setStep(step - 1)}
            data-testid="question-back"
          >
            Back
          </Button>
        )}
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={skip} data-testid="question-skip">
          Skip
        </Button>
        {last ? (
          <Button
            size="sm"
            variant="primary"
            icon={Check}
            disabled={!questions.every((question, i) => isAnswered(question, choices[i]))}
            onClick={submit}
            data-testid="question-submit"
          >
            Answer
          </Button>
        ) : (
          <Button
            size="sm"
            variant="primary"
            disabled={!isAnswered(q, choice)}
            onClick={() => setStep(step + 1)}
            data-testid="question-next"
          >
            Next <ChevronRight className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
