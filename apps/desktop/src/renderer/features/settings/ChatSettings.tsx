import { LogIn, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import type { ChatProvider, ModelInfo } from "../../../shared/engine";
import { CODEX_EFFORT_LEVELS, PERMISSION_MODE_LABELS, PERMISSION_MODES } from "../../../shared/engine";
import { chatGptModelChoices, resolveChatGptModel } from "../../../shared/providers";
import { call, errorMessage } from "../../lib/host";
import { updateConfig, useConfig } from "../../stores/config";
import { useChatGptStatus, useProviderModels } from "../../stores/providers";
import { Badge, Button, Select, Spinner, Switch } from "../../ui";
import { workbench } from "../../workbench/store";
import { ProviderMark } from "../usage/ProviderMark";
import { AiFeaturesLink, ModelSetting, TextSetting } from "./OtherSections";
import { SegmentedSwitch, SettingRow, SettingsGroup, SettingsSection } from "./parts";

/** One width for every picker in the groups, so their right edges and texts line up. */
const PICKER = "w-64";

/** The group that new chats run on gets this badge at the far right of its header. */
const DefaultBadge = () => (
  <Badge tone="accent" className="uppercase">
    <span data-testid="settings-default-badge">Default</span>
  </Badge>
);

/**
 * Settings → Chats (D-314): which provider new chats run on, then one fixed group per provider (both
 * always shown, so switching never reshapes the page), then what applies to every chat. A chat keeps
 * its provider for life (D-309); projects and the new-chat picker can choose the other one.
 */
export function ChatSettings() {
  const config = useConfig((s) => s.config);
  const chatgpt = useChatGptStatus();
  if (!config) return <Spinner center />;
  const e = config.engine;
  const provider = e.provider;
  const setProvider = (next: ChatProvider) => void updateConfig({ engine: { provider: next } });
  return (
    <div className="flex flex-col gap-4">
      <SettingsSection
        title="Chats"
        description="Each chat runs on Claude (Claude Code) or ChatGPT (OpenAI's Codex), signed in with your own account. You choose when the chat starts, and it stays on that one for its whole life. Jig never sees your logins."
      >
        <SettingRow
          label="New chats run on"
          description="A project can choose the other one in its settings, and a new chat beside its model picker."
        >
          <SegmentedSwitch
            label="New chats run on"
            testId="settings-chat-provider"
            value={provider}
            onChange={setProvider}
            options={[
              { id: "claude", label: "Claude", leading: <ProviderMark provider="claude" iconOnly /> },
              {
                id: "codex",
                label: "ChatGPT",
                leading: <ProviderMark provider="codex" iconOnly />,
                // Signed out: it can't be picked, but stays picked if it already was.
                disabled: provider !== "codex" && chatgpt?.ready !== true,
                title: chatgpt?.ready === false ? chatgpt.detail : undefined,
              },
            ]}
          />
        </SettingRow>
      </SettingsSection>
      <ClaudeChats isDefault={provider === "claude"} />
      <ChatGptChats isDefault={provider === "codex"} />
      <AllChats />
    </div>
  );
}

function ClaudeChats({ isDefault }: { isDefault: boolean }) {
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
  if (!config) return null;
  const e = config.engine;
  return (
    <SettingsGroup
      title="Claude chats"
      description="The official Claude Code, with your Claude plan."
      leading={<ProviderMark provider="claude" iconOnly />}
      badge={isDefault && <DefaultBadge />}
      testId="settings-claude-chats"
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
        description="Opus works, Sonnet helps, Haiku searches and tests. Applies to new chats."
      >
        <Button
          variant="primary"
          icon={Sparkles}
          onClick={() =>
            void updateConfig({
              engine: {
                defaultModel: "opus",
                defaultPermissionMode: "plan",
                subagentModel: "sonnet",
                helperModel: "sonnet",
                quickModel: "haiku",
                testerModel: "haiku",
                searchModel: "haiku",
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
        description="For new Claude chats. Project and chat selections override this."
        value={e.defaultModel}
        models={models}
        className={PICKER}
        hybrid
        onSave={(defaultModel) => void updateConfig({ engine: { defaultModel } })}
      />
      <ModelSetting
        label="Subagent fallback model"
        description="For subagents without an explicit model choice."
        value={e.subagentModel}
        models={models}
        className={PICKER}
        onSave={(subagentModel) => void updateConfig({ engine: { subagentModel } })}
      />
      <ModelSetting
        label="Tester model"
        description="For the browser-testing helper and Test something…."
        value={e.testerModel}
        models={models}
        className={PICKER}
        onSave={(testerModel) => void updateConfig({ engine: { testerModel } })}
      />
      <ModelSetting
        label="Search model"
        description="For code searches the chat hands to its search helper, so the chat's model doesn't read through files itself."
        value={e.searchModel}
        models={models}
        className={PICKER}
        emptyLabel="Off (the chat searches itself)"
        onSave={(searchModel) => void updateConfig({ engine: { searchModel } })}
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
        label="claude.ai connectors"
        description="The connectors of your claude.ai account (Asana, Notion, Linear, Microsoft 365…). Off: none are loaded into chats, so none is flagged as needing sign-in. The MCP servers in your own Claude Code settings are not affected. Applies to new chats."
      >
        <Switch
          label="claude.ai connectors"
          checked={e.claudeAiConnectors}
          onChange={(claudeAiConnectors) => void updateConfig({ engine: { claudeAiConnectors } })}
        />
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
    </SettingsGroup>
  );
}

/** The ChatGPT model picker (D-310): the families first, a divider, then the exact versions. */
function chatGptChoices(models: ModelInfo[], saved: string): Array<[string, string] | null> {
  const { families, versions } = chatGptModelChoices(models);
  const choices: Array<[string, string] | null> = [
    ...families.map((f): [string, string] => [f.value, f.label]),
    null,
    ...versions.map((v): [string, string] => [v.value, v.label]),
  ];
  if (saved && !choices.some((c) => c?.[0] === saved)) {
    const unknown = resolveChatGptModel(saved, models).notice;
    choices.push([saved, unknown ? `${saved} (no such family: Codex's default)` : `${saved} (saved choice)`]);
  }
  return choices;
}

function ChatGptChats({ isDefault }: { isDefault: boolean }) {
  const config = useConfig((s) => s.config);
  const chatgpt = useChatGptStatus();
  const models = useProviderModels("codex") ?? [];
  if (!config) return null;
  const e = config.engine;
  return (
    <SettingsGroup
      title="ChatGPT chats"
      description="OpenAI's Codex, with your ChatGPT plan. No subagents: tester and search stay with Claude."
      leading={<ProviderMark provider="codex" iconOnly />}
      badge={isDefault && <DefaultBadge />}
      testId="settings-chatgpt-chats"
    >
      {/* The same row whatever the status: a badge or Get started in one slot, nothing below moves. */}
      <SettingRow label="ChatGPT account" description={chatgpt ? chatgpt.detail : "Asking the Codex CLI…"}>
        {chatgpt?.ready ? (
          <Badge tone="success">Signed in</Badge>
        ) : (
          <Button
            size="sm"
            icon={LogIn}
            disabled={!chatgpt}
            data-testid="settings-chatgpt-get-started"
            onClick={() => void workbench.openTab("jig.setup")}
          >
            Get started
          </Button>
        )}
      </SettingRow>
      <SettingRow
        label="Default model"
        description="For new ChatGPT chats. A family always runs on its newest version; pick a version to pin it."
      >
        <Select
          className={PICKER}
          aria-label="Default ChatGPT model"
          data-testid="settings-codex-model"
          value={e.codexModel}
          onChange={(ev) => void updateConfig({ engine: { codexModel: ev.target.value } })}
        >
          {chatGptChoices(models, e.codexModel).map((c, i) =>
            c ? (
              <option key={c[0]} value={c[0]}>
                {c[1]}
              </option>
            ) : (
              <hr key={`divider-${i}`} />
            ),
          )}
        </Select>
      </SettingRow>
      <SettingRow
        label="Reasoning effort"
        description="How hard new ChatGPT chats think. A chat can change it."
      >
        <Select
          className={PICKER}
          aria-label="ChatGPT reasoning effort"
          data-testid="settings-codex-effort"
          value={e.codexEffort}
          onChange={(ev) =>
            void updateConfig({ engine: { codexEffort: ev.target.value as typeof e.codexEffort } })
          }
        >
          <option value="">Model's default</option>
          {CODEX_EFFORT_LEVELS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </Select>
      </SettingRow>
      <SettingRow
        label="Your personal instructions"
        description="ChatGPT chats follow the same personal instructions as Claude: ~/.claude/CLAUDE.md with the files it imports. Off: Codex uses its own ~/.codex/AGENTS.md."
      >
        <Switch
          label="Your personal instructions"
          checked={e.codexInstructions === "claude"}
          onChange={(on) => void updateConfig({ engine: { codexInstructions: on ? "claude" : "off" } })}
        />
      </SettingRow>
      <SettingRow
        label="Claude Code's skills"
        description="ChatGPT chats can use the skills Claude chats have: .claude/skills in the project and in your home folder, and Jig's built-in skills, besides Codex's own .agents/skills. Nothing is copied. Off: only Codex's own skills."
      >
        <Switch
          label="Claude Code's skills"
          checked={e.codexSkills === "claude"}
          onChange={(on) => void updateConfig({ engine: { codexSkills: on ? "claude" : "off" } })}
        />
      </SettingRow>
      <TextSetting
        label="Codex binary"
        description="Leave empty to use the `codex` on your PATH, or point to your own."
        value={e.codexPath}
        placeholder="(from PATH)"
        onSave={(codexPath) => void updateConfig({ engine: { codexPath } })}
      />
      <SettingRow
        label="Allow API keys"
        description="Off: OPENAI_API_KEY and CODEX_API_KEY are removed from ChatGPT chats, so usage always comes from your ChatGPT plan. On: a key in your environment switches them to pay-as-you-go billing."
      >
        <Switch
          label="Allow OpenAI API keys"
          checked={e.codexAllowApiKey}
          onChange={(codexAllowApiKey) => void updateConfig({ engine: { codexAllowApiKey } })}
        />
      </SettingRow>
    </SettingsGroup>
  );
}

/** What applies to every chat, whoever runs it. */
function AllChats() {
  const config = useConfig((s) => s.config);
  if (!config) return null;
  const e = config.engine;
  return (
    <SettingsGroup title="All chats" testId="settings-all-chats">
      <SettingRow
        label="Default permission mode"
        description="How new chats ask before editing files or running commands. ChatGPT chats have no Plan only: they ask before changes instead."
      >
        <Select
          className={PICKER}
          value={e.defaultPermissionMode}
          aria-label="Default permission mode"
          onChange={(ev) =>
            void updateConfig({
              engine: { defaultPermissionMode: ev.target.value as typeof e.defaultPermissionMode },
            })
          }
        >
          {PERMISSION_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode === "bypassPermissions" ? "Don't ask (bypass)" : PERMISSION_MODE_LABELS[mode]}
            </option>
          ))}
        </Select>
      </SettingRow>
      <SettingRow
        label="Name new chats"
        description="An AI model gives each new chat a short name from its first message (pick which in AI features → Chat names). Until it answers, the chat is called by the message's first words; renaming a chat yourself always wins."
      >
        <Switch
          label="Name new chats"
          checked={e.aiTitles}
          onChange={(aiTitles) => void updateConfig({ engine: { aiTitles } })}
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
        label="Show Claude’s browser when it's used"
        description="Opens the browser view by itself when Claude starts browsing, so you can watch. The view only shows a picture of the page: Claude resizes the page and takes screenshots at any size whatever the view's size, and no window ever pops up. Turn it off to keep the view closed; you can open it from Tools."
      >
        <Switch
          label="Show Claude’s browser when it's used"
          checked={config.browser.showWhenUsed}
          onChange={(showWhenUsed) => void updateConfig({ browser: { showWhenUsed } })}
        />
      </SettingRow>
      <SettingRow
        label="Chats’ pages in Claude’s browser"
        description="Each chat that browses has its own page. Shared: the pages share cookies and logins, so you sign in to your dev server once, and a logout in one chat logs out the others. Separate: each page has its own, gone when the page closes. Applies to pages opened from now on."
      >
        <SegmentedSwitch
          label="Chats’ pages in Claude’s browser"
          testId="settings-browser-sessions"
          value={config.browser.pageSessions}
          onChange={(pageSessions) => void updateConfig({ browser: { pageSessions } })}
          options={[
            { id: "shared", label: "Shared logins" },
            { id: "separate", label: "Separate" },
          ]}
        />
      </SettingRow>
      <AiFeaturesLink description="Commit messages, checks, tours, chat names and add-ons' questions each pick Claude or ChatGPT and a model there, whatever runs your chats." />
    </SettingsGroup>
  );
}
