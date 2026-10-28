import { Eye, FolderOpen, RotateCcw, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { defaultLayout } from "../../../shared/layout";
import { call } from "../../lib/host";
import { updateConfig, useConfig } from "../../stores/config";
import { Badge, Button, confirmDialog, Input, Select, Spinner, Switch, Textarea } from "../../ui";
import { hiddenViews } from "../../workbench/actions";
import { updateLayout, useWorkbench, workbench } from "../../workbench/store";
import { lookForPatterns, useLearning } from "../learning/store";
import { SettingRow, SettingsSection } from "./parts";

export function LayoutSettings() {
  useWorkbench((s) => s.layout?.hidden);
  const hidden = hiddenViews();
  return (
    <SettingsSection
      title="Layout"
      description="Move views with the ⋯ menu on each view, or right-click its tab."
    >
      {hidden.length === 0 && <SettingRow label="No hidden views">{null}</SettingRow>}
      {hidden.map((view) => (
        <SettingRow key={view.id} label={view.title} description="Hidden">
          <Button size="sm" icon={Eye} onClick={() => workbench.showView(view.id)}>
            Show
          </Button>
        </SettingRow>
      ))}
      <SettingRow label="Reset layout" description="Put every view back where it started. Open tabs stay.">
        <Button
          size="sm"
          icon={RotateCcw}
          onClick={() => updateLayout((l) => ({ ...defaultLayout(), main: l.main }))}
        >
          Reset
        </Button>
      </SettingRow>
    </SettingsSection>
  );
}

function TextSetting({
  label,
  description,
  value,
  placeholder,
  onSave,
}: {
  label: string;
  description?: string;
  value: string;
  placeholder?: string;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <SettingRow label={label} description={description}>
      <Input
        value={draft}
        placeholder={placeholder}
        className="w-72"
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft.trim() !== value && onSave(draft.trim())}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    </SettingRow>
  );
}

export function EngineSettings() {
  const config = useConfig((s) => s.config);
  const info = useConfig((s) => s.info);
  if (!config) return <Spinner />;
  const e = config.engine;
  return (
    <SettingsSection
      title="Claude Code"
      description="Jig runs the official Claude Code, signed in with your own Claude account. Jig never sees your login."
    >
      <SettingRow label="Engine">
        <Badge tone={info?.engine === "fake" ? "warning" : "success"}>
          {info?.engine === "fake" ? "Fake (testing)" : "Claude Code"}
        </Badge>
      </SettingRow>
      <TextSetting
        label="Claude Code binary"
        description="Leave empty to use the Claude Code that ships with Jig, or point to your own `claude`."
        value={e.claudePath}
        placeholder="(built in)"
        onSave={(claudePath) => void updateConfig({ engine: { claudePath } })}
      />
      <TextSetting
        label="Default model"
        description="Model alias or id for new sessions (e.g. sonnet, opus). Empty = Claude Code's default."
        value={e.defaultModel}
        placeholder="(Claude Code default)"
        onSave={(defaultModel) => void updateConfig({ engine: { defaultModel } })}
      />
      <SettingRow
        label="Default permission mode"
        description="How new sessions ask before editing files or running commands."
      >
        <Select
          value={e.defaultPermissionMode}
          aria-label="Default permission mode"
          onChange={(ev) =>
            void updateConfig({
              engine: { defaultPermissionMode: ev.target.value as typeof e.defaultPermissionMode },
            })
          }
        >
          <option value="default">Ask before changes</option>
          <option value="acceptEdits">Accept edits</option>
          <option value="plan">Plan only</option>
          <option value="bypassPermissions">Don't ask (bypass)</option>
        </Select>
      </SettingRow>
      <SettingRow
        label="Allow API keys"
        description="Off: ANTHROPIC_API_KEY and ANTHROPIC_AUTH_TOKEN are removed from sessions, so usage always comes from your Claude plan. On: a key in your environment switches sessions to pay-as-you-go billing."
      >
        <Switch
          label="Allow API keys"
          checked={e.allowApiKey}
          onChange={(allowApiKey) => void updateConfig({ engine: { allowApiKey } })}
        />
      </SettingRow>
    </SettingsSection>
  );
}

export function TerminalSettings() {
  const config = useConfig((s) => s.config);
  if (!config) return <Spinner />;
  return (
    <SettingsSection title="Terminal">
      <TextSetting
        label="Shell"
        description="Empty = PowerShell on Windows, your login shell elsewhere. Examples: pwsh.exe, cmd.exe, C:\\Program Files\\Git\\bin\\bash.exe"
        value={config.terminal.shell}
        placeholder="(default)"
        onSave={(shell) => void updateConfig({ terminal: { shell } })}
      />
    </SettingsSection>
  );
}

/** Level 3: where Jig's source is and which commands check and build it. */
export function BuilderSettings() {
  const config = useConfig((s) => s.config);
  if (!config) return <Spinner />;
  const b = config.builder;
  return (
    <SettingsSection
      title="Builder"
      description="When no add-on or setting can do what you ask, the builder can change Jig's own code (level 3). It works in a git worktree of Jig's repository, runs these checks, and you try a preview instance before accepting."
    >
      <SettingRow
        label="Jig's source repository"
        description="A git clone of Jig (with AGENTS.md). Empty = the repository Jig runs from, when it runs from source."
      >
        <div className="flex items-center gap-2">
          <span className="selectable max-w-72 truncate font-mono text-xs text-muted">
            {b.sourcePath || "(the repository Jig runs from)"}
          </span>
          <Button
            size="sm"
            icon={FolderOpen}
            onClick={() =>
              void call("app.pickFolder", { title: "Jig's source repository" }).then(
                (sourcePath) => sourcePath && void updateConfig({ builder: { sourcePath } }),
              )
            }
          >
            Choose…
          </Button>
          {b.sourcePath && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void updateConfig({ builder: { sourcePath: "" } })}
            >
              Reset
            </Button>
          )}
        </div>
      </SettingRow>
      <TextSetting
        label="Check command"
        description="Must pass before you see a change."
        value={b.checkCommand}
        onSave={(checkCommand) => void updateConfig({ builder: { checkCommand } })}
      />
      <TextSetting
        label="Build command"
        value={b.buildCommand}
        onSave={(buildCommand) => void updateConfig({ builder: { buildCommand } })}
      />
      <TextSetting
        label="Install command"
        description="Run when a change touches package.json or package-lock.json."
        value={b.installCommand}
        onSave={(installCommand) => void updateConfig({ builder: { installCommand } })}
      />
    </SettingsSection>
  );
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function LearningSettings() {
  const config = useConfig((s) => s.config);
  const [exclusions, setExclusions] = useState<string>();
  if (!config) return <Spinner />;
  const l = config.learning;
  const time = `${String(l.schedule.hour).padStart(2, "0")}:${String(l.schedule.minute).padStart(2, "0")}`;
  return (
    <SettingsSection
      title="Learning"
      description="Jig records what you do on this computer only, and looks for repeated patterns when you ask or on a weekly schedule."
    >
      <SettingRow
        label="Record activity"
        description="Prompts, commands and actions, stored in ~/.jig/activity. Nothing leaves your machine."
      >
        <Switch
          label="Record activity"
          checked={l.recording}
          onChange={(recording) => void updateConfig({ learning: { recording } })}
        />
      </SettingRow>
      <SettingRow
        label="Weekly pattern run"
        description={
          l.schedule.enabled
            ? `Every ${DAYS[l.schedule.day]} at ${time}. A missed run happens at the next start.`
            : "Off"
        }
      >
        <Switch
          label="Weekly pattern run"
          checked={l.schedule.enabled}
          onChange={(enabled) => void updateConfig({ learning: { schedule: { enabled } } })}
        />
        <Select
          value={l.schedule.day}
          aria-label="Day"
          disabled={!l.schedule.enabled}
          onChange={(e) => void updateConfig({ learning: { schedule: { day: Number(e.target.value) } } })}
        >
          {DAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </Select>
        <Input
          type="time"
          value={time}
          aria-label="Time"
          disabled={!l.schedule.enabled}
          className="w-28"
          onChange={(e) => {
            const [hour, minute] = e.target.value.split(":").map(Number);
            if (hour !== undefined && minute !== undefined && !Number.isNaN(hour))
              void updateConfig({ learning: { schedule: { hour, minute } } });
          }}
        />
      </SettingRow>
      <SettingRow label="Keep activity for">
        <Select
          value={l.retentionDays}
          aria-label="Retention"
          onChange={(e) => void updateConfig({ learning: { retentionDays: Number(e.target.value) } })}
        >
          {[30, 90, 180, 365].map((d) => (
            <option key={d} value={d}>
              {d} days
            </option>
          ))}
        </Select>
      </SettingRow>
      <TextSetting
        label="Model for pattern runs"
        description="A small model keeps quota use low."
        value={l.model}
        onSave={(model) => void updateConfig({ learning: { model } })}
      />
      <LearningActions />
      <div className="flex flex-col gap-2 px-4 py-3">
        <div className="text-sm">Never record activity containing</div>
        <div className="text-xs text-muted">
          One per line: folder paths, project names, or any text (e.g. a customer name).
        </div>
        <Textarea
          rows={3}
          aria-label="Exclusions"
          value={exclusions ?? l.exclusions.join("\n")}
          onChange={(e) => setExclusions(e.target.value)}
          onBlur={() => {
            if (exclusions === undefined) return;
            void updateConfig({
              learning: {
                exclusions: exclusions
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
              },
            });
            setExclusions(undefined);
          }}
        />
      </div>
    </SettingsSection>
  );
}

function LearningActions() {
  const state = useLearning((s) => s.state);
  const info = useConfig((s) => s.info);
  return (
    <>
      <SettingRow
        label="Look for patterns now"
        description={
          state?.lastRun
            ? `Last run ${new Date(state.lastRun).toLocaleString()}. Uses one short Claude Code request only when something repeats.`
            : "Uses one short Claude Code request only when something repeats."
        }
      >
        <Button size="sm" icon={Search} busy={state?.running} onClick={() => void lookForPatterns()}>
          Look now
        </Button>
      </SettingRow>
      <SettingRow
        label="Recorded activity"
        description={
          state
            ? `${state.stats.events} events over ${state.stats.days} days (${Math.round(state.stats.bytes / 1024)} KB), only on this computer.`
            : ""
        }
      >
        <Button
          size="sm"
          icon={FolderOpen}
          onClick={() => info && void call("app.openPath", { path: `${info.jigHome}/activity` })}
        >
          Open
        </Button>
        <Button
          size="sm"
          variant="danger"
          icon={Trash2}
          data-testid="delete-activity"
          onClick={async () => {
            if (
              await confirmDialog({
                title: "Delete all recorded activity?",
                message: "Suggestions you already have stay.",
                confirmLabel: "Delete",
                danger: true,
              })
            )
              await call("learning.clearActivity");
          }}
        >
          Delete all
        </Button>
      </SettingRow>
    </>
  );
}

export function AboutSettings() {
  const info = useConfig((s) => s.info);
  if (!info) return <Spinner />;
  return (
    <SettingsSection title="About Jig">
      <SettingRow label="Version">
        <span className="text-sm text-muted">{info.version}</span>
      </SettingRow>
      <SettingRow
        label="Data folder"
        description={<span className="selectable font-mono">{info.jigHome}</span>}
      >
        <Button size="sm" icon={FolderOpen} onClick={() => void call("app.openPath", { path: info.jigHome })}>
          Open
        </Button>
      </SettingRow>
      <SettingRow label="Setup and updates" description="What Jig needs on this machine, and newer versions.">
        <Button size="sm" onClick={() => void workbench.openTab("jig.setup")} data-testid="about-setup">
          Get started…
        </Button>
      </SettingRow>
      <SettingRow label="Logs" description="The host log helps when something goes wrong.">
        <Button
          size="sm"
          icon={FolderOpen}
          onClick={() => void call("app.openPath", { path: `${info.jigHome}/logs` })}
        >
          Open logs
        </Button>
      </SettingRow>
    </SettingsSection>
  );
}
