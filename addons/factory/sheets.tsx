/**
 * The Run tab's modals (ui.md → Run): a stage's sheet (its chats, report, outputs, a question to answer,
 * Re-run and Fork), a gate's sheet (what it reviews, Approve / Ask for changes / Reject), the Inspector
 * and Re-run / Fork with a note. Forms and details are modals, never inline expanders (no layout shift).
 */

import type { AddonUiContext } from "@jig/sdk";
import {
  Badge,
  Button,
  cn,
  Dialog,
  FileIcon,
  Markdown,
  Select,
  Spinner,
  Textarea,
  useHostCall,
} from "@jig/sdk/ui";
import { GitFork, MessageSquare, RotateCcw } from "lucide-react";
import { useState } from "react";
import { gateOutputs } from "./lib/conductor";
import { GATE_STATUS, GATES, outputName, ownerName, ownerOf, revisionsLeft } from "./lib/gates";
import type { GateId, Output, Run, StageRun, StageStatus } from "./lib/run";
import { clock, OutputPill } from "./parts";

export const STAGE_STATUS: Record<
  StageStatus,
  { label: string; tone: "neutral" | "warning" | "success" | "danger" | "info" | "accent" }
> = {
  blocked: { label: "Not yet", tone: "neutral" },
  ready: { label: "Ready", tone: "neutral" },
  running: { label: "Running", tone: "info" },
  "needs-you": { label: "Waiting for you", tone: "warning" },
  done: { label: "Done", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  skipped: { label: "Skipped", tone: "neutral" },
};

type Call = (method: string, args: Record<string, unknown>) => Promise<unknown>;

function useAct(ctx: AddonUiContext, run: Run, onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const act: Call = async (method, args) => {
    setBusy(true);
    setError(undefined);
    try {
      const r = await ctx.host.call(method, { projectId: run.projectId, runId: run.id, ...args });
      onDone();
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return { act, busy, error };
}

/** A label and its value on one row, labels in a fixed column. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-6 items-start gap-3 text-xs">
      <span className="w-20 shrink-0 text-hint">{label}</span>
      <span className="min-w-0 flex-1 text-fg">{children}</span>
    </div>
  );
}

function OutputRows({
  outputs,
  files,
  ctx,
}: {
  outputs: Output[];
  files?: Record<string, string>;
  ctx: AddonUiContext;
}) {
  if (!outputs.length) return <div className="text-xs text-hint">No outputs yet</div>;
  return (
    <ul className="flex flex-col">
      {outputs.map((o) => (
        <li key={o.id}>
          <button
            type="button"
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-hover"
            data-testid="factory-sheet-output"
            onClick={() => {
              const p = files?.[o.id];
              if (p) ctx.openPreview(p);
            }}
          >
            <FileIcon path={o.path} className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-fg">{outputName(o)}</span>
            <span className="w-8 shrink-0 text-right text-hint tabular-nums">v{o.version}</span>
            <span className="flex w-20 shrink-0 justify-end">
              <OutputPill status={o.status} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The stages a graph box stands for: one, or a fan-out's (`S7:spec`, `S7:pitch`…). */
export function stagesOf(run: Run, boxId: string): StageRun[] {
  return run.stages.filter((s) => s.id === boxId || s.id.startsWith(`${boxId}:`));
}

export function StageSheet({
  ctx,
  run,
  boxId,
  title,
  files,
  now,
  onClose,
  onAction,
}: {
  ctx: AddonUiContext;
  run: Run;
  boxId: string;
  title: (id: string) => string;
  files?: Record<string, string>;
  now: number;
  onClose: () => void;
  onAction: (mode: "rerun" | "fork", stageId: string) => void;
}) {
  const stages = stagesOf(run, boxId);
  const [picked, setPicked] = useState(stages[0]?.id ?? boxId);
  const stage = stages.find((s) => s.id === picked) ?? stages[0];
  const [reply, setReply] = useState("");
  const { act, busy, error } = useAct(ctx, run, () => setReply(""));
  const outputs = run.outputs.filter((o) => o.stage === stage?.id && o.status !== "superseded");
  const status = stage ? STAGE_STATUS[stage.status] : STAGE_STATUS.blocked;
  const chats = stage?.chats ?? (stage?.chatId ? [stage.chatId] : []);
  return (
    <Dialog
      open
      onClose={onClose}
      width="lg"
      testId="factory-stage-sheet"
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-muted tabular-nums">{boxId}</span>
          <span className="truncate">{title(boxId)}</span>
        </span>
      }
      footer={
        stage && (
          <>
            {stage.chatId && (
              <Button
                size="sm"
                variant="ghost"
                icon={MessageSquare}
                data-testid="factory-stage-chat"
                onClick={() => {
                  void ctx.openChat({ sessionId: stage.chatId });
                  onClose();
                }}
              >
                Open chat
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              icon={GitFork}
              disabled={stage.status === "blocked"}
              data-testid="factory-stage-fork"
              onClick={() => onAction("fork", stage.id)}
            >
              Fork from here…
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={RotateCcw}
              disabled={stage.status === "running" || stage.status === "blocked"}
              data-testid="factory-stage-rerun"
              onClick={() => onAction("rerun", stage.id)}
            >
              Re-run…
            </Button>
            <Button size="sm" variant="primary" onClick={onClose}>
              Close
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {stages.length > 1 && (
          <Select
            value={stage?.id}
            onChange={(e) => setPicked(e.target.value)}
            className="w-60"
            data-testid="factory-stage-pick"
          >
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {title(s.id)} · {STAGE_STATUS[s.status].label}
              </option>
            ))}
          </Select>
        )}
        {!stage ? (
          <div className="text-xs text-hint">The run hasn't reached this stage yet.</div>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <Field label="Status">
                <Badge tone={status.tone}>{status.label}</Badge>
              </Field>
              <Field label="Recipe">{stage.recipe}</Field>
              <Field label="Version">
                <span className="tabular-nums">
                  v{stage.version ?? 1} · attempt {stage.attempt}
                </span>
              </Field>
              <Field label="Time">
                <span className="tabular-nums">
                  {stage.startedAt ? clock(stage.startedAt, now) : "–"}
                  {stage.endedAt ? ` → ${clock(stage.endedAt, now)}` : ""}
                </span>
              </Field>
              {stage.chatNote && <Field label="Its chat">{stage.chatNote}</Field>}
              {stage.feedback && <Field label="Changes">{stage.feedback}</Field>}
              {chats.length > 1 && (
                <Field label="Chats">
                  <span className="flex flex-wrap gap-x-3">
                    {chats.map((c, i) => (
                      <button
                        key={c}
                        type="button"
                        className="text-accent hover:underline"
                        onClick={() => {
                          void ctx.openChat({ sessionId: c });
                          onClose();
                        }}
                      >
                        Chat {i + 1}
                      </button>
                    ))}
                  </span>
                </Field>
              )}
            </div>
            {stage.question && (
              <section className="flex flex-col gap-2 rounded-lg border border-line bg-raised p-3">
                <span className="text-2xs font-semibold tracking-wide text-hint uppercase">It asks</span>
                <div className="text-sm text-fg" data-testid="factory-stage-question">
                  {stage.question}
                </div>
                {stage.status === "needs-you" && (
                  <>
                    <Textarea
                      rows={3}
                      value={reply}
                      placeholder="Your answer"
                      onChange={(e) => setReply(e.target.value)}
                      data-testid="factory-stage-reply"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs text-danger">{error}</span>
                      <Button
                        size="sm"
                        variant="primary"
                        busy={busy}
                        disabled={!reply.trim()}
                        data-testid="factory-stage-send"
                        onClick={() => void act("answer", { stageId: stage.id, reply: reply.trim() })}
                      >
                        Send answer
                      </Button>
                    </div>
                  </>
                )}
              </section>
            )}
            <section className="flex flex-col gap-2">
              <span className="text-2xs font-semibold tracking-wide text-hint uppercase">Report</span>
              {stage.report ? (
                <>
                  <div className="text-sm text-fg" data-testid="factory-stage-report">
                    <Markdown text={stage.report.summary} />
                  </div>
                  {stage.report.notes.length > 0 && (
                    <ul className="flex list-disc flex-col gap-0.5 pl-5 text-xs text-muted">
                      {stage.report.notes.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  )}
                  {stage.report.quality && (
                    <Field label="Quality">
                      {stage.report.quality.pass ? "Passes" : "Not yet"}
                      {stage.report.quality.score !== undefined && ` · ${stage.report.quality.score}`}
                    </Field>
                  )}
                </>
              ) : (
                <div className="text-xs text-hint">No report yet</div>
              )}
            </section>
            <section className="flex flex-col gap-1">
              <span className="text-2xs font-semibold tracking-wide text-hint uppercase">Outputs</span>
              <OutputRows outputs={outputs} files={files} ctx={ctx} />
            </section>
          </>
        )}
      </div>
    </Dialog>
  );
}

export function GateSheet({
  ctx,
  run,
  gateId,
  files,
  onClose,
}: {
  ctx: AddonUiContext;
  run: Run;
  gateId: GateId;
  files?: Record<string, string>;
  onClose: () => void;
}) {
  const gate = run.gates.find((g) => g.id === gateId);
  const status = GATE_STATUS[gate?.status ?? "closed"];
  const [note, setNote] = useState("");
  const { act, busy, error } = useAct(ctx, run, onClose);
  const open = gate?.status === "waiting";
  const decide = (kind: "approve" | "changes" | "reject") =>
    void act("decide", { gateId, kind, note: note.trim() || undefined });
  return (
    <Dialog
      open
      onClose={onClose}
      width="lg"
      testId="factory-gate-sheet"
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-muted tabular-nums">{gateId}</span>
          <span className="truncate">{GATES[gateId].label}</span>
        </span>
      }
      footer={
        open ? (
          <>
            <span className="min-w-0 flex-1 truncate text-xs text-danger">{error}</span>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              data-testid="factory-gate-reject"
              onClick={async () => {
                if (
                  await ctx.confirm({
                    title: `Reject at ${GATES[gateId].label}?`,
                    message: "The run stops here. Its files and branch stay.",
                    confirmLabel: "Reject",
                    danger: true,
                  })
                )
                  decide("reject");
              }}
            >
              Reject…
            </Button>
            <Button
              size="sm"
              disabled={busy || !note.trim()}
              title={note.trim() ? undefined : "Say what to change first"}
              data-testid="factory-gate-changes"
              onClick={() => decide("changes")}
            >
              Ask for changes
            </Button>
            <Button
              size="sm"
              variant="primary"
              busy={busy}
              data-testid="factory-gate-approve"
              onClick={() => decide("approve")}
            >
              Approve
            </Button>
          </>
        ) : (
          <Button size="sm" variant="primary" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Field label="Status">
            <Badge tone={status.tone}>{status.label}</Badge>
          </Field>
          <Field label="Owner">{ownerName(ownerOf(run, gateId))}</Field>
          <Field label="Revisions">
            <span className="tabular-nums">{revisionsLeft(run, gateId)} left</span>
          </Field>
          {gate?.note && <Field label="Last note">{gate.note}</Field>}
        </div>
        <section className="flex flex-col gap-1">
          <span className="text-2xs font-semibold tracking-wide text-hint uppercase">To review</span>
          <OutputRows outputs={gateOutputs(run, gateId)} files={files} ctx={ctx} />
        </section>
        {open && (
          <Textarea
            rows={3}
            value={note}
            placeholder="What to change (needed for Ask for changes)"
            onChange={(e) => setNote(e.target.value)}
            data-testid="factory-gate-note"
          />
        )}
      </div>
    </Dialog>
  );
}

/** Re-run a stage as its next version, or fork the run from it, with a note for the new version. */
export function StageActionDialog({
  ctx,
  run,
  mode,
  stageId,
  title,
  onClose,
  onForked,
}: {
  ctx: AddonUiContext;
  run: Run;
  mode: "rerun" | "fork";
  stageId?: string;
  title: (id: string) => string;
  onClose: () => void;
  onForked: (r: Run) => void;
}) {
  const choices = run.stages.filter((s) =>
    mode === "rerun" ? s.status !== "running" && s.status !== "blocked" : s.status !== "blocked",
  );
  const [stage, setStage] = useState(stageId ?? choices[0]?.id ?? "");
  const [note, setNote] = useState("");
  const { act, busy, error } = useAct(ctx, run, () => undefined);
  return (
    <Dialog
      open
      onClose={onClose}
      width="md"
      testId="factory-stage-action"
      title={mode === "rerun" ? "Re-run a stage" : "Fork the run"}
      footer={
        <>
          <span className="min-w-0 flex-1 truncate text-xs text-danger">{error}</span>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            busy={busy}
            disabled={!stage}
            data-testid="factory-stage-action-go"
            onClick={async () => {
              const r = (await act(mode, { stageId: stage, note: note.trim() || undefined })) as
                | Run
                | undefined;
              if (!r) return;
              onClose();
              if (mode === "fork") onForked(r);
            }}
          >
            {mode === "rerun" ? "Re-run" : "Fork"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-xs">
        <span className="text-muted">
          {mode === "rerun"
            ? "The stage runs again as its next version; everything after it waits for it again."
            : "A new run starts from this stage on a branch of its own; this run stays as it is."}
        </span>
        <div className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-hint">Stage</span>
          <Select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="w-60"
            data-testid="factory-stage-action-stage"
          >
            {choices.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id} · {title(s.id)}
              </option>
            ))}
          </Select>
        </div>
        <Textarea
          rows={4}
          value={note}
          placeholder="What the new version should do differently (optional)"
          onChange={(e) => setNote(e.target.value)}
          data-testid="factory-stage-action-note"
        />
      </div>
    </Dialog>
  );
}

interface InspectEntry {
  at: string;
  stage?: string;
  kind: "prompt" | "message" | "tool" | "decision" | "error";
  text: string;
}

const KIND_TONE: Record<InspectEntry["kind"], string> = {
  prompt: "text-accent",
  message: "text-muted",
  tool: "text-info",
  decision: "text-success",
  error: "text-danger",
};

/** The run's log: prompts sent, reports, tools, decisions and errors, newest last. */
export function InspectorDialog({ run, onClose, now }: { run: Run; onClose: () => void; now: number }) {
  const { data } = useHostCall<InspectEntry[]>("inspect", { projectId: run.projectId, runId: run.id });
  const [stage, setStage] = useState("");
  const list = (data ?? []).filter((e) => !stage || e.stage === stage);
  const stages = [...new Set((data ?? []).map((e) => e.stage).filter((s): s is string => !!s))];
  return (
    <Dialog
      open
      onClose={onClose}
      width="xl"
      column
      testId="factory-inspector"
      title={`Inspector · ${run.title}`}
    >
      <div className="flex shrink-0 items-center gap-3 pb-3 text-xs">
        <span className="text-hint">Stage</span>
        <Select value={stage} onChange={(e) => setStage(e.target.value)} className="w-48">
          <option value="">All</option>
          {stages.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <span className="flex-1" />
        <span className="text-hint tabular-nums">{list.length} entries</span>
      </div>
      <div
        className="min-h-60 flex-1 overflow-y-auto rounded-lg border border-line"
        data-testid="factory-inspector-log"
      >
        {!data ? (
          <Spinner center />
        ) : !list.length ? (
          <div className="p-3 text-xs text-hint">Nothing logged yet</div>
        ) : (
          <ol className="flex flex-col divide-y divide-line">
            {list.map((e, i) => (
              <li key={`${e.at}-${i}`} className="flex items-start gap-3 px-3 py-1.5 text-xs">
                <span className="w-14 shrink-0 text-right text-hint tabular-nums">{clock(e.at, now)}</span>
                <span className="w-12 shrink-0 truncate text-hint tabular-nums">{e.stage ?? ""}</span>
                <span className={cn("w-16 shrink-0", KIND_TONE[e.kind])}>{e.kind}</span>
                <span className="line-clamp-6 min-w-0 flex-1 whitespace-pre-wrap break-words text-fg">
                  {e.text}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Dialog>
  );
}

/** Start a run from a golden brief or a brief you paste (the New idea flow comes in session 3). */
export function StartDialog({
  ctx,
  projectId,
  onClose,
}: {
  ctx: AddonUiContext;
  projectId: string;
  onClose: () => void;
}) {
  const { data: briefs } = useHostCall<Array<{ id: string; title: string; level?: string }>>("briefs");
  const [brief, setBrief] = useState("");
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"acceptEdits" | "bypassPermissions">("acceptEdits");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const pasted = brief === "";
  const ready = pasted ? !!text.trim() : true;
  return (
    <Dialog
      open
      onClose={onClose}
      width="lg"
      testId="factory-start"
      title="Start from a brief"
      footer={
        <>
          <span className="min-w-0 flex-1 truncate text-xs text-danger">{error}</span>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            busy={busy}
            disabled={!ready}
            data-testid="factory-start-go"
            onClick={async () => {
              setBusy(true);
              setError(undefined);
              try {
                const r = await ctx.host.call<Run>("startRun", {
                  projectId,
                  ...(pasted ? { briefText: text } : { brief }),
                  permissionMode: mode,
                });
                onClose();
                ctx.openTab("run", { projectId, runId: r.id, title: r.title });
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Start
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-xs">
        <div className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-hint">Brief</span>
          <Select
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            className="w-72"
            data-testid="factory-start-brief"
          >
            <option value="">Paste a brief</option>
            {(briefs ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
                {b.level ? ` · ${b.level}` : ""}
              </option>
            ))}
          </Select>
        </div>
        <Textarea
          rows={8}
          value={pasted ? text : ""}
          disabled={!pasted}
          placeholder={
            pasted ? "The brief in Markdown: what, for whom, why now" : "Uses the sample brief you picked"
          }
          onChange={(e) => setText(e.target.value)}
          data-testid="factory-start-text"
        />
        <div className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-hint">Stage chats</span>
          <Select
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
            className="w-72"
            data-testid="factory-start-mode"
          >
            <option value="acceptEdits">Accept edits (asks before commands)</option>
            <option value="bypassPermissions">Don't ask (runs unattended)</option>
          </Select>
        </div>
        <span className="text-hint">
          The run works in a git worktree on its own branch, factory/&lt;name&gt;, and stops at each gate for
          you.
        </span>
      </div>
    </Dialog>
  );
}
