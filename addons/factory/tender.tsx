/**
 * Tenders and the release package on screen (D-471, ui.md → Tracks): a tender run's requirement
 * matrix on its Run tab, the Floor's recurring-gap report, and the Floor's Release package modal.
 */

import type { AddonUiContext } from "@jig/sdk";
import {
  Badge,
  Button,
  Dialog,
  Input,
  SearchInput,
  Select,
  Spinner,
  useAddonEvent,
  useHostCall,
} from "@jig/sdk/ui";
import { useState } from "react";
import type { Candidate } from "./lib/package";
import type { Run } from "./lib/run";
import {
  counts,
  type Matrix,
  REQ_STATUS,
  REQ_STATUSES,
  type RecurringGap,
  type ReqStatus,
  type Requirement,
} from "./lib/tenders";

const STATUS_FILTERS: Array<{ id: "all" | ReqStatus; label: string }> = [
  { id: "all", label: "All requirements" },
  ...REQ_STATUSES.map((id) => ({ id, label: REQ_STATUS[id].label })),
];

/** A tender run's requirement matrix: a fixed box, so the matrix arriving moves nothing. */
export function MatrixSection({ run }: { run: Pick<Run, "projectId" | "id"> }) {
  const { data: matrix, reload } = useHostCall<Matrix | null>("tenderMatrix", {
    projectId: run.projectId,
    runId: run.id,
  });
  useAddonEvent("changed", (p) => {
    const e = p as { runId?: string } | undefined;
    if (!e?.runId || e.runId === run.id) void reload();
  });
  const [status, setStatus] = useState<"all" | ReqStatus>("all");
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<Requirement>();
  const c = matrix ? counts(matrix) : undefined;
  const q = filter.trim().toLowerCase();
  const rows = (matrix?.requirements ?? []).filter(
    (r) =>
      (status === "all" || r.status === status) &&
      (!q || `${r.id} ${r.text} ${r.category} ${r.source}`.toLowerCase().includes(q)),
  );
  return (
    <section className="flex flex-col gap-2" data-testid="factory-matrix">
      <div className="flex h-5 items-center gap-2">
        <span className="text-2xs font-semibold tracking-wide text-hint uppercase">Requirements</span>
        <span className="text-2xs text-hint tabular-nums">{c?.total ?? ""}</span>
        <span className="min-w-0 flex-1 truncate text-2xs text-hint">
          {matrix
            ? [matrix.buyer, matrix.deadline && `due ${matrix.deadline}`].filter(Boolean).join(" · ")
            : ""}
        </span>
        <span
          className="w-40 shrink-0 text-right text-2xs text-danger tabular-nums"
          data-testid="factory-matrix-blocking"
        >
          {c?.blocking ? `${c.blocking} must not met` : ""}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="w-44 shrink-0"
          disabled={!matrix}
          data-testid="factory-matrix-status"
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
              {c && f.id !== "all" ? ` · ${c[f.id]}` : ""}
            </option>
          ))}
        </Select>
        <div className="min-w-0 flex-1">
          <SearchInput
            value={filter}
            placeholder="Filter requirements"
            onChange={(e) => setFilter(e.target.value)}
            onClear={() => setFilter("")}
          />
        </div>
      </div>
      <div className="h-72 overflow-y-auto rounded-md border border-line" data-testid="factory-matrix-rows">
        {matrix === undefined ? (
          <Spinner center />
        ) : !matrix ? (
          <div className="flex h-full items-center justify-center text-xs text-hint">
            The requirement matrix shows here once Jig has read the tender
          </div>
        ) : rows.length ? (
          rows.map((r) => (
            <button
              key={r.id}
              type="button"
              className="flex h-8 w-full items-center gap-2 border-b border-line px-2 text-left text-xs last:border-b-0 hover:bg-hover"
              onClick={() => setOpen(r)}
              data-testid={`factory-req-${r.id}`}
            >
              <span className="w-10 shrink-0 font-mono text-hint">{r.id}</span>
              <span className="min-w-0 flex-1 truncate text-fg">{r.text}</span>
              <span className="@max-2xl:hidden @2xl:inline w-28 shrink-0 truncate text-hint">
                {r.category}
              </span>
              <span className="w-12 shrink-0 text-hint">{r.kind === "must" ? "Must" : "Should"}</span>
              <span className="flex w-36 shrink-0 justify-end">
                <Badge tone={REQ_STATUS[r.status].tone}>{REQ_STATUS[r.status].label}</Badge>
              </span>
            </button>
          ))
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-hint">
            No requirement matches
          </div>
        )}
      </div>
      {open && (
        <Dialog open onClose={() => setOpen(undefined)} width="md" title={`${open.id} · ${open.category}`}>
          <div className="flex flex-col gap-3 text-xs" data-testid="factory-req-detail">
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-hint">Status</span>
              <Badge tone={REQ_STATUS[open.status].tone}>{REQ_STATUS[open.status].label}</Badge>
              <span className="text-hint">{open.kind === "must" ? "Must" : "Should"}</span>
            </div>
            <p className="text-fg">{open.text}</p>
            <div className="flex gap-2">
              <span className="w-16 shrink-0 text-hint">Where</span>
              <span className="min-w-0 flex-1 text-muted">{open.source || "Not given"}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-16 shrink-0 text-hint">Why</span>
              <span className="min-w-0 flex-1 text-muted">{open.why || "Not given"}</span>
            </div>
          </div>
        </Dialog>
      )}
    </section>
  );
}

/** The Floor's recurring-gap report: what the company failed in two or more tenders. */
export function RecurringGapsDialog({
  projectId,
  onOpenRun,
  onClose,
}: {
  projectId: string;
  onOpenRun: (runId: string) => void;
  onClose: () => void;
}) {
  const { data } = useHostCall<{ tenders: number; gaps: RecurringGap[] }>("tenderGaps", { projectId });
  return (
    <Dialog
      open
      onClose={onClose}
      width="lg"
      testId="factory-gaps"
      title="Recurring gaps"
      footer={
        <>
          <span className="min-w-0 flex-1 truncate text-xs text-hint">
            {data ? `Over ${data.tenders} tender${data.tenders === 1 ? "" : "s"} read in this project` : ""}
          </span>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2 text-xs">
        <span className="text-hint">
          Requirements not met, or not known, in two or more tenders: one investment may win several bids.
        </span>
        <div className="h-80 overflow-y-auto rounded-md border border-line" data-testid="factory-gaps-rows">
          {!data ? (
            <Spinner center />
          ) : data.gaps.length ? (
            data.gaps.map((g) => (
              <div key={g.key} className="flex flex-col gap-1 border-b border-line px-3 py-2 last:border-b-0">
                <div className="flex h-5 items-center gap-2">
                  <span className="w-40 shrink-0 truncate text-hint">{g.key}</span>
                  <span className="min-w-0 flex-1 truncate text-fg" title={g.text}>
                    {g.text}
                  </span>
                  <span className="w-24 shrink-0 text-right text-hint tabular-nums">
                    {g.tenders.length} tenders
                  </span>
                  <span className="w-20 shrink-0 text-right text-hint tabular-nums">{g.must} must</span>
                </div>
                {g.tenders.map((t) => (
                  <button
                    key={t.runId}
                    type="button"
                    className="flex h-6 w-full items-center gap-2 rounded-sm pl-42 text-left hover:bg-hover"
                    onClick={() => onOpenRun(t.runId)}
                  >
                    <span className="min-w-0 flex-1 truncate text-muted">{t.title}</span>
                    <span className="w-24 shrink-0 text-right whitespace-nowrap text-hint tabular-nums">
                      {t.at.slice(0, 10)}
                    </span>
                    <span className="flex w-20 shrink-0 justify-end">
                      <Badge tone={REQ_STATUS[t.status].tone}>{REQ_STATUS[t.status].label}</Badge>
                    </span>
                  </button>
                ))}
              </div>
            ))
          ) : (
            <div className="flex h-full items-center justify-center text-hint">
              No requirement has come back unmet yet
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

/** The Floor's Release package: tick the ready change requests, pick the day, write the package. */
export function ReleasePackageDialog({
  ctx,
  projectId,
  onClose,
}: {
  ctx: AddonUiContext;
  projectId: string;
  onClose: () => void;
}) {
  const { data: list } = useHostCall<Candidate[]>("packageCandidates", { projectId });
  const [picked, setPicked] = useState<string[]>([]);
  const [day, setDay] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const toggle = (id: string) => setPicked((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  return (
    <Dialog
      open
      onClose={() => !busy && onClose()}
      width="lg"
      testId="factory-package"
      title="Release package"
      footer={
        <>
          <span className="w-10 shrink-0 text-xs text-hint">Day</span>
          <Input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="w-40"
            data-testid="factory-package-day"
          />
          <span className="min-w-0 flex-1 truncate text-right text-xs text-danger">{error}</span>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            busy={busy}
            disabled={!picked.length || !day}
            data-testid="factory-package-make"
            onClick={async () => {
              setBusy(true);
              setError(undefined);
              try {
                const r = await ctx.host.call<{ folder: string; files: string[]; staged: boolean }>(
                  "makePackage",
                  {
                    projectId,
                    runIds: picked,
                    day,
                  },
                );
                ctx.notify({
                  title: `Release package written: ${r.files.length} files`,
                  message: r.staged
                    ? `${r.folder}. Releases offers it as the next release's notes.`
                    : `${r.folder}. Nothing is committed yet.`,
                  tone: "success",
                });
                onClose();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Write the package
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2 text-xs">
        <span className="text-hint">
          Ready change requests go in together: release notes, test documents and customer letters in
          docs/factory/releases/&lt;day&gt;, uncommitted, for Releases to ship.
        </span>
        <div
          className="h-72 overflow-y-auto rounded-md border border-line"
          data-testid="factory-package-rows"
        >
          {!list ? (
            <Spinner center />
          ) : list.length ? (
            list.map((c) => {
              const ready = !c.waiting.length;
              return (
                <label
                  key={c.runId}
                  className={
                    ready
                      ? "flex h-8 cursor-pointer items-center gap-2 border-b border-line px-3 last:border-b-0 hover:bg-hover"
                      : "flex h-8 items-center gap-2 border-b border-line px-3 opacity-60 last:border-b-0"
                  }
                  data-testid={`factory-package-${c.runId}`}
                >
                  <input
                    type="checkbox"
                    className="accent-accent"
                    disabled={!ready}
                    checked={picked.includes(c.runId)}
                    onChange={() => toggle(c.runId)}
                  />
                  <span className="min-w-0 flex-1 truncate text-fg">{c.title}</span>
                  <span className="w-48 shrink-0 truncate text-right text-hint">{c.why}</span>
                </label>
              );
            })
          ) : (
            <div className="flex h-full items-center justify-center text-hint">
              No change request has its plan done yet
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
