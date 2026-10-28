import { describePermission } from "@jig/sdk";
import { FolderOpen, History, Puzzle, RefreshCw, RotateCcw, Sparkles, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import type { AddonCommit, AddonInfo } from "../../../shared/addons";
import { requestBuild } from "../../addons/buildRequests";
import { iconByName } from "../../addons/context";
import { useAddons } from "../../addons/loader";
import { call, errorMessage } from "../../lib/host";
import { useConfig } from "../../stores/config";
import { Badge, Button, confirmDialog, Dialog, Empty, IconButton, Spinner, Switch } from "../../ui";
import { useRegistry } from "../../workbench/registry";
import { notify } from "../../workbench/toasts";
import { SettingsSection } from "./parts";

function HistoryDialog({ addon, onClose }: { addon: AddonInfo; onClose: () => void }) {
  const [commits, setCommits] = useState<AddonCommit[]>();
  useEffect(() => {
    void call("addons.history", { id: addon.id })
      .then(setCommits)
      .catch((error) => {
        setCommits([]);
        notify({ title: "Couldn't read the history", message: errorMessage(error), tone: "danger" });
      });
  }, [addon.id]);
  const rollback = async (commit: AddonCommit) => {
    const ok = await confirmDialog({
      title: `Roll ${addon.name} back?`,
      message: `To “${commit.message}” (${new Date(commit.date).toLocaleString()}). This is recorded as a new change, so you can undo it.`,
      confirmLabel: "Roll back",
    });
    if (!ok) return;
    try {
      await call("addons.rollback", { id: addon.id, commit: commit.hash });
      notify({ title: `${addon.name} rolled back`, tone: "success" });
      onClose();
    } catch (error) {
      notify({ title: "Roll back failed", message: errorMessage(error), tone: "danger" });
    }
  };
  return (
    <Dialog open onClose={onClose} title={`History of ${addon.name}`} width="lg">
      {!commits ? (
        <Spinner />
      ) : commits.length === 0 ? (
        <Empty title="No history yet" />
      ) : (
        <div className="flex flex-col divide-y divide-line">
          {commits.map((c, i) => (
            <div key={c.hash} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{c.message}</div>
                <div className="text-xs text-muted">
                  {new Date(c.date).toLocaleString()} ·{" "}
                  <span className="font-mono">{c.hash.slice(0, 7)}</span>
                </div>
              </div>
              {i > 0 && (
                <Button size="sm" icon={RotateCcw} onClick={() => void rollback(c)}>
                  Roll back to this
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}

function AddonRow({ addon }: { addon: AddonInfo }) {
  const loadError = useAddons((s) => s.loadErrors[addon.id]);
  const canBuild = useRegistry((s) => Boolean(s.actions["jig.build"]));
  const [history, setHistory] = useState(false);
  const Icon = iconByName(addon.manifest?.icon) ?? Puzzle;
  const errors = [...addon.errors, ...(loadError ? [loadError] : [])];
  return (
    <div className="flex flex-col gap-2 px-4 py-3" data-testid={`addon-${addon.id}`}>
      <div className="flex items-center gap-3">
        <Icon className="size-5 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{addon.name}</span>
            <Badge>
              {addon.source === "builtin" ? "built in" : addon.overridesBuiltin ? "your copy" : "yours"}
            </Badge>
            {addon.version && <span className="text-xs text-hint">{addon.version}</span>}
          </div>
          {addon.description && <div className="text-xs text-muted">{addon.description}</div>}
        </div>
        {canBuild && (
          <IconButton
            icon={Sparkles}
            label="Change this with AI"
            onClick={() => requestBuild({ goal: "", addonId: addon.id, origin: "settings" })}
          />
        )}
        {addon.source === "user" && (
          <IconButton icon={History} label="History" onClick={() => setHistory(true)} />
        )}
        <IconButton
          icon={FolderOpen}
          label="Open folder"
          onClick={() => void call("app.openPath", { path: addon.dir })}
        />
        <IconButton
          icon={RefreshCw}
          label="Reload"
          onClick={() => void call("addons.reload", { id: addon.id })}
        />
        <Switch
          label={addon.enabled ? `Turn off ${addon.name}` : `Turn on ${addon.name}`}
          checked={addon.enabled}
          onChange={(enabled) => void call("addons.setEnabled", { id: addon.id, enabled })}
        />
      </div>
      {addon.manifest?.permissions.length ? (
        <div className="flex flex-wrap gap-1 pl-8">
          {addon.manifest.permissions.map((p) => (
            <Badge key={p} tone="info">
              {describePermission(p)}
            </Badge>
          ))}
        </div>
      ) : null}
      {errors.length > 0 && (
        <div
          className="ml-8 rounded-md bg-danger-soft p-2 font-mono text-xs whitespace-pre-wrap text-danger selectable"
          data-testid="addon-errors"
        >
          {errors.join("\n")}
        </div>
      )}
      {addon.warnings?.length ? (
        <details className="ml-8 text-xs text-warning">
          <summary className="flex cursor-default items-center gap-1">
            <TriangleAlert className="size-3.5" /> {addon.warnings.length} design-token warning(s)
          </summary>
          <div className="mt-1 font-mono whitespace-pre-wrap text-muted selectable">
            {addon.warnings.join("\n")}
          </div>
        </details>
      ) : null}
      {history && <HistoryDialog addon={addon} onClose={() => setHistory(false)} />}
    </div>
  );
}

export function AddonsSettings() {
  const addons = useAddons((s) => s.addons);
  const info = useConfig((s) => s.info);
  const builtin = addons.filter((a) => a.source === "builtin");
  const user = addons.filter((a) => a.source === "user");
  return (
    <div className="flex flex-col gap-8">
      <SettingsSection
        title="Your add-ons"
        description="Add-ons Jig built for you (and any you wrote) live in ~/.jig/addons. Every change is recorded, so you can roll back."
      >
        {user.length === 0 ? (
          <div className="px-4 py-3 text-sm text-muted">
            None yet. Use Tools → Build something… to make one.
          </div>
        ) : (
          user.map((a) => <AddonRow key={`${a.id}:${a.dir}`} addon={a} />)
        )}
        <div className="flex gap-2 px-4 py-3">
          <Button
            size="sm"
            icon={FolderOpen}
            onClick={() => info && void call("app.openPath", { path: `${info.jigHome}/addons` })}
          >
            Open add-ons folder
          </Button>
          <Button size="sm" icon={RefreshCw} onClick={() => void call("addons.reload", {})}>
            Reload all
          </Button>
        </div>
      </SettingsSection>
      <SettingsSection
        title="Built in"
        description="Shipped with Jig. Changing one with AI makes your own copy; switching it off hides it."
      >
        {builtin.map((a) => (
          <AddonRow key={a.id} addon={a} />
        ))}
      </SettingsSection>
    </div>
  );
}
