import { FilePen, Map as MapIcon, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { type ChatStats, chatStats } from "../../../shared/chatStats";
import type { ChatItem, SessionMeta } from "../../../shared/engine";
import { tourFolder } from "../../../shared/tour";
import { Button, Dialog, FileIcon } from "../../ui";
import { openPreview } from "../preview/actions";
import { startTour } from "../tour/actions";
import { restoreFiles } from "./restore";

/** One fixed-height row for the whole chat, outside the scrolling transcript. */
export function ChatChanges({ meta, items }: { meta: SessionMeta; items: ChatItem[] }) {
  const [snapshot, setSnapshot] = useState<ChatStats>();
  const stats = useMemo(() => chatStats(items), [items]);
  const details = snapshot ?? stats;
  const firstMessage = items.find((item) => item.kind === "user");
  const working = ["working", "starting", "needs_you"].includes(meta.status);
  return (
    <div
      className="mx-auto h-9 w-full max-w-[var(--jig-chat-width)] shrink-0 px-6"
      data-testid="chat-changes-slot"
    >
      {stats.files.length > 0 && (
        <div
          className="flex h-full items-center gap-1 overflow-x-auto whitespace-nowrap"
          data-testid="chat-changes"
          role="group"
          aria-label="Changes across the whole chat"
        >
          <Button
            size="sm"
            variant="ghost"
            icon={FilePen}
            className="w-36 justify-start"
            onClick={() => setSnapshot(stats)}
            title="Files edited across this whole chat"
            data-testid="chat-changes-open"
          >
            {stats.files.length} file{stats.files.length === 1 ? "" : "s"} changed
          </Button>
          <span
            className="mr-auto flex w-20 shrink-0 items-center gap-1 font-mono text-2xs"
            data-testid="chat-changes-lines"
          >
            <span className="text-success">+{stats.linesAdded}</span>
            <span className="text-danger">−{stats.linesRemoved}</span>
          </span>
          <Button
            size="sm"
            variant="ghost"
            icon={MapIcon}
            disabled={working}
            onClick={() =>
              void startTour(
                tourFolder(
                  meta.cwd,
                  stats.files.map((f) => f.path),
                ),
              )
            }
            data-testid="chat-changes-tour"
          >
            Walk me through
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={Undo2}
            disabled={working || firstMessage?.kind !== "user" || !firstMessage.messageId}
            title="Restore files to before the first message in this chat; you will review and confirm first"
            data-testid="chat-changes-undo"
            onClick={() => {
              if (firstMessage) void restoreFiles(meta.id, firstMessage.id);
            }}
          >
            Undo changes
          </Button>
        </div>
      )}
      <Dialog
        open={Boolean(snapshot)}
        onClose={() => setSnapshot(undefined)}
        title="Files changed in this chat"
        width="xl"
        column
        testId="chat-changes-dialog"
        footer={<Button onClick={() => setSnapshot(undefined)}>Close</Button>}
      >
        <div className="flex flex-col gap-1 border-b border-line px-4 py-3 text-xs text-muted">
          <span>
            {details.files.length} files ·{" "}
            <span className="font-mono text-success">+{details.linesAdded}</span>{" "}
            <span className="font-mono text-danger">−{details.linesRemoved}</span> · Whole chat
          </span>
          <p>
            Totals count recorded file edits across this chat, including repeated edits. Restoring files keeps
            this history. Changes made through commands may not be included.
          </p>
        </div>
        <div className="h-80 min-h-0 shrink-0 overflow-auto px-4 pb-4">
          <table className="w-full table-fixed text-xs">
            <colgroup>
              <col />
              <col className="w-16" />
              <col className="w-20" />
              <col className="w-20" />
            </colgroup>
            <thead className="sticky top-0 bg-elevated text-muted">
              <tr>
                <th className="py-2 text-left font-medium">File</th>
                <th className="py-2 text-right font-medium">Edits</th>
                <th className="py-2 text-right font-medium">Added</th>
                <th className="py-2 text-right font-medium">Removed</th>
              </tr>
            </thead>
            <tbody>
              {details.files.map((file) => (
                <tr key={file.path} className="border-t border-line" data-testid="chat-changed-file">
                  <td className="py-2 pr-3">
                    <button
                      type="button"
                      className="flex w-full min-w-0 items-center gap-2 text-left hover:text-accent"
                      title={file.path}
                      onClick={() => {
                        setSnapshot(undefined);
                        openPreview(file.path);
                      }}
                    >
                      <FileIcon path={file.path} className="size-4 shrink-0" />
                      <span className="min-w-0 break-all">{file.path}</span>
                    </button>
                  </td>
                  <td className="py-2 text-right font-mono tabular-nums">{file.edits}</td>
                  <td className="py-2 text-right font-mono text-success tabular-nums">+{file.added}</td>
                  <td className="py-2 text-right font-mono text-danger tabular-nums">−{file.removed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Dialog>
    </div>
  );
}
