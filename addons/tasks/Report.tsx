import type { AddonTabProps, AddonUiContext } from "@jig/sdk";
import {
  Badge,
  Button,
  cn,
  Dialog,
  Empty,
  ProviderMark,
  Spinner,
  useAddonEvent,
  useHostCall,
} from "@jig/sdk/ui";
import { FileText, GitCommitHorizontal, ListPlus, RefreshCw, Sparkles } from "lucide-react";
import { type ReactNode, useState, useSyncExternalStore } from "react";
import {
  AWARE_LABEL,
  canReport,
  NEED_LABEL,
  PROPOSAL_KINDS,
  PROPOSAL_LABEL,
  parseRunReport,
  type ReportProposal,
  type RunReport,
  reportPrompt,
  runFollowUps,
} from "./lib/report";
import { type Run, STATUS_LABEL, type Task } from "./lib/tasks";
import { STATUS_TONE, StatusIcon, type Tone } from "./parts";

/**
 * A finished run's report (D-355): its own main-area tab (`report`, one per run), made only when you ask
 * from History (the row's report action or the run page's header). The AI call runs here in the view
 * through `ctx.ai.answer` (Settings → AI features → "Task run report"); the host keeps the result with
 * the run. A call in flight is remembered per run (below), so a tab opened again shows it still going.
 */

const making = new Map<string, Promise<void>>();
const failed = new Map<string, string>();
const listeners = new Set<() => void>();
let version = 0;
const changed = () => {
  version++;
  for (const l of listeners) l();
};

/** Whether a run's report is being made now, and why the last try failed. */
function useMaking(runId: string): { busy: boolean; error?: string } {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
  return { busy: making.has(runId), error: failed.get(runId) };
}

/** Makes (or makes again) a finished run's report and saves it with the run; one call per run at a time. */
export function makeReport(ctx: AddonUiContext, projectId: string, run: Run): Promise<void> {
  const going = making.get(run.id);
  if (going) return going;
  failed.delete(run.id);
  const job = (async () => {
    try {
      const answer = await ctx.ai.answer(reportPrompt(run), { feature: "taskRunReport" });
      const report = parseRunReport(answer.text, run, { provider: answer.provider, model: answer.model });
      await ctx.host.call("saveReport", { projectId, report });
    } catch (e) {
      failed.set(run.id, e instanceof Error ? e.message : String(e));
    } finally {
      making.delete(run.id);
      changed();
    }
  })();
  making.set(run.id, job);
  changed();
  return job;
}

export const runWhen = (iso?: string) =>
  iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";

/** Opens a run's report tab; without a saved report it starts making one (you asked for it). */
export function openReport(ctx: AddonUiContext, projectId: string, run: Run, saved: boolean) {
  if (!canReport(run)) return;
  if (!saved && !making.has(run.id)) void makeReport(ctx, projectId, run);
  ctx.openTab("report", { projectId, runId: run.id, title: `Run report · ${runWhen(run.startedAt)}` });
}

/** Why the report action is off: the run is still going. */
export const REPORT_OPEN_RUN = "The run report can be made once the run finishes";

export function RunReportTab({ ctx, params }: AddonTabProps) {
  const projectId = String(params.projectId ?? "");
  const runId = String(params.runId ?? "");
  const runs = useHostCall<Run[]>("history", { projectId });
  const saved = useHostCall<RunReport | null>("report", { projectId, runId });
  useAddonEvent("changed", (payload) => {
    const p = (payload as { projectId?: string } | undefined)?.projectId;
    if (p && p !== projectId) return;
    void runs.reload();
    void saved.reload();
  });
  const { busy, error } = useMaking(runId);
  const run = runs.data?.find((r) => r.id === runId);
  const report = saved.data ?? undefined;
  const loaded = runs.data !== undefined && saved.data !== undefined;

  let body: ReactNode;
  if (runs.error || saved.error)
    body = (
      <Empty icon={FileText} title="The report couldn't be read" className="flex-1">
        {runs.error ?? saved.error}
      </Empty>
    );
  else if (!loaded || busy) body = <Spinner center />;
  else if (!run)
    body = <Empty icon={FileText} title="This run is no longer in the history" className="flex-1" />;
  else if (error)
    body = (
      <Empty
        icon={FileText}
        title="The report couldn't be made"
        className="flex-1"
        actions={
          <Button size="sm" icon={RefreshCw} onClick={() => void makeReport(ctx, projectId, run)}>
            Retry
          </Button>
        }
      >
        <p data-testid="run-report-error">{error}</p>
      </Empty>
    );
  else if (!report)
    body = (
      <Empty
        icon={FileText}
        title="No report for this run yet"
        className="flex-1"
        actions={
          <span title={canReport(run) ? undefined : REPORT_OPEN_RUN}>
            <Button
              size="sm"
              icon={Sparkles}
              disabled={!canReport(run)}
              onClick={() => void makeReport(ctx, projectId, run)}
              data-testid="run-report-make"
            >
              Make the report
            </Button>
          </span>
        }
      >
        An AI reads the run's task reports and writes a summary, what to be aware of, what needs you, and its
        follow-ups merged into proposals you can queue.
      </Empty>
    );
  else body = <ReportBody ctx={ctx} projectId={projectId} run={run} report={report} />;

  return (
    <div className="@container flex h-full min-h-0 flex-col bg-surface" data-testid="run-report">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-4">
        <FileText className="size-4 shrink-0 text-muted" />
        <span className="min-w-0 truncate text-sm text-fg">
          Run report{run ? ` · ${runWhen(run.startedAt)}` : ""}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {run && (
            <span title={canReport(run) ? "Make a new report; it replaces this one" : REPORT_OPEN_RUN}>
              <Button
                size="sm"
                variant="ghost"
                icon={RefreshCw}
                disabled={busy || !report || !canReport(run)}
                onClick={() => void makeReport(ctx, projectId, run)}
                data-testid="run-report-regenerate"
              >
                Regenerate
              </Button>
            </span>
          )}
        </span>
      </div>
      {/* The AI disclosure and who made it: a fixed line, filled once there's a report. */}
      <div
        className="flex h-8 shrink-0 items-center gap-2 border-b border-line px-4 text-xs text-muted"
        data-testid="run-report-disclosure"
      >
        <Sparkles className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate">AI-generated report · check important details</span>
        {report && !busy && (
          <span
            className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5"
            data-testid="run-report-made"
            title={`Made by ${report.provider === "chatgpt" ? "ChatGPT" : "Claude"} (${report.model}) on ${runWhen(report.madeAt)}`}
          >
            <ProviderMark provider={report.provider} iconOnly />
            <span className="@max-xl:hidden @xl:inline truncate">{report.model}</span>
            <span className="@max-xl:hidden @xl:inline">·</span>
            <span className="tabular-nums">{runWhen(report.madeAt)}</span>
          </span>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">{body}</div>
    </div>
  );
}

/** A task's place in the run: "3", for links ("#3"). */
const numberOf = (run: Run, taskId: string) => run.tasks.findIndex((t) => t.id === taskId) + 1;

/** Opens a task's chat, when it has one. */
function openTaskChat(ctx: AddonUiContext, task?: Task) {
  if (task?.sessionId) void ctx.openChat({ sessionId: task.sessionId });
}

/** Links to the tasks an item came from: "#2 #5", each opening its chat; at most three, then "+n". */
function TaskLinks({ ctx, run, ids }: { ctx: AddonUiContext; run: Run; ids: string[] }) {
  const tasks = ids.map((id) => run.tasks.find((t) => t.id === id)).filter((t): t is Task => !!t);
  const shown = tasks.slice(0, 3);
  return (
    <span className="flex w-24 shrink-0 items-center justify-end gap-0.5">
      {shown.map((task) => (
        <button
          key={task.id}
          type="button"
          title={`${numberOf(run, task.id)}. ${task.title}${task.sessionId ? " · open its chat" : ""}`}
          disabled={!task.sessionId}
          onClick={(e) => {
            e.stopPropagation();
            openTaskChat(ctx, task);
          }}
          className="rounded px-1 text-xs tabular-nums text-muted hover:bg-hover hover:text-accent disabled:hover:bg-transparent disabled:hover:text-muted"
        >
          #{numberOf(run, task.id)}
        </button>
      ))}
      {tasks.length > shown.length && (
        <span
          className="px-1 text-xs text-hint"
          title={tasks
            .slice(3)
            .map((t) => t.title)
            .join(" · ")}
        >
          +{tasks.length - shown.length}
        </span>
      )}
    </span>
  );
}

function Section({
  title,
  count,
  actions,
  testId,
  children,
}: {
  title: string;
  count?: number;
  actions?: ReactNode;
  testId: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2" data-testid={testId}>
      <div className="flex h-7 items-center gap-2">
        <h2 className="text-2xs font-medium uppercase tracking-wide text-hint">{title}</h2>
        {count !== undefined && <span className="text-2xs tabular-nums text-hint">{count}</span>}
        <span className="ml-auto flex items-center gap-2">{actions}</span>
      </div>
      {children}
    </section>
  );
}

const LIST = "overflow-hidden rounded-lg border border-line bg-raised";
const ROW = "flex w-full items-center gap-3 border-b border-line px-3 py-2.5 text-left last:border-b-0";

const AWARE_TONE: Record<string, Tone> = {
  bug: "success",
  regression: "danger",
  flaky: "warning",
  decision: "accent",
  assumption: "accent",
  risk: "warning",
  surprise: "info",
};

function ReportBody({
  ctx,
  projectId,
  run,
  report,
}: {
  ctx: AddonUiContext;
  projectId: string;
  run: Run;
  report: RunReport;
}) {
  const taskOf = (id: string) => run.tasks.find((t) => t.id === id);
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-4">
      {(report.overview || report.tasks.length > 0) && (
        <Section title="What was done" testId="run-report-summary">
          {report.overview && <p className="text-sm leading-relaxed text-fg">{report.overview}</p>}
          {report.tasks.length > 0 && (
            <div className={LIST}>
              {report.tasks.map((line) => {
                const task = taskOf(line.taskId)!;
                return (
                  <button
                    key={line.taskId}
                    type="button"
                    className={cn(ROW, task.sessionId ? "hover:bg-hover" : "cursor-default")}
                    title={task.sessionId ? "Open its chat" : undefined}
                    onClick={() => openTaskChat(ctx, task)}
                    data-testid={`run-report-task-${line.taskId}`}
                  >
                    <span className="w-5 shrink-0 text-right text-xs tabular-nums text-hint">
                      {numberOf(run, line.taskId)}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-xs font-medium text-fg">{task.title}</span>
                      <span className="text-xs text-muted">{line.line}</span>
                      {line.committed && (
                        <span className="@max-2xl:flex @2xl:hidden min-w-0 items-center gap-1 text-xs text-hint">
                          <GitCommitHorizontal className="size-3.5 shrink-0" />
                          <span className="truncate">{line.committed}</span>
                        </span>
                      )}
                    </span>
                    <span
                      className="@max-2xl:hidden @2xl:flex w-48 shrink-0 items-center gap-1 text-xs text-hint"
                      title={line.committed}
                    >
                      {line.committed && <GitCommitHorizontal className="size-3.5 shrink-0" />}
                      <span className="truncate">{line.committed ?? ""}</span>
                    </span>
                    <StatusSlot task={task} />
                  </button>
                );
              })}
            </div>
          )}
        </Section>
      )}

      {report.aware.length > 0 && (
        <Section title="Things to be aware of" count={report.aware.length} testId="run-report-aware">
          <div className={LIST}>
            {report.aware.map((item, i) => (
              <div key={i} className={ROW}>
                <span className="min-w-0 flex-1 text-xs text-fg">{item.text}</span>
                <TaskLinks ctx={ctx} run={run} ids={item.taskIds} />
                <span className="flex w-28 shrink-0 justify-end">
                  <Badge tone={AWARE_TONE[item.kind]}>{AWARE_LABEL[item.kind]}</Badge>
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {report.stuck.length > 0 && (
        <Section
          title="Blocked, partly done and failed"
          count={report.stuck.length}
          testId="run-report-stuck"
        >
          <div className={LIST}>
            {report.stuck.map((item) => {
              const task = taskOf(item.taskId)!;
              return (
                <button
                  key={item.taskId}
                  type="button"
                  className={cn(ROW, task.sessionId ? "hover:bg-hover" : "cursor-default")}
                  title={task.sessionId ? "Open its chat" : undefined}
                  onClick={() => openTaskChat(ctx, task)}
                >
                  <span className="w-5 shrink-0 text-right text-xs tabular-nums text-hint">
                    {numberOf(run, item.taskId)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-xs font-medium text-fg">{task.title}</span>
                    {item.what && <span className="text-xs text-muted">{item.what}</span>}
                    {item.unblock && (
                      <span className="text-xs text-fg">
                        <span className="text-hint">To unblock: </span>
                        {item.unblock}
                      </span>
                    )}
                  </span>
                  <StatusSlot task={task} />
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {report.needsYou.length > 0 && (
        <Section title="Needs you" count={report.needsYou.length} testId="run-report-needs-you">
          <div className={LIST}>
            {report.needsYou.map((item, i) => (
              <div key={i} className={ROW}>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-xs text-fg">{item.text}</span>
                  {item.repo && <span className="truncate text-xs text-hint">{item.repo}</span>}
                </span>
                <TaskLinks ctx={ctx} run={run} ids={item.taskIds} />
                <span className="flex w-28 shrink-0 justify-end">
                  <Badge tone="warning">{NEED_LABEL[item.kind]}</Badge>
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {report.proposals.length > 0 && <Proposals ctx={ctx} projectId={projectId} run={run} report={report} />}
    </div>
  );
}

/** A task's status at the far right: the badge and its icon, as in the queue. */
function StatusSlot({ task }: { task: Task }) {
  return (
    <span className="flex w-28 shrink-0 items-center justify-end gap-1.5 whitespace-nowrap">
      <Badge tone={STATUS_TONE[task.status]}>{STATUS_LABEL[task.status]}</Badge>
      <StatusIcon status={task.status} />
    </span>
  );
}

/** The follow-ups reshaped into proposals, by kind; tick some and queue them, or queue one or all. */
function Proposals({
  ctx,
  projectId,
  run,
  report,
}: {
  ctx: AddonUiContext;
  projectId: string;
  run: Run;
  report: RunReport;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<ReportProposal | undefined>();
  const [queuing, setQueuing] = useState(false);
  const left = report.proposals.filter((p) => !p.queuedAt);
  const chosen = left.filter((p) => picked.has(p.id));
  const queue = async (list: ReportProposal[]) => {
    if (!list.length) return;
    setQueuing(true);
    try {
      await ctx.host.call("add", { projectId, prompts: list.map((p) => p.prompt), newChat: true });
      await ctx.host.call("reportQueued", { projectId, runId: run.id, ids: list.map((p) => p.id) });
      setPicked(new Set());
      ctx.notify({
        title: `Queued ${list.length} proposal${list.length === 1 ? "" : "s"}`,
        tone: "success",
      });
    } catch (e) {
      ctx.notify({ title: (e as Error).message, tone: "danger" });
    } finally {
      setQueuing(false);
    }
  };
  const groups = [
    ...PROPOSAL_KINDS.map((kind) => ({
      key: kind,
      title: PROPOSAL_LABEL[kind],
      items: report.proposals.filter((p) => p.kind === kind && !p.asSuggested),
    })),
    {
      key: "asSuggested",
      title: "As the tasks suggested them",
      items: report.proposals.filter((p) => p.asSuggested),
    },
  ].filter((g) => g.items.length);
  return (
    <Section
      title="Follow-ups"
      count={report.proposals.length}
      testId="run-report-proposals"
      actions={
        <>
          <Button
            size="sm"
            variant="ghost"
            icon={ListPlus}
            disabled={!chosen.length || queuing}
            onClick={() => void queue(chosen)}
            data-testid="run-report-queue-picked"
          >
            {chosen.length ? `Queue ${chosen.length} ticked` : "Queue ticked"}
          </Button>
          <Button
            size="sm"
            icon={ListPlus}
            disabled={!left.length || queuing}
            onClick={() => void queue(left)}
            data-testid="run-report-queue-all"
          >
            Queue all
          </Button>
        </>
      }
    >
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-1">
          <div className="px-1 text-xs font-medium text-muted">{group.title}</div>
          <div className={LIST}>
            {group.items.map((p) => (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                data-testid={`run-report-proposal-${p.id}`}
                onClick={() => setOpen(p)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setOpen(p);
                }}
                className={cn(ROW, "cursor-default hover:bg-hover")}
              >
                <span className="flex w-4 shrink-0 items-center justify-center">
                  {!p.queuedAt && (
                    <input
                      type="checkbox"
                      aria-label={`Pick ${p.title}`}
                      className="size-3.5 accent-accent"
                      checked={picked.has(p.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const next = new Set(picked);
                        if (e.target.checked) next.add(p.id);
                        else next.delete(p.id);
                        setPicked(next);
                      }}
                    />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-xs font-medium text-fg">{p.title}</span>
                  {p.why && <span className="text-xs text-muted">{p.why}</span>}
                </span>
                <span className="@max-xl:hidden @xl:block w-28 shrink-0 text-right text-xs text-hint">
                  {p.sources.length === 1 ? "1 follow-up" : `${p.sources.length} follow-ups`}
                </span>
                <span className="flex w-20 shrink-0 justify-end">
                  {p.queuedAt ? (
                    <Badge tone="success">Queued</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={queuing}
                      onClick={(e) => {
                        e.stopPropagation();
                        void queue([p]);
                      }}
                      data-testid={`run-report-queue-${p.id}`}
                    >
                      Queue
                    </Button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {open && (
        <ProposalDialog
          ctx={ctx}
          run={run}
          proposal={report.proposals.find((p) => p.id === open.id) ?? open}
          queuing={queuing}
          onQueue={(p) => void queue([p])}
          onClose={() => setOpen(undefined)}
        />
      )}
    </Section>
  );
}

/** A proposal in full: its prompt, and the follow-ups it came from with links to their tasks. */
function ProposalDialog({
  ctx,
  run,
  proposal: p,
  queuing,
  onQueue,
  onClose,
}: {
  ctx: AddonUiContext;
  run: Run;
  proposal: ReportProposal;
  queuing: boolean;
  onQueue: (p: ReportProposal) => void;
  onClose: () => void;
}) {
  const followUps = runFollowUps(run);
  return (
    <Dialog
      open
      onClose={onClose}
      width="lg"
      testId="run-report-proposal"
      title={<span className="truncate">{p.title}</span>}
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
          {p.queuedAt ? (
            <Badge tone="success">Queued {runWhen(p.queuedAt)}</Badge>
          ) : (
            <Button size="sm" variant="primary" icon={ListPlus} disabled={queuing} onClick={() => onQueue(p)}>
              Queue it
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {p.why && <p className="text-sm text-fg">{p.why}</p>}
        <div className="flex flex-col gap-1">
          <div className="text-2xs font-medium uppercase tracking-wide text-hint">Prompt to queue</div>
          <div className="whitespace-pre-wrap rounded-md border border-line bg-raised p-3 text-xs text-fg">
            {p.prompt}
          </div>
        </div>
        <div className="flex flex-col gap-1" data-testid="run-report-sources">
          <div className="text-2xs font-medium uppercase tracking-wide text-hint">
            From {p.sources.length === 1 ? "this follow-up" : `these ${p.sources.length} follow-ups`}
          </div>
          <div className={LIST}>
            {p.sources.map((id) => {
              const f = followUps.get(id);
              if (!f) return null;
              return (
                <div key={id} className={ROW}>
                  <span className="min-w-0 flex-1 text-xs text-fg">{f.text}</span>
                  <TaskLinks ctx={ctx} run={run} ids={[f.task.id]} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
