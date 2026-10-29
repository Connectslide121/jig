import { Eye, FolderOpen, RotateCcw, Search, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { ModelInfo } from "../../../shared/engine";
import { defaultLayout } from "../../../shared/layout";
import { call, errorMessage } from "../../lib/host";
import { updateConfig, useConfig } from "../../stores/config";
import { Badge, Button, confirmDialog, Input, Select, Spinner, Switch, Textarea } from "../../ui";
import { addWorkspace, hiddenViews } from "../../workbench/actions";
import { useProjects } from "../../workbench/projects";
import { updateLayout, useWorkbench, workbench } from "../../workbench/store";
import { notify } from "../../workbench/toasts";
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

/** How deep a workspace project (a folder of repositories) is searched for repositories. */
function WorkspaceDepthRow() {
  const depth = useConfig((s) => s.config?.projects.repoScanDepth);
  if (depth === undefined) return null;
  return (
    <SettingRow
      label="Workspace search depth"
      description="For a project that is a folder of repositories: how many folder levels Jig looks into (repos\client\api is 2)."
    >
      <Select
        value={String(depth)}
        aria-label="Workspace search depth"
        data-testid="workspace-depth"
        onChange={(e) => void updateConfig({ projects: { repoScanDepth: Number(e.target.value) } })}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            {n} {n === 1 ? "level" : "levels"}
          </option>
        ))}
      </Select>
    </SettingRow>
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
  useEffect(() => setDraft(value), [value]);
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

function ModelSetting({
  label,
  description,
  value,
  models,
  onSave,
  hybrid = false,
}: {
  label: string;
  description: string;
  value: string;
  models: ModelInfo[];
  onSave: (value: string) => void;
  hybrid?: boolean;
}) {
  const choices = new Map(models.filter((m) => m.value !== "opusplan").map((m) => [m.value, m.displayName]));
  choices.set("", "Follow Claude Code");
  if (hybrid) choices.set("opusplan", "Opus plans · Sonnet executes");
  if (value && !choices.has(value)) choices.set(value, `${value} (saved choice)`);
  return (
    <SettingRow label={label} description={description}>
      <Select className="w-64" aria-label={label} value={value} onChange={(ev) => onSave(ev.target.value)}>
        {[...choices].map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </Select>
    </SettingRow>
  );
}

export function EngineSettings() {
  const config = useConfig((s) => s.config);
  const info = useConfig((s) => s.info);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsError, setModelsError] = useState<string>();
  const [reload, setReload] = useState(0);
  const binary = config?.engine.claudePath;
  const allowApiKey = config?.engine.allowApiKey;
  // biome-ignore lint/correctness/useExhaustiveDependencies: retry and host-side engine options deliberately reload discovery.
  useEffect(() => {
    if (binary === undefined) return;
    let active = true;
    setModelsError(undefined);
    void call("engine.models").then(
      (list) => active && setModels(list),
      (error) => active && setModelsError(errorMessage(error)),
    );
    return () => {
      active = false;
    };
  }, [binary, allowApiKey, reload]);
  if (!config) return <Spinner center />;
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
      <SettingRow
        label="Recommended setup"
        description="Opus plans, Sonnet executes, Haiku tests. Applies to new chats."
      >
        <Button
          variant="primary"
          icon={Sparkles}
          onClick={() =>
            void updateConfig({
              engine: {
                defaultModel: "opusplan",
                defaultPermissionMode: "plan",
                subagentModel: "sonnet",
                helperModel: "sonnet",
                testerModel: "haiku",
              },
            })
          }
        >
          Use recommended defaults
        </Button>
      </SettingRow>
      {modelsError && (
        <SettingRow label="Couldn't load available models" description={modelsError}>
          <Button onClick={() => setReload((n) => n + 1)}>Retry</Button>
        </SettingRow>
      )}
      <ModelSetting
        label="Default model"
        description="For new chats. Project and chat selections override this."
        value={e.defaultModel}
        models={models}
        hybrid
        onSave={(defaultModel) => void updateConfig({ engine: { defaultModel } })}
      />
      <ModelSetting
        label="Helper model"
        description="For add-on questions, such as commit messages and reviews."
        value={e.helperModel}
        models={models}
        onSave={(helperModel) => void updateConfig({ engine: { helperModel } })}
      />
      <ModelSetting
        label="Subagent fallback model"
        description="For subagents without an explicit model choice."
        value={e.subagentModel}
        models={models}
        onSave={(subagentModel) => void updateConfig({ engine: { subagentModel } })}
      />
      <ModelSetting
        label="Tester model"
        description="For the browser-testing helper and Test something…."
        value={e.testerModel}
        models={models}
        onSave={(testerModel) => void updateConfig({ engine: { testerModel } })}
      />
      <div className="px-4 py-3 text-xs text-muted">
        <p>Defaults affect new chats. Smaller models save usage but cannot guarantee equal quality.</p>
        <details className="mt-2">
          <summary className="cursor-pointer text-fg">How subagent models are chosen</summary>
          <p className="mt-2">
            Claude’s choice for the invocation wins, then the agent definition, then your fallback, then the
            chat model. Built-in Explore and Plan follow Claude Code’s own rules. A forced model in your
            environment can override these choices.
          </p>
        </details>
      </div>
      <SettingRow
        label="Default permission mode"
        description="How new chats ask before editing files or running commands."
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
        label="Suggest the next message"
        description="After a turn, Claude Code proposes what you might send next (shown above the message box; Tab takes it). Nearly free: it reuses the conversation's cache."
      >
        <Switch
          label="Suggest the next message"
          checked={e.promptSuggestions}
          onChange={(promptSuggestions) => void updateConfig({ engine: { promptSuggestions } })}
        />
      </SettingRow>
      <SettingRow
        label="Desktop notifications"
        description="A system notification (and a flashing taskbar button) when a chat needs you, finishes or fails while Jig is in the background. Click it to go to the chat."
      >
        <Switch
          label="Desktop notifications"
          checked={config.notifications.desktop}
          onChange={(desktop) => void updateConfig({ notifications: { desktop } })}
        />
      </SettingRow>
      <SettingRow
        label="Show Claude's browser when it's used"
        description="Opens the Claude's browser view by itself when Claude starts browsing, so you can watch. The view only shows a picture of the page: Claude resizes the page and takes screenshots at any size whatever the view's size, and no window ever pops up. Turn it off to keep the view closed; you can open it from Tools."
      >
        <Switch
          label="Show Claude's browser when it's used"
          checked={config.browser.showWhenUsed}
          onChange={(showWhenUsed) => void updateConfig({ browser: { showWhenUsed } })}
        />
      </SettingRow>
      <SettingRow
        label="File checkpoints"
        description="Claude Code keeps a copy of each file before changing it, so you can restore files to how they were before any of your messages (the message's menu)."
      >
        <Switch
          label="File checkpoints"
          checked={e.fileCheckpoints}
          onChange={(fileCheckpoints) => void updateConfig({ engine: { fileCheckpoints } })}
        />
      </SettingRow>
      <SettingRow
        label="Allow API keys"
        description="Off: ANTHROPIC_API_KEY and ANTHROPIC_AUTH_TOKEN are removed from chats, so usage always comes from your Claude plan. On: a key in your environment switches chats to pay-as-you-go billing."
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
export function EditorSettings() {
  const config = useConfig((s) => s.config);
  if (!config) return <Spinner center />;
  const e = config.editor;
  return (
    <SettingsSection
      title="Editor"
      description="The editor for code and text files in Preview. It colours code with your theme, follows each file's own indentation and keeps its line endings."
    >
      <SettingRow label="Wrap long lines" description="Long lines wrap instead of scrolling sideways.">
        <Switch
          label="Wrap long lines"
          checked={e.wordWrap}
          onChange={(wordWrap) => void updateConfig({ editor: { wordWrap } })}
        />
      </SettingRow>
      <SettingRow
        label="Show spaces and tabs"
        description="Faint dots and arrows; spaces at the end of a line are marked."
      >
        <Switch
          label="Show spaces and tabs"
          checked={e.showWhitespace}
          onChange={(showWhitespace) => void updateConfig({ editor: { showWhitespace } })}
        />
      </SettingRow>
      <SettingRow label="Close brackets and quotes" description={`Typing ( [ { " ' adds the closing one.`}>
        <Switch
          label="Close brackets and quotes"
          checked={e.closeBrackets}
          onChange={(closeBrackets) => void updateConfig({ editor: { closeBrackets } })}
        />
      </SettingRow>
      <SettingRow
        label="Indentation for new files"
        description="Spaces per indent in a file that has no indentation yet. Other files keep their own."
      >
        <Select
          value={String(e.tabSize)}
          aria-label="Indentation for new files"
          onChange={(event) => void updateConfig({ editor: { tabSize: Number(event.target.value) } })}
          data-testid="settings-tab-size"
        >
          {[2, 4, 8].map((n) => (
            <option key={n} value={n}>
              {n} spaces
            </option>
          ))}
        </Select>
      </SettingRow>
    </SettingsSection>
  );
}

export function TerminalSettings() {
  const config = useConfig((s) => s.config);
  if (!config) return <Spinner center />;
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

/** Updates from a git clone of Jig: where it is and how it is built. */
export function UpdatesSettings() {
  const config = useConfig((s) => s.config);
  if (!config) return <Spinner center />;
  const u = config.updates;
  return (
    <SettingsSection
      title="Updates"
      description="When Jig runs from a git clone, Check for updates… pulls, builds and restarts it (Tools → Check for updates…). An installed Jig looks for new releases instead."
    >
      <SettingRow
        label="Jig's source repository"
        description="A git clone of Jig (with AGENTS.md). Empty = the repository Jig runs from, when it runs from source."
      >
        <div className="flex items-center gap-2">
          <span className="selectable max-w-72 truncate font-mono text-xs text-muted">
            {u.sourcePath || "(the repository Jig runs from)"}
          </span>
          <Button
            size="sm"
            icon={FolderOpen}
            onClick={() =>
              void call("app.pickFolder", { title: "Jig's source repository" }).then(
                (sourcePath) => sourcePath && void updateConfig({ updates: { sourcePath } }),
              )
            }
          >
            Choose…
          </Button>
          {u.sourcePath && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void updateConfig({ updates: { sourcePath: "" } })}
            >
              Reset
            </Button>
          )}
        </div>
      </SettingRow>
      <TextSetting
        label="Build command"
        value={u.buildCommand}
        onSave={(buildCommand) => void updateConfig({ updates: { buildCommand } })}
      />
      <TextSetting
        label="Install command"
        description="Run when an update touches package.json or package-lock.json."
        value={u.installCommand}
        onSave={(installCommand) => void updateConfig({ updates: { installCommand } })}
      />
    </SettingsSection>
  );
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function LearningSettings() {
  const config = useConfig((s) => s.config);
  const [exclusions, setExclusions] = useState<string>();
  if (!config) return <Spinner center />;
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
  const config = useConfig((s) => s.config);
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
        label="What Jig knows about me"
        description="Your profile, notes Claude saved from chats, and the activity: read, edit or delete them."
      >
        <Button
          size="sm"
          onClick={() => void workbench.openTab("jig.knowledge")}
          data-testid="settings-knowledge"
        >
          Open…
        </Button>
      </SettingRow>
      <SettingRow
        label="Check-in"
        description="A short chat (3–5 questions) about how you work, so suggestions fit better. Uses a little of your plan."
      >
        <Select
          className="w-40"
          value={config?.learning.checkIn ?? "off"}
          onChange={(e) =>
            void updateConfig({ learning: { checkIn: e.target.value as "off" | "weekly" | "biweekly" } })
          }
          data-testid="settings-checkin"
        >
          <option value="off">Off</option>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Every two weeks</option>
        </Select>
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
  if (!info) return <Spinner center />;
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
      <SettingRow
        label="What Jig can do"
        description="Features, extension slots, add-ons, skills and shortcuts."
      >
        <Button
          size="sm"
          onClick={() => void workbench.openTab("jig.about")}
          data-testid="settings-about-page"
        >
          Open…
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

/** The folders Jig knows (workspaces): add, look for repositories again, forget. */
export function WorkspacesSettings() {
  const workspaces = useProjects((s) => s.workspaces);
  const projects = useProjects((s) => s.projects);
  return (
    <SettingsSection
      title="Workspaces"
      description="The folders Jig knows: repositories, or folders of repositories. Projects use one as their default; chats can run in any of them. Repos lists every repository here."
    >
      {workspaces.length === 0 && <SettingRow label="No folders yet">{null}</SettingRow>}
      {workspaces.map((w) => {
        const users = projects.filter((p) => p.path === w.path).map((p) => p.name);
        return (
          <SettingRow
            key={w.id}
            label={w.name}
            description={`${w.path}${w.repos.length ? ` · ${w.repos.length} repositories` : w.isGitRepo ? " · a repository" : ""}${users.length ? ` · default of ${users.join(", ")}` : ""}${w.exists ? "" : " · folder not found"}`}
          >
            <div className="flex gap-1.5">
              {!w.isGitRepo && (
                <Button
                  size="sm"
                  icon={Search}
                  onClick={() => void call("projects.rescanRepos", { id: w.id })}
                >
                  Look again
                </Button>
              )}
              <Button
                size="sm"
                icon={Trash2}
                variant="ghost"
                data-testid={`workspace-remove-${w.name}`}
                onClick={() =>
                  void call("workspaces.remove", { id: w.id }).catch((e) =>
                    notify({ title: "Not removed", message: errorMessage(e), tone: "warning" }),
                  )
                }
              >
                Forget
              </Button>
            </div>
          </SettingRow>
        );
      })}
      <SettingRow label="Add a folder" description="A repository, or a folder with repositories inside.">
        <Button
          size="sm"
          icon={FolderOpen}
          onClick={() => void addWorkspace()}
          data-testid="settings-workspace-add"
        >
          Add folder…
        </Button>
      </SettingRow>
      <WorkspaceDepthRow />
    </SettingsSection>
  );
}
