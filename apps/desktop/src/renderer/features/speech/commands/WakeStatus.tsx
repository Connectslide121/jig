import { Mic, MicOff } from "lucide-react";
import { useConfig } from "../../../stores/config";
import { cn } from "../../../ui";
import { openAbout } from "../../about";
import { useWake, useWakeVoice, type WakePhase } from "./state";

const LABEL: Record<WakePhase, string> = {
  off: "Hey Jig",
  starting: "Starting…",
  listening: "Hey Jig",
  awake: "Listening…",
  working: "On it…",
  speaking: "Speaking…",
};

/**
 * The status bar while "Hey Jig" is on (D-278): what it is doing, in a slot of fixed width; click it
 * for the voice commands.
 */
export function WakeStatusItem() {
  const on = useConfig((s) => Boolean(s.config?.speech.wake));
  const phase = useWake((s) => s.phase);
  const said = useWake((s) => s.said);
  const muted = useWakeVoice((s) => s.muted);
  if (!on) return null;
  const Icon = muted ? MicOff : Mic;
  const active = phase === "awake" || phase === "working" || phase === "speaking";
  return (
    <button
      type="button"
      data-testid="wake-status"
      data-phase={phase}
      data-said={said}
      title={`Say “Hey Jig” and a command${muted ? " (Jig's voice is muted: say “Hey Jig, unmute”)" : ""}.${said ? ` Last answer: ${said}` : ""} Click for the commands.`}
      onClick={() => openAbout("voice")}
      className={cn(
        "flex w-24 items-center gap-1 rounded-sm px-1 hover:bg-hover",
        active && "text-accent",
        phase === "off" && "opacity-60",
      )}
    >
      <Icon className={cn("size-3.5 shrink-0", phase === "awake" && "motion-safe:animate-pulse")} />
      <span className="truncate">{LABEL[phase]}</span>
    </button>
  );
}
