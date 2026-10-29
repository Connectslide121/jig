import { cn, languageForPath, ResizeHandle, useHighlightedLines, useSplitRatio } from "@jig/sdk/ui";
import { ChevronsUpDown, MessageSquare, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  collapseUnchanged,
  type DiffLine,
  parseUnifiedDiff,
  type SideBySideRow,
  sideBySide,
} from "./lib/parse";
import type { ReviewComment } from "./lib/review";

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

/** The width of an element, kept up to date. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Review comments shown under their line. */
function Comments({ list, onRemove }: { list: ReviewComment[]; onRemove?: (id: string) => void }) {
  if (!list.length) return null;
  return (
    <div className="border-y border-line bg-surface px-3 py-1 font-sans" data-testid="git-review-comments">
      {list.map((c) => (
        <div key={c.id} className="flex items-start gap-2 py-0.5 text-xs whitespace-normal">
          <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-accent" />
          <span className="min-w-0 flex-1 text-fg">{c.text}</span>
          {onRemove && (
            <button
              type="button"
              className="shrink-0 rounded-sm text-hint hover:text-fg"
              aria-label="Remove the comment"
              onClick={() => onRemove(c.id)}
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** A line number; with `onClick`, a button that adds a review comment on that line. */
function LineNo({ n, className, onClick }: { n?: number; className: string; onClick?: () => void }) {
  if (n === undefined || !onClick) return <span className={cn(className, "select-none")}>{n ?? ""}</span>;
  return (
    <button
      type="button"
      className={cn(className, "cursor-pointer select-none hover:bg-accent-soft hover:text-accent")}
      title="Comment on this line"
      onClick={onClick}
      data-testid={`git-diff-line-${n}`}
    >
      {n}
    </button>
  );
}

export function DiffView({
  patch,
  path,
  mode,
  comments = [],
  onComment,
  onRemoveComment,
}: {
  patch: string;
  path: string;
  mode: "split" | "inline";
  /** Review comments on this file. */
  comments?: ReviewComment[];
  /** Click on a line number: comment on it. */
  onComment?: (anchor: { side: "old" | "new"; line: number; code: string }) => void;
  onRemoveComment?: (id: string) => void;
}) {
  const on = (side: "old" | "new", l?: DiffLine) => {
    const line = side === "old" ? l?.oldNo : l?.newNo;
    return onComment && l && line !== undefined ? () => onComment({ side, line, code: l.text }) : undefined;
  };
  const at = (side: "old" | "new", line?: number) =>
    line === undefined ? [] : comments.filter((c) => c.side === side && c.line === line);
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
  const [ratio, setRatio, resetRatio] = useSplitRatio("addon.git.diff");
  const [boxRef, width] = useWidth();

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
                <Fragment key={j}>
                  <div className={cn("flex whitespace-pre", tone(l.type))}>
                    <LineNo
                      n={l.oldNo}
                      className="w-12 shrink-0 pr-2 text-right text-hint"
                      onClick={l.type === "del" ? on("old", l) : undefined}
                    />
                    <LineNo
                      n={l.newNo}
                      className="w-12 shrink-0 pr-2 text-right text-hint"
                      onClick={on("new", l)}
                    />
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
                  <Comments
                    list={l.type === "del" ? at("old", l.oldNo) : at("new", l.newNo)}
                    onRemove={onRemoveComment}
                  />
                </Fragment>
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
      <LineNo
        n={side === "old" ? l?.oldNo : l?.newNo}
        className="w-12 shrink-0 pr-2 text-right text-hint"
        onClick={side === "old" && l?.type !== "del" ? undefined : on(side, l)}
      />
      <span className="min-w-0 flex-1 overflow-hidden">
        {l ? <Code html={htmlFor(l, side)} text={l.text} /> : " "}
      </span>
    </div>
  );
  const columns = { gridTemplateColumns: `minmax(0, ${ratio}fr) minmax(0, ${1 - ratio}fr)` };
  return (
    <div ref={boxRef} className="relative flex min-h-0 flex-1 flex-col">
      {width > 0 && (
        <div className="pointer-events-none absolute inset-y-0 left-0" style={{ width: ratio * width }}>
          <ResizeHandle
            edge="right"
            size={ratio * width}
            min={width * 0.1}
            max={width * 0.9}
            label="Resize the two sides"
            className="pointer-events-auto"
            onResize={(px) => setRatio(px / width)}
            onReset={resetRatio}
            data-testid="git-diff-resize"
          />
        </div>
      )}
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
                <Fragment key={j}>
                  <div className="grid divide-x divide-line" style={columns}>
                    {cell(row.left, "old")}
                    {cell(row.right, "new")}
                  </div>
                  <Comments
                    list={[
                      ...(row.left?.type === "del" ? at("old", row.left.oldNo) : []),
                      ...at("new", row.right?.newNo),
                    ]}
                    onRemove={onRemoveComment}
                  />
                </Fragment>
              ))}
            </Fragment>
          ),
        )}
      </div>
    </div>
  );
}
