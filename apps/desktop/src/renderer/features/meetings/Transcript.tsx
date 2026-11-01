import { AlertTriangle, ListChecks, MessageSquareText, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";
import type { MeetingCaption, MeetingRecord } from "../../../shared/meetings";
import { Button, CountBadge, Empty, Markdown } from "../../ui";
import { Pane } from "../../workbench/Pane";
import { clock, initials } from "./format";

type Item =
  | { kind: "speech"; key: string; speaker: string; speakerId: string; at: string; lines: MeetingCaption[] }
  | { kind: "gap"; key: string; at: string; reason: string };

/** Consecutive captions from one speaker within two minutes read as one block; gaps sit where they happened. */
function items(record: MeetingRecord): Item[] {
  const out: Item[] = [];
  for (const c of record.captions) {
    const last = out.at(-1);
    if (
      last?.kind === "speech" &&
      last.speakerId === c.speakerId &&
      new Date(c.timestamp).getTime() - new Date(last.lines.at(-1)!.timestamp).getTime() < 120_000
    )
      last.lines.push(c);
    else
      out.push({
        kind: "speech",
        key: c.id,
        speaker: c.speaker,
        speakerId: c.speakerId,
        at: c.timestamp,
        lines: [c],
      });
  }
  record.gaps.forEach((g, index) => {
    const at = new Date(g.at).getTime();
    const position = out.findIndex((item) => new Date(item.at).getTime() > at);
    const gap: Item = { kind: "gap", key: `gap-${g.at}-${index}`, at: g.at, reason: g.reason };
    if (position < 0) out.push(gap);
    else out.splice(position, 0, gap);
  });
  return out;
}

export function Transcript({
  record,
  live,
  busy,
  onGenerateNotes,
  onReview,
}: {
  record?: MeetingRecord;
  live: boolean;
  busy: boolean;
  onGenerateNotes(): void;
  onReview(): void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const previous = useRef<string | undefined>(undefined);
  const lastCaption = record?.captions.at(-1);
  // biome-ignore lint/correctness/useExhaustiveDependencies: follow new and revised captions.
  useEffect(() => {
    if (previous.current !== record?.id) following.current = true;
    previous.current = record?.id;
    const element = container.current;
    if (element && following.current) element.scrollTop = element.scrollHeight;
  }, [record?.id, lastCaption?.id, lastCaption?.text]);
  const open = record?.actions.filter((a) => !a.queued).length ?? 0;
  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col" aria-label="Transcript">
        <ColumnHeader title="Transcript">
          <span className="text-xs text-hint tabular-nums">
            {record ? `${record.captions.length} captions · no audio is recorded` : ""}
          </span>
        </ColumnHeader>
        <div
          data-testid="meeting-transcript"
          ref={container}
          onScroll={() => {
            const element = container.current;
            if (element)
              following.current = element.scrollHeight - element.scrollTop - element.clientHeight < 32;
          }}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
        >
          {!record ? (
            <Empty icon={MessageSquareText} title="No meeting selected" className="h-full">
              Pick a saved meeting on the left, or join one to capture live captions.
            </Empty>
          ) : !record.captions.length && !record.gaps.length ? (
            <Empty icon={MessageSquareText} title={live ? "Listening…" : "No captions"} className="h-full">
              {live
                ? "Captions appear here as people speak, with their names."
                : "No captions were captured in this meeting."}
            </Empty>
          ) : (
            <ol className="space-y-4">
              {items(record).map((item) =>
                item.kind === "gap" ? (
                  <li key={item.key} className="flex items-center gap-3 text-xs text-warning">
                    <time className="w-10 shrink-0 text-right tabular-nums">{clock(item.at)}</time>
                    <span className="flex size-7 shrink-0 items-center justify-center">
                      <AlertTriangle className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">{item.reason}</span>
                  </li>
                ) : (
                  <li key={item.key} className="flex gap-3">
                    <time className="w-10 shrink-0 pt-1.5 text-right text-xs text-hint tabular-nums">
                      {clock(item.at)}
                    </time>
                    <span
                      aria-hidden
                      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-raised text-2xs font-semibold text-muted"
                    >
                      {initials(item.speaker)}
                    </span>
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="pt-1 font-semibold">{item.speaker}</div>
                      {item.lines.map((c) => (
                        <p
                          key={c.id}
                          className={
                            c.final
                              ? "whitespace-pre-wrap leading-relaxed"
                              : "whitespace-pre-wrap leading-relaxed text-muted"
                          }
                        >
                          {c.text}
                        </p>
                      ))}
                    </div>
                  </li>
                ),
              )}
            </ol>
          )}
        </div>
      </section>
      <Pane
        id="addon.meetings.notes"
        edge="left"
        defaultSize={340}
        min={240}
        max={640}
        className="flex flex-col border-l border-line bg-surface"
      >
        <ColumnHeader title="Notes">
          <Button size="sm" icon={Sparkles} disabled={!record} busy={busy} onClick={onGenerateNotes}>
            Generate notes
          </Button>
        </ColumnHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {record?.notes ? (
            <Markdown text={record.notes} />
          ) : (
            <Empty icon={Sparkles} title="No notes yet" className="h-full">
              Claude reads the transcript and drafts a summary, decisions and actions. It only runs when you
              ask.
            </Empty>
          )}
        </div>
        <div className="flex h-12 shrink-0 items-center gap-2 border-t border-line px-3">
          <span className="min-w-0 flex-1 truncate text-xs text-hint">
            {record?.notes ? "AI draft · check details" : ""}
          </span>
          <Button
            icon={ListChecks}
            aria-label="Review actions"
            disabled={!record?.actions.length}
            onClick={onReview}
          >
            Review actions
            <span className="flex w-5 justify-end">
              <CountBadge count={open} />
            </span>
          </Button>
        </div>
      </Pane>
    </div>
  );
}

function ColumnHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-4">
      <h2 className="min-w-0 flex-1 truncate text-2xs font-semibold tracking-wide text-hint uppercase">
        {title}
      </h2>
      {children}
    </div>
  );
}
