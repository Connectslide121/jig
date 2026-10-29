import { Check, MessageSquare, RefreshCw, Sparkles, Split, Trash2, Trophy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { AttemptChanges, AttemptRun } from "../../../shared/attempts";
import { call, errorMessage, useHostEvent } from "../../lib/host";
import { Badge, Button, Card, cn, confirmDialog, Empty, FileIcon, Spinner } from "../../ui";
import type { TabProps } from "../../workbench/registry";
import { workbench } from "../../workbench/store";
import { notify } from "../../workbench/toasts";
import { DiffLines } from "../preview/viewers";
import { StatusDot } from "../sessions/status";
import { useSessions } from "../sessions/store";

const FILE_TONE = {
  added: "text-success",
  modified: "text-warning",
  deleted: "text-danger",
  renamed: "text-info",
};

function useRun(id: string) {
  const [run, setRun] = useState<AttemptRun>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    void call("attempts.get", { id })
      .then(setRun)
      .catch((e) => setError(errorMessage(e)));
  }, [id]);
  useHostEvent("attempts.changed", (r) => {
    if (r.id === id) setRun(r);
  });
  return { run, error };
}

/**
 * "Try several ways": the attempts side by side — each chat's status, what it changed (click a file
 * for its diff), Claude's verdict, and Keep this one.
 */
export function AttemptsTab({ params, active }: TabProps) {
  const id = String(params.runId ?? "");
  const { run, error } = useRun(id);
  const metas = useSessions((s) => s.metas);
  const [changes, setChanges] = useState<AttemptChanges[]>([]);
  const [selected, setSelected] = useState<{ index: number; path: string }>();
  const [diff, setDiff] = useState<string>();
  const [judging, setJudging] = useState(false);
  const [keeping, setKeeping] = useState<number>();

  const working = run?.attempts.some((a) => {
    const s = metas[a.sessionId]?.status;
    return s === "working" || s === "starting" || s === "needs_you";
  });
  const refresh = useCallback(() => {
    if (run?.status !== "running") return;
    void call("attempts.changes", { id })
      .then(setChanges)
      .catch(() => {});
  }, [id, run?.status]);
  // Follow the attempts while they work (and once when they stop).
  useEffect(() => {
    if (!active || !run) return;
    refresh();
    if (!working) return;
    const timer = setInterval(refresh, 4000);
    return () => clearInterval(timer);
  }, [active, run, working, refresh]);
  useEffect(() => {
    if (!selected) return setDiff(undefined);
    let current = true;
    void call("attempts.diff", { id, index: selected.index, path: selected.path })
      .then((d) => current && setDiff(d))
      .catch((e) => current && setDiff(`Can't show the diff: ${errorMessage(e)}`));
    return () => {
      current = false;
    };
  }, [id, selected]);

  if (error) return <Empty title="These attempts no longer exist">{error}</Empty>;
  if (!run)
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );

  const judge = async () => {
    setJudging(true);
    try {
      await call("attempts.judge", { id });
    } catch (e) {
      notify({ title: "Claude couldn't judge", message: errorMessage(e), tone: "danger" });
    } finally {
      setJudging(false);
    }
  };
  const keep = async (index: number) => {
    const dirty = await call("attempts.repoDirty", { id }).catch(() => false);
    const ok = await confirmDialog({
      title: `Keep attempt ${index}?`,
      message: `Its changes go into your working copy (not committed), and every attempt's copy is removed.${
        dirty ? " Your working copy already has changes: the attempt is applied on top of them." : ""
      }`,
      confirmLabel: "Keep it",
    });
    if (!ok) return;
    setKeeping(index);
    try {
      await call("attempts.keep", { id, index });
      notify({
        title: `Kept attempt ${index}`,
        message: "Its changes are in your working copy.",
        tone: "success",
      });
    } catch (e) {
      notify({ title: "Couldn't keep it", message: errorMessage(e), tone: "danger" });
    } finally {
      setKeeping(undefined);
    }
  };
  const discard = async () => {
    if (
      await confirmDialog({
        title: "Discard every attempt?",
        message: "Their copies of the repository are removed; the chats stay in your list.",
        confirmLabel: "Discard",
        danger: true,
      })
    )
      await call("attempts.discard", { id }).catch((e) =>
        notify({ title: "Couldn't discard", message: errorMessage(e), tone: "danger" }),
      );
  };

  const verdict = run.verdict;
  const done = run.status !== "running";
  return (
    <div className="flex h-full flex-col" data-testid="attempts">
      <header className="flex shrink-0 flex-col gap-1 border-b border-line px-4 py-2">
        <div className="flex items-center gap-2">
          <Split className="size-4 text-accent" />
          <span className="text-sm font-semibold text-fg">Try several ways</span>
          <span className="text-xs text-hint">
            {run.attempts.length} attempts from {run.base.slice(0, 7)}
          </span>
          {run.status === "kept" && <Badge tone="success">Kept attempt {run.kept}</Badge>}
          {run.status === "discarded" && <Badge>Discarded</Badge>}
          <div className="flex-1" />
          {!done && (
            <>
              <Button size="sm" variant="ghost" icon={RefreshCw} onClick={refresh}>
                Refresh
              </Button>
              <Button
                size="sm"
                icon={Sparkles}
                busy={judging}
                disabled={judging || working}
                title={
                  working
                    ? "Wait until every attempt has finished"
                    : "Claude compares the attempts and picks one"
                }
                onClick={() => void judge()}
                data-testid="attempts-judge"
              >
                Let Claude judge
              </Button>
              <Button size="sm" variant="ghost" icon={Trash2} onClick={() => void discard()}>
                Discard all
              </Button>
            </>
          )}
        </div>
        <div className="line-clamp-2 text-xs whitespace-pre-wrap text-muted">{run.task}</div>
      </header>
      {verdict && (
        <div
          className="mx-4 mt-3 flex gap-2 rounded-lg border border-accent bg-accent-soft p-3 text-sm"
          data-testid="attempts-verdict"
        >
          <Trophy className="mt-0.5 size-4 shrink-0 text-accent" />
          <div>
            <div className="font-medium text-fg">
              {verdict.winner ? `Claude recommends attempt ${verdict.winner}` : "Claude has no clear winner"}
            </div>
            <div className="text-xs text-muted">{verdict.summary}</div>
          </div>
        </div>
      )}
      <div
        className="grid min-h-0 shrink-0 gap-3 overflow-x-auto p-4"
        style={{ gridTemplateColumns: `repeat(${run.attempts.length}, minmax(14rem, 1fr))` }}
      >
        {run.attempts.map((a) => {
          const meta = metas[a.sessionId];
          const c = changes.find((x) => x.index === a.index);
          const note = verdict?.notes.find((n) => n.attempt === a.index);
          const winner = verdict?.winner === a.index || run.kept === a.index;
          return (
            <Card
              key={a.index}
              className={cn("flex min-w-0 flex-col gap-2 p-3", winner && "border-accent")}
              data-testid={`attempt-${a.index}`}
            >
              <div className="flex items-center gap-2">
                {meta && <StatusDot status={meta.status} />}
                <span className="text-sm font-semibold text-fg">Attempt {a.index}</span>
                {verdict?.winner === a.index && <Badge tone="accent">Claude's pick</Badge>}
                <div className="flex-1" />
                <Button
                  size="sm"
                  variant="ghost"
                  icon={MessageSquare}
                  onClick={() => workbench.openTab("jig.chat", { sessionId: a.sessionId })}
                >
                  Chat
                </Button>
              </div>
              <div className="text-xs text-muted">{a.hint}</div>
              {note && (
                <div className="text-xs">
                  {note.strengths && <div className="text-success">+ {note.strengths}</div>}
                  {note.weaknesses && <div className="text-warning">− {note.weaknesses}</div>}
                </div>
              )}
              {!done && (
                <div className="flex flex-col gap-0.5 border-t border-line pt-2">
                  <div className="text-2xs font-semibold tracking-wide text-hint uppercase">
                    {c
                      ? `${c.files.length} file${c.files.length === 1 ? "" : "s"} · +${c.insertions} −${c.deletions}`
                      : "Changes"}
                  </div>
                  {c?.files.length === 0 && <div className="text-xs text-hint">Nothing changed yet</div>}
                  {c?.files.map((f) => (
                    <button
                      key={f.path}
                      type="button"
                      onClick={() => setSelected({ index: a.index, path: f.path })}
                      className={cn(
                        "flex min-w-0 items-center gap-1.5 rounded-sm px-1 py-0.5 text-left text-xs hover:bg-hover",
                        selected?.index === a.index && selected.path === f.path && "bg-active",
                      )}
                    >
                      <FileIcon path={f.path} className="size-3.5" />
                      <span className="min-w-0 flex-1 truncate text-fg">{f.path}</span>
                      <span className={FILE_TONE[f.status]}>
                        +{f.insertions} −{f.deletions}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {!done && (
                <Button
                  size="sm"
                  variant={verdict?.winner === a.index ? "primary" : "secondary"}
                  icon={Check}
                  busy={keeping === a.index}
                  disabled={!c?.files.length || keeping !== undefined}
                  onClick={() => void keep(a.index)}
                  data-testid={`attempt-keep-${a.index}`}
                >
                  Keep this one
                </Button>
              )}
            </Card>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-auto border-t border-line">
        {done ? (
          <Empty
            title={
              run.status === "kept"
                ? `Attempt ${run.kept} is in your working copy`
                : "The attempts were discarded"
            }
          >
            {run.status === "kept" && (
              <Button size="sm" onClick={() => workbench.showView("addon.git.git")}>
                Review it in Git
              </Button>
            )}
          </Empty>
        ) : diff !== undefined ? (
          <DiffLines text={diff} testId="attempts-diff" />
        ) : (
          <div className="p-4 text-xs text-hint">Click a file of an attempt to see its diff.</div>
        )}
      </div>
    </div>
  );
}
