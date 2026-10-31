import { describePermission } from "@jig/sdk";
import { Plus, Puzzle, RefreshCw, Store, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { GalleryAddon, GallerySource } from "../../../shared/addons";
import { iconByName } from "../../addons/icons";
import { call, errorMessage } from "../../lib/host";
import { updateConfig, useConfig } from "../../stores/config";
import { Badge, Button, confirmDialog, Empty, IconButton, promptDialog, Spinner } from "../../ui";
import { registerAction, registerTabType } from "../../workbench/registry";
import { workbench } from "../../workbench/store";
import { notify } from "../../workbench/toasts";

/** The add-on gallery (D-179): browse add-ons from git repositories or folders you add, and install them. */
export function registerGallery(): void {
  registerTabType({
    type: "jig.addonGallery",
    title: () => "Add-on gallery",
    icon: Store,
    component: AddonGallery,
    singleton: true,
    owner: "core",
  });
  registerAction({
    id: "jig.addonGallery",
    title: "Add-on gallery",
    group: "Jig",
    icon: Store,
    keywords: ["install", "browse", "share", "add-ons", "extensions", "marketplace"],
    run: () => {
      workbench.openTab("jig.addonGallery", {});
    },
  });
}

export const openGallery = () => workbench.openTab("jig.addonGallery", {});

function AddonGallery() {
  const sources = useConfig((s) => s.config?.addonGallery.sources ?? []);
  const [result, setResult] = useState<GallerySource[] | undefined>();
  const [loading, setLoading] = useState(true);
  const key = sources.join("\n");

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      setResult(await call("addons.gallery", { refresh }));
    } catch (error) {
      notify({ tone: "danger", title: "Couldn't read the gallery", message: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload when the sources change
  useEffect(() => {
    void load();
  }, [load, key]);

  const addSource = async () => {
    const source = await promptDialog({
      title: "Add a gallery",
      message:
        "A git repository (https:// or ssh://, cloned with your own git) or a folder. Its add-ons are the folders with an addon.json, at the top or under addons/.",
      placeholder: "https://example.com/contoso/jig-addons.git",
      confirmLabel: "Add",
    });
    if (!source || sources.includes(source)) return;
    await updateConfig({ addonGallery: { sources: [...sources, source] } });
  };
  const removeSource = async (source: string) => {
    if (!(await confirmDialog({ title: "Remove this gallery?", message: source, confirmLabel: "Remove" })))
      return;
    await updateConfig({ addonGallery: { sources: sources.filter((s) => s !== source) } });
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="addon-gallery">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-4">
        <Store className="size-4 text-muted" />
        <div className="min-w-0 flex-1 truncate text-sm font-medium">Add-on gallery</div>
        <Button size="sm" icon={Plus} onClick={() => void addSource()} data-testid="gallery-add-source">
          Add gallery…
        </Button>
        <Button
          size="sm"
          icon={RefreshCw}
          busy={loading}
          disabled={loading || sources.length === 0}
          onClick={() => void load(true)}
          data-testid="gallery-refresh"
        >
          Refresh
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sources.length === 0 ? (
          <Empty icon={Store} title="No galleries yet" className="h-full">
            Add a git repository or a folder that holds add-ons, for example one your team shares. Installing
            shows each add-on's permissions first, and nothing runs until you install it.
          </Empty>
        ) : !result ? (
          <Spinner center />
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4">
            {result.map((s) => (
              <SourceSection
                key={s.source}
                source={s}
                onRemove={() => void removeSource(s.source)}
                onInstalled={() => void load()}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SourceSection({
  source,
  onRemove,
  onInstalled,
}: {
  source: GallerySource;
  onRemove: () => void;
  onInstalled: () => void;
}) {
  return (
    <section className="flex flex-col rounded-md border border-line" data-testid="gallery-source">
      <div className="flex h-9 items-center gap-2 border-b border-line px-3">
        <span
          className="min-w-0 flex-1 truncate font-mono text-xs text-muted selectable"
          title={source.source}
        >
          {source.source}
        </span>
        <IconButton icon={X} size="sm" label="Remove this gallery" onClick={onRemove} />
      </div>
      {source.error ? (
        <div className="p-3 text-xs text-danger selectable" data-testid="gallery-source-error">
          {source.error}
        </div>
      ) : source.addons.length === 0 ? (
        <div className="p-3 text-xs text-muted">No add-ons here.</div>
      ) : (
        source.addons.map((a) => (
          <GalleryRow key={a.id} source={source.source} addon={a} onInstalled={onInstalled} />
        ))
      )}
    </section>
  );
}

function GalleryRow({
  source,
  addon,
  onInstalled,
}: {
  source: string;
  addon: GalleryAddon;
  onInstalled: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const Icon = iconByName(addon.icon) ?? Puzzle;
  const mine = addon.installed;
  const same = mine?.source === "user" && mine.version === addon.version;
  const label = !mine ? "Install" : same ? "Installed" : mine.source === "builtin" ? "Replace" : "Update";

  const install = async () => {
    const replace = mine?.source === "user";
    const ok = await confirmDialog({
      title: `${label} ${addon.name}?`,
      confirmLabel: label,
      message: (
        <div className="flex flex-col gap-2">
          <div>
            {addon.description ?? addon.id}
            {replace &&
              ` This replaces your version ${mine?.version ?? ""}; the old one stays in its history.`}
            {mine?.source === "builtin" && " Your copy takes the place of the built-in one."}
          </div>
          {addon.permissions.length ? (
            <div className="flex flex-col gap-1">
              <div className="text-xs text-muted">It may:</div>
              <div className="flex flex-wrap gap-1">
                {addon.permissions.map((p) => (
                  <Badge key={p} tone="info">
                    {describePermission(p)}
                  </Badge>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted">It asks for no permissions.</div>
          )}
        </div>
      ),
    });
    if (!ok) return;
    setBusy(true);
    try {
      const done = await call("addons.galleryInstall", { source, id: addon.id, replace });
      notify({ tone: "success", title: `${done.name} installed` });
      onInstalled();
    } catch (error) {
      notify({ tone: "danger", title: `Couldn't install ${addon.name}`, message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="flex h-14 items-center gap-3 border-b border-line px-3 last:border-b-0"
      data-testid={`gallery-addon-${addon.id}`}
    >
      <Icon className="size-5 shrink-0 text-muted" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="truncate text-sm">{addon.name}</div>
        <div className="truncate text-xs text-muted" title={addon.description}>
          {addon.errors.length ? addon.errors[0] : (addon.description ?? addon.id)}
        </div>
      </div>
      <span className="w-16 shrink-0 text-right font-mono text-xs text-muted tabular-nums">
        {addon.version ?? ""}
      </span>
      <div className="flex w-24 shrink-0 justify-end">
        <Button
          size="sm"
          variant={!mine ? "primary" : "secondary"}
          busy={busy}
          disabled={busy || same || addon.errors.length > 0}
          onClick={() => void install()}
          data-testid={`gallery-install-${addon.id}`}
        >
          {label}
        </Button>
      </div>
    </div>
  );
}
