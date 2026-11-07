/**
 * The Interview tab (ui.md → Interview, D-461): the interviewer's question cards on the left, the brief
 * as it is written on the right, coverage in the header. Cards have a fixed size and a new round
 * replaces them in place; answered rounds fold into one line above. "Looks right" approves G0 and
 * opens the Plan step.
 */

import type { AddonTabProps, AddonUiContext } from "@jig/sdk";
import {
  Badge,
  Button,
  cn,
  Dictate,
  Empty,
  IconButton,
  Input,
  Spinner,
  useAddonEvent,
  useHostCall,
} from "@jig/sdk/ui";
import { Check, Factory, MoreHorizontal } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { type BriefDoc, LANGUAGE_GROUP_LABELS, LANGUAGE_GROUPS, LANGUAGES, sectionsFor } from "./lib/brief";
import type { Question, Run } from "./lib/run";
import { LevelBadge, Ring } from "./parts";
import { PlanDialog } from "./plan";

type Params = { projectId?: string; runId?: string };

function useRun(params: Params) {
  const skip = !params.projectId || !params.runId;
  const run = useHostCall<Run>("run", params, { skip });
  const brief = useHostCall<BriefDoc | null>("briefDoc", params, { skip });
  useAddonEvent("changed", () => {
    void run.reload();
    void brief.reload();
  });
  return { run: run.data, brief: brief.data, error: run.error };
}

/** The cards waiting for an answer: the latest round's unanswered S1 questions. */
export function openCards(run: Run): Question[] {
  const asked = (run.questions ?? []).filter((q) => q.stage === "S1");
  const open = asked.filter((q) => !q.answer);
  if (!open.length) return [];
  const round = Math.max(...open.map((q) => q.round));
  return open.filter((q) => q.round === round);
}

/** "Rounds 1–2 answered · 8 questions": the answered rounds, folded. */
export function answeredLine(run: Run): string {
  const done = (run.questions ?? []).filter((q) => q.stage === "S1" && q.answer);
  if (!done.length) return "No answers yet";
  const rounds = [...new Set(done.map((q) => q.round))].sort((a, b) => a - b);
  const span = rounds.length === 1 ? `Round ${rounds[0]}` : `Rounds ${rounds[0]}–${rounds.at(-1)}`;
  return `${span} answered · ${done.length} question${done.length === 1 ? "" : "s"}`;
}

export function InterviewTab({ ctx, params }: AddonTabProps) {
  const p = params as Params;
  const { run, brief, error } = useRun(p);
  const [planning, setPlanning] = useState(false);
  if (!p.runId) return <Empty icon={Factory} title="No run" className="h-full" />;
  if (!run) return error ? <div className="p-3 text-xs text-danger">{error}</div> : <Spinner center />;
  const cov = run.brief?.coverage ?? brief?.coverage;
  return (
    <div className="@container flex h-full min-h-0 flex-col" data-testid="factory-interview">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-4">
        <span className="min-w-0 truncate text-sm font-semibold text-fg">{run.title}</span>
        <span className="shrink-0 text-sm text-hint">· Interview</span>
        <span className="flex-1" />
        <span
          className="flex shrink-0 items-center gap-1.5 text-xs text-muted"
          data-testid="factory-coverage"
        >
          coverage
          <Ring value={cov ? cov.covered / cov.total : 0} />
          <span className="w-8 tabular-nums">{cov ? `${cov.covered}/${cov.total}` : "–"}</span>
        </span>
        <IconButton
          icon={MoreHorizontal}
          size="sm"
          label="More"
          data-testid="factory-interview-more"
          onClick={(e) => {
            const chat = run.stages.find((s) => s.id === "S1")?.chatId;
            ctx.menu(
              [
                {
                  label: "Open the interview's chat",
                  icon: "message-square",
                  disabled: !chat,
                  onSelect: () => void ctx.openChat({ sessionId: chat }),
                },
                {
                  label: "Open the run",
                  icon: "factory",
                  onSelect: () =>
                    ctx.openTab("run", { projectId: run.projectId, runId: run.id, title: run.title }),
                },
              ],
              e.currentTarget,
            );
          }}
        />
      </div>
      <div className="grid min-h-0 flex-1 @max-3xl:grid-cols-1 @max-3xl:content-start @max-3xl:overflow-y-auto @3xl:grid-cols-2 @3xl:overflow-hidden">
        <Questions ctx={ctx} run={run} />
        <Brief ctx={ctx} run={run} brief={brief ?? null} onPlan={() => setPlanning(true)} />
      </div>
      {planning && (
        <PlanDialog ctx={ctx} run={run} brief={brief ?? null} onClose={() => setPlanning(false)} />
      )}
    </div>
  );
}

function Questions({ ctx, run }: { ctx: AddonUiContext; run: Run }) {
  const cards = openCards(run);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"send" | "enough">();
  const [error, setError] = useState<string>();
  const answerOf = (q: Question) => values[q.id] ?? q.suggestion ?? "";
  const edited = cards.some((q) => values[q.id] !== undefined && values[q.id] !== (q.suggestion ?? ""));
  const interviewing = run.state === "interview" && run.stages.find((s) => s.id === "S1")?.status !== "done";
  const act = async (kind: "send" | "enough") => {
    setBusy(kind);
    setError(undefined);
    try {
      if (kind === "enough") await ctx.host.call("enough", { projectId: run.projectId, runId: run.id });
      else
        await ctx.host.call("answer", {
          projectId: run.projectId,
          runId: run.id,
          stageId: "S1",
          answers: cards.map((q) => ({ id: q.id, answer: answerOf(q) })).filter((a) => a.answer.trim()),
        });
      setValues({});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(undefined);
    }
  };
  return (
    <section className="flex min-h-0 flex-col gap-2 p-4 @3xl:border-r @3xl:border-line">
      <div className="flex h-6 shrink-0 items-center gap-2 text-xs">
        <span className="font-semibold text-fg">
          Questions{cards.length ? ` (round ${cards[0]?.round})` : ""}
        </span>
        <span className="flex-1" />
        <span className="text-hint" data-testid="factory-rounds">
          {answeredLine(run)}
        </span>
      </div>
      <div
        className="flex min-h-0 flex-1 flex-col gap-2 @3xl:overflow-y-auto"
        data-testid="factory-questions"
      >
        {cards.length ? (
          cards.map((q) => (
            <Card
              key={q.id}
              q={q}
              value={answerOf(q)}
              onChange={(v) => setValues((m) => ({ ...m, [q.id]: v }))}
            />
          ))
        ) : (
          <div className="flex h-36 flex-col items-center justify-center gap-2 text-xs text-hint">
            {interviewing ? (
              <>
                <Spinner />
                <span>Jig is reading your answers and writing the brief…</span>
              </>
            ) : (
              <span>The interview is over.</span>
            )}
          </div>
        )}
      </div>
      <div className="flex h-8 shrink-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-danger">{error}</span>
        <Button
          size="sm"
          variant="ghost"
          busy={busy === "enough"}
          disabled={!interviewing || !!busy}
          data-testid="factory-enough"
          onClick={() => act("enough")}
        >
          Good enough
        </Button>
        <Button
          size="sm"
          variant="primary"
          className="w-40 justify-center"
          busy={busy === "send"}
          disabled={!cards.length || !!busy}
          data-testid="factory-answer"
          onClick={() => act("send")}
        >
          {edited ? "Send answers" : "Answer all suggested"}
        </Button>
      </div>
    </section>
  );
}

/** Adds dictated words after what the field had when you started speaking. */
function useDictated(value: string, onChange: (v: string) => void) {
  const base = useRef<string | undefined>(undefined);
  const latest = useRef(value);
  latest.current = value;
  return (words: string, final: boolean) => {
    base.current ??= latest.current;
    const b = base.current;
    onChange(`${b}${b && !/\s$/.test(b) ? " " : ""}${words}`);
    if (final) base.current = undefined;
  };
}

function Card({ q, value, onChange }: { q: Question; value: string; onChange: (v: string) => void }) {
  const dictated = useDictated(value, onChange);
  const suggested = value === (q.suggestion ?? "");
  return (
    <div
      className="flex h-32 shrink-0 flex-col gap-2 rounded-md border border-line bg-surface p-3"
      data-testid="factory-question"
    >
      <span className="line-clamp-2 h-8 text-xs text-fg">{q.text}</span>
      <div className="flex items-center gap-1">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1"
          aria-label={q.text}
          data-testid="factory-question-answer"
        />
        <IconButton
          icon={Check}
          size="sm"
          label={suggested ? "The suggested answer" : "Back to the suggested answer"}
          className={cn(suggested && "text-accent")}
          onClick={() => onChange(q.suggestion ?? "")}
        />
        <Dictate target={`factory-card-${q.id}`} onText={dictated} />
      </div>
      {/* The options' row is always there, so cards with and without options are the same size. */}
      <div className="flex h-6 items-center gap-1 overflow-hidden">
        {(q.options ?? []).slice(0, 5).map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={cn(
              "h-6 max-w-40 shrink-0 truncate rounded-full border px-2 text-xs transition-colors",
              value === o
                ? "border-accent text-accent"
                : "border-line text-muted hover:bg-hover hover:text-fg",
            )}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

const label = (code?: string) => LANGUAGES.find((l) => l.code === code)?.label ?? code;

function Brief({
  ctx,
  run,
  brief,
  onPlan,
}: {
  ctx: AddonUiContext;
  run: Run;
  brief: BriefDoc | null;
  onPlan: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const writing = run.state === "interview";
  const g0 = run.gates.find((g) => g.id === "G0");
  const planWaiting = run.stages.some((s) => s.recipe === "plan" && s.status === "needs-you");
  const level = brief?.level ?? run.brief?.level;
  return (
    <section className="flex min-h-0 flex-col gap-2 p-4" data-testid="factory-brief">
      <div className="flex h-6 shrink-0 items-center gap-2 text-xs">
        <span className="font-semibold text-fg">Brief</span>
        <span className="text-hint">({g0?.status === "approved" ? "approved" : "draft"})</span>
      </div>
      <dl className="flex min-h-0 flex-1 flex-col gap-2 text-xs @3xl:overflow-y-auto">
        {sectionsFor(run.track).map((name) => {
          const text = brief?.sections[name]?.trim();
          return (
            <Row key={name} name={name}>
              {text ? (
                <span className="line-clamp-3 whitespace-pre-line text-fg">{text}</span>
              ) : writing ? (
                <span className="mt-1 block h-3 w-3/4 animate-pulse rounded bg-hover" />
              ) : (
                <span className="text-hint">–</span>
              )}
            </Row>
          );
        })}
        <Row name="Level">
          <span className="flex items-center gap-2">
            <LevelBadge level={level} />
            <span className="line-clamp-2 text-muted">
              {brief?.levelWhy ?? (level ? "" : "Not picked yet")}
            </span>
          </span>
        </Row>
        <Row name="Languages">
          <span className="line-clamp-2 text-muted" data-testid="factory-brief-languages">
            {LANGUAGE_GROUPS.filter((g) => brief?.languages[g])
              .map((g) => `${LANGUAGE_GROUP_LABELS[g]} ${label(brief?.languages[g])}`)
              .join(" · ") || "Not asked yet"}
          </span>
        </Row>
        <Row name="Open points">
          {brief?.gaps.length ? (
            <span className="flex flex-col gap-0.5" data-testid="factory-brief-gaps">
              {brief.gaps.slice(0, 6).map((g) => (
                <span key={g} className="flex items-center gap-1.5">
                  <Badge tone="warning">gap</Badge>
                  <span className="min-w-0 truncate text-fg">{g}</span>
                </span>
              ))}
            </span>
          ) : (
            <span className="text-hint">None</span>
          )}
        </Row>
      </dl>
      <div className="flex h-8 shrink-0 items-center justify-end gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-danger">{error}</span>
        {planWaiting || run.state === "planning" ? (
          <Button
            size="sm"
            variant="primary"
            className="w-40 justify-center"
            data-testid="factory-plan-open"
            onClick={onPlan}
          >
            Plan the run…
          </Button>
        ) : g0?.status === "approved" ? (
          <Button
            size="sm"
            className="w-40 justify-center"
            onClick={() => ctx.openTab("run", { projectId: run.projectId, runId: run.id, title: run.title })}
          >
            Open the run
          </Button>
        ) : (
          <Button
            size="sm"
            variant="primary"
            className="w-40 justify-center"
            busy={busy}
            disabled={g0?.status !== "waiting"}
            data-testid="factory-looks-right"
            onClick={async () => {
              setBusy(true);
              setError(undefined);
              try {
                await ctx.host.call("decide", {
                  projectId: run.projectId,
                  runId: run.id,
                  gateId: "G0",
                  kind: "approve",
                });
                onPlan();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Looks right
          </Button>
        )}
      </div>
    </section>
  );
}

function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 truncate text-hint">{name}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}
