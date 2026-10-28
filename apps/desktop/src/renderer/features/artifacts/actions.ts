import { call, errorMessage } from "../../lib/host";
import { dismiss, notify } from "../../workbench/toasts";
import { openPreview } from "../preview/actions";

/** Opens the page an artifact was published from, in Jig's Preview tab. */
export function openLocalArtifact(path: string): void {
  openPreview(path);
}

/** Opens a claude.ai artifact in Jig: Claude Code reads it back (a small model call), Preview shows it. */
export async function openRemoteArtifact(url: string, title?: string): Promise<void> {
  const waiting = notify({
    title: `Opening “${title ?? "the artifact"}”…`,
    message: "Claude Code is reading it from claude.ai.",
    timeout: 0,
  });
  try {
    const { path } = await call("artifacts.fetch", { url });
    openPreview(path);
  } catch (error) {
    notify({ title: "Couldn't open the artifact in Jig", message: errorMessage(error), tone: "danger" });
  } finally {
    dismiss(waiting);
  }
}

export function openArtifactOnline(url: string): void {
  void call("app.openExternal", { url });
}
