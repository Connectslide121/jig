import { FolderPlus, Plug, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { create } from "zustand";
import type { ChatAttachment, McpServerInfo, QueuedMessage } from "../../../shared/engine";
import { call, errorMessage } from "../../lib/host";
import {
  Badge,
  type BadgeTone,
  Button,
  Dialog,
  FileIcon,
  IconButton,
  type MenuEntry,
  Spinner,
  Switch,
} from "../../ui";
import { formatShortcut } from "../../workbench/shortcuts";
import { notify } from "../../workbench/toasts";
import { ComposerBox, useComposerText } from "./ComposerBox";
import { tokenAt } from "./composerInput";
import { useSessions } from "./store";

type OpenDialog =
  | { kind: "mcp" | "folders"; sessionId: string }
  | { kind: "queued"; sessionId: string; queued: QueuedMessage };

const useDialog = create<{ open: OpenDialog | undefined }>(() => ({
  open: undefined,
}));

/** MCP servers of a chat: status, sign-in needed, on/off, reconnect (Claude Code's /mcp). */
export const openMcpDialog = (sessionId: string) => useDialog.setState({ open: { kind: "mcp", sessionId } });
/** Folders Claude may use besides the chat's own (Claude Code's /add-dir). */
export const openFoldersDialog = (sessionId: string) =>
  useDialog.setState({ open: { kind: "folders", sessionId } });

/** Changes a message waiting in the queue before it is sent. */
export const openEditQueuedDialog = (sessionId: string, queued: QueuedMessage) =>
  useDialog.setState({ open: { kind: "queued", sessionId, queued } });

const STATUS: Record<McpServerInfo["status"], { label: string; tone: BadgeTone }> = {
  connected: { label: "connected", tone: "success" },
  pending: { label: "starting", tone: "info" },
  failed: { label: "failed", tone: "danger" },
  "needs-auth": { label: "needs sign-in", tone: "warning" },
  disabled: { label: "off", tone: "neutral" },
};

function McpDialog({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [servers, setServers] = useState<McpServerInfo[]>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const load = useCallback(() => {
    setError(undefined);
    void call("sessions.mcpStatus", { id: sessionId })
      .then(setServers)
      .catch((e) => setError(errorMessage(e)));
  }, [sessionId]);
  useEffect(load, [load]);
  const act = async (name: string, run: () => Promise<unknown>) => {
    setBusy(name);
    try {
      await run();
      load();
    } catch (e) {
      notify({ title: `${name}: it didn't work`, message: errorMessage(e), tone: "danger" });
    } finally {
      setBusy(undefined);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="MCP servers"
      testId="mcp-dialog"
      footer={
        <Button variant="ghost" icon={RefreshCw} onClick={load}>
          Refresh
        </Button>
      }
    >
      <p className="mb-3 text-xs text-muted">
        The MCP servers Claude Code uses in this chat, from your user, project and plugin settings. Servers
        that need a sign-in: run <code className="font-mono">claude</code> in a terminal and use{" "}
        <code className="font-mono">/mcp</code> there.
      </p>
      {error && <div className="text-xs text-danger">{error}</div>}
      {!servers && !error && <Spinner center />}
      {servers?.length === 0 && <div className="text-xs text-hint">No MCP servers are configured.</div>}
      <div className="flex flex-col gap-1">
        {servers?.map((s) => (
          <div
            key={s.name}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-hover"
            data-testid="mcp-server"
          >
            <Plug className="size-4 shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">{s.name}</span>
                <Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge>
              </div>
              <div className="truncate text-xs text-muted">
                {[s.scope, s.tools !== undefined ? `${s.tools} tools` : undefined, s.error]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            {busy === s.name && <Spinner size="sm" />}
            {s.status !== "disabled" && (
              <IconButton
                icon={RefreshCw}
                size="sm"
                label="Reconnect"
                onClick={() =>
                  void act(s.name, () => call("sessions.mcpReconnect", { id: sessionId, name: s.name }))
                }
              />
            )}
            <Switch
              label={`Use ${s.name}`}
              checked={s.status !== "disabled"}
              onChange={(on) =>
                void act(s.name, () =>
                  call("sessions.mcpToggle", { id: sessionId, name: s.name, enabled: on }),
                )
              }
            />
          </div>
        ))}
      </div>
    </Dialog>
  );
}

function FoldersDialog({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const meta = useSessions((s) => s.metas[sessionId]);
  const dirs = meta?.addDirs ?? [];
  const save = async (next: string[]) => {
    try {
      await call("sessions.setDirs", { id: sessionId, dirs: next });
    } catch (e) {
      notify({ title: "Couldn't change the folders", message: errorMessage(e), tone: "danger" });
    }
  };
  const add = async () => {
    const folder = await call("app.pickFolder", { title: "A folder Claude may use" });
    if (folder && !dirs.includes(folder)) await save([...dirs, folder]);
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Folders for this chat"
      testId="folders-dialog"
      footer={
        <Button icon={FolderPlus} onClick={() => void add()} data-testid="folders-add">
          Add a folder…
        </Button>
      }
    >
      <p className="mb-3 text-xs text-muted">
        Claude works in <span className="font-mono">{meta?.cwd}</span>. Add other folders it may read and
        change too (another repository, shared docs). Claude Code restarts with them at your next message.
      </p>
      {dirs.length === 0 && <div className="text-xs text-hint">No other folders.</div>}
      {dirs.map((dir) => (
        <div
          key={dir}
          className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-hover"
          data-testid="folder-row"
        >
          <FileIcon path={dir} folder className="size-4" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{dir}</span>
          <IconButton
            icon={Trash2}
            size="sm"
            label="Remove"
            onClick={() => void save(dirs.filter((d) => d !== dir))}
          />
        </div>
      ))}
    </Dialog>
  );
}

function EditQueuedDialog({
  sessionId,
  queued,
  onClose,
}: {
  sessionId: string;
  queued: QueuedMessage;
  onClose: () => void;
}) {
  const meta = useSessions((s) => s.metas[sessionId]);
  const input = useComposerText(queued.text);
  const [files, setFiles] = useState<ChatAttachment[]>(queued.attachments ?? []);
  const [saving, setSaving] = useState(false);
  const empty = !input.text.trim() && files.length === 0;
  // The caret at the end, as you left it; a queued "/command" doesn't open its list until you type.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, when the dialog opens.
  useEffect(() => {
    const token = tokenAt(queued.text, queued.text.length);
    input.setClosedAt(token ? `${token.kind}:${token.start}` : undefined);
    input.setText(queued.text);
  }, []);
  const save = async () => {
    if (empty || saving) return;
    setSaving(true);
    try {
      await call("sessions.editQueued", {
        id: sessionId,
        queuedId: queued.id,
        text: input.latestText.current.trim(),
        attachments: files,
      });
      onClose();
    } catch (e) {
      notify({ title: "Couldn't change the message", message: errorMessage(e), tone: "danger" });
      onClose();
    }
  };
  // Only what changes the message: the chat's own settings and actions stay in the chat's composer.
  const moreMenu = (base: { commands: MenuEntry; mention: MenuEntry; attach: MenuEntry }): MenuEntry[] => [
    base.commands,
    base.mention,
    base.attach,
  ];
  return (
    <Dialog
      open
      onClose={onClose}
      title="Edit queued message"
      testId="edit-queued-dialog"
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            busy={saving}
            disabled={empty}
            onClick={() => void save()}
            data-testid="edit-queued-save"
          >
            Save
          </Button>
        </>
      }
    >
      <p className="mb-2 text-xs text-muted">
        It sends after Claude's current turn, in the same place in the queue. {formatShortcut("Mod+Enter")}{" "}
        saves.
      </p>
      <div className="h-80">
        <ComposerBox
          input={input}
          files={files}
          onFiles={setFiles}
          sessionId={sessionId}
          cwd={meta?.cwd ?? ""}
          dictationTarget={`${sessionId}:queued`}
          fill
          testId="edit-queued-box"
          inputTestId="edit-queued-text"
          inputLabel="Queued message"
          placeholder="Message Claude…  / commands · @ files"
          moreMenu={moreMenu}
          moreLabel="Commands, files and attachments"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void save();
            }
          }}
        />
      </div>
    </Dialog>
  );
}

/** Mount once. */
export function SessionDialogsHost() {
  const open = useDialog((s) => s.open);
  const close = () => useDialog.setState({ open: undefined });
  if (!open) return null;
  if (open.kind === "queued")
    return (
      <EditQueuedDialog
        key={open.queued.id}
        sessionId={open.sessionId}
        queued={open.queued}
        onClose={close}
      />
    );
  return open.kind === "mcp" ? (
    <McpDialog sessionId={open.sessionId} onClose={close} />
  ) : (
    <FoldersDialog sessionId={open.sessionId} onClose={close} />
  );
}
