import { ListTodo, Mic, MicOff, PhoneOff, Play, ScrollText, VolumeX, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button, cn, IconButton, Markdown, usePresence } from "../../ui";
import { useSessions } from "../sessions/store";
import type { VoicePlan } from "./replies";
import { goAhead, hushVoice, setVoiceMuted, stopVoice, useVoice, type VoicePhase } from "./voice";
import { Waves } from "./Waves";

const STATUS: Record<VoicePhase, string> = {
  off: "Talking ended",
  starting: "Getting ready…",
  listening: "Listening",
  hearing: "Hearing you",
  thinking: "Claude is thinking",
  speaking: "Claude is speaking",
};

/**
 * The talking window (D-210, redesigned in D-218): one calm, wide space over the chat while you talk
 * with Claude. The sound waves are the centre; the conversation runs underneath and fades away
 * upwards; the plan (one plan, or a task queue) shows as a card in the right margin only while
 * Claude asks to start it, over space kept empty for it, so nothing moves. Controls along the
 * bottom: mute, stop Claude's voice, end talking, and Go ahead. Always the same size.
 */
export function VoiceDialogHost() {
  const phase = useVoice((s) => s.phase);
  const target = useVoice((s) => s.target);
  const title = useSessions((s) => (target ? s.metas[target]?.title : undefined));
  const open = phase !== "off";
  const present = usePresence(open);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!present) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => previous?.focus?.();
  }, [present]);
  if (!present) return null;
  return createPortal(
    <div
      className="jig-modal-layer no-drag fixed inset-0 z-40 flex items-center justify-center bg-scrim p-8 backdrop-blur-xs"
      data-closing={!open}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Talking with Claude"
        tabIndex={-1}
        data-testid="voice-dialog"
        data-phase={phase}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            stopVoice();
          }
        }}
        className="jig-modal-panel relative flex h-full max-h-240 w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-line bg-elevated text-fg shadow-popover outline-none"
      >
        <header className="flex h-14 shrink-0 items-center gap-3 px-6">
          <span className="shrink-0 text-sm font-medium">Talking with Claude</span>
          <span className="min-w-0 flex-1 truncate text-sm text-hint">{title}</span>
          <span className="shrink-0 text-xs text-hint">AI · Claude can make mistakes</span>
          <IconButton icon={X} label="End talking" size="sm" onClick={stopVoice} />
        </header>
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
            <div className="h-56 w-full shrink-0">
              <Waves />
            </div>
            <Status />
          </div>
          <Conversation />
          <PlanCard />
        </div>
        <Controls />
      </div>
    </div>,
    document.body,
  );
}

/** What is going on, with what Claude is doing (one line under the waves, always there). */
function Status() {
  const phase = useVoice((s) => s.phase);
  const activity = useVoice((s) => s.activity);
  const muted = useVoice((s) => s.muted);
  const handing = useVoice((s) => s.handing);
  const label = muted
    ? "Microphone muted"
    : handing
      ? "Claude is writing up the plan, then starts"
      : phase === "thinking" && activity
        ? `${activity}…`
        : STATUS[phase];
  return (
    <div
      className="flex h-8 w-full max-w-xl shrink-0 items-center justify-center gap-2 px-6 text-sm"
      data-testid="voice-status"
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          muted
            ? "bg-hint"
            : phase === "hearing"
              ? "bg-info"
              : phase === "listening"
                ? "bg-success"
                : "bg-accent",
          (phase === "thinking" || phase === "hearing") && !muted && "motion-safe:animate-pulse",
        )}
      />
      <span className="truncate text-muted">{label}</span>
    </div>
  );
}

/**
 * Everything said since talking started, newest at the bottom, older lines fading out upwards.
 * Follows the end unless you scrolled up.
 */
function Conversation() {
  const lines = useVoice((s) => s.lines);
  const hearing = useVoice((s) => s.hearing);
  const box = useRef<HTMLDivElement>(null);
  const atEnd = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new line scrolls to the end.
  useLayoutEffect(() => {
    const el = box.current;
    if (el && atEnd.current) el.scrollTop = el.scrollHeight;
  }, [lines, hearing]);
  const empty = lines.length === 0 && !hearing;
  return (
    <div
      ref={box}
      className="jig-voice-fade selectable mx-auto h-72 w-full max-w-xl shrink-0 overflow-y-auto px-6"
      data-testid="voice-transcript"
      onScroll={(e) => {
        const el = e.currentTarget;
        atEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      }}
    >
      <div className="flex min-h-full flex-col justify-end pt-16 pb-4">
        {empty && (
          <p className="text-center text-base leading-relaxed text-hint">
            Say what you want to do. Claude can look at the code while you plan.
            <br />
            Say “go ahead” when you agree, “bye” to stop talking.
          </p>
        )}
        {lines.map((line) => (
          <Line key={line.id} who={line.who} text={line.text} />
        ))}
        {hearing && <Line who="you" text={hearing} live />}
      </div>
    </div>
  );
}

function Line({ who, text, live }: { who: "you" | "claude"; text: string; live?: boolean }) {
  return (
    <div className="flex gap-3 py-1.5" data-testid="voice-line" data-who={who}>
      <span className="flex h-6 w-2 shrink-0 items-center" title={who === "you" ? "You" : "Claude"}>
        <span className={cn("size-1.5 rounded-full", who === "you" ? "bg-info" : "bg-accent")} />
      </span>
      <span className="sr-only">{who === "you" ? "You:" : "Claude:"}</span>
      <span
        className={cn(
          "min-w-0 flex-1 text-base leading-relaxed",
          who === "you" ? "text-muted" : "text-fg",
          live && "italic",
        )}
      >
        {text}
      </span>
    </div>
  );
}

/** The plan Claude asks to start, in the right margin (kept empty for it); only while it asks. */
function PlanCard() {
  const plan = useVoice((s) => s.plan);
  if (!plan) return null;
  const queue = plan.kind === "queue";
  return (
    <aside
      className="jig-voice-plan absolute top-2 right-6 bottom-6 flex w-80 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card"
      data-testid="voice-plan"
      data-kind={plan.kind}
    >
      <div className="flex h-11 shrink-0 items-center gap-2 px-4">
        {queue ? (
          <ListTodo className="size-4 shrink-0 text-accent" />
        ) : (
          <ScrollText className="size-4 shrink-0 text-accent" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{queue ? "Task queue" : "Plan"}</span>
        <span className="shrink-0 text-xs text-hint tabular-nums">
          {queue ? `${plan.tasks.length} ${plan.tasks.length === 1 ? "task" : "tasks"}` : "One chat"}
        </span>
      </div>
      <div className="selectable min-h-0 flex-1 overflow-y-auto px-4 pb-3 text-sm">
        <PlanBody plan={plan} />
      </div>
      <div className="flex h-10 shrink-0 items-center border-t border-line px-4 text-xs text-muted">
        Say “go ahead”, or what to change
      </div>
    </aside>
  );
}

function PlanBody({ plan }: { plan: VoicePlan }) {
  if (plan.kind === "plan") return <Markdown text={plan.text} />;
  return (
    <ol className="flex flex-col">
      {plan.tasks.map((task, i) => (
        <li key={i} className="flex gap-3 py-1.5">
          <span className="w-5 shrink-0 text-right text-hint tabular-nums">{i + 1}</span>
          <span className="line-clamp-3 min-w-0 flex-1">{task}</span>
        </li>
      ))}
    </ol>
  );
}

function Controls() {
  const phase = useVoice((s) => s.phase);
  const muted = useVoice((s) => s.muted);
  const handing = useVoice((s) => s.handing);
  const plan = useVoice((s) => s.plan);
  const live = phase !== "off" && phase !== "starting";
  return (
    <footer className="flex h-20 shrink-0 items-center justify-center gap-3 px-6">
      <IconButton
        icon={muted ? MicOff : Mic}
        label={muted ? "Unmute the microphone" : "Mute the microphone"}
        active={muted}
        disabled={!live}
        data-testid="voice-mute"
        onClick={() => setVoiceMuted(!muted)}
      />
      <IconButton
        icon={VolumeX}
        label="Stop Claude's voice (or just start talking)"
        disabled={phase !== "speaking"}
        data-testid="voice-hush"
        onClick={hushVoice}
      />
      <span className="mx-2 h-5 w-px shrink-0 bg-line" />
      <Button variant="ghost" icon={PhoneOff} data-testid="voice-end" onClick={stopVoice}>
        End talking
      </Button>
      <Button
        variant="primary"
        icon={Play}
        busy={handing}
        disabled={!live || handing}
        title={
          plan?.kind === "queue"
            ? "Queue the tasks and start them; talking ends"
            : plan
              ? "Approve the plan: Claude starts working and talking ends"
              : "Claude writes up the plan and starts working; talking ends"
        }
        data-testid="voice-go-ahead"
        onClick={goAhead}
      >
        Go ahead
      </Button>
    </footer>
  );
}
