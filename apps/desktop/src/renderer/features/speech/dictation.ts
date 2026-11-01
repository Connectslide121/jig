import { create } from "zustand";
import { errorMessage } from "../../lib/host";
import { notify } from "../../workbench/toasts";
import { Capture, LiveText, prepareSpeech } from "./engine";

/**
 * Dictation (D-208, D-209): one at a time, for one chat's composer. While you speak, Whisper reads
 * what you said so far and the text appears where the caret is (`onText(text, false)`); when you
 * stop it reads it once more (`onText(text, true)`). Cancelling removes it (`onText("", true)`).
 */
export type DictationPhase = "idle" | "recording" | "transcribing";

export const useDictation = create<{ phase: DictationPhase; target?: string }>(() => ({ phase: "idle" }));

export type DictationText = (text: string, final: boolean) => void;

/** Longest recording; dictation stops by itself after this. */
const MAX_RECORDING_MS = 10 * 60_000;

let session:
  | { capture: Capture; live: LiveText; onText: DictationText; timer: ReturnType<typeof setTimeout> }
  | undefined;
/** Between the click and the recording (download question, microphone prompt). */
let starting = false;

/** Starts dictating into a chat's composer. */
export async function startDictation(target: string, onText: DictationText): Promise<void> {
  if (starting || session || useDictation.getState().phase !== "idle") return;
  starting = true;
  let capture: Capture | undefined;
  try {
    if (!(await prepareSpeech(target, "stop"))) return;
    capture = await Capture.open();
  } finally {
    starting = false;
  }
  if (!capture) return;
  const live = new LiveText(capture, 0, (text) => onText(text, false));
  session = { capture, live, onText, timer: setTimeout(stopDictation, MAX_RECORDING_MS) };
  useDictation.setState({ phase: "recording", target });
}

/** Stops recording; the last words are read and the text is final. */
export function stopDictation(): void {
  const current = session;
  if (!current) return;
  session = undefined;
  clearTimeout(current.timer);
  useDictation.setState({ phase: "transcribing" });
  void (async () => {
    try {
      const text = await current.live.finish();
      current.onText(text, true);
      if (!text)
        notify({ title: "Nothing heard", message: "Check the microphone and speak a little louder." });
    } catch (error) {
      current.onText("", true);
      notify({ title: "Dictation failed", message: errorMessage(error), tone: "danger" });
    } finally {
      current.capture.close();
      useDictation.setState({ phase: "idle", target: undefined });
    }
  })();
}

/** Stops recording and removes what it wrote (the chat closed, or Escape). */
export function cancelDictation(): void {
  const current = session;
  if (!current) return;
  session = undefined;
  clearTimeout(current.timer);
  current.live.cancel();
  current.capture.close();
  current.onText("", true);
  useDictation.setState({ phase: "idle", target: undefined });
}
