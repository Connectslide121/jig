import {
  AlertTriangle,
  ListChecks,
  MessageSquareText,
  Mic,
  MicOff,
  MonitorUp,
  MoreHorizontal,
  Sparkles,
  Video,
  VideoOff,
} from "lucide-react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { actionOpen, type MeetingCaption, type MeetingRecord } from "../../../shared/meetings";
import {
  Button,
  CountBadge,
  cn,
  Empty,
  IconButton,
  JumpToLatest,
  Markdown,
  type MenuEntry,
  openMenuAt,
} from "../../ui";
import { clock, initials } from "./format";
import type { Person } from "./media";
import { PersonPhoto } from "./photo";
import { PresenceDot } from "./presence";

/** A panel's title bar: the same height everywhere, so panels side by side line up. */
export function PanelHeader({
  title,
  detail,
  menu,
  children,
}: {
  title: string;
  detail?: ReactNode;
  /** The panel's ⋯ menu (move, hide). */
  menu?: MenuEntry[];
  children?: ReactNode;
}) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line pr-2 pl-4">
      <h2 className="shrink-0 text-2xs font-semibold tracking-wide text-hint uppercase">{title}</h2>
      <span className="min-w-0 flex-1 truncate text-xs text-hint tabular-nums">{detail}</span>
      {children}
      {menu && (
        <IconButton
          icon={MoreHorizontal}
          size="sm"
          label={`${title} options`}
          onClick={(e) => openMenuAt(e.currentTarget, menu, true)}
        />
      )}
    </div>
  );
}

type Item =
  | {
      kind: "speech";
      key: string;
      speaker: string;
      speakerId: string;
      at: string;
      local: boolean;
      lines: MeetingCaption[];
    }
  | { kind: "gap"; key: string; at: string; reason: string };

/**
 * Consecutive captions from one speaker within two minutes read as one block (Teams' captions and
 * the local transcript's apart, D-321); gaps sit where they happened.
 */
function items(record: MeetingRecord): Item[] {
  const out: Item[] = [];
  for (const c of record.captions) {
    const last = out.at(-1);
    if (
      last?.kind === "speech" &&
      last.speakerId === c.speakerId &&
      last.local === (c.source === "local") &&
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
        local: c.source === "local",
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

export function TranscriptPanel({
  record,
  live,
  menu,
  actions,
}: {
  record: MeetingRecord;
  live: boolean;
  menu?: MenuEntry[];
  actions?: ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLOListElement>(null);
  // Following the newest caption: only the user scrolling up turns it off (wheel, keys, scrollbar);
  // content growing, a translation landing or the panel resizing never does.
  const following = useRef(true);
  const lastTop = useRef(0);
  const [away, setAway] = useState(false);
  const previous = useRef<string | undefined>(undefined);
  const lastCaption = record.captions.at(-1);
  const empty = !record.captions.length && !record.gaps.length;
  // Claude translates (D-277): each line keeps a second line for its original, so nothing moves when
  // the translation comes in.
  const translating = Boolean(record.aiTranslation);
  const aiTranslated = translating || record.captions.some((c) => c.translatedBy === "ai");
  const toBottom = () => {
    const element = container.current;
    if (!element || !following.current) return;
    element.scrollTop = element.scrollHeight;
    lastTop.current = element.scrollTop;
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: follow new and revised captions before paint.
  useLayoutEffect(() => {
    if (previous.current !== record.id) {
      following.current = true;
      setAway(false);
    }
    previous.current = record.id;
    toBottom();
  }, [record.id, lastCaption?.id, lastCaption?.text]);
  // Anything else that makes the list taller (translations, wrapping, photos, a narrower panel).
  // biome-ignore lint/correctness/useExhaustiveDependencies: toBottom reads refs only.
  useEffect(() => {
    const element = content.current;
    if (!element) return;
    const observer = new ResizeObserver(() => toBottom());
    observer.observe(element);
    observer.observe(container.current!);
    return () => observer.disconnect();
  }, [empty]);
  return (
    <section className="flex size-full min-h-0 min-w-0 flex-col" aria-label="Transcript">
      <PanelHeader
        title="Transcript"
        detail={
          record.translationError ??
          (aiTranslated
            ? `${record.captions.length} captions${
                record.translationSkipped
                  ? ` · Translation skipped ${record.translationSkipped} ${record.translationSkipped === 1 ? "line" : "lines"} to keep up`
                  : ""
              } · AI translation, may be inaccurate`
            : `${record.captions.length} captions`)
        }
        menu={menu}
      >
        {actions}
      </PanelHeader>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          data-testid="meeting-transcript"
          ref={container}
          onWheel={(e) => {
            if (e.deltaY < 0 && e.currentTarget.scrollTop > 0) following.current = false;
          }}
          onScroll={() => {
            const element = container.current;
            if (!element) return;
            const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 32;
            // Moving down without reaching the end is the list settling, not the user leaving.
            following.current = atBottom || (following.current && element.scrollTop >= lastTop.current);
            lastTop.current = element.scrollTop;
            setAway(!following.current);
          }}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
        >
          {empty ? (
            <Empty icon={MessageSquareText} title={live ? "Listening…" : "No captions"} className="h-full">
              {live
                ? "Captions appear here as people speak, with their names. No audio is recorded."
                : "No captions were captured in this meeting."}
            </Empty>
          ) : (
            <ol ref={content} className="space-y-4">
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
                      className="relative flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-raised text-2xs font-semibold text-muted"
                    >
                      {initials(item.speaker)}
                      <PersonPhoto id={item.speakerId} />
                    </span>
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="flex min-w-0 items-center gap-2 pt-1">
                        <span className="min-w-0 truncate font-semibold">{item.speaker}</span>
                        {item.local && (
                          <span
                            className="shrink-0 rounded-sm border border-line px-1 text-2xs leading-4 font-medium text-hint"
                            title="Transcribed on this computer because Teams captions weren't available. Who spoke may be a guess."
                          >
                            Local
                          </span>
                        )}
                      </div>
                      {item.lines.map((c) => (
                        <div key={c.id}>
                          <p
                            className={
                              c.final
                                ? "whitespace-pre-wrap leading-relaxed"
                                : "whitespace-pre-wrap leading-relaxed text-muted"
                            }
                          >
                            {c.translated ?? c.text}
                          </p>
                          {/* What was said, under its translation (D-260); its space is kept while Claude translates. */}
                          {c.translated ? (
                            <p className="whitespace-pre-wrap text-xs leading-relaxed text-hint" lang="">
                              {c.text}
                            </p>
                          ) : (
                            translating && (
                              // A line Claude won't translate says so in the same space (D-384).
                              <p
                                aria-hidden
                                className="text-xs leading-relaxed text-hint"
                                title={
                                  c.untranslated === "skipped"
                                    ? "Skipped to keep the translation live; it stays as spoken"
                                    : c.untranslated === "failed"
                                      ? "The translation failed for this line"
                                      : undefined
                                }
                              >
                                {!c.final ? " " : c.untranslated ? "Not translated" : "Translating…"}
                              </p>
                            )
                          )}
                        </div>
                      ))}
                    </div>
                  </li>
                ),
              )}
            </ol>
          )}
        </div>
        {away && (
          <JumpToLatest
            testId="meeting-transcript-latest"
            onClick={() => {
              const element = container.current;
              if (!element) return;
              following.current = true;
              setAway(false);
              element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
            }}
          />
        )}
      </div>
    </section>
  );
}

export function NotesPanel({
  record,
  busy,
  menu,
  onGenerateNotes,
  onReview,
}: {
  record: MeetingRecord;
  busy: boolean;
  menu?: MenuEntry[];
  onGenerateNotes(): void;
  onReview(): void;
}) {
  const open = record.actions.filter(actionOpen).length;
  return (
    <section className="flex size-full min-h-0 min-w-0 flex-col" aria-label="Notes">
      <PanelHeader title="Notes" menu={menu}>
        <Button size="sm" icon={Sparkles} busy={busy} onClick={onGenerateNotes}>
          Generate notes
        </Button>
      </PanelHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {record.notes ? (
          <Markdown text={record.notes} />
        ) : (
          <Empty icon={Sparkles} title="No notes yet" className="h-full">
            Jig reads the transcript and drafts a summary, decisions and actions. It only runs when you ask.
          </Empty>
        )}
      </div>
      <div className="flex h-12 shrink-0 items-center gap-2 border-t border-line px-3">
        <span className="min-w-0 flex-1 truncate text-xs text-hint">
          {record.notes ? "AI draft · check details" : ""}
        </span>
        <Button
          icon={ListChecks}
          aria-label="Review actions"
          disabled={!record.actions.length}
          onClick={onReview}
        >
          Review actions
          <span className="flex w-5 justify-end">
            <CountBadge count={open} />
          </span>
        </Button>
      </div>
    </section>
  );
}

/** Everyone in the call, you first; mic, camera and presenting marks in fixed columns at the right. */
export function PeoplePanel({ people, you, menu }: { people: Person[]; you: Person; menu?: MenuEntry[] }) {
  const everyone = [you, ...[...people].sort((a, b) => a.name.localeCompare(b.name))];
  return (
    <section className="flex size-full min-h-0 min-w-0 flex-col" aria-label="People">
      <PanelHeader title="People" detail={String(everyone.length)} menu={menu} />
      <ul className="min-h-0 flex-1 overflow-y-auto p-2">
        {everyone.map((p) => (
          <li key={p.id} className="flex h-11 items-center gap-3 rounded-md px-2 hover:bg-hover">
            <span className="relative flex shrink-0">
              <span
                aria-hidden
                className={cn(
                  "relative flex size-8 shrink-0 items-center justify-center rounded-full bg-raised text-xs font-semibold",
                  p.speaking && "ring-2 ring-accent",
                )}
              >
                {initials(p.name)}
                <PersonPhoto id={p.id} />
              </span>
              {/* Their Teams status when they have a Microsoft account id (D-329). */}
              <PresenceDot id={p.id} name={p.name} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{p.name}</span>
              {p.state !== "Connected" && (
                <span className="block truncate text-xs text-muted">{p.state}</span>
              )}
            </span>
            <span className="flex w-5 shrink-0 justify-center" title={p.screen ? "Presenting" : undefined}>
              {p.screen && <MonitorUp className="size-4 text-accent" />}
            </span>
            <span className="flex w-5 shrink-0 justify-center" title={p.camera ? "Camera on" : "Camera off"}>
              {p.camera ? <Video className="size-4 text-fg" /> : <VideoOff className="size-4 text-hint" />}
            </span>
            <span className="flex w-5 shrink-0 justify-center" title={p.muted ? "Muted" : "Microphone on"}>
              {p.muted ? <MicOff className="size-4 text-hint" /> : <Mic className="size-4 text-fg" />}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
