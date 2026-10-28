import { cn, languageForPath, useHighlightedLines } from "@jig/sdk/ui";
import { ChevronsUpDown } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import {
  collapseUnchanged,
  type DiffLine,
  parseUnifiedDiff,
  type SideBySideRow,
  sideBySide,
} from "./lib/parse";

/**
 * A file diff, side by side or inline, highlighted with the active theme's syntax colours. Long runs
 * of unchanged lines are collapsed (click to expand).
 */
function Code({ html, text }: { html?: string; text: string }) {
  return html !== undefined ? (
    // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki output built from escaped text.
    <span dangerouslySetInnerHTML={{ __html: html || "&nbsp;" }} />
  ) : (
    <span>{text || " "}</span>
  );
}

const tone = (type: DiffLine["type"] | undefined) =>
  type === "add" ? "bg-success-soft" : type === "del" ? "bg-danger-soft" : "";

function Collapsed({ count, onExpand }: { count: number; onExpand: () => void }) {
  return (
    <button
      type="button"
      onClick={onExpand}
      className="flex h-6 w-full items-center gap-2 bg-surface px-3 text-left font-sans text-xs text-muted hover:bg-hover hover:text-fg"
    >
      <ChevronsUpDown className="size-3.5" /> {count} unchanged lines
    </button>
  );
}

export function DiffView({ patch, path, mode }: { patch: string; path: string; mode: "split" | "inline" }) {
  const diff = useMemo(() => parseUnifiedDiff(patch), [patch]);
  const lines = useMemo(() => diff.hunks.flatMap((h) => h.lines), [diff]);
  const lang = languageForPath(path);
  // With full context the patch holds both whole files: highlight each once.
  const oldText = useMemo(
    () =>
      lines
        .filter((l) => l.type !== "add")
        .map((l) => l.text)
        .join("\n"),
    [lines],
  );
  const newText = useMemo(
    () =>
      lines
        .filter((l) => l.type !== "del")
        .map((l) => l.text)
        .join("\n"),
    [lines],
  );
  const oldHtml = useHighlightedLines(oldText, lang);
  const newHtml = useHighlightedLines(newText, lang);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const oldIndex = useMemo(() => {
    const map = new Map<number, number>();
    let i = 0;
    for (const l of lines) if (l.type !== "add" && l.oldNo !== undefined) map.set(l.oldNo, i++);
    return map;
  }, [lines]);
  const newIndex = useMemo(() => {
    const map = new Map<number, number>();
    let i = 0;
    for (const l of lines) if (l.type !== "del" && l.newNo !== undefined) map.set(l.newNo, i++);
    return map;
  }, [lines]);
  const htmlFor = (l: DiffLine | undefined, side: "old" | "new") => {
    if (!l) return undefined;
    if (side === "old" && l.oldNo !== undefined) return oldHtml?.[oldIndex.get(l.oldNo) ?? -1];
    if (side === "new" && l.newNo !== undefined) return newHtml?.[newIndex.get(l.newNo) ?? -1];
    return undefined;
  };

  if (diff.binary) return <div className="p-6 text-sm text-muted">Binary file — no text diff.</div>;
  if (lines.length === 0) return <div className="p-6 text-sm text-muted">No changes in this file.</div>;

  const expand = (i: number) => setExpanded((s) => new Set(s).add(i));

  if (mode === "inline") {
    const segments = collapseUnchanged(lines, (l) => l.type !== "context");
    return (
      <div
        className="selectable min-h-0 flex-1 overflow-auto bg-code font-mono text-xs leading-5"
        data-testid="git-diff-inline"
      >
        {segments.map((segment, i) =>
          segment.kind === "collapsed" && !expanded.has(i) ? (
            <Collapsed key={i} count={segment.items.length} onExpand={() => expand(i)} />
          ) : (
            <Fragment key={i}>
              {segment.items.map((l, j) => (
                <div key={j} className={cn("flex whitespace-pre", tone(l.type))}>
                  <span className="w-12 shrink-0 pr-2 text-right text-hint select-none">{l.oldNo ?? ""}</span>
                  <span className="w-12 shrink-0 pr-2 text-right text-hint select-none">{l.newNo ?? ""}</span>
                  <span
                    className={cn(
                      "w-4 shrink-0 select-none",
                      l.type === "add" ? "text-success" : l.type === "del" ? "text-danger" : "text-hint",
                    )}
                  >
                    {l.type === "add" ? "+" : l.type === "del" ? "−" : " "}
                  </span>
                  <Code html={htmlFor(l, l.type === "del" ? "old" : "new")} text={l.text} />
                </div>
              ))}
            </Fragment>
          ),
        )}
      </div>
    );
  }

  const rows = sideBySide(lines);
  const segments = collapseUnchanged<SideBySideRow>(
    rows,
    (r) => r.left?.type !== "context" || r.right?.type !== "context",
  );
  const cell = (l: DiffLine | undefined, side: "old" | "new") => (
    <div className={cn("flex min-w-0 whitespace-pre", l ? tone(l.type) : "bg-surface")}>
      <span className="w-12 shrink-0 pr-2 text-right text-hint select-none">
        {side === "old" ? (l?.oldNo ?? "") : (l?.newNo ?? "")}
      </span>
      <span className="min-w-0 flex-1 overflow-hidden">
        {l ? <Code html={htmlFor(l, side)} text={l.text} /> : " "}
      </span>
    </div>
  );
  return (
    <div
      className="selectable min-h-0 flex-1 overflow-auto bg-code font-mono text-xs leading-5"
      data-testid="git-diff-split"
    >
      {segments.map((segment, i) =>
        segment.kind === "collapsed" && !expanded.has(i) ? (
          <Collapsed key={i} count={segment.items.length} onExpand={() => expand(i)} />
        ) : (
          <Fragment key={i}>
            {segment.items.map((row, j) => (
              <div key={j} className="grid grid-cols-2 divide-x divide-line">
                {cell(row.left, "old")}
                {cell(row.right, "new")}
              </div>
            ))}
          </Fragment>
        ),
      )}
    </div>
  );
}
