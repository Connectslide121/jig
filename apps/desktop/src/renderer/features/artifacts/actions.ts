import { call } from "../../lib/host";
import { openPreview } from "../preview/actions";

/** Opens the page an artifact was published from, in Jig's Preview tab. */
export function openLocalArtifact(path: string): void {
  openPreview(path);
}

export function openArtifactOnline(url: string): void {
  void call("app.openExternal", { url });
}
