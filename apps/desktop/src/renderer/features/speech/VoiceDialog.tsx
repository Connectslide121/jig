import { Mic, MicOff, PhoneOff, Play, VolumeX } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, cn, Dialog, IconButton, Markdown, Tabs } from "../../ui";
import { useSessions } from "../sessions/store";
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

type View = "now" | "transcript" | "plan";

/**
 * The talking window (D-210): over the chat while you talk with Claude. Sound waves for both
 * voices, the sentence being said now, the conversation and the plan, and the controls: mute,
 * stop Claude's voice, end talking, and Go ahead (Claude starts working and talking ends).
 * Always the same size, whatever it shows (no layout shift).
 */
export function VoiceDialogHost() {
  const phase = useVoice((s) => s.phase);
  const target = useVoice((s) => s.target);
  const title = useSessions((s) => (target ? s.metas[target]?.title : undefined));
  const plan = useVoice((s) => s.plan);
  const [view, setView] = useState<View>("now");
  const open = phase !== "off";
  // A plan to approve is shown as it comes; a new conversation starts on Now.
  useEffect(() => {
    if (plan) setView("plan");
  }, [plan]);
  useEffect(() => {
    if (phase === "starting") setView("now");
  }, [phase]);
  return (
    <Dialog
      open={open}
      onClose={stopVoice}
      width="md"
      testId="voice-dialog"
      title={
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0">Talking with Claude</span>
          {title && <span className="truncate text-sm font-normal text-muted">{title}</span>}
        </span>
      }
      footer={<Controls />}
    >
      <div className="flex h-96 flex-col" data-phase={phase}>
        <div className="relative h-28 shrink-0 overflow-hidden rounded-lg bg-surface">
          <Waves />
        </div>
        <Status />
        <Tabs
          className="mt-1 shrink-0 px-0"
          value={view}
          onChange={setView}
          items={[
            { id: "now", label: "Now" },
            { id: "transcript", label: "Conversation" },
            {
              id: "plan",
              label: (
                <span className="flex items-center gap-1.5">
                  Plan
                  <span className={cn("size-1.5 rounded-full", plan ? "bg-accent" : "bg-transparent")} />
                </span>
              ),
            },
          ]}
        />
        <div className="relative min-h-0 flex-1 pt-2">
          {view === "now" && <NowLine />}
          {view === "transcript" && <Conversation />}
          {view === "plan" && <PlanView />}
        </div>
      </div>
    </Dialog>
  );
}

/** What is going on, with what Claude is doing (one line, always there). */
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
    <div className="flex h-8 shrink-0 items-center gap-2 text-sm" data-testid="voice-status">
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
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
      <span className="min-w-0 flex-1 truncate text-muted">{label}</span>
    </div>
  );
}

/** The sentence being said now: yours while you speak, else the last one said. */
function NowLine() {
  const hearing = useVoice((s) => s.hearing);
  const last = useVoice((s) => s.lines.at(-1));
  const phase = useVoice((s) => s.phase);
  const line = phase === "hearing" || hearing ? { who: "you" as const, text: hearing || "…" } : last;
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center"
      data-testid="voice-now"
    >
      <div
        className={cn(
          "h-4 text-2xs font-medium uppercase tracking-wide",
          line?.who === "you" ? "text-info" : "text-accent",
        )}
      >
        {line ? (line.who === "you" ? "You" : "Claude") : ""}
      </div>
      <div className={cn("line-clamp-4 text-lg leading-snug", line ? "text-fg" : "text-hint")}>
        {line?.text ??
          "Say what you want to do. Claude can look at the code while you plan. Say “go ahead” when you agree, “bye” to stop talking."}
      </div>
    </div>
  );
}

/** Everything said since talking started; follows the end unless you scrolled up. */
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
  return (
    <div
      ref={box}
      className="selectable h-full overflow-y-auto pr-1"
      data-testid="voice-transcript"
      onScroll={(e) => {
        const el = e.currentTarget;
        atEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      }}
    >
      {lines.length === 0 && !hearing && (
        <div className="py-6 text-center text-sm text-hint">Nothing said yet.</div>
      )}
      {lines.map((line) => (
        <Row key={line.id} who={line.who} text={line.text} />
      ))}
      {hearing && <Row who="you" text={hearing} live />}
    </div>
  );
}

function Row({ who, text, live }: { who: "you" | "claude"; text: string; live?: boolean }) {
  return (
    <div className="flex gap-3 py-1 text-sm" data-testid="voice-line" data-who={who}>
      <span className={cn("w-12 shrink-0 font-medium", who === "you" ? "text-info" : "text-accent")}>
        {who === "you" ? "You" : "Claude"}
      </span>
      <span className={cn("min-w-0 flex-1", live ? "text-muted italic" : "text-fg")}>{text}</span>
    </div>
  );
}

function PlanView() {
  const plan = useVoice((s) => s.plan);
  if (!plan)
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-hint">
        Claude shows its plan here when you agree on what to do. Say “go ahead” or press Go ahead and it
        starts.
      </div>
    );
  return (
    <div className="flex h-full flex-col">
      <div
        className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-line bg-surface px-3 py-2"
        data-testid="voice-plan"
      >
        <Markdown text={plan} />
      </div>
      <div className="flex h-7 shrink-0 items-end text-xs text-muted">
        Say “go ahead” or press Go ahead to start, or say what to change.
      </div>
    </div>
  );
}

function Controls() {
  const phase = useVoice((s) => s.phase);
  const muted = useVoice((s) => s.muted);
  const handing = useVoice((s) => s.handing);
  const plan = useVoice((s) => s.plan);
  const live = phase !== "off" && phase !== "starting";
  return (
    <>
      <div className="mr-auto flex items-center gap-1">
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
      </div>
      <Button variant="ghost" icon={PhoneOff} data-testid="voice-end" onClick={stopVoice}>
        End talking
      </Button>
      <Button
        variant="primary"
        icon={Play}
        busy={handing}
        disabled={!live || handing}
        title={
          plan
            ? "Approve the plan: Claude starts working and talking ends"
            : "Claude writes up the plan and starts working; talking ends"
        }
        data-testid="voice-go-ahead"
        onClick={goAhead}
      >
        Go ahead
      </Button>
    </>
  );
}
