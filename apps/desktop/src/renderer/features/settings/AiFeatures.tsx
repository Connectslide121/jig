import { LogIn } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AI_FEATURES, type AiFeature } from "../../../shared/aiFeatures";
import type { JigConfig } from "../../../shared/config";
import type { ModelInfo } from "../../../shared/engine";
import { modelName, modelOptions } from "../../../shared/models";
import {
  AI_PROVIDER_LABELS,
  type AiProvider,
  chatGptModelChoices,
  type ProviderStatus,
  resolveChatGptModel,
} from "../../../shared/providers";
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

/** The model a feature's picker shows: the saved one, else its default (ChatGPT: the feature's family). */
function shownModel(feature: AiFeature, provider: AiProvider, config: JigConfig): string {
  return config.ai[feature.id].model || (provider === "chatgpt" ? feature.chatgpt : "");
}

/**
 * The model choices for a feature on a provider. Claude: its default first, then Claude Code's models.
 * ChatGPT (D-310): the families first ("Sol (latest) · now GPT-6.1-Sol"), a divider, then the exact
 * versions for pinning one. `null` is the divider.
 */
function modelChoices(
  feature: AiFeature,
  provider: AiProvider,
  config: JigConfig,
  models: ModelInfo[],
): Array<[string, string] | null> {
  const choices: Array<[string, string] | null> = [];
  if (provider === "claude") {
    choices.push(["", `Default (${modelName(feature.fallback(config), models) || "Claude Code's"})`]);
    for (const m of modelOptions(models, false)) if (m.id) choices.push([m.id, m.label]);
  } else {
    const { families, versions } = chatGptModelChoices(models);
    for (const f of families) choices.push([f.value, f.label]);
    choices.push(null);
    for (const v of versions) choices.push([v.value, v.label]);
  }
  const saved = shownModel(feature, provider, config);
  if (saved && !choices.some((c) => c?.[0] === saved)) {
    const unknown = provider === "chatgpt" && resolveChatGptModel(saved, models).notice;
    choices.push([saved, unknown ? `${saved} (no such family: Codex's default)` : `${saved} (saved choice)`]);
  }
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
      description="Who answers Jig's one-shot AI features, and on which model. Claude runs through Claude Code on your Claude plan; ChatGPT through OpenAI's Codex CLI on your ChatGPT plan, where a family (Sol, Terra, Luna) always uses its newest version. Answers are AI-generated and can be wrong: check them before you use them."
    >
      <div className="@container" data-testid="ai-features">
        {/* Wide: one row per feature (feature · provider · model). Narrow: the pickers go under the
            feature's name, still in two aligned columns, and the header is left out. What changes with
            the width is set only through @max-xl:/@xl: variants: add-on stylesheets repeat plain
            utilities later in the same layer, and a plain one would beat the variant. */}
        <div className="items-center gap-3 border-b border-line px-4 py-2 text-xs font-medium text-muted @max-xl:hidden @xl:flex">
          <span className="min-w-0 flex-1">Feature</span>
          <span className="w-40 shrink-0">Provider</span>
          <span className="shrink-0 @max-2xl:w-52 @2xl:w-72">Model</span>
        </div>
        {AI_FEATURES.map((feature) => {
          const { provider } = config.ai[feature.id];
          const model = shownModel(feature, provider, config);
          const choices = modelChoices(feature, provider, config, models[provider]);
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
                    onChange={(ev) => {
                      const next = ev.target.value as AiProvider;
                      choose(feature, next, next === "chatgpt" ? feature.chatgpt : "");
                    }}
                  >
                    <option value="claude">{AI_PROVIDER_LABELS.claude}</option>
                    <option value="chatgpt" disabled={!chatgpt?.ready}>
                      {chatgpt?.ready ? "ChatGPT" : "ChatGPT (sign in first)"}
                    </option>
                  </Select>
                </div>
                <div className="min-w-0 @max-xl:flex-1 @xl:w-52 @2xl:w-72">
                  <Select
                    className="w-full"
                    aria-label={`${feature.label}: model`}
                    // The whole name on hover, where a narrow column cuts it off.
                    title={choices.find((c) => c?.[0] === model)?.[1]}
                    value={model}
                    onChange={(ev) => choose(feature, provider, ev.target.value)}
                  >
                    {choices.map((choice) =>
                      choice ? (
                        <option key={choice[0]} value={choice[0]}>
                          {choice[1]}
                        </option>
                      ) : (
                        // Families above, exact versions below (a native select separator).
                        <hr key="divider" />
                      ),
                    )}
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
