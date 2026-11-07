/**
 * The inbox's review of one output (ui.md → Inbox, D-467): its content (Markdown, the page, the
 * image), the files that go with it, Approve / Edit / Reject; the deck's and one-pager's two forms
 * side by side, each with its own Approve. Stories can go to a board as cards from here. Trust per
 * output kind sits under the inbox's rows.
 */

import type { AddonUiContext } from "@jig/sdk";
import {
  Badge,
  Button,
  cn,
  Dialog,
  FileIcon,
  HtmlThumbnail,
  Markdown,
  Select,
  Spinner,
  Textarea,
  useHostCall,
} from "@jig/sdk/ui";
import { useEffect, useState } from "react";
import type { ReviewItem } from "./host";
import type { Trust } from "./lib/gates";
import { kindLabel, type Output, outputName } from "./lib/run";
import { OutputPill } from "./parts";

/** The preview box's height (`h-80`), which page pictures are drawn at. */
const PREVIEW_HEIGHT = 320;
const OPEN: Output["status"][] = ["draft", "reviewed"];

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
const stripFrontMatter = (md: string) => md.replace(/^---\n[\s\S]*?\n---\n?/, "");

export interface ReviewTarget {
  projectId: string;
  runId: string;
  runTitle: string;
  outputId: string;
}

export function OutputReview({
  ctx,
  target,
  onClose,
}: {
  ctx: AddonUiContext;
  target: ReviewTarget;
  onClose: () => void;
}) {
  const ids = { projectId: target.projectId, runId: target.runId };
  const review = useHostCall<ReviewItem[]>("reviewOf", { ...ids, outputId: target.outputId });
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [rejecting, setRejecting] = useState<Output>();
  const [carding, setCarding] = useState<Output>();
  const items = review.data ?? [];
  const main = items[0]?.output;
  const decide = async (o: Output, kind: "approve" | "reject", note?: string) => {
    setBusy(o.id);
    setError(undefined);
    try {
      await ctx.host.call("decideOutput", { ...ids, outputId: o.id, kind, note });
      review.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(undefined);
    }
  };
  return (
    <>
      <Dialog
        open
        onClose={onClose}
        width={items.length > 1 ? "xl" : "lg"}
        testId="factory-output-review"
        title={
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{main ? outputName(main) : "Review"}</span>
            <span className="shrink-0 text-muted">·</span>
            <span className="truncate text-muted">{target.runTitle}</span>
          </span>
        }
        footer={
          <>
            <span className={cn("min-w-0 flex-1 truncate text-xs", error ? "text-danger" : "text-hint")}>
              {error ?? "Draft by Jig · check before you approve"}
            </span>
            <Button size="sm" onClick={onClose}>
              Close
            </Button>
          </>
        }
      >
        {review.data ? (
          <div className="@container">
            <div
              className={cn("grid gap-4", items.length > 1 ? "@max-2xl:grid-cols-1 @2xl:grid-cols-2" : "")}
            >
              {items.map((item) => (
                <ReviewColumn
                  key={item.output.id}
                  ctx={ctx}
                  item={item}
                  busy={busy === item.output.id}
                  disabled={!!busy}
                  onApprove={() => void decide(item.output, "approve")}
                  onReject={() => setRejecting(item.output)}
                  onEdit={() => {
                    if (item.file) ctx.openPreview(item.file);
                    onClose();
                  }}
                  onCards={() => setCarding(item.output)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex h-96 items-center justify-center text-xs text-danger">
            {review.error ?? <Spinner center />}
          </div>
        )}
      </Dialog>
      {rejecting && (
        <RejectDialog
          output={rejecting}
          onClose={() => setRejecting(undefined)}
          onReject={async (note) => {
            await decide(rejecting, "reject", note);
            setRejecting(undefined);
          }}
        />
      )}
      {carding && (
        <BoardCardsDialog
          ctx={ctx}
          ids={ids}
          output={carding}
          stories={storyCount(items.find((i) => i.output.id === carding.id)?.text)}
          onClose={() => setCarding(undefined)}
        />
      )}
    </>
  );
}

function storyCount(text?: string): number {
  return (stripFrontMatter(text ?? "").match(/^##\s+\S/gm) ?? []).length;
}

/** One output: a header, its content in a fixed-height box, its files, its actions. */
function ReviewColumn({
  ctx,
  item,
  busy,
  disabled,
  onApprove,
  onReject,
  onEdit,
  onCards,
}: {
  ctx: AddonUiContext;
  item: ReviewItem;
  busy: boolean;
  disabled: boolean;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
  onCards: () => void;
}) {
  const o = item.output;
  const open = OPEN.includes(o.status);
  return (
    <section className="flex min-w-0 flex-col gap-2" data-testid="factory-review-column">
      <div className="flex h-7 items-center gap-2">
        <FileIcon path={o.path} className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{outputName(o)}</span>
        <span className="flex w-20 shrink-0 justify-end">
          <OutputPill status={o.status} />
        </span>
      </div>
      <div
        className="h-80 overflow-hidden rounded-lg border border-line bg-surface"
        data-testid="factory-review-preview"
      >
        <Preview ctx={ctx} item={item} />
      </div>
      <ul className="flex h-24 flex-col overflow-y-auto">
        {[{ output: o, file: item.file }, ...item.files].map((f) => (
          <li key={f.output.id}>
            <button
              type="button"
              disabled={!f.file}
              onClick={() => f.file && ctx.openPreview(f.file)}
              data-testid="factory-review-file"
              className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-hover disabled:opacity-60"
            >
              <FileIcon path={f.output.path} className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-fg">{baseName(f.output.path)}</span>
              <span className="w-32 shrink-0 truncate text-right text-hint">
                {f.file ? kindLabel(f.output.kind) : "Not there"}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex h-8 items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={!item.file}
          onClick={onEdit}
          data-testid="factory-review-edit"
        >
          Edit
        </Button>
        {o.kind === "stories" && (
          <Button
            size="sm"
            variant="ghost"
            disabled={!item.file}
            onClick={onCards}
            data-testid="factory-review-cards"
          >
            Add as board cards…
          </Button>
        )}
        <span className="flex-1" />
        {open && (
          <>
            <Button size="sm" disabled={disabled} onClick={onReject} data-testid="factory-review-reject">
              Reject…
            </Button>
            <Button
              size="sm"
              variant="primary"
              busy={busy}
              disabled={disabled}
              onClick={onApprove}
              data-testid="factory-review-approve"
            >
              Approve
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

/** An output's content: Markdown rendered, a page as a picture, an image fitted; else its icon. */
function Preview({ ctx, item }: { ctx: AddonUiContext; item: ReviewItem }) {
  const path = item.output.path;
  if (!item.file)
    return (
      <div className="flex h-full items-center justify-center text-xs text-hint">The file isn't there</div>
    );
  if (item.text !== undefined)
    return (
      <div className="h-full overflow-y-auto bg-raised px-4 py-3">
        <Markdown text={stripFrontMatter(item.text)} />
      </div>
    );
  if (/\.html?$/i.test(path)) return <HtmlThumbnail path={item.file} height={PREVIEW_HEIGHT} />;
  const poster = /\.(png|jpe?g|webp|gif|svg)$/i.test(path)
    ? item.file
    : item.files.find((f) => f.file && /\.(png|jpe?g|webp)$/i.test(f.output.path))?.file;
  if (poster) return <FramedImage ctx={ctx} file={poster} name={baseName(path)} />;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-muted">
      <FileIcon path={path} className="size-8" />
      {baseName(path)}
    </div>
  );
}

function FramedImage({ ctx, file, name }: { ctx: AddonUiContext; file: string; name: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let live = true;
    ctx.frameUrl(file).then(
      (u) => live && setUrl(u),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [ctx, file]);
  return url ? <img src={url} alt={name} className="size-full object-contain" /> : <Spinner center />;
}

function RejectDialog({
  output,
  onClose,
  onReject,
}: {
  output: Output;
  onClose: () => void;
  onReject: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open
      onClose={onClose}
      width="sm"
      testId="factory-reject-dialog"
      title={`Reject ${outputName(output)}?`}
      footer={
        <>
          <span className="flex-1" />
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="danger"
            busy={busy}
            disabled={!note.trim()}
            data-testid="factory-reject-confirm"
            onClick={async () => {
              setBusy(true);
              await onReject(note.trim());
              setBusy(false);
            }}
          >
            Reject
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2 text-xs text-muted">
        It stays in the run's folder as rejected; its gate waits for the rest.
        <Textarea
          rows={3}
          autoFocus
          value={note}
          placeholder="Why (the run's log keeps it)"
          onChange={(e) => setNote(e.target.value)}
          data-testid="factory-reject-note"
        />
      </div>
    </Dialog>
  );
}

/** Adds the stories as cards on a board the Boards add-on follows (D-467): only on this click. */
function BoardCardsDialog({
  ctx,
  ids,
  output,
  stories,
  onClose,
}: {
  ctx: AddonUiContext;
  ids: { projectId: string; runId: string };
  output: Output;
  stories: number;
  onClose: () => void;
}) {
  const boards = useHostCall<{
    targets: Array<{ id: string; name: string; type?: string; problem?: string }>;
    problem?: string;
  }>("boardTargets", { projectId: ids.projectId });
  const usable = (boards.data?.targets ?? []).filter((t) => t.type && !t.problem);
  const [picked, setPicked] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>();
  const [error, setError] = useState<string>();
  const board = usable.find((t) => t.id === picked) ?? usable[0];
  const problem =
    boards.data?.problem ?? (boards.data && !usable.length ? "No board to add them to" : undefined);
  return (
    <Dialog
      open
      onClose={onClose}
      width="sm"
      testId="factory-cards-dialog"
      title="Add the stories as board cards"
      footer={
        <>
          <span className="min-w-0 flex-1 truncate text-xs text-danger">{error}</span>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {result ? "Close" : "Cancel"}
          </Button>
          {!result && (
            <Button
              size="sm"
              variant="primary"
              busy={busy}
              disabled={!board || !stories}
              data-testid="factory-cards-add"
              onClick={async () => {
                if (!board?.type) return;
                setBusy(true);
                setError(undefined);
                try {
                  const r = await ctx.host.call<{ made: number; board?: string }>("storyCards", {
                    ...ids,
                    outputId: output.id,
                    boardId: board.id,
                    type: board.type,
                  });
                  setResult(`${r.made} card${r.made === 1 ? "" : "s"} added to ${r.board ?? board.name}`);
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Add {stories} card{stories === 1 ? "" : "s"}
            </Button>
          )}
        </>
      }
    >
      <div className="flex h-20 flex-col gap-2 text-xs text-muted">
        {!boards.data ? (
          <Spinner center />
        ) : result ? (
          <span className="text-fg" data-testid="factory-cards-result">
            {result}
          </span>
        ) : problem ? (
          <span>{problem}. Follow the product's board in the Boards add-on first.</span>
        ) : (
          <>
            One card per story ({stories}), each with its text and acceptance criteria.
            <Select
              value={board?.id}
              onChange={(e) => setPicked(e.target.value)}
              className="w-full"
              data-testid="factory-cards-board"
            >
              {usable.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.type}
                </option>
              ))}
            </Select>
          </>
        )}
      </div>
    </Dialog>
  );
}

/** Trust per output kind (D-467): reviewed, approved without edits, the median time to a review. */
export function TrustTable({ rows }: { rows: Array<Trust & { kind: string }> }) {
  if (!rows.length) return null;
  return (
    <section className="flex flex-col" data-testid="factory-trust">
      <div className="flex h-7 items-center gap-3 px-3 text-2xs font-semibold tracking-wide text-hint uppercase">
        <span className="min-w-0 flex-1 truncate">Trust per output</span>
        <span className="w-20 shrink-0 text-right whitespace-nowrap">Reviewed</span>
        <span className="w-24 shrink-0 text-right whitespace-nowrap">As written</span>
        <span className="@max-lg:hidden @lg:block w-24 shrink-0 text-right whitespace-nowrap">
          Review time
        </span>
      </div>
      <div className="flex flex-col overflow-hidden rounded-lg border border-line bg-raised">
        {rows.map((t) => (
          <div
            key={t.kind}
            className="flex h-8 items-center gap-3 border-b border-line px-3 text-xs last:border-b-0"
            data-testid="factory-trust-row"
          >
            <span className="min-w-0 flex-1 truncate text-fg">{kindLabel(t.kind)}</span>
            <span className="w-20 shrink-0 text-right text-muted tabular-nums">{t.decided}</span>
            <span className="w-24 shrink-0 text-right tabular-nums">
              <Badge tone={(t.rate ?? 0) >= 0.8 ? "success" : (t.rate ?? 0) >= 0.5 ? "warning" : "neutral"}>
                {Math.round((t.rate ?? 0) * 100)}%
              </Badge>
            </span>
            <span className="@max-lg:hidden @lg:block w-24 shrink-0 text-right text-muted tabular-nums">
              {minutes(t.reviewMinutes)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function minutes(m?: number): string {
  if (m === undefined) return "—";
  if (m < 1) return "<1 min";
  if (m < 90) return `${Math.round(m)} min`;
  if (m < 60 * 36) return `${Math.round(m / 60)} h`;
  return `${Math.round(m / 1440)} d`;
}
