import type { LucideIcon } from "lucide-react";
import {
  Captions,
  Mic,
  MicOff,
  MonitorUp,
  MoreHorizontal,
  PhoneOff,
  Settings2,
  Users,
  Video,
  VideoOff,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MeetingRecord } from "../../../shared/meetings";
import { Button, cn, openMenuAt } from "../../ui";
import { elapsed, initials } from "./format";
import { type MediaState, type Person, selfPerson } from "./media";

/**
 * The call's video area. Its size never depends on the call: idle, it explains itself; live, the
 * participants or shared content fill it and the controls float over its bottom edge.
 */
export function Stage({
  active,
  media,
  fake,
  slot,
  peopleOpen,
  onPeople,
  onMute,
  onCamera,
  onShare,
  onDevices,
  onRetryCaptions,
  onLeave,
  leaveLabel = "Leave",
}: {
  active?: MeetingRecord;
  media: MediaState;
  fake: boolean;
  /** A tile's video slot (`video:<id>`, `screen:<id>`, `local`); the media owner fills it. */
  slot(key: string): (element: HTMLElement | null) => void;
  peopleOpen: boolean;
  onPeople(): void;
  onMute(): void;
  onCamera(): void;
  onShare(): void;
  onDevices(): void;
  onRetryCaptions(): void;
  onLeave(): void;
  /** "Hang up" for a one-to-one call. */
  leaveLabel?: string;
}) {
  const people = media.people;
  const presenter = people.find((p) => p.screen);
  // Your own share isn't drawn here (you see your screen already), so your tile never presents.
  const you: Person = { ...selfPerson(media), screen: false };
  const everyone = [...people, you];
  return (
    <div className="relative h-full overflow-hidden bg-canvas">
      {!active ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-surface text-hint">
            <Video className="size-6" />
          </span>
          <div className="text-base font-medium">No meeting in progress</div>
        </div>
      ) : presenter ? (
        // Someone presents: their screen gets the space, everyone stays visible in a strip beside it.
        <div className="flex h-full gap-3 px-3 pt-13 pb-20">
          <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl bg-surface">
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted">
              <MonitorUp className="size-8 text-hint" />
              {presenter.name}'s screen
            </div>
            <div ref={slot(`screen:${presenter.id}`)} className="absolute inset-0 *:size-full" />
            <span className="absolute bottom-2 left-2 flex h-6 items-center gap-1.5 rounded-md bg-elevated px-2 text-xs shadow-card">
              <MonitorUp className="size-3.5 text-accent" />
              {presenter.name} is presenting
            </span>
          </div>
          <div className="flex w-1/4 max-w-64 min-w-40 shrink-0 flex-col gap-2 overflow-y-auto p-0.5">
            {everyone.map((p) => (
              <Tile key={p.id} person={p} slot={slot} className="aspect-video w-full shrink-0" />
            ))}
          </div>
        </div>
      ) : (
        <Gallery people={everyone} slot={slot} waiting={!people.length && media.state === "Connected"} />
      )}
      {active && (
        <>
          <div className="pointer-events-none absolute top-3 left-3 flex h-7 items-center gap-2 rounded-md bg-elevated px-2 text-xs shadow-card">
            <LiveDot state={media.state} />
            <span className="font-medium">{media.state === "Connected" ? "Live" : media.state}</span>
            <Elapsed from={active.startedAt} />
          </div>
          <button
            type="button"
            aria-label={peopleOpen ? "Hide people" : "Show people"}
            aria-pressed={peopleOpen}
            title={peopleOpen ? "Hide people" : "Show people"}
            onClick={onPeople}
            className={cn(
              "absolute top-3 right-3 flex h-7 items-center gap-1.5 rounded-md px-2 text-xs shadow-card transition-colors",
              peopleOpen ? "bg-accent text-on-accent hover:bg-accent-hover" : "bg-elevated hover:bg-hover",
            )}
          >
            <Users className="size-3.5" />
            <span className="tabular-nums">{people.length + 1}</span>
          </button>
          <div className="absolute inset-x-0 bottom-3 flex justify-center">
            <div className="flex items-center gap-1 rounded-xl border border-line bg-elevated p-1.5 shadow-popover">
              <DockButton
                icon={media.muted ? MicOff : Mic}
                label={media.muted ? "Unmute" : "Mute"}
                off={media.muted}
                onClick={onMute}
              />
              <DockButton
                icon={media.camera ? Video : VideoOff}
                label={media.camera ? "Camera off" : "Camera on"}
                off={!media.camera}
                disabled={fake}
                onClick={onCamera}
              />
              <DockButton
                icon={MonitorUp}
                label={media.sharing ? "Stop sharing" : "Share screen"}
                on={media.sharing}
                onClick={onShare}
              />
              <DockButton
                icon={MoreHorizontal}
                label="More call options"
                onClick={(e) =>
                  openMenuAt(e.currentTarget, [
                    { label: "Devices…", icon: Settings2, disabled: fake, onSelect: onDevices },
                    { label: "Restart captions", icon: Captions, disabled: fake, onSelect: onRetryCaptions },
                  ])
                }
              />
              <span className="mx-1 h-6 w-px bg-line" />
              <Button icon={PhoneOff} variant="danger" className="h-9 px-4" onClick={onLeave}>
                {leaveLabel}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DockButton({
  icon: Icon,
  label,
  on,
  off,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  /** Highlighted: something you started (sharing). */
  on?: boolean;
  /** Filled: something switched off (muted, camera off). */
  off?: boolean;
  disabled?: boolean;
  onClick(event: React.MouseEvent<HTMLButtonElement>): void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "no-drag flex size-9 items-center justify-center rounded-lg transition-colors disabled:pointer-events-none disabled:opacity-40",
        on
          ? "bg-accent text-on-accent hover:bg-accent-hover"
          : off
            ? "bg-active text-fg hover:bg-hover"
            : "text-fg hover:bg-hover",
      )}
    >
      <Icon className="size-4.5" />
    </button>
  );
}

function LiveDot({ state }: { state: string }) {
  const tone = state === "Connected" ? "bg-danger" : state === "Disconnected" ? "bg-hint" : "bg-warning";
  return <span className={cn("size-2 shrink-0 rounded-full", tone)} />;
}

function Elapsed({ from }: { from: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <span className="min-w-8 text-muted tabular-nums">{elapsed(from, now)}</span>;
}

/** Everyone in a grid of equal tiles, sized to fit the stage like Teams' gallery. */
function Gallery({
  people,
  slot,
  waiting,
}: {
  people: Person[];
  slot(key: string): (element: HTMLElement | null) => void;
  waiting: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setBox({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // The column count that gives the biggest 16:9 tiles in this box.
  const gap = 12;
  let best = { columns: 1, width: 0 };
  for (let columns = 1; columns <= people.length; columns++) {
    const rows = Math.ceil(people.length / columns);
    const width = Math.min(
      (box.width - gap * (columns - 1)) / columns,
      ((box.height - gap * (rows - 1)) / rows) * (16 / 9),
    );
    if (width > best.width) best = { columns, width };
  }
  return (
    <div ref={ref} className="absolute inset-x-3 top-13 bottom-20">
      {waiting && (
        <div className="absolute inset-x-0 -top-10 flex h-7 justify-center text-sm text-muted">
          Waiting for others to join…
        </div>
      )}
      <div className="flex h-full flex-wrap content-center items-center justify-center gap-3">
        {people.map((p) => (
          <Tile key={p.id} person={p} slot={slot} style={{ width: Math.max(0, Math.floor(best.width)) }} />
        ))}
      </div>
    </div>
  );
}

/** One person: their camera when it's on, otherwise their initials; name, muted mic and a ring while speaking. */
function Tile({
  person,
  slot,
  className,
  style,
}: {
  person: Person;
  slot(key: string): (element: HTMLElement | null) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const key = person.id === "local" ? "local" : `video:${person.id}`;
  return (
    <div
      role="group"
      aria-label={person.name}
      style={style}
      className={cn(
        "relative aspect-video overflow-hidden rounded-xl bg-surface transition-shadow",
        person.speaking && "ring-2 ring-accent",
        className,
      )}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-raised text-lg font-semibold shadow-card">
          {initials(person.name)}
        </span>
      </div>
      {person.camera && <div ref={slot(key)} className="absolute inset-0 *:size-full" />}
      <span className="absolute bottom-2 left-2 flex h-6 max-w-full items-center gap-1.5 rounded-md bg-elevated px-2 text-xs shadow-card">
        {person.muted && <MicOff className="size-3.5 shrink-0 text-muted" />}
        <span className="truncate">{person.name}</span>
        {person.state !== "Connected" && <span className="shrink-0 text-muted">· {person.state}</span>}
      </span>
    </div>
  );
}
