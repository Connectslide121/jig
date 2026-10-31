import { describePermission, scopeLabel } from "@jig/sdk";
import {
  FileDown,
  FileUp,
  FolderOpen,
  History,
  Puzzle,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Store,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { AddonCommit, AddonInfo } from "../../../shared/addons";
import { requestBuild } from "../../addons/buildRequests";
import { iconByName, unknownIcons } from "../../addons/icons";
import { useAddons } from "../../addons/loader";
import { call, errorMessage } from "../../lib/host";
import { useConfig } from "../../stores/config";
import { Badge, Button, confirmDialog, Dialog, Empty, IconButton, Spinner, Switch } from "../../ui";
import { useRegistry } from "../../workbench/registry";
import { notify } from "../../workbench/toasts";
import { openGallery } from "../gallery";
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
        <Spinner center />
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

async function exportAddon(addon: AddonInfo) {
  try {
    const file = await call("addons.export", { id: addon.id });
    if (file)
      notify({
        title: `Saved ${addon.name}`,
        message: `${file} — send it to a colleague; they use Import add-on….`,
        tone: "success",
      });
  } catch (error) {
    notify({ title: "Couldn't export", message: errorMessage(error), tone: "danger" });
  }
}

async function deleteAddon(addon: AddonInfo) {
  const ok = await confirmDialog({
    title: addon.overridesBuiltin ? `Delete your copy of ${addon.name}?` : `Delete ${addon.name}?`,
    message: addon.overridesBuiltin
      ? "The built-in add-on comes back. Your copy stays in the add-ons' git history."
      : "Its folder is deleted (it stays in the add-ons' git history). Its stored data is kept, so importing it again finds it.",
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  try {
    await call("addons.remove", { id: addon.id });
    notify({ title: `${addon.name} deleted`, tone: "success" });
  } catch (error) {
    notify({ title: "Couldn't delete", message: errorMessage(error), tone: "danger" });
  }
}

/** Import: pick a .zip, see what it is and what it may do, then install it. */
export async function importAddon(path?: string) {
  try {
    const pkg = await call("addons.inspectPackage", { path });
    if (!pkg) return;
    if (pkg.errors.length) {
      notify({
        title: "This isn't an add-on Jig can install",
        message: pkg.errors.join("\n"),
        tone: "danger",
      });
      return;
    }
    const permissions = pkg.permissions.length
      ? `It may: ${pkg.permissions.map((p) => describePermission(p)).join("; ")}.`
      : "It asks for no permissions.";
    const ok = await confirmDialog({
      title: `Install ${pkg.name}${pkg.version ? ` ${pkg.version}` : ""}?`,
      message: [
        pkg.description ?? "",
        `${pkg.files.length} file${pkg.files.length === 1 ? "" : "s"}. ${permissions}`,
        pkg.exists === "user"
          ? `You already have "${pkg.id}": it is replaced (the old one stays in its history).`
          : pkg.exists === "builtin"
            ? `It becomes your copy of the built-in "${pkg.id}".`
            : "",
        "Only install add-ons from people you trust: they run code on your computer.",
      ]
        .filter(Boolean)
        .join("\n\n"),
      confirmLabel: pkg.exists === "user" ? "Replace" : "Install",
      danger: pkg.exists === "user",
    });
    if (!ok) return;
    const done = await call("addons.importPackage", { path: pkg.path, replace: pkg.exists === "user" });
    notify({ title: `Installed ${done.name}`, tone: "success" });
  } catch (error) {
    notify({ title: "Couldn't import", message: errorMessage(error), tone: "danger" });
  }
}

function AddonRow({ addon }: { addon: AddonInfo }) {
  const loadError = useAddons((s) => s.loadErrors[addon.id]);
  const canBuild = useRegistry((s) => Boolean(s.actions["jig.build"]));
  const [history, setHistory] = useState(false);
  const Icon = iconByName(addon.manifest?.icon) ?? Puzzle;
  const errors = [...addon.errors, ...(loadError ? [loadError] : [])];
  const warnings = [
    ...unknownIcons(addon.manifest).map(
      (name) =>
        `addon.json: icon "${name}" isn't a Lucide icon (https://lucide.dev/icons); it shows as a puzzle piece`,
    ),
    ...(addon.warnings ?? []),
  ];
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
            {addon.manifest?.storage?.scope && addon.manifest.storage.scope !== "global" && (
              <Badge tone="info">data {scopeLabel(addon.manifest.storage.scope)}</Badge>
            )}
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
        {addon.source === "user" && !addon.preview && (
          <IconButton
            icon={Trash2}
            label={addon.overridesBuiltin ? `Delete your copy of ${addon.name}` : `Delete ${addon.name}`}
            data-testid={`addon-delete-${addon.id}`}
            onClick={() => void deleteAddon(addon)}
          />
        )}
        <IconButton
          icon={FileDown}
          label={`Export ${addon.name} to share`}
          data-testid={`addon-export-${addon.id}`}
          onClick={() => void exportAddon(addon)}
        />
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
      {warnings.length ? (
        <details className="ml-8 text-xs text-warning" data-testid="addon-warnings">
          <summary className="flex cursor-default items-center gap-1">
            <TriangleAlert className="size-3.5" /> {warnings.length} warning(s)
          </summary>
          <div className="mt-1 font-mono whitespace-pre-wrap text-muted selectable">
            {warnings.join("\n")}
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
          <Button size="sm" icon={FileUp} onClick={() => void importAddon()} data-testid="addon-import">
            Import add-on…
          </Button>
          <Button size="sm" icon={Store} onClick={() => void openGallery()} data-testid="addon-gallery-open">
            Add-on gallery
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
