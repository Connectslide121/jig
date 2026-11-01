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
import { useEffect, useState } from "react";
import type { MeetingRecord } from "../../../shared/meetings";
import { Button, cn, openMenuAt } from "../../ui";
import { elapsed, initials } from "./format";
import type { MediaState } from "./media";

/**
 * The call's video area. Its size never depends on the call: idle, it explains itself; live, the
 * participants or shared content fill it and the controls float over its bottom edge.
 */
export function Stage({
  active,
  media,
  fake,
  attachCanvas,
  onMute,
  onCamera,
  onShare,
  onDevices,
  onRetryCaptions,
  onLeave,
}: {
  active?: MeetingRecord;
  media: MediaState;
  fake: boolean;
  attachCanvas(element: HTMLDivElement | null): void;
  onMute(): void;
  onCamera(): void;
  onShare(): void;
  onDevices(): void;
  onRetryCaptions(): void;
  onLeave(): void;
}) {
  const people = media.participants.map((p) => {
    const [name = "Participant", state = ""] = p.split(" · ");
    return { name, state };
  });
  return (
    <div className="relative h-full overflow-hidden bg-canvas">
      <div ref={attachCanvas} className="flex h-full min-h-0 gap-2 overflow-hidden p-3" />
      {!active ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-surface text-hint">
            <Video className="size-6" />
          </span>
          <div className="text-base font-medium">No meeting in progress</div>
          <p className="max-w-sm text-sm text-muted">
            Join from your calendar or paste a Teams link. Video and shared screens show here.
          </p>
        </div>
      ) : (
        !media.hasVideo && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 pb-20">
            {people.length ? (
              <div className="flex max-w-full flex-wrap items-start justify-center gap-6">
                {people.slice(0, 8).map((p, index) => (
                  <div key={`${p.name}-${index}`} className="flex w-24 flex-col items-center gap-2">
                    <span className="flex size-16 items-center justify-center rounded-full bg-raised text-lg font-semibold text-fg shadow-card">
                      {initials(p.name)}
                    </span>
                    <span className="w-full truncate text-center text-sm" title={p.name}>
                      {p.name}
                    </span>
                    <span className="-mt-1.5 w-full truncate text-center text-xs text-muted">{p.state}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-sm text-muted">Waiting for others to join…</span>
            )}
          </div>
        )
      )}
      {active && (
        <>
          <div className="pointer-events-none absolute top-3 left-3 flex h-7 items-center gap-2 rounded-md bg-elevated px-2 text-xs shadow-card">
            <LiveDot state={media.state} />
            <span className="font-medium">{media.state === "Connected" ? "Live" : media.state}</span>
            <Elapsed from={active.startedAt} />
          </div>
          <div
            className="absolute top-3 right-3 flex h-7 items-center gap-1.5 rounded-md bg-elevated px-2 text-xs shadow-card"
            title={people.map((p) => `${p.name} (${p.state})`).join("\n") || "No one else yet"}
          >
            <Users className="size-3.5 text-muted" />
            <span className="tabular-nums">{people.length + 1}</span>
          </div>
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
                Leave
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
