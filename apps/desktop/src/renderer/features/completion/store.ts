import { create } from "zustand";
import type { CompletionState } from "../../../shared/completion";
import { call } from "../../lib/host";

/** Who completes code in the editor, and Copilot's setup (D-255); follows `completion.changed`. */
export const useCompletion = create<{ state?: CompletionState }>(() => ({}));

let started = false;
/** Reads the state once and follows the host's changes (called by the editor and the dialogs). */
export function watchCompletion(): void {
  if (started) return;
  started = true;
  void call("completion.state")
    .then((state) => useCompletion.setState({ state }))
    .catch(() => {
      started = false;
    });
  window.jig.on("completion.changed", (state) => useCompletion.setState({ state }));
}
