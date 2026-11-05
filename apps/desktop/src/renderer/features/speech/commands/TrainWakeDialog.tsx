import { Check, Mic, RotateCcw, X } from "lucide-react";
import { Button, cn, Dialog, Spinner } from "../../../ui";
import { useWake, type WakeCheck } from "./state";
import { closeWakeTraining, restartWakeTraining, TAKES, type TakeState, useTraining } from "./train";

/** The live microphone level: a bar in a fixed slot, so nothing moves as it changes. */
function LevelBar() {
  const value = useTraining((s) => s.level);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-hover" aria-hidden>
      <div
        className="h-full origin-left rounded-full bg-accent transition-transform duration-75"
        style={{ transform: `scaleX(${value})` }}
      />
    </div>
  );
}

function TakeRow({ index, take, current }: { index: number; take: TakeState; current: boolean }) {
  const phase = useTraining((s) => s.phase);
  const live = current && (phase === "listening" || phase === "hearing");
  return (
    <li
      className={cn("flex h-9 items-center gap-3 rounded-sm px-2", current && "bg-hover")}
      data-testid={`train-take-${index + 1}`}
      data-state={current && take.state === "waiting" ? "current" : take.state}
    >
      <span className="w-16 shrink-0 text-xs text-muted tabular-nums">Take {index + 1}</span>
      <span className="flex min-w-0 flex-1 items-center">
        {live ? (
          <LevelBar />
        ) : current && phase === "reading" ? (
          <span className="text-xs text-muted">Reading…</span>
        ) : take.state === "done" ? (
          <span className="truncate text-sm text-fg">
            {take.take.text}
            {!take.known && <span className="text-muted"> · learned as yours</span>}
          </span>
        ) : take.state === "again" ? (
          <span className="truncate text-sm text-muted">
            {take.heard ? `“${take.heard}”` : "Nothing heard"}
          </span>
        ) : null}
      </span>
      <span className="flex w-5 shrink-0 justify-end">
        {take.state === "done" ? (
          <Check className="size-4 text-success" aria-label="Got it" />
        ) : current && phase === "reading" ? (
          <Spinner size="sm" />
        ) : live ? (
          <Mic className={cn("size-4 text-accent", phase === "hearing" && "motion-safe:animate-pulse")} />
        ) : take.state === "again" ? (
          <RotateCcw className="size-4 text-warning" aria-label="Again" />
        ) : null}
      </span>
    </li>
  );
}

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** What the wake check heard lately while listening (D-389): to see why Jig didn't react. */
function HeardLately() {
  const checks = useWake((s) => s.checks);
  const shown: Array<WakeCheck | undefined> = [...checks.slice(-4)].reverse();
  while (shown.length < 4) shown.push(undefined);
  return (
    <section className="mt-4" data-testid="train-heard">
      <h3 className="px-2 text-xs font-medium text-muted">Heard lately while listening</h3>
      <ul className="mt-1 flex flex-col">
        {shown.map((check, i) =>
          check ? (
            <li
              key={`${check.at}-${i}`}
              className="flex h-7 items-center gap-3 px-2 text-xs"
              title={`${check.reason} · loudness ${check.level.toFixed(3)}${check.voice === undefined ? "" : ` · voice ${check.voice.toFixed(2)}`}`}
            >
              <span className="w-16 shrink-0 whitespace-nowrap text-muted tabular-nums">
                {time(check.at)}
              </span>
              <span className="min-w-0 flex-1 truncate text-fg">
                {check.text ? `“${check.text}”` : "Nothing"}
              </span>
              <span className="w-56 shrink-0 truncate text-muted">{check.reason}</span>
              <span className="flex w-4 shrink-0 justify-end">
                {check.woke ? (
                  <Check className="size-3.5 text-success" aria-label="Woke" />
                ) : (
                  <X className="size-3.5 text-muted" aria-label="Ignored" />
                )}
              </span>
            </li>
          ) : (
            <li key={`empty-${i}`} className="flex h-7 items-center px-2 text-xs text-muted">
              {i === 0 && !checks.length ? "Nothing yet: turn Hey Jig on and talk." : ""}
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

function prompt(phase: string, current: number, message?: string): string {
  if (message) return message;
  if (phase === "starting") return "Getting the microphone ready…";
  if (phase === "done") return "Done. Jig will listen for your voice like this.";
  if (phase === "reading") return "Reading what you said…";
  return current === 0 ? "Say “Hey Jig” now." : "And again: “Hey Jig”.";
}

/** "Train Hey Jig" (D-389): five takes in a modal, then save. Mounted once with the workbench. */
export function TrainWakeDialogHost() {
  const open = useTraining((s) => s.open);
  const turnOn = useTraining((s) => s.turnOn);
  const phase = useTraining((s) => s.phase);
  const takes = useTraining((s) => s.takes);
  const current = useTraining((s) => s.current);
  const message = useTraining((s) => s.message);
  const done = phase === "done";
  return (
    <Dialog
      open={open}
      onClose={() => closeWakeTraining(false)}
      title="Train Hey Jig"
      width="lg"
      testId="train-wake"
      footer={
        <>
          <Button variant="ghost" icon={RotateCcw} disabled={current === 0} onClick={restartWakeTraining}>
            Start over
          </Button>
          <span className="flex-1" />
          <Button variant="ghost" onClick={() => closeWakeTraining(false)} data-testid="train-wake-skip">
            {turnOn ? "Listen without training" : "Cancel"}
          </Button>
          <Button
            variant="primary"
            disabled={!done}
            onClick={() => closeWakeTraining(true)}
            data-testid="train-wake-save"
          >
            {turnOn ? "Save and listen" : "Save"}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">
        Say “Hey Jig” {TAKES} times, the way you'd say it across the room, with a pause after each. Jig keeps
        only what it heard, as text, and how loud you were. Your voice isn't recorded.
      </p>
      <p
        className={cn("mt-3 h-5 truncate text-sm", message ? "text-warning" : "text-fg")}
        data-testid="train-wake-prompt"
        aria-live="polite"
      >
        {prompt(phase, current, message)}
      </p>
      <ol className="mt-2 flex flex-col gap-0.5">
        {takes.map((take, i) => (
          <TakeRow key={i} index={i} take={take} current={i === current} />
        ))}
      </ol>
      <HeardLately />
    </Dialog>
  );
}
