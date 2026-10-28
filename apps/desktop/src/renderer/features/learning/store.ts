import { create } from "zustand";
import type { LearningState } from "../../../shared/learning";
import { call, errorMessage } from "../../lib/host";
import { notify } from "../../workbench/toasts";

export const useLearning = create<{ state: LearningState | undefined }>(() => ({ state: undefined }));

export async function lookForPatterns(): Promise<void> {
  try {
    const run = await call("learning.runNow");
    if (!run.ok) notify({ title: "Looking for patterns failed", message: run.error, tone: "danger" });
    else if (run.suggestions === 0)
      notify({
        title: "No new suggestions",
        message: run.note ?? `Found ${run.patterns} pattern(s), none worth a tool yet.`,
      });
  } catch (error) {
    notify({ title: "Couldn't look for patterns", message: errorMessage(error), tone: "warning" });
  }
}
