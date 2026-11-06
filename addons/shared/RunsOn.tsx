import type { AddonUiContext, MenuInput } from "@jig/sdk";
import { cn, ProviderMark, useChatGptReady } from "@jig/sdk/ui";
import { ChevronDown } from "lucide-react";
import {
  modelShort,
  PROVIDER_LABEL,
  type ProviderChoice,
  providerOfModel,
  type RunsOnSource,
  runsOnShort,
  runsOnText,
  TASK_MODELS,
  TASK_PROVIDERS,
  type TaskProvider,
} from "./providers";

/**
 * Who runs a queue's or a task's chats (D-330), or a workflow's AI step: a compact button with the
 * provider's mark that opens a menu through Jig's menus. The default entry (the project's, or the queue's choice) shows the mark it
 * stands for; ChatGPT is greyed out with "Sign in on Get Started" while Codex isn't signed in.
 */

/** Where a provider came from, in a few words ("the queue's", "the project's default"). */
export const SOURCE_TEXT: Record<RunsOnSource, string> = {
  task: "this task's",
  queue: "the queue's",
  project: "the project's default",
  chat: "the chat it continues",
  ran: "its chat's",
  step: "this step's",
};

export { modelShort, type ProviderChoice, runsOnShort, runsOnText } from "./providers";

/** What the button shows: the provider and model it runs on now, and where that came from. */
export interface ShownRunsOn {
  provider: TaskProvider;
  model?: string;
  from: RunsOnSource;
}

/**
 * The entries: the default (`fallback` and `fallbackModel`: what it stands for), Claude and ChatGPT;
 * with `models`, each provider opens its models ("Default model", then the families) beside it. A
 * task's provider without a model of its own takes the queue's model when it's that provider's
 * (D-408), so that provider's first entry names it ("Queue's model · Opus").
 */
export function providerEntries({
  ctx,
  chatgptReady,
  value,
  fallback,
  fallbackModel,
  defaultLabel,
  models,
  testPrefix = "tasks",
  onPick,
}: {
  ctx: AddonUiContext;
  chatgptReady: boolean;
  value: ProviderChoice;
  fallback: TaskProvider;
  fallbackModel?: string;
  defaultLabel: string;
  models: boolean;
  /** The menu entries' test ids start with it (`tasks-runs-on-claude`). */
  testPrefix?: string;
  onPick: (choice: ProviderChoice) => void;
}): MenuInput[] {
  const defaultModel = (provider: TaskProvider) =>
    fallbackModel && providerOfModel(fallbackModel) === provider
      ? `Queue's model · ${modelShort(fallbackModel)}`
      : "Default model";
  const providerEntry = (provider: TaskProvider): MenuInput => {
    const off = provider === "chatgpt" && !chatgptReady;
    const checked = value.provider === provider;
    return {
      label: PROVIDER_LABEL[provider],
      provider,
      checked,
      disabled: off,
      detail: off ? "Sign in on Get Started" : undefined,
      testId: `${testPrefix}-runs-on-${provider}`,
      // A greyed-out entry gets no models either: Jig's menus open a submenu on hover regardless.
      ...(off
        ? {}
        : models
          ? {
              submenu: [
                {
                  label: defaultModel(provider),
                  checked: checked && !value.model,
                  testId: `${testPrefix}-model-${provider}-default`,
                  onSelect: () => onPick({ provider }),
                },
                ...TASK_MODELS[provider].map((m) => ({
                  label: m.label,
                  checked: checked && value.model === m.value,
                  testId: `${testPrefix}-model-${m.value}`,
                  onSelect: () => onPick({ provider, model: m.value }),
                })),
              ],
            }
          : { onSelect: () => onPick({ provider }) }),
    };
  };
  return [
    { heading: "Runs on" },
    {
      label: `${defaultLabel} (${runsOnShort({ provider: fallback, model: fallbackModel })})`,
      provider: fallback,
      checked: !value.provider,
      testId: `${testPrefix}-runs-on-default`,
      onSelect: () => onPick({}),
    },
    { separator: true },
    ...TASK_PROVIDERS.map(providerEntry),
    ...(chatgptReady
      ? []
      : [
          { separator: true } as const,
          {
            label: "Sign in to ChatGPT on Get Started…",
            icon: "log-in",
            testId: `${testPrefix}-runs-on-get-started`,
            onSelect: () => ctx.openGetStarted(),
          },
        ]),
  ];
}

/**
 * The button: the effective provider's mark, then (when `label`) what it says, and a chevron. A fixed
 * width (`className`) keeps everything beside it in place whatever it says. Disabled, it explains why
 * in its tooltip (a task that continues a chat).
 */
export function RunsOnButton({
  ctx,
  value,
  shown,
  fallback,
  fallbackModel,
  defaultLabel,
  models,
  label,
  disabledReason,
  className,
  labelClassName,
  testId,
  testPrefix,
  onPick,
}: {
  ctx: AddonUiContext;
  value: ProviderChoice;
  /** What it runs on now (the choice, else the default). */
  shown: ShownRunsOn;
  fallback: TaskProvider;
  /** The default's model (the queue's, D-408). */
  fallbackModel?: string;
  defaultLabel: string;
  models: boolean;
  /** The words after the mark; none shows the provider's name. */
  label?: string;
  disabledReason?: string;
  className?: string;
  /** E.g. hide the words in a narrow container (the mark stays). */
  labelClassName?: string;
  testId: string;
  testPrefix?: string;
  onPick: (choice: ProviderChoice) => void;
}) {
  const chatgpt = useChatGptReady();
  const text = label ?? runsOnShort(shown);
  const title = disabledReason
    ? `Runs on ${runsOnText(shown)}: ${disabledReason}`
    : `Runs on ${runsOnText(shown)} (${SOURCE_TEXT[shown.from]}): choose Claude or ChatGPT${models ? " and a model" : ""}`;
  return (
    <button
      type="button"
      data-testid={testId}
      aria-disabled={!!disabledReason}
      aria-label={title}
      title={title}
      className={cn(
        "flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-line px-2 text-xs text-fg",
        disabledReason ? "cursor-default opacity-60" : "hover:bg-hover",
        className,
      )}
      onClick={(e) => {
        if (disabledReason) return;
        ctx.menu(
          providerEntries({
            ctx,
            chatgptReady: chatgpt?.ready === true,
            value,
            fallback,
            fallbackModel,
            defaultLabel,
            models,
            testPrefix,
            onPick,
          }),
          e.currentTarget,
        );
      }}
    >
      <ProviderMark provider={shown.provider} iconOnly />
      <span className={cn("min-w-0 flex-1 truncate text-left", labelClassName)}>{text}</span>
      {!disabledReason && <ChevronDown className="size-3.5 shrink-0 text-muted" />}
    </button>
  );
}
