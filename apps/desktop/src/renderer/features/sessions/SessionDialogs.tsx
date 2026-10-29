import { FolderPlus, Plug, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { create } from "zustand";
import type { McpServerInfo } from "../../../shared/engine";
import { call, errorMessage } from "../../lib/host";
import { Badge, type BadgeTone, Button, Dialog, FileIcon, IconButton, Spinner, Switch } from "../../ui";
import { notify } from "../../workbench/toasts";
import { useSessions } from "./store";

const useDialog = create<{ open: { kind: "mcp" | "folders"; sessionId: string } | undefined }>(() => ({
  open: undefined,
}));

/** MCP servers of a chat: status, sign-in needed, on/off, reconnect (Claude Code's /mcp). */
export const openMcpDialog = (sessionId: string) => useDialog.setState({ open: { kind: "mcp", sessionId } });
/** Folders Claude may use besides the chat's own (Claude Code's /add-dir). */
export const openFoldersDialog = (sessionId: string) =>
  useDialog.setState({ open: { kind: "folders", sessionId } });

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

/** Mount once. */
export function SessionDialogsHost() {
  const open = useDialog((s) => s.open);
  const close = () => useDialog.setState({ open: undefined });
  if (!open) return null;
  return open.kind === "mcp" ? (
    <McpDialog sessionId={open.sessionId} onClose={close} />
  ) : (
    <FoldersDialog sessionId={open.sessionId} onClose={close} />
  );
}
