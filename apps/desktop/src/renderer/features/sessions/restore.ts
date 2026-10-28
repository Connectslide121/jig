import { call, errorMessage } from "../../lib/host";
import { confirmDialog } from "../../ui";
import { notify } from "../../workbench/toasts";

const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;

/**
 * Restores the files Claude changed since one of your messages (Claude Code's file checkpoints): asks
 * what would change first, shows it, and restores only after you confirm.
 */
export async function restoreFiles(sessionId: string, itemId: string): Promise<void> {
  try {
    const preview = await call("sessions.rewindFiles", { id: sessionId, itemId, dryRun: true });
    if (!preview.canRewind) {
      notify({ title: "Can't restore files", message: preview.error, tone: "warning" });
      return;
    }
    const files = preview.filesChanged ?? [];
    if (files.length === 0) {
      notify({ title: "Nothing to restore", message: "Claude hasn't changed any files since this message." });
      return;
    }
    const shown =
      files.slice(0, 8).map(fileName).join(", ") + (files.length > 8 ? ` and ${files.length - 8} more` : "");
    const ok = await confirmDialog({
      title: `Restore ${files.length} file${files.length === 1 ? "" : "s"}?`,
      message: `${shown} go back to how they were before this message. The chat itself stays as it is.`,
      confirmLabel: "Restore files",
      danger: true,
    });
    if (!ok) return;
    const done = await call("sessions.rewindFiles", { id: sessionId, itemId, dryRun: false });
    if (!done.canRewind) notify({ title: "Can't restore files", message: done.error, tone: "danger" });
  } catch (error) {
    notify({ title: "Can't restore files", message: errorMessage(error), tone: "danger" });
  }
}
