import { AudioLines } from "lucide-react";
import { useEffect } from "react";
import { cn, Spinner } from "../../ui";
import { stopVoice, toggleVoice, useVoice, type VoiceHooks, type VoicePhase } from "./voice";

const LABELS: Record<VoicePhase, string> = {
  off: "Talk with Claude: speak, hear its answers, and say “yes, go ahead” to start its plan",
  starting: "Getting ready to listen…",
  listening: "Listening. Click to stop talking",
  hearing: "Hearing you. Click to stop talking",
  thinking: "Claude is answering. Click to stop talking",
  speaking: "Claude is speaking; talk to interrupt. Click to stop talking",
};

/**
 * Talking with Claude (D-209), from a chat's message box. Always the same square, whatever it is
 * doing (no layout shift); the phase shows in its colour and animation.
 */
export function VoiceButton({ target, hooks }: { target: string; hooks: VoiceHooks }) {
  const phase = useVoice((s) => (s.target === target ? s.phase : "off"));
  const said = useVoice((s) => (s.target === target ? s.said : undefined));
  const busyElsewhere = useVoice((s) => s.phase !== "off" && s.target !== target);
  // Closing the chat ends the conversation.
  useEffect(
    () => () => {
      if (useVoice.getState().target === target) stopVoice();
    },
    [target],
  );
  const on = phase !== "off";
  return (
    <button
      type="button"
      aria-label={LABELS[phase]}
      aria-pressed={on}
      title={LABELS[phase]}
      data-testid="composer-voice"
      data-phase={phase}
      data-said={said}
      disabled={busyElsewhere || phase === "starting"}
      onClick={() => toggleVoice(target, hooks)}
      className={cn(
        "no-drag relative inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
        "hover:bg-hover disabled:pointer-events-none",
        on ? "bg-active" : "text-muted hover:text-fg",
        phase === "hearing" ? "text-danger" : on && "text-accent",
        busyElsewhere && "opacity-50",
      )}
    >
      {phase === "starting" ? (
        <Spinner size="sm" />
      ) : (
        <AudioLines
          className={cn(
            "size-4.5",
            (phase === "hearing" || phase === "speaking") && "motion-safe:animate-pulse",
            phase === "thinking" && "opacity-60",
          )}
        />
      )}
    </button>
  );
}
