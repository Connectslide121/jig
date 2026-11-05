import { AudioLines, Mic, MicOff, ScrollText, Settings, VolumeX } from "lucide-react";
import { useConfig } from "../../../stores/config";
import { cn, contextMenu, type MenuEntry } from "../../../ui";
import { openSettings } from "../../../workbench/actions";
import { openAbout } from "../../about";
import { useWake, useWakeVoice, type WakePhase } from "./state";
import { toggleWake } from "./toggle";

const LABEL: Record<WakePhase, string> = {
  off: "Hey Jig",
  starting: "Starting…",
  listening: "Hey Jig",
  awake: "Listening…",
  working: "On it…",
  speaking: "Speaking…",
};

/**
 * The three ways into "Hey Jig" besides on/off (D-387), the same in the status bar's right-click menu
 * and in Settings → Speech → Hey Jig. Training arrives with its own task; until then it shows as soon.
 */
export function wakeMenu(): MenuEntry[] {
  return [
    { label: "Train Hey Jig…", icon: AudioLines, disabled: true, badge: "Soon", testId: "wake-menu-train" },
    {
      label: "Voice commands…",
      icon: ScrollText,
      onSelect: () => openAbout("voice"),
      testId: "wake-menu-commands",
    },
    {
      label: "Speech settings…",
      icon: Settings,
      onSelect: () => openSettings("speech"),
      testId: "wake-menu-settings",
    },
  ];
}

/**
 * "Hey Jig" in the status bar (D-278, D-387), always there in a slot of fixed width: a click turns
 * listening on or off, a right-click opens `wakeMenu`. Icons: Mic listening, MicOff not listening
 * (dimmed), and a VolumeX after the label while Jig's own voice is muted.
 */
export function WakeStatusItem() {
  const on = useConfig((s) => Boolean(s.config?.speech.wake));
  const phase = useWake((s) => s.phase);
  const said = useWake((s) => s.said);
  const muted = useWakeVoice((s) => s.muted);
  const shown: WakePhase = on ? phase : "off";
  const active = shown === "awake" || shown === "working" || shown === "speaking";
  const title = on
    ? `Hey Jig is on · Say “Hey Jig” and a command${muted ? ". Jig's voice is muted: say “Hey Jig, unmute”" : ""}.${said ? ` Last answer: ${said}` : ""} Click to turn off · Right-click for more`
    : "Hey Jig is off · Click to listen · Right-click for more";
  return (
    <button
      type="button"
      data-testid="wake-status"
      data-phase={shown}
      data-said={said}
      aria-pressed={on}
      title={title}
      onClick={toggleWake}
      onContextMenu={contextMenu(wakeMenu)}
      className={cn(
        "flex w-24 items-center gap-1 rounded-sm px-1 hover:bg-hover",
        active && "text-accent",
        !on && "opacity-60 hover:opacity-100",
      )}
    >
      {on ? (
        <Mic className={cn("size-3.5 shrink-0", shown === "awake" && "motion-safe:animate-pulse")} />
      ) : (
        <MicOff className="size-3.5 shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate text-left">{LABEL[shown]}</span>
      {on && muted && <VolumeX className="size-3 shrink-0" data-testid="wake-status-muted" />}
    </button>
  );
}
