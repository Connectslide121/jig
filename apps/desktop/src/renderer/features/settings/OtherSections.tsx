import {
  BrainCircuit,
  ChevronDown,
  Eye,
  FolderOpen,
  LayoutTemplate,
  Pencil,
  RotateCcw,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ModelInfo } from "../../../shared/engine";
import type { LanguageServerInfo } from "../../../shared/lsp";
import { modelOptions } from "../../../shared/models";
import { shellName } from "../../../shared/shellNames";
import { call, errorMessage } from "../../lib/host";
import { updateConfig, useConfig } from "../../stores/config";
import {
  Button,
  cn,
  confirmDialog,
  IconButton,
  Input,
  MenuButton,
  type MenuEntry,
  promptDialog,
  Select,
  Spinner,
  Switch,
  Textarea,
} from "../../ui";
import { addWorkspace, hiddenViews, openSettings, resetLayout, saveLayoutAs } from "../../workbench/actions";
import { useProjects } from "../../workbench/projects";
import { useWorkbench, workbench } from "../../workbench/store";
import { notify } from "../../workbench/toasts";
import { openCopilotDialog } from "../completion/CopilotDialog";
import { useCompletion, watchCompletion } from "../completion/store";
import { lookForPatterns, useLearning } from "../learning/store";
import { newTerminal } from "../terminals/actions";
import { shellEntries } from "../terminals/shellEntries";
import { useShellChoices } from "../terminals/shells";
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
      <SavedLayouts />
      <SettingRow label="Reset layout" description="Put every view back where it started. Open tabs stay.">
        <Button size="sm" icon={RotateCcw} onClick={() => void resetLayout()}>
          Reset
        </Button>
      </SettingRow>
    </SettingsSection>
  );
}

/** Named layouts (D-175): switch to one or delete it; save the current one. */
function SavedLayouts() {
  const saved = useWorkbench((s) => s.layout?.saved) ?? [];
  return (
    <>
      {saved.map((layout) => (
        <SettingRow key={layout.name} label={layout.name} description="Saved layout">
          <div className="flex items-center gap-2" data-testid={`saved-layout-${layout.name}`}>
            <Button size="sm" icon={LayoutTemplate} onClick={() => workbench.switchLayout(layout.name)}>
              Use
            </Button>
            <IconButton
              size="sm"
              icon={Trash2}
              label={`Delete the layout ${layout.name}`}
              onClick={async () => {
                if (
                  await confirmDialog({
                    title: `Delete the layout "${layout.name}"?`,
                    confirmLabel: "Delete",
                    danger: true,
                  })
                )
                  workbench.deleteLayout(layout.name);
              }}
            />
          </div>
        </SettingRow>
      ))}
      <SettingRow
        label="Save this layout"
        description="Where every view is, and the sizes, under a name. Open tabs aren't saved."
      >
        <Button size="sm" icon={Save} onClick={() => void saveLayoutAs()}>
          Save as…
        </Button>
      </SettingRow>
    </>
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
        onChange={(e) =>
          void updateConfig({
            projects: { repoScanDepth: Number(e.target.value) },
          })
        }
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

export function TextSetting({
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

export function ModelSetting({
  label,
  description,
  value,
  models,
  onSave,
  hybrid = false,
  emptyLabel = "Follow Claude Code",
  disabled,
  className = "w-40",
}: {
  label: string;
  description: string;
  value: string;
  models: ModelInfo[];
  onSave: (value: string) => void;
  hybrid?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
  /** The select's width; a group of rows uses one width so the selects line up. */
  className?: string;
}) {
  const choices = new Map(modelOptions(models, hybrid).map((m) => [m.id, m.label]));
  choices.set("", emptyLabel);
  if (value && !choices.has(value)) choices.set(value, `${value} (saved choice)`);
  return (
    <SettingRow label={label} description={description}>
      <Select
        className={className}
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(ev) => onSave(ev.target.value)}
      >
        {[...choices].map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </Select>
    </SettingRow>
  );
}

/** Points to Settings → AI features, where one-shot features pick their provider and model (D-297). */
export function AiFeaturesLink({ description }: { description: string }) {
  return (
    <SettingRow label="Models for AI features" description={description}>
      <Button size="sm" icon={BrainCircuit} onClick={() => openSettings("ai")}>
        AI features
      </Button>
    </SettingRow>
  );
}

/**
 * Language servers (D-259): the switch, and each server Jig knows with where it was found, or an
 * Install button that runs its install command in a terminal you can watch.
 */
function LanguageServerRows({ enabled }: { enabled: boolean }) {
  const [servers, setServers] = useState<LanguageServerInfo[]>();
  const [version, setVersion] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Check again re-reads PATH.
  useEffect(() => {
    void call("lsp.servers").then(setServers, () => setServers([]));
  }, [version]);
  return (
    <>
      <SettingRow
        label="Language servers"
        description="Errors and warnings as you type, hover, go to definition (F12), references, rename (F2) and formatting, from the language servers you install. Jig runs them for the files you open."
      >
        <Switch
          label="Language servers"
          checked={enabled}
          onChange={(languageServers) => void updateConfig({ editor: { languageServers } })}
        />
      </SettingRow>
      {/* A fixed height while it looks on PATH, so the rows below don't move. */}
      <div className="relative min-h-32 rounded-md border border-line" data-testid="settings-lsp">
        {!servers ? (
          <Spinner center />
        ) : (
          <>
            {servers.map((s) => (
              <div
                key={s.id}
                className="flex h-10 items-center gap-3 border-b border-line px-3 text-sm last:border-b-0"
                data-testid="settings-lsp-row"
              >
                <span className={cn("size-2 shrink-0 rounded-full", s.path ? "bg-success" : "bg-hint")} />
                <span className="w-48 shrink-0 truncate">{s.name}</span>
                <span
                  className="min-w-0 flex-1 truncate font-mono text-2xs text-hint"
                  title={s.path ?? s.install}
                >
                  {s.path ?? s.install}
                </span>
                <span className="flex w-28 shrink-0 justify-end">
                  {s.path ? (
                    <span className="text-xs text-muted">
                      {s.running ? `Running (${s.running})` : "Installed"}
                    </span>
                  ) : (
                    <Button size="sm" onClick={() => void newTerminal(s.install, `Install ${s.name}`)}>
                      Install…
                    </Button>
                  )}
                </span>
              </div>
            ))}
            <div className="flex h-9 items-center px-3">
              <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setVersion((n) => n + 1)}>
                Check again
              </Button>
              <span className="ml-2 text-2xs text-hint">after installing one</span>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export function EditorSettings() {
  const config = useConfig((s) => s.config);
  const completion = useCompletion((s) => s.state);
  const [models, setModels] = useState<ModelInfo[]>([]);
  useEffect(() => {
    watchCompletion();
    // The model list comes from the running Claude Code (never a list of Jig's own).
    void call("engine.models").then(setModels, () => setModels([]));
  }, []);
  if (!config) return <Spinner center />;
  const e = config.editor;
  const copilot = completion?.copilot;
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
          onChange={(event) =>
            void updateConfig({
              editor: { tabSize: Number(event.target.value) },
            })
          }
          data-testid="settings-tab-size"
        >
          {[2, 4, 8].map((n) => (
            <option key={n} value={n}>
              {n} spaces
            </option>
          ))}
        </Select>
      </SettingRow>
      <SettingRow
        label="GitHub Copilot"
        description="Optional: suggests code as you type; Tab takes it. Needs a GitHub account with Copilot. Used when completion with Claude is off."
      >
        <div className="flex items-center gap-2" data-testid="settings-copilot">
          <span className="max-w-48 truncate text-xs text-muted">
            {copilot?.signedIn
              ? `Signed in${copilot.user ? ` as ${copilot.user}` : ""}`
              : copilot?.installed
                ? "Not signed in"
                : "Not set up"}
          </span>
          {copilot?.signedIn ? (
            <Button size="sm" onClick={() => void call("completion.copilotSignOut")}>
              Sign out
            </Button>
          ) : (
            <Button size="sm" onClick={openCopilotDialog}>
              Set up…
            </Button>
          )}
        </div>
      </SettingRow>
      <SettingRow
        label="Code completion with Claude"
        description="Claude Code suggests the code instead of Copilot, after you pause typing. Slower than Copilot: about 1 second after the pause (the first suggestion takes about 5 seconds while Claude Code starts). Each suggestion uses your Claude plan."
      >
        <Switch
          label="Code completion with Claude"
          checked={e.claudeCompletion}
          onChange={(claudeCompletion) => void updateConfig({ editor: { claudeCompletion } })}
        />
      </SettingRow>
      <LanguageServerRows enabled={e.languageServers} />
      <ModelSetting
        label="Model for completion"
        description="For completion with Claude. Haiku is the quickest; larger models are slower and use more of your plan."
        value={e.claudeCompletionModel}
        models={models}
        emptyLabel="Haiku (default)"
        disabled={!e.claudeCompletion}
        onSave={(claudeCompletionModel) =>
          void updateConfig({ editor: { claudeCompletionModel: claudeCompletionModel || "haiku" } })
        }
      />
    </SettingsSection>
  );
}

export function TerminalSettings() {
  const config = useConfig((s) => s.config);
  const choices = useShellChoices();
  if (!config) return <Spinner center />;
  const current = config.terminal.shell;
  const set = (shell: string) => void updateConfig({ terminal: { shell } });
  const known = choices?.options.find((o) => o.path === current);
  const shownName = !current
    ? `Default (${choices?.defaultShell.name ?? "…"})`
    : (known?.name ?? `Custom: ${shellName(current)}`);
  const shownPath = current || choices?.defaultShell.path || "";
  const entries = (): MenuEntry[] => [
    { label: `Default (${choices?.defaultShell.name ?? "…"})`, checked: !current, onSelect: () => set("") },
    { separator: true },
    ...shellEntries(choices, set, current),
    ...(current && !known
      ? [{ label: `Custom: ${shellName(current)}`, detail: current, checked: true }]
      : []),
    { separator: true },
    {
      label: "Custom path…",
      icon: Pencil,
      onSelect: async () => {
        const path = await promptDialog({
          title: "Custom shell",
          message: "Full path of the shell's executable, e.g. C:Tools\nu.exe or /usr/local/bin/fish.",
          initial: current,
          confirmLabel: "Use this shell",
        });
        if (path) set(path);
      },
    },
  ];
  return (
    <SettingsSection title="Terminal">
      <SettingRow
        label="Shell"
        description={
          <span className="selectable block min-h-4 font-mono text-2xs" title={shownPath}>
            {shownPath}
          </span>
        }
      >
        <MenuButton
          entries={entries}
          alignRight
          label="Shell"
          testId="settings-shell"
          className="flex h-7 w-64 items-center gap-2 rounded-md border border-line-strong bg-raised px-2 text-sm text-fg hover:bg-hover"
        >
          <span className="min-w-0 flex-1 truncate text-left">{shownName}</span>
          <ChevronDown className="size-4 shrink-0 text-muted" />
        </MenuButton>
      </SettingRow>
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
              void call("app.pickFolder", {
                title: "Jig's source repository",
              }).then((sourcePath) => sourcePath && void updateConfig({ updates: { sourcePath } }))
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
          onChange={(e) =>
            void updateConfig({
              learning: { schedule: { day: Number(e.target.value) } },
            })
          }
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
          onChange={(e) =>
            void updateConfig({
              learning: { retentionDays: Number(e.target.value) },
            })
          }
        >
          {[30, 90, 180, 365].map((d) => (
            <option key={d} value={d}>
              {d} days
            </option>
          ))}
        </Select>
      </SettingRow>
      <AiFeaturesLink description="Who looks for patterns, and on which model: AI features → Weekly patterns. A small model keeps quota use low." />
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
            void updateConfig({
              learning: {
                checkIn: e.target.value as "off" | "weekly" | "biweekly",
              },
            })
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
                    notify({
                      title: "Not removed",
                      message: errorMessage(e),
                      tone: "warning",
                    }),
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
