import type { AddonUiContext } from "@jig/sdk";
import { Badge, Button, cn, Dialog, Spinner } from "@jig/sdk/ui";
import { CircleAlert, CornerDownRight, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  blocksOf,
  type Change,
  changesAnything,
  changesOf,
  MIN_MOVABLE,
  type Placed,
  type Proposal,
  parseProposal,
  reorganizePrompt,
} from "./lib/reorganize";
import type { Queue } from "./lib/tasks";

/** The AI feature the question runs on (Settings → AI features → "Reorganize the task queue"). */
const FEATURE = "taskQueueReorganize" as const;

type Phase =
  | { kind: "asking" }
  | { kind: "error"; message: string }
  | { kind: "ready"; proposal: Proposal; changes: Change[]; by: string };

/**
 * Reorganize (D-397): asks the small AI for a better order and grouping of the tasks that haven't run,
 * shows what it would change and applies it only on Apply, as one change with an Undo toast. The modal
 * keeps one size through working, answer and failure, so nothing moves.
 */
export function ReorganizeDialog({
  ctx,
  projectId,
  queue,
  onClose,
}: {
  ctx: AddonUiContext;
  projectId: string;
  queue: Queue;
  onClose: () => void;
}) {
  // The queue as it was when the question was asked; the host checks the answer against the live one.
  const asked = useRef(queue);
  const open = useRef(true);
  const [phase, setPhase] = useState<Phase>({ kind: "asking" });
  const [applying, setApplying] = useState(false);

  const ask = () => {
    setPhase({ kind: "asking" });
    ctx.ai
      .answer(reorganizePrompt(asked.current), { feature: FEATURE })
      .then((answer) => {
        if (!open.current) return;
        const proposal = parseProposal(asked.current, answer.text);
        const by = `${answer.provider === "chatgpt" ? "ChatGPT" : "Claude"} ${answer.model}`;
        setPhase({ kind: "ready", proposal, changes: changesOf(asked.current, proposal.tasks), by });
      })
      .catch((e: unknown) => {
        if (!open.current) return;
        setPhase({
          kind: "error",
          message: `${e instanceof Error ? e.message : String(e)}. Nothing was changed.`,
        });
      });
  };
  useEffect(() => {
    ask();
    return () => {
      open.current = false;
    };
  }, []);

  const apply = async (proposal: Proposal) => {
    setApplying(true);
    try {
      const { previous } = (await ctx.host.call("reorganize", { projectId, tasks: proposal.tasks })) as {
        previous: Placed[];
      };
      onClose();
      ctx.notify({
        title: "Queue reorganized",
        message: proposal.summary,
        tone: "success",
        actions: [
          {
            label: "Undo reorganize",
            run: () =>
              void ctx.host
                .call("reorganize", { projectId, tasks: previous, restore: true })
                .then(() => ctx.notify({ title: "Queue order restored", tone: "info", timeout: 3000 }))
                .catch((e: Error) => ctx.notify({ title: e.message, tone: "danger" })),
          },
        ],
        timeout: 15000,
      });
    } catch (e) {
      setPhase({ kind: "error", message: (e as Error).message });
    } finally {
      setApplying(false);
    }
  };

  const ready = phase.kind === "ready" ? phase : undefined;
  const useful = !!ready && changesAnything(ready.changes);
  return (
    <Dialog
      open
      onClose={onClose}
      width="lg"
      testId="tasks-reorganize-dialog"
      title="Reorganize the queue"
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onClose} data-testid="tasks-reorganize-cancel">
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={Sparkles}
            disabled={!useful || applying}
            onClick={() => ready && void apply(ready.proposal)}
            data-testid="tasks-reorganize-apply"
          >
            Apply
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {/* Fixed-height slots: the summary line, the list and the disclosure keep their place. */}
        <div className="h-5 truncate text-xs text-muted" title={ready?.proposal.summary}>
          {phase.kind === "asking"
            ? "Looking at the tasks that haven't run…"
            : ready
              ? ready.proposal.summary || (useful ? "A better order was found." : "")
              : ""}
        </div>
        <div
          className="h-96 overflow-y-auto rounded-md border border-border"
          data-testid="tasks-reorganize-body"
        >
          {phase.kind === "asking" && (
            <div className="flex h-full items-center justify-center" data-testid="tasks-reorganize-working">
              <Spinner center />
            </div>
          )}
          {phase.kind === "error" && (
            <div
              className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
              data-testid="tasks-reorganize-error"
            >
              <CircleAlert className="size-5 text-danger" />
              <div className="text-sm text-fg">{phase.message}</div>
              <Button size="sm" onClick={ask}>
                Try again
              </Button>
            </div>
          )}
          {ready && !useful && (
            <div
              className="flex h-full items-center justify-center px-6 text-center text-sm text-muted"
              data-testid="tasks-reorganize-same"
            >
              The queue is already in a good order: nothing to change.
            </div>
          )}
          {ready && useful && (
            <Rows queue={asked.current} changes={ready.changes} proposal={ready.proposal} />
          )}
        </div>
        <div className="flex h-5 items-center gap-1.5 text-xs text-hint" data-testid="tasks-reorganize-ai">
          <Sparkles className="size-3.5 shrink-0" />
          <span className="truncate">
            AI-suggested order · check it before applying{ready ? ` · ${ready.by}` : ""}
          </span>
        </div>
      </div>
    </Dialog>
  );
}

/** The proposed queue: new place, chat mark, title with the reason, former place, and the marks, in columns. */
function Rows({ queue, changes, proposal }: { queue: Queue; changes: Change[]; proposal: Proposal }) {
  const byId = new Map(queue.tasks.map((t) => [t.id, t]));
  const reasons = new Map(proposal.tasks.map((p) => [p.id, p.reason]));
  // A thin rule between blocks: tasks between them stay where they are.
  const sizes = blocksOf(queue)
    .filter((b) => b.length >= MIN_MOVABLE)
    .map((b) => b.length);
  const edges = new Set(sizes.map((_, i) => sizes.slice(0, i + 1).reduce((a, b) => a + b, 0)));
  return (
    <ul className="flex flex-col py-1">
      {changes.map((c, i) => {
        const task = byId.get(c.id);
        const reason = reasons.get(c.id);
        return (
          <li key={c.id} className="contents">
            <div
              className={cn(
                "flex items-start gap-2 px-3 py-1.5",
                (c.moved || c.regrouped) && "bg-accent-soft",
              )}
              data-testid="tasks-reorganize-row"
              data-moved={c.moved ? "" : undefined}
              data-regrouped={c.regrouped ? "" : undefined}
            >
              <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted">{c.to}</span>
              <span className="flex size-4 shrink-0 items-center justify-center text-muted">
                {!c.newChat && (
                  <CornerDownRight className="size-3.5" aria-label="Continues the chat before" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-fg" title={task?.title}>
                  {task?.title ?? c.id}
                </span>
                {(c.moved || c.regrouped) && reason && (
                  <span className="block truncate text-xs text-muted" title={reason}>
                    {reason}
                  </span>
                )}
              </span>
              <span className="w-10 shrink-0 text-right text-xs tabular-nums text-hint">
                {c.from !== c.to ? `was ${c.from}` : ""}
              </span>
              <span className="w-16 shrink-0">{c.moved && <Badge tone="info">Moved</Badge>}</span>
              <span className="w-24 shrink-0">
                {c.regrouped && <Badge tone="neutral">{c.newChat ? "Own chat" : "Joins chat"}</Badge>}
              </span>
            </div>
            {edges.has(i + 1) && i + 1 < changes.length && <div className="mx-3 my-1 h-px bg-border" />}
          </li>
        );
      })}
    </ul>
  );
}
