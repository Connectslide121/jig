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
import type { CompletionSetting } from "../../../shared/completion";
import type { ModelInfo } from "../../../shared/engine";
import { BOTTOM_SPANS, DEFAULT_BOTTOM_SPAN } from "../../../shared/layout";
import type { LanguageServerInfo } from "../../../shared/lsp";
import { modelOptions } from "../../../shared/models";
import { shellName } from "../../../shared/shellNames";
import { NATURAL_VOICES, VOICE_LANGUAGES } from "../../../shared/speech";
import { call, errorMessage } from "../../lib/host";
import { updateConfig, useConfig } from "../../stores/config";
import { useChatGptStatus, useProviderModels } from "../../stores/providers";
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
import { BOTTOM_SPAN_LABELS, BottomSpanIcon } from "../../workbench/bottomSpan";
import { useProjects } from "../../workbench/projects";
import { useWorkbench, workbench } from "../../workbench/store";
import { notify } from "../../workbench/toasts";
import { openChangelog } from "../changelog";
import { openCopilotDialog } from "../completion/CopilotDialog";
import { useCompletion, watchCompletion } from "../completion/store";
import { lookForPatterns, useLearning } from "../learning/store";
import { newTerminal } from "../terminals/actions";
import { shellEntries } from "../terminals/shellEntries";
import { useShellChoices } from "../terminals/shells";
import { ChatGptModelSelect } from "./ChatGptModelSelect";
import { SegmentedSwitch, SettingRow, SettingsSection } from "./parts";

export function LayoutSettings() {
  useWorkbench((s) => s.layout?.hidden);
  const bottomSpan = useWorkbench((s) => s.layout?.bottomSpan ?? DEFAULT_BOTTOM_SPAN);
  const hidden = hiddenViews();
  return (
    <SettingsSection
      title="Layout"
      description="Move views with the ⋯ menu on each view, or right-click its tab."
    >
      <SettingRow
        label="Bottom panel width"
        description="How far it reaches under the sidebars. Sizes stay as they are."
      >
        <SegmentedSwitch
          label="Bottom panel width"
          value={bottomSpan}
          options={BOTTOM_SPANS.map((span) => ({
            id: span,
            label: BOTTOM_SPAN_LABELS[span].short,
            title: BOTTOM_SPAN_LABELS[span].label,
            leading: <BottomSpanIcon span={span} />,
          }))}
          onChange={(span) => workbench.setBottomSpan(span)}
          testId="settings-bottom-span"
        />
      </SettingRow>
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

/** One width for the completion selects, so the provider and both model rows line up. */
const COMPLETION_WIDTH = "w-80";

export function EditorSettings() {
  const config = useConfig((s) => s.config);
  const completion = useCompletion((s) => s.state);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const chatgpt = useChatGptStatus();
  const chatgptModels = useProviderModels("codex") ?? [];
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
        description="Optional: suggests code as you type; Tab takes it. Needs a GitHub account with Copilot. Used when code completion is set to GitHub Copilot."
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
        label="Code completion"
        description="Who suggests code at the caret after you pause typing. Claude and ChatGPT are slower than Copilot (about a second after the pause; the first suggestion waits while their process starts) and every suggestion uses your Claude or ChatGPT plan. Suggestions are AI-generated: check them before you accept."
      >
        <Select
          className={COMPLETION_WIDTH}
          aria-label="Code completion"
          data-testid="settings-completion-provider"
          value={e.completionProvider}
          onChange={(ev) =>
            void updateConfig({ editor: { completionProvider: ev.target.value as CompletionSetting } })
          }
        >
          <option value="copilot">GitHub Copilot</option>
          <option value="claude">Claude (uses your Claude plan)</option>
          <option value="chatgpt" disabled={!chatgpt?.ready && e.completionProvider !== "chatgpt"}>
            {chatgpt?.ready ? "ChatGPT (uses your ChatGPT plan)" : "ChatGPT (sign in first)"}
          </option>
        </Select>
      </SettingRow>
      <ModelSetting
        label="Claude model for completion"
        description="For completion with Claude. Haiku is the quickest; larger models are slower and use more of your plan."
        value={e.claudeCompletionModel}
        models={models}
        emptyLabel="Haiku (default)"
        className={COMPLETION_WIDTH}
        disabled={e.completionProvider !== "claude"}
        onSave={(claudeCompletionModel) =>
          void updateConfig({ editor: { claudeCompletionModel: claudeCompletionModel || "haiku" } })
        }
      />
      <SettingRow
        label="ChatGPT model for completion"
        description="For completion with ChatGPT. Luna is the quickest and always its newest version; pick an exact version to pin one."
      >
        <ChatGptModelSelect
          className={COMPLETION_WIDTH}
          label="ChatGPT model for completion"
          testId="settings-chatgpt-completion-model"
          value={e.chatgptCompletionModel}
          models={chatgptModels}
          disabled={e.completionProvider !== "chatgpt"}
          onSave={(chatgptCompletionModel) =>
            void updateConfig({ editor: { chatgptCompletionModel: chatgptCompletionModel || "luna" } })
          }
        />
      </SettingRow>
      <LanguageServerRows enabled={e.languageServers} />
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

/** Jig factory's own settings (D-443); the rest of the factory's settings join here in later sessions. */
export function FactorySettings() {
  const config = useConfig((s) => s.config);
  if (!config) return <Spinner center />;
  return (
    <SettingsSection title="Jig factory">
      <TextSetting
        label="Demo kit folder"
        description="The jig-demo-kit folder Jig factory builds and checks demos with (it runs the kit's npm scripts there)."
        value={config.factory.demoKitPath}
        placeholder="(not set)"
        onSave={(demoKitPath) => void updateConfig({ factory: { demoKitPath } })}
      />
      <TextSetting
        label="Design references"
        description="DESIGN.md libraries (repository addresses or folders, separated by commas) a new brand's directions are made in the spirit of, and the critic checks against."
        value={config.factory.designSources.join(", ")}
        placeholder="github.com/VoltAgent/awesome-design-md"
        onSave={(v) =>
          void updateConfig({
            factory: {
              designSources: v
                .split(/[,\n]/)
                .map((s) => s.trim())
                .filter(Boolean),
            },
          })
        }
      />
      <TextSetting
        label="E-learning server"
        description="The MCP server of your e-learning platform (its name in Claude Code's MCP list): the course outputs are created there, unpublished. Empty: courses stay Markdown files."
        value={config.factory.elearning.server}
        placeholder="(none)"
        onSave={(server) => void updateConfig({ factory: { elearning: { server } } })}
      />
      <TextSetting
        label="E-learning tools"
        description="The server's tools a course stage uses (names or a short how-to)."
        value={config.factory.elearning.tools}
        placeholder="(any)"
        onSave={(tools) => void updateConfig({ factory: { elearning: { tools } } })}
      />
      <SettingRow
        label="Stage chats at once"
        description="How many stage chats run at the same time, across all runs. More stages wait until one finishes."
      >
        <MenuButton
          entries={() =>
            [1, 2, 3, 4, 5, 6].map((n) => ({
              label: String(n),
              checked: config.factory.concurrency === n,
              onSelect: () => void updateConfig({ factory: { concurrency: n } }),
            }))
          }
          alignRight
          label="Stage chats at once"
          testId="settings-factory-concurrency"
          className="flex h-7 w-24 items-center gap-2 rounded-md border border-line-strong bg-raised px-2 text-sm text-fg hover:bg-hover"
        >
          <span className="min-w-0 flex-1 text-left tabular-nums">{config.factory.concurrency}</span>
          <ChevronDown className="size-4 shrink-0 text-muted" />
        </MenuButton>
      </SettingRow>
    </SettingsSection>
  );
}

/** A folder setting: the path (or what empty means), Choose… and Reset. */
function FolderSetting({
  label,
  description,
  value,
  empty,
  title,
  onSave,
  testId,
}: {
  label: string;
  description: string;
  value: string;
  empty: string;
  title: string;
  onSave: (path: string) => void;
  testId?: string;
}) {
  return (
    <SettingRow label={label} description={description}>
      <div className="flex items-center gap-2" data-testid={testId}>
        <span className="selectable max-w-72 truncate font-mono text-xs text-muted">{value || empty}</span>
        <Button
          size="sm"
          icon={FolderOpen}
          onClick={() => void call("app.pickFolder", { title }).then((path) => path && onSave(path))}
        >
          Choose…
        </Button>
        <Button size="sm" variant="ghost" disabled={!value} onClick={() => onSave("")}>
          Reset
        </Button>
      </div>
    </SettingRow>
  );
}

/** Motion (D-453, D-454): where FFmpeg and music are, and how new videos start. */
export function MotionSettings() {
  const config = useConfig((s) => s.config);
  if (!config) return <Spinner center />;
  const m = config.motion;
  return (
    <SettingsSection
      title="Motion"
      description="Videos made from your storyboards: teasers, what's new clips and walkthroughs (Motion in the top bar)."
    >
      <FolderSetting
        label="FFmpeg"
        description="The folder with ffmpeg and ffprobe Motion renders with. Empty = Motion's own copy (installed on the first render), then the one on your PATH."
        value={m.ffmpegPath}
        empty="(Motion's own copy, then PATH)"
        title="FFmpeg's folder"
        onSave={(ffmpegPath) => void updateConfig({ motion: { ffmpegPath } })}
        testId="settings-motion-ffmpeg"
      />
      <FolderSetting
        label="Music folder"
        description="A folder of music tracks videos can play under the voice."
        value={m.musicFolder}
        empty="(none)"
        title="Music folder"
        onSave={(musicFolder) => void updateConfig({ motion: { musicFolder } })}
      />
      <SettingRow
        label="New videos"
        description="The format new videos start with; each video can change it."
      >
        <div className="w-64">
          <SegmentedSwitch
            label="Format of new videos"
            value={m.defaultAspect}
            options={(["16:9", "1:1", "9:16", "4:5"] as const).map((id) => ({ id, label: id }))}
            onChange={(defaultAspect) => void updateConfig({ motion: { defaultAspect } })}
            testId="settings-motion-aspect"
          />
        </div>
      </SettingRow>
      <SettingRow
        label="Voice of new videos"
        description="The natural voice new videos speak their scripts with (spoken on this computer); each video can change it."
      >
        <Select
          className="w-64"
          value={m.defaultVoice}
          onChange={(e) => void updateConfig({ motion: { defaultVoice: e.target.value } })}
          data-testid="settings-motion-voice"
        >
          <option value="">No voice</option>
          {NATURAL_VOICES.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({VOICE_LANGUAGES.find((l) => l.code === v.language)?.label ?? v.language})
            </option>
          ))}
        </Select>
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
            ? `Last run ${new Date(state.lastRun).toLocaleString()}. Uses one short AI request (Settings → AI features) only when something repeats.`
            : "Uses one short AI request (Settings → AI features) only when something repeats."
        }
      >
        <Button size="sm" icon={Search} busy={state?.running} onClick={() => void lookForPatterns()}>
          Look now
        </Button>
      </SettingRow>
      <SettingRow
        label="What Jig knows about me"
        description="Your profile, notes Jig saved from chats, and the activity: read, edit or delete them."
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
      <SettingRow label="Version" description={`${info.version}: what changed in each version.`}>
        <Button size="sm" onClick={() => openChangelog(info.version)} data-testid="settings-about-changelog">
          What's new…
        </Button>
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
