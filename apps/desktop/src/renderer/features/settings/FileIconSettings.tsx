import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { FileIconThemeList } from "../../../shared/themes";
import { call, useHostEvent } from "../../lib/host";
import { updateConfig, useConfig } from "../../stores/config";
import { Button, FileIcon, Select, Spinner } from "../../ui";
import { SettingRow, SettingsSection } from "./parts";

const SAMPLES: Array<{ path: string; folder?: boolean; expanded?: boolean }> = [
  { path: "src", folder: true, expanded: true },
  { path: "node_modules", folder: true },
  { path: "App.tsx" },
  { path: "index.ts" },
  { path: "cart.spec.ts" },
  { path: "package.json" },
  { path: "README.md" },
  { path: "Program.cs" },
  { path: "Api.csproj" },
  { path: "logo.png" },
  { path: "styles.css" },
  { path: "Dockerfile" },
  { path: ".gitignore" },
  { path: "deploy.ps1" },
];

/** Settings → Appearance → File icons: the same icon theme as VS Code, Jig's own, or any installed one. */
export function FileIconSettings() {
  const choice = useConfig((s) => s.config?.appearance.fileIconTheme);
  const [list, setList] = useState<FileIconThemeList>();
  const load = useCallback(
    (rescan = false) =>
      void call(rescan ? "iconThemes.rescan" : "iconThemes.list")
        .then(setList)
        .catch(() => setList({ themes: [] })),
    [],
  );
  useEffect(() => load(), [load]);
  useHostEvent("themes.changed", () => load());
  if (choice === undefined) return <Spinner center />;
  const vscodeTheme = list?.themes.find((t) => t.id === list.vscodeMatch);
  const vscodeLabel = !list
    ? "Same as VS Code"
    : vscodeTheme
      ? `Same as VS Code (${vscodeTheme.label})`
      : list.vscodeSetting
        ? `Same as VS Code (${list.vscodeSetting} isn't installed here — Jig's icons)`
        : "Same as VS Code (VS Code not found — Jig's icons)";
  return (
    <SettingsSection
      title="File icons"
      description="Icons for files and folders in Git, chats, builds and tabs. Jig reads VS Code file icon themes (like Material Icon Theme) from your VS Code, or installs them from Open VSX below."
    >
      <SettingRow label="Icon theme">
        <div className="flex items-center gap-2">
          <Select
            value={choice}
            aria-label="File icon theme"
            data-testid="file-icon-theme"
            onChange={(e) => void updateConfig({ appearance: { fileIconTheme: e.target.value } })}
          >
            <option value="vscode">{vscodeLabel}</option>
            <option value="jig">Jig</option>
            {list?.themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label} ({t.source === "vscode" ? "VS Code" : "Open VSX"})
              </option>
            ))}
          </Select>
          <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => load(true)}>
            Rescan
          </Button>
        </div>
      </SettingRow>
      <div className="flex flex-wrap gap-x-4 gap-y-2 px-4 pb-4" data-testid="file-icon-samples">
        {SAMPLES.map((s) => (
          <span key={s.path} className="flex items-center gap-1.5 text-xs text-muted">
            <FileIcon path={s.path} folder={s.folder} expanded={s.expanded} />
            {s.path}
          </span>
        ))}
      </div>
    </SettingsSection>
  );
}
