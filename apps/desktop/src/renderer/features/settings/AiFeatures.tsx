import { LogIn } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AI_FEATURES, type AiFeature } from "../../../shared/aiFeatures";
import type { JigConfig } from "../../../shared/config";
import type { ModelInfo } from "../../../shared/engine";
import { modelName, modelOptions } from "../../../shared/models";
import { AI_PROVIDER_LABELS, type AiProvider, type ProviderStatus } from "../../../shared/providers";
import { call, useHostEvent } from "../../lib/host";
import { updateConfig, useConfig } from "../../stores/config";
import { Button, Select, Spinner } from "../../ui";
import { workbench } from "../../workbench/store";
import { SettingsSection } from "./parts";

/** The models each provider offers, loaded once when the section opens. */
function useProviderModels(): Record<AiProvider, ModelInfo[]> {
  const [models, setModels] = useState<Record<AiProvider, ModelInfo[]>>({ claude: [], chatgpt: [] });
  useEffect(() => {
    let active = true;
    for (const provider of ["claude", "chatgpt"] as const)
      void call("ai.models", { provider }).then(
        (list) => active && setModels((m) => ({ ...m, [provider]: list })),
        () => {},
      );
    return () => {
      active = false;
    };
  }, []);
  return models;
}

/** Whether ChatGPT can answer (the Codex CLI installed and signed in); asked again after a sign-in. */
function useChatGptStatus(): ProviderStatus | undefined {
  const [status, setStatus] = useState<ProviderStatus>();
  const load = useCallback(() => {
    void call("ai.providers").then(
      (list) => setStatus(list.find((p) => p.provider === "chatgpt")),
      () => setStatus({ provider: "chatgpt", ready: false, detail: "Couldn't ask the Codex CLI." }),
    );
  }, []);
  useEffect(() => load(), [load]);
  useHostEvent("codex.signIn", () => load());
  return status;
}

/** The model choices for a feature on a provider: its default first, then the provider's models. */
function modelChoices(
  feature: AiFeature,
  provider: AiProvider,
  config: JigConfig,
  models: ModelInfo[],
): Array<[string, string]> {
  const fallback = feature.fallback(config);
  const choices: Array<[string, string]> =
    provider === "claude"
      ? [
          ["", `Default (${modelName(fallback, models) || "Claude Code's"})`],
          ...modelOptions(models, false)
            .filter((m) => m.id)
            .map((m): [string, string] => [m.id, m.label]),
        ]
      : [["", "Codex's default"], ...models.map((m): [string, string] => [m.value, m.displayName])];
  const saved = config.ai[feature.id].model;
  if (saved && !choices.some(([id]) => id === saved)) choices.push([saved, `${saved} (saved choice)`]);
  return choices;
}

/**
 * Settings → AI features (D-297): for each of Jig's simple AI features, who answers (Claude through
 * Claude Code, or ChatGPT through OpenAI's Codex CLI) and on which model. One table with fixed columns
 * (feature · provider · model), so rows line up and nothing moves when a choice changes.
 */
export function AiFeaturesSettings() {
  const config = useConfig((s) => s.config);
  const models = useProviderModels();
  const chatgpt = useChatGptStatus();
  if (!config) return <Spinner center />;
  const choose = (feature: AiFeature, provider: AiProvider, model: string) =>
    void updateConfig({ ai: { [feature.id]: { provider, model } } });
  return (
    <SettingsSection
      title="AI features"
      description="Who answers Jig's one-shot AI features, and on which model. Claude runs through Claude Code on your Claude plan; ChatGPT through OpenAI's Codex CLI on your ChatGPT plan. Chats always run on Claude Code. Answers are AI-generated and can be wrong: check them before you use them."
    >
      <div className="@container" data-testid="ai-features">
        {/* Wide: one row per feature (feature · provider · model). Narrow: the pickers go under the
            feature's name, still in two aligned columns, and the header is left out. What changes with
            the width is set only through @max-xl:/@xl: variants: add-on stylesheets repeat plain
            utilities later in the same layer, and a plain one would beat the variant. */}
        <div className="items-center gap-3 border-b border-line px-4 py-2 text-xs font-medium text-muted @max-xl:hidden @xl:flex">
          <span className="min-w-0 flex-1">Feature</span>
          <span className="w-40 shrink-0">Provider</span>
          <span className="w-52 shrink-0">Model</span>
        </div>
        {AI_FEATURES.map((feature) => {
          const { provider } = config.ai[feature.id];
          return (
            <div
              key={feature.id}
              className="flex border-b border-line px-4 py-2 @max-xl:flex-col @max-xl:gap-2 @xl:items-center @xl:gap-3"
              data-testid={`ai-feature-${feature.id}`}
            >
              <div className="min-w-0 @xl:flex-1">
                <div className="truncate text-sm text-fg">{feature.label}</div>
                <div className="truncate text-xs text-muted">{feature.where}</div>
              </div>
              <div className="flex gap-3">
                <div className="@max-xl:w-32 @xl:w-40">
                  <Select
                    className="w-full"
                    aria-label={`${feature.label}: provider`}
                    value={provider}
                    onChange={(ev) => choose(feature, ev.target.value as AiProvider, "")}
                  >
                    <option value="claude">{AI_PROVIDER_LABELS.claude}</option>
                    <option value="chatgpt" disabled={!chatgpt?.ready}>
                      {chatgpt?.ready ? "ChatGPT" : "ChatGPT (sign in first)"}
                    </option>
                  </Select>
                </div>
                <div className="min-w-0 @max-xl:flex-1 @xl:w-52">
                  <Select
                    className="w-full"
                    aria-label={`${feature.label}: model`}
                    value={config.ai[feature.id].model}
                    onChange={(ev) => choose(feature, provider, ev.target.value)}
                  >
                    {modelChoices(feature, provider, config, models[provider]).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>
          );
        })}
        {/* A fixed height, so the table never moves when the ChatGPT status arrives or changes. */}
        <div className="flex h-14 items-center gap-3 px-4 text-xs text-muted">
          <span className="line-clamp-2 min-w-0 flex-1" data-testid="ai-chatgpt-status">
            {chatgpt === undefined
              ? "Checking ChatGPT…"
              : chatgpt.ready
                ? `ChatGPT: ${chatgpt.detail}`
                : `ChatGPT isn't available. ${chatgpt.detail} Set up OpenAI's Codex CLI from Get started to use it.`}
          </span>
          {chatgpt && !chatgpt.ready && (
            <Button size="sm" icon={LogIn} onClick={() => void workbench.openTab("jig.setup")}>
              Get started
            </Button>
          )}
        </div>
      </div>
    </SettingsSection>
  );
}
