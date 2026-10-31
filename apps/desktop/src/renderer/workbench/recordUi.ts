import { call } from "../lib/host";
import { useProjects } from "./projects";

/**
 * Records what you do in Jig's own UI for Learning (`ui` activity, D-175): menu actions by title,
 * views opened as tabs and moved. Only names and ids, never content. The host drops it when
 * recording is off.
 */
export function recordUi(
  op: "action" | "open-tab" | "move",
  text: string,
  detail: Record<string, string> = {},
) {
  void call("learning.record", {
    kind: "ui",
    text,
    projectId: useProjects.getState().activeId,
    detail: { op, ...detail },
  }).catch(() => {});
}
