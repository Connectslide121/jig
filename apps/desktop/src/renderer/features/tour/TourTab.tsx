import { ArrowLeft, ArrowRight, Eye, Map as MapIcon, MessageSquare } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Tour } from "../../../shared/tour";
import { call, errorMessage } from "../../lib/host";
import { Button, cn, Empty, FileIcon, Markdown, Spinner } from "../../ui";
import { Pane } from "../../workbench/Pane";
import { useProjects } from "../../workbench/projects";
import type { TabProps } from "../../workbench/registry";
import { openPreview } from "../preview/actions";
import { DiffLines } from "../preview/viewers";
import { newSession } from "../sessions/actions";

/** A file diff split at its hunks (`@@ … @@`), so one can be highlighted. */
function splitHunks(diff: string): { header: string; hunks: string[] } {
  const parts = diff.split(/^(?=@@ )/m);
  return { header: parts[0] ?? "", hunks: parts.slice(1) };
}

function hunkFor(hunks: string[], line: number | undefined): number {
  if (!line) return 0;
  const i = hunks.findIndex((h) => {
    const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(h);
    if (!m) return false;
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    return line >= start && line < start + Math.max(count, 1);
  });
  return Math.max(0, i);
}

/**
 * A guided tour of changes: Claude's steps in the order that makes them easy to follow, each with its
 * explanation next to the part of the diff it's about.
 */
export function TourTab({ params, active }: TabProps) {
  const id = String(params.tourId ?? "");
  const [tour, setTour] = useState<Tour>();
  const [error, setError] = useState<string>();
  const [step, setStep] = useState(0);
  const projects = useProjects((s) => s.projects);
  const hunkRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    void call("tour.get", { id })
      .then(setTour)
      .catch((e) => setError(errorMessage(e)));
  }, [id]);
  const current = tour?.steps[step];
  const parts = useMemo(
    () => (current && tour ? splitHunks(tour.diffs[current.file] ?? "") : undefined),
    [tour, current],
  );
  const highlighted = parts && current ? hunkFor(parts.hunks, current.line) : 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when the step changes.
  useEffect(() => {
    hunkRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [step, highlighted]);
  useEffect(() => {
    if (!active || !tour) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "ArrowRight" || e.key === "j") setStep((s) => Math.min(tour.steps.length - 1, s + 1));
      if (e.key === "ArrowLeft" || e.key === "k") setStep((s) => Math.max(0, s - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, tour]);

  if (error)
    return (
      <Empty icon={MapIcon} title="Tour not available">
        {error}
      </Empty>
    );
  if (!tour || !current || !parts)
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  const ask = () => {
    const norm = (p: string) => p.replaceAll("\\", "/").toLowerCase();
    const project = projects.find(
      (p) => norm(tour.cwd) === norm(p.path) || norm(tour.cwd).startsWith(`${norm(p.path)}/`),
    );
    void newSession(
      project?.id,
      project && norm(tour.cwd) !== norm(project.path) ? tour.cwd : undefined,
      `About the uncommitted change in ${current.file} ("${current.title}"): `,
    );
  };
  return (
    <div className="flex h-full" data-testid="tour">
      <Pane id="jig.tour.steps" edge="right" defaultSize={260} min={180} max={480} label="Resize the steps">
        <div className="flex h-full flex-col border-r border-line bg-surface">
          <div className="border-b border-line p-3">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-fg">
              <MapIcon className="size-4 text-accent" /> {tour.title}
            </div>
            <div className="mt-1 text-xs text-muted">{tour.overview}</div>
          </div>
          <ol className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {tour.steps.map((s, i) => (
              <li key={`${i}-${s.file}`}>
                <button
                  type="button"
                  onClick={() => setStep(i)}
                  data-testid={`tour-step-${i + 1}`}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs",
                    i === step ? "bg-active text-fg" : "text-muted hover:bg-hover hover:text-fg",
                  )}
                >
                  <span
                    className={cn(
                      "mt-px flex size-4 shrink-0 items-center justify-center rounded-full text-2xs",
                      i === step ? "bg-accent text-on-accent" : "bg-active",
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">{s.title}</span>
                    <span className="block truncate text-hint">{s.file}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </Pane>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-line p-4" data-testid="tour-current">
          <div className="flex items-center gap-2">
            <span className="text-xs text-hint">
              Step {step + 1} of {tour.steps.length}
            </span>
            <div className="flex-1" />
            <Button size="sm" variant="ghost" icon={MessageSquare} onClick={ask}>
              Ask about this
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={Eye}
              onClick={() => openPreview(`${tour.cwd}/${current.file}`)}
            >
              Open file
            </Button>
            <Button size="sm" icon={ArrowLeft} disabled={step === 0} onClick={() => setStep(step - 1)}>
              Back
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={ArrowRight}
              disabled={step === tour.steps.length - 1}
              onClick={() => setStep(step + 1)}
              data-testid="tour-next"
            >
              Next
            </Button>
          </div>
          <div className="mt-2 text-base font-semibold text-fg">{current.title}</div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
            <FileIcon path={current.file} className="size-3.5" />
            {current.file}
            {current.line ? `:${current.line}` : ""}
          </div>
          <Markdown text={current.explanation} className="mt-2" />
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {parts.header && <DiffLines text={parts.header.trimEnd()} />}
          {parts.hunks.map((hunk, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: hunks of one file diff.
              key={i}
              ref={i === highlighted ? hunkRef : undefined}
              className={cn(i === highlighted ? "border-l-2 border-accent bg-accent-soft" : "opacity-60")}
              data-testid={i === highlighted ? "tour-hunk" : undefined}
            >
              <DiffLines text={hunk.trimEnd()} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
