/**
 * Recipe evals on screen (D-472): the Floor's "Recipe evals…" modal. Runs every golden brief to its
 * quality gate with the recipes as they are now, and shows the critic's numbers per recipe version.
 */

import type { AddonUiContext } from "@jig/sdk";
import { Badge, Button, Dialog, Spinner, useAddonEvent, useHostCall } from "@jig/sdk/ui";
import { useState } from "react";
import type { EvalResult, EvalRow } from "./lib/evals";

interface Evals {
  rows: EvalRow[];
  results: EvalResult[];
  running: Array<{ runId: string; title: string; brief: string }>;
}

const score = (v?: number) => (v === undefined ? "—" : Math.round(v).toString());

export function EvalsDialog({
  ctx,
  projectId,
  onOpenRun,
  onClose,
}: {
  ctx: AddonUiContext;
  projectId: string;
  onOpenRun: (runId: string) => void;
  onClose: () => void;
}) {
  const { data, reload } = useHostCall<Evals>("evals", { projectId });
  const { data: briefs } = useHostCall<Array<{ id: string; title: string }>>("briefs", {});
  useAddonEvent("changed", () => void reload());
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const started = await ctx.host.call<unknown[]>("runEvals", { projectId });
      ctx.notify({
        title: `${started.length} eval run${started.length === 1 ? "" : "s"} started`,
        message: "Each runs to its quality gate by itself; the numbers show here when it gets there.",
        tone: "success",
      });
      await reload();
    } catch (err) {
      ctx.notify({
        title: "Couldn't start the evals",
        message: err instanceof Error ? err.message : String(err),
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      width="lg"
      testId="factory-evals"
      title="Recipe evals"
      footer={
        <>
          <span className="min-w-0 flex-1 truncate text-xs text-hint">
            {briefs ? `${briefs.length} golden brief${briefs.length === 1 ? "" : "s"}, on your models` : ""}
          </span>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={busy || !briefs?.length || !!data?.running.length}
            onClick={() => void run()}
            data-testid="factory-evals-run"
          >
            Run evals
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2 text-xs">
        <span className="text-hint">
          Each golden brief runs to its quality gate with the recipes as they are now; Jig decides its gates
          and the critic scores the demo. Change a recipe, run them again, and compare.
        </span>
        <div className="h-80 overflow-y-auto rounded-md border border-line" data-testid="factory-evals-rows">
          {!data ? (
            <Spinner center />
          ) : (
            <>
              <div className="flex h-7 items-center gap-2 border-b border-line px-3 text-hint">
                <span className="w-20 shrink-0">Recipe</span>
                <span className="min-w-0 flex-1">Version</span>
                <span className="w-12 shrink-0 text-right">Runs</span>
                <span className="w-14 shrink-0 text-right">Passed</span>
                <span className="w-12 shrink-0 text-right">Score</span>
                <span className="w-14 shrink-0 text-right">Trend</span>
                <span
                  className="w-20 shrink-0 text-right whitespace-nowrap"
                  title="Demo versions it took on average"
                >
                  Rounds
                </span>
              </div>
              {data.running.map((r) => (
                <button
                  key={r.runId}
                  type="button"
                  className="flex h-8 w-full items-center gap-2 border-b border-line px-3 text-left hover:bg-hover"
                  onClick={() => onOpenRun(r.runId)}
                  data-testid="factory-evals-running"
                >
                  <span className="w-20 shrink-0 truncate text-hint">{r.brief}</span>
                  <span className="min-w-0 flex-1 truncate text-fg">{r.title}</span>
                  <span className="flex w-80 shrink-0 justify-end">
                    <Badge tone="info">Running</Badge>
                  </span>
                </button>
              ))}
              {data.rows.map((e) => (
                <div
                  key={`${e.recipe} ${e.version}`}
                  className="flex h-8 items-center gap-2 border-b border-line px-3 last:border-b-0"
                  data-testid="factory-evals-row"
                >
                  <span className="w-20 shrink-0 truncate text-muted">{e.recipe}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-fg">{e.version}</span>
                  <span className="w-12 shrink-0 text-right text-muted tabular-nums">{e.n}</span>
                  <span className="w-14 shrink-0 text-right text-muted tabular-nums">{e.passed}</span>
                  <span className="w-12 shrink-0 text-right text-fg tabular-nums">{score(e.avgScore)}</span>
                  <span
                    className={`w-14 shrink-0 text-right tabular-nums ${
                      e.trend === undefined ? "text-hint" : e.trend >= 0 ? "text-success" : "text-danger"
                    }`}
                  >
                    {e.trend === undefined ? "—" : `${e.trend >= 0 ? "+" : ""}${Math.round(e.trend)}`}
                  </span>
                  <span className="w-20 shrink-0 text-right text-muted tabular-nums">
                    {e.avgRounds.toFixed(1)}
                  </span>
                </div>
              ))}
              {!data.rows.length && !data.running.length && (
                <div className="flex h-60 items-center justify-center text-hint">
                  No evals yet: Run evals starts one per golden brief
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
