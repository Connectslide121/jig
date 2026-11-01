import { Mic } from "lucide-react";
import { useEffect, useState } from "react";
import { cn, Dialog, Spinner } from "../../ui";
import { formatShortcut } from "../../workbench/shortcuts";
import {
  cancelDictation,
  type DictationText,
  startDictation,
  stopDictation,
  useDictation,
} from "./dictation";
import { useSpeechEngine } from "./engine";

export const DICTATION_SHORTCUT = "Mod+Shift+Space";

/** Starts or stops dictating into a chat's composer. */
export function toggleDictation(target: string, onText: DictationText): void {
  const { phase, target: current } = useDictation.getState();
  if (phase === "recording" && current === target) stopDictation();
  else if (phase === "idle") void startDictation(target, onText);
}

/**
 * The composer's microphone: click to speak, click again to stop; the text goes where the caret is.
 * Always the same square, whatever it is doing (no layout shift).
 */
export function DictationButton({ target, onText }: { target: string; onText: DictationText }) {
  const dictation = useDictation((s) => (s.target === target ? s.phase : "idle"));
  const downloading = useSpeechEngine((s) => s.downloading?.target === target);
  const phase = downloading ? "downloading" : dictation;
  const busyElsewhere = useDictation((s) => s.phase !== "idle" && s.target !== target);
  // A chat that closes while you speak drops the recording.
  useEffect(
    () => () => {
      const s = useDictation.getState();
      if (s.target === target && s.phase === "recording") cancelDictation();
    },
    [target],
  );
  const label =
    phase === "recording"
      ? `Stop and add what you said (${formatShortcut(DICTATION_SHORTCUT)}; Esc discards it)`
      : phase === "transcribing"
        ? "Turning what you said into text…"
        : phase === "downloading"
          ? "Downloading the speech model…"
          : `Dictate: speak instead of typing (${formatShortcut(DICTATION_SHORTCUT)})`;
  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-pressed={phase === "recording"}
        title={label}
        data-testid="composer-dictate"
        data-phase={phase}
        disabled={busyElsewhere || phase === "transcribing" || phase === "downloading"}
        onClick={() => toggleDictation(target, onText)}
        className={cn(
          "no-drag relative inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
          "hover:bg-hover disabled:pointer-events-none",
          phase === "recording" ? "bg-active text-danger" : "text-muted hover:text-fg",
          busyElsewhere && "opacity-50",
        )}
      >
        {phase === "transcribing" || phase === "downloading" ? (
          <Spinner size="sm" />
        ) : (
          <Mic className={cn("size-4.5", phase === "recording" && "motion-safe:animate-pulse")} />
        )}
      </button>
      {phase === "downloading" && <SpeechDownloadDialog />}
    </>
  );
}

/** The model download's progress (dictation and talking with Claude). */
export function SpeechDownloadDialog() {
  const progress = useSpeechEngine((s) => s.downloading);
  const percent = progress?.total ? Math.min(100, (progress.loaded / progress.total) * 100) : 0;
  const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(0)} MB`;
  // Closing it doesn't stop the download: the microphone keeps spinning and a note says when it's ready.
  const [open, setOpen] = useState(true);
  return (
    <Dialog
      open={open}
      width="sm"
      title="Getting speech ready"
      onClose={() => setOpen(false)}
      testId="dictation-download"
    >
      <div className="flex flex-col gap-2">
        <div className="text-muted">Downloading the speech model. This happens once.</div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised">
          <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
        </div>
        <div className="text-right text-xs text-hint tabular-nums">
          {progress?.total ? `${mb(progress.loaded)} of ${mb(progress.total)}` : "Connecting to Hugging Face"}
        </div>
      </div>
    </Dialog>
  );
}
