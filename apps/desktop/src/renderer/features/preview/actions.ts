import { workbench } from "../../workbench/store";

/** Opens a file in the Preview tab (one tab per file). */
export function openPreview(path: string): void {
  workbench.openTab("jig.preview", { path });
}
