import type { JigTheme, ThemeSummary } from "@jig/themes";
import { Download, FolderOpen, RefreshCw, Search, Trash2, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import type { OpenVsxExtension } from "../../../shared/themes";
import { call, errorMessage } from "../../lib/host";
import { applyTheme } from "../../lib/theme";
import { useAppearance } from "../../stores/appearance";
import { updateConfig, useConfig } from "../../stores/config";
import {
  Badge,
  Button,
  cn,
  confirmDialog,
  Empty,
  IconButton,
  Input,
  Select,
  Spinner,
  Switch,
} from "../../ui";
import { notify } from "../../workbench/toasts";
import { FileIconSettings } from "./FileIconSettings";
import { SettingRow, SettingsSection } from "./parts";

const sourceLabel: Record<ThemeSummary["source"], string> = {
  builtin: "Jig",
  user: "Your file",
  vscode: "VS Code",
  openvsx: "Open VSX",
};

function Swatch({ summary }: { summary: ThemeSummary }) {
  const [canvas, surface, fg, accent] = summary.swatch ?? [];
  // Theme colours are data here (a preview of another theme), so they are applied as inline styles.
  return (
    <div className="flex h-12 overflow-hidden rounded-md border border-line" aria-hidden>
      <div className="w-1/3" style={{ background: surface }} />
      <div className="flex flex-1 flex-col justify-center gap-1 px-2" style={{ background: canvas }}>
        <div className="h-1 w-3/4 rounded-full" style={{ background: fg }} />
        <div className="h-1 w-1/2 rounded-full" style={{ background: accent }} />
      </div>
    </div>
  );
}

function ThemeGrid({ filter }: { filter: string }) {
  const themes = useAppearance((s) => s.themes);
  const active = useAppearance((s) => s.theme);
  const config = useConfig((s) => s.config);
  const previewing = useRef<string | undefined>(undefined);
  if (!config) return null;
  const words = filter.toLowerCase();
  const list = themes.filter((t) => !words || `${t.label} ${t.id}`.toLowerCase().includes(words));

  const preview = async (id: string) => {
    previewing.current = id;
    const theme = await call("themes.get", { id }).catch(() => undefined);
    if (theme && previewing.current === id) applyTheme(theme, config.appearance);
  };
  const endPreview = () => {
    previewing.current = undefined;
    if (active) applyTheme(active as JigTheme, config.appearance);
  };
  const choose = (summary: ThemeSummary) => {
    previewing.current = undefined;
    const a = config.appearance;
    if (!a.followSystem) void updateConfig({ appearance: { themeId: summary.id } });
    else if (summary.appearance === "dark") void updateConfig({ appearance: { darkThemeId: summary.id } });
    else void updateConfig({ appearance: { lightThemeId: summary.id } });
  };
  const remove = async (summary: ThemeSummary) => {
    if (!(await confirmDialog({ title: `Remove ${summary.label}?`, confirmLabel: "Remove", danger: true })))
      return;
    await call("themes.remove", { id: summary.id }).catch((e) =>
      notify({ title: "Not removed", message: errorMessage(e), tone: "danger" }),
    );
  };

  if (list.length === 0) return <Empty title="No themes match" />;
  return (
    <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-3 xl:grid-cols-4" onMouseLeave={endPreview}>
      {list.map((summary) => {
        const selected = config.appearance.followSystem
          ? summary.id === config.appearance.darkThemeId || summary.id === config.appearance.lightThemeId
          : summary.id === config.appearance.themeId;
        return (
          <div
            key={summary.id}
            role="button"
            tabIndex={0}
            data-testid={`theme-${summary.id}`}
            aria-pressed={selected}
            onMouseEnter={() => void preview(summary.id)}
            onClick={() => choose(summary)}
            onKeyDown={(e) => e.key === "Enter" && choose(summary)}
            className={cn(
              "group flex cursor-default flex-col gap-1.5 rounded-lg border p-2 text-left",
              selected
                ? "border-accent bg-accent-soft"
                : "border-line hover:border-line-strong hover:bg-hover",
            )}
          >
            <Swatch summary={summary} />
            <div className="flex items-center gap-1">
              <span className="min-w-0 flex-1 truncate text-sm">{summary.label}</span>
              {(summary.source === "user" || summary.source === "openvsx") && (
                <IconButton
                  icon={Trash2}
                  label="Remove theme"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    void remove(summary);
                  }}
                />
              )}
            </div>
            <div className="flex gap-1">
              <Badge>{sourceLabel[summary.source]}</Badge>
              <Badge>{summary.appearance}</Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OpenVsxSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OpenVsxExtension[]>();
  const [busy, setBusy] = useState(false);
  const [installing, setInstalling] = useState<string>();
  const [error, setError] = useState<string>();
  const search = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setResults(await call("themes.searchOpenVsx", { query }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const install = async (ext: OpenVsxExtension) => {
    const key = `${ext.namespace}.${ext.name}`;
    setInstalling(key);
    try {
      const added = await call("themes.installOpenVsx", { namespace: ext.namespace, name: ext.name });
      notify({
        title: `Installed ${ext.displayName}`,
        message: added.length
          ? added.map((t) => t.label).join(", ")
          : "If it is a file icon theme, choose it under File icons.",
        tone: "success",
      });
    } catch (e) {
      notify({ title: `Couldn't install ${ext.displayName}`, message: errorMessage(e), tone: "danger" });
    } finally {
      setInstalling(undefined);
    }
  };
  return (
    <div className="flex flex-col gap-3 p-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Open VSX themes (e.g. dracula, catppuccin, material icon theme)"
        />
        <Button type="submit" icon={Search} busy={busy}>
          Search
        </Button>
      </form>
      {error && <div className="text-sm text-danger">{error}</div>}
      {results?.length === 0 && <div className="text-sm text-muted">No theme extensions found.</div>}
      {results?.map((ext) => (
        <div key={`${ext.namespace}.${ext.name}`} className="flex items-center gap-3">
          {ext.iconUrl ? (
            <img src={ext.iconUrl} alt="" className="size-8 rounded-md" />
          ) : (
            <div className="size-8 rounded-md bg-active" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{ext.displayName}</div>
            <div className="truncate text-xs text-muted">
              {ext.namespace} · {ext.downloads.toLocaleString()} downloads
              {ext.description ? ` · ${ext.description}` : ""}
            </div>
          </div>
          <Button
            size="sm"
            icon={Download}
            busy={installing === `${ext.namespace}.${ext.name}`}
            onClick={() => void install(ext)}
          >
            Install
          </Button>
        </div>
      ))}
      <p className="text-xs text-hint">
        Only the theme's colour files (and a file icon theme's icons and fonts) are downloaded. Nothing from
        an extension is ever run.
      </p>
    </div>
  );
}

export function AppearanceSettings() {
  const config = useConfig((s) => s.config);
  const info = useConfig((s) => s.info);
  const themes = useAppearance((s) => s.themes);
  const themeError = useAppearance((s) => s.themeError);
  const [filter, setFilter] = useState("");
  if (!config) return <Spinner />;
  const a = config.appearance;
  const byAppearance = (appearance: "dark" | "light") => themes.filter((t) => t.appearance === appearance);
  return (
    <div className="flex flex-col gap-8">
      <SettingsSection
        title="Theme"
        description="Click a theme to use it; hover to preview. Imported VS Code themes recolour all of Jig, add-ons included."
      >
        {themeError && (
          <div className="flex items-center gap-2 px-4 py-2 text-sm text-warning">
            <TriangleAlert className="size-4" /> {themeError}
          </div>
        )}
        <SettingRow
          label="Follow the system light/dark mode"
          description="Switch between a light and a dark theme with Windows."
        >
          <Switch
            label="Follow system"
            checked={a.followSystem}
            onChange={(v) => void updateConfig({ appearance: { followSystem: v } })}
          />
        </SettingRow>
        {a.followSystem && (
          <SettingRow label="Light and dark themes">
            <Select
              value={a.lightThemeId}
              onChange={(e) => void updateConfig({ appearance: { lightThemeId: e.target.value } })}
              aria-label="Light theme"
            >
              {byAppearance("light").map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
            <Select
              value={a.darkThemeId}
              onChange={(e) => void updateConfig({ appearance: { darkThemeId: e.target.value } })}
              aria-label="Dark theme"
            >
              {byAppearance("dark").map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          </SettingRow>
        )}
        <div className="flex items-center gap-2 px-4 pt-3">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`Filter ${themes.length} themes…`}
            className="max-w-xs"
          />
          <div className="flex-1" />
          <Button
            size="sm"
            icon={RefreshCw}
            onClick={() =>
              void call("themes.rescan").then((list) => useAppearance.setState({ themes: list }))
            }
          >
            Rescan
          </Button>
          <Button
            size="sm"
            icon={FolderOpen}
            onClick={() => info && void call("app.openPath", { path: `${info.jigHome}/themes` })}
          >
            Themes folder
          </Button>
        </div>
        <ThemeGrid filter={filter} />
      </SettingsSection>

      <SettingsSection
        title="Get themes"
        description="Install colour themes and file icon themes from Open VSX. Themes from your installed VS Code, VS Code Insiders, Cursor and VSCodium appear automatically."
      >
        <OpenVsxSearch />
      </SettingsSection>

      <FileIconSettings />

      <SettingsSection
        title="Style"
        description="These change Jig's spacing, corners and type, whatever the theme."
      >
        <SettingRow label="Density">
          <Select
            value={a.density}
            onChange={(e) =>
              void updateConfig({ appearance: { density: e.target.value as typeof a.density } })
            }
            aria-label="Density"
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </Select>
        </SettingRow>
        <SettingRow label="Corners">
          <Select
            value={a.radius}
            onChange={(e) => void updateConfig({ appearance: { radius: e.target.value as typeof a.radius } })}
            aria-label="Corners"
          >
            <option value="sharp">Sharp</option>
            <option value="soft">Soft</option>
            <option value="round">Round</option>
          </Select>
        </SettingRow>
        <SettingRow label="Font size" description="Base size of the interface text.">
          <Select
            value={a.fontSize}
            onChange={(e) => void updateConfig({ appearance: { fontSize: Number(e.target.value) } })}
            aria-label="Font size"
          >
            {[11, 12, 13, 14, 15, 16, 17, 18].map((n) => (
              <option key={n} value={n}>
                {n} px
              </option>
            ))}
          </Select>
        </SettingRow>
        <FontRow
          label="Interface font"
          value={a.uiFont}
          onSave={(uiFont) => void updateConfig({ appearance: { uiFont } })}
        />
        <FontRow
          label="Code font"
          value={a.monoFont}
          onSave={(monoFont) => void updateConfig({ appearance: { monoFont } })}
        />
      </SettingsSection>
    </div>
  );
}

function FontRow({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <SettingRow label={label} description="Any font installed on your computer.">
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== value && onSave(draft.trim())}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="w-56"
        aria-label={label}
      />
    </SettingRow>
  );
}
