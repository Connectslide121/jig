import { FolderOpen, GitBranch, MessageSquareShare } from "lucide-react";
import { useEffect, useState } from "react";
import { create } from "zustand";
import type { SavedClaudeSession } from "../../../shared/engine";
import { call, errorMessage } from "../../lib/host";
import { Button, Dialog, formatBytes, SearchInput, Spinner } from "../../ui";
import { workbench } from "../../workbench/store";
import { notify } from "../../workbench/toasts";
import { ensureTranscript } from "./store";

const useDialog = create<{ open: boolean }>(() => ({ open: false }));

/** Chats you had in Claude Code (its CLI, the desktop app's Code tab, an IDE), to open in Jig (D-150). */
export const openSavedChatsDialog = () => useDialog.setState({ open: true });

function when(ms: number): string {
  const minutes = Math.round((Date.now() - ms) / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 1)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return new Date(ms).toLocaleDateString();
}

/** The folder's last two parts: enough to tell projects apart. */
function folderLabel(cwd?: string): string {
  if (!cwd) return "unknown folder";
  return cwd.split(/[\\/]/).filter(Boolean).slice(-2).join("/");
}

function SavedChatsDialog({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<SavedClaudeSession[]>();
  const [error, setError] = useState<string>();
  const [filter, setFilter] = useState("");
  const [opening, setOpening] = useState<string>();
  useEffect(() => {
    call("sessions.saved").then(setList, (e) => setError(errorMessage(e)));
  }, []);
  const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (list ?? []).filter((s) => {
    const text = `${s.title} ${s.cwd ?? ""} ${s.gitBranch ?? ""}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
  const open = async (saved: SavedClaudeSession) => {
    if (saved.chatId) {
      await ensureTranscript(saved.chatId);
      workbench.openTab("jig.chat", { sessionId: saved.chatId });
      onClose();
      return;
    }
    setOpening(saved.sessionId);
    try {
      const meta = await call("sessions.openSaved", { sessionId: saved.sessionId });
      await ensureTranscript(meta.id);
      workbench.openTab("jig.chat", { sessionId: meta.id });
      notify({
        title: `Opened “${meta.title}”`,
        message: "It's in No project; drag it to a project.",
        tone: "success",
      });
      onClose();
    } catch (e) {
      notify({ title: "Couldn't open the chat", message: errorMessage(e), tone: "danger" });
    } finally {
      setOpening(undefined);
    }
  };
  return (
    <Dialog open onClose={onClose} title="Open a Claude Code chat" width="lg" testId="saved-chats">
      <div className="flex min-h-0 flex-col gap-3">
        <p className="text-sm text-muted">
          Chats you had in Claude Code: its terminal, the Claude desktop app's Code tab, an IDE. Opening one
          brings its history here, in <span className="text-fg">No project</span>; what you send continues it
          as a copy, and the original stays as it was.
        </p>
        <SearchInput
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onClear={() => setFilter("")}
          placeholder="Filter by title, folder or branch"
          aria-label="Filter Claude Code chats"
          data-testid="saved-chats-filter"
        />
        {error && <div className="text-sm text-danger">{error}</div>}
        {!list && !error && <Spinner center />}
        {list && shown.length === 0 && (
          <div className="py-6 text-center text-sm text-hint">
            {list.length ? "No chat matches." : "Claude Code has no saved chats on this computer."}
          </div>
        )}
        <div className="-mx-1 flex max-h-96 flex-col overflow-y-auto">
          {shown.map((s) => (
            <div
              key={s.sessionId}
              className="group flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-hover"
              data-testid={`saved-chat-${s.title}`}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium" title={s.title}>
                  {s.title}
                </div>
                <div className="flex min-w-0 items-center gap-2 text-xs text-muted">
                  <span className="flex min-w-0 items-center gap-1 truncate" title={s.cwd}>
                    <FolderOpen className="size-3 shrink-0" />
                    <span className="truncate">{folderLabel(s.cwd)}</span>
                  </span>
                  {s.gitBranch && (
                    <span className="flex min-w-0 items-center gap-1 truncate">
                      <GitBranch className="size-3 shrink-0" />
                      <span className="truncate">{s.gitBranch}</span>
                    </span>
                  )}
                  <span className="shrink-0">{when(s.lastModified)}</span>
                  {s.fileSize ? <span className="shrink-0 text-hint">{formatBytes(s.fileSize)}</span> : null}
                </div>
              </div>
              <Button
                size="sm"
                variant={s.chatId ? "ghost" : "secondary"}
                icon={MessageSquareShare}
                busy={opening === s.sessionId}
                disabled={Boolean(opening) && opening !== s.sessionId}
                onClick={() => void open(s)}
                data-testid={`saved-chat-open-${s.title}`}
              >
                {s.chatId ? "In Jig" : "Open"}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  );
}

/** Mount once. */
export function SavedChatsDialogHost() {
  const open = useDialog((s) => s.open);
  return open ? <SavedChatsDialog onClose={() => useDialog.setState({ open: false })} /> : null;
}
