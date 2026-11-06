/**
 * Jig's simple AI features (one text in, one text out) and which provider and model each runs on
 * (D-297). Settings → AI features lists them in this order. A feature's `config.ai.<id>` holds the
 * provider and the model; an empty model means the model the feature used before this setting
 * existed (`fallback`), so nothing changes until you pick one, and on ChatGPT the feature's family
 * (`chatgpt`, D-310). Documented in docs/reference/engine.md.
 */
import type { JigConfig } from "./config";
import type { AiProvider, AiProviderSetting, ChatGptFamily } from "./providers";

export interface AiFeature {
  id: AiFeatureId;
  label: string;
  /** Where it shows, in a few words. */
  where: string;
  /** The model it uses with Claude when none is picked: the setting it used before. */
  fallback: (config: JigConfig) => string;
  /** Its ChatGPT family when none is picked, matching the Claude tier (haiku → luna, sonnet → terra,
   * opus → sol; D-310). */
  chatgpt: ChatGptFamily;
  /** It asks for JSON: Jig checks the answer and says so when it doesn't parse. */
  json?: boolean;
  /** The provider it runs on until you pick one (default Claude; `default` follows your chats). */
  provider?: AiProviderSetting;
  /**
   * Settings offers "Default (follows your chat provider)" for it (D-424): it runs on whoever runs
   * your chats (`engine.provider`), on the feature's default model there.
   */
  followsChat?: boolean;
  /** Said beside where it shows, always: what it sends (the meeting's transcript…). */
  sends?: string;
  /** Said beside it in Settings while ChatGPT is picked: how it does worse there. */
  chatgptNote?: string;
}

export const AI_FEATURE_IDS = [
  "commitMessage",
  "commitCheck",
  "releaseNotes",
  "tour",
  "attemptsJudge",
  "standup",
  "taskRunReport",
  "chatTitles",
  "chatSuggestions",
  "learning",
  "meetingTranslation",
  "meetingNotes",
  "taskQueueReorganize",
  "addonQuick",
  "addonHelper",
] as const;
export type AiFeatureId = (typeof AI_FEATURE_IDS)[number];

const quick = (c: JigConfig) => c.engine.quickModel;
const helper = (c: JigConfig) => c.engine.helperModel;
const chat = (c: JigConfig) => c.engine.defaultModel;

export const AI_FEATURES: AiFeature[] = [
  {
    id: "commitMessage",
    label: "Commit message",
    where: "Git → Write message",
    fallback: quick,
    chatgpt: "luna",
  },
  {
    id: "commitCheck",
    label: "Check before committing",
    where: "Git → Check changes",
    fallback: helper,
    chatgpt: "terra",
  },
  {
    id: "releaseNotes",
    label: "Release notes draft",
    where: "Releases → Draft",
    fallback: helper,
    chatgpt: "terra",
  },
  {
    id: "tour",
    label: "Tour of changes",
    where: "Git → Walk me through",
    fallback: chat,
    chatgpt: "sol",
    json: true,
  },
  {
    id: "attemptsJudge",
    label: "Compare attempts",
    where: "Parallel attempts",
    fallback: chat,
    chatgpt: "sol",
    json: true,
  },
  { id: "standup", label: "Standup", where: "Tools → Standup", fallback: chat, chatgpt: "sol" },
  {
    // Made only when you ask, from a finished run in Tasks → History (D-355).
    id: "taskRunReport",
    label: "Task run report",
    where: "Tasks → History",
    fallback: chat,
    chatgpt: "sol",
    json: true,
  },
  { id: "chatTitles", label: "Chat names", where: "New chats", fallback: quick, chatgpt: "luna" },
  {
    // Claude chats get Claude Code's own suggestion; Codex has none, so Jig asks after each turn (D-315).
    id: "chatSuggestions",
    label: "Next-message suggestions",
    where: "ChatGPT chats",
    fallback: quick,
    chatgpt: "luna",
    provider: "chatgpt",
  },
  {
    id: "learning",
    label: "Weekly patterns",
    where: "Learning",
    fallback: (c) => c.learning.model,
    chatgpt: "luna",
  },
  {
    id: "meetingTranslation",
    label: "Caption translation",
    where: "Meetings",
    fallback: (c) => c.meetings.translationModel,
    chatgpt: "luna",
    // The model needs ~5 s per batch even on a warm Codex process, so live captions wait longer (D-384, D-402).
    chatgptNote: "Slower with ChatGPT: more lines are skipped to keep up. Claude keeps up better",
  },
  {
    // Made only when you click Generate notes, silently, as structured JSON (D-424). Meetings run
    // long, so it needs a model that keeps up with a long transcript (Jon: Sonnet / Terra).
    id: "meetingNotes",
    label: "Meeting notes",
    where: "Meetings → Generate notes",
    fallback: helper,
    chatgpt: "terra",
    json: true,
    provider: "default",
    followsChat: true,
    sends: "Sends the meeting's transcript to the chosen provider",
  },
  {
    id: "taskQueueReorganize",
    label: "Reorganize the task queue",
    where: "Tasks → Reorganize",
    fallback: quick,
    chatgpt: "luna",
    json: true,
  },
  {
    id: "addonQuick",
    label: "Add-ons: short answers",
    where: "Other add-ons",
    fallback: quick,
    chatgpt: "luna",
  },
  {
    id: "addonHelper",
    label: "Add-ons: other questions",
    where: "Other add-ons",
    fallback: helper,
    chatgpt: "terra",
  },
];

/** Features an add-on may name in `ctx.ai.ask({ feature })`: the built-in add-ons' own rows. */
export const ADDON_AI_FEATURES = [
  "commitMessage",
  "commitCheck",
  "releaseNotes",
  "taskRunReport",
  "taskQueueReorganize",
] as const;
export type AddonAiFeature = (typeof ADDON_AI_FEATURES)[number];

export function aiFeature(id: AiFeatureId): AiFeature {
  return AI_FEATURES.find((f) => f.id === id)!;
}

/**
 * The provider and model a feature runs on. Claude without a picked model: the feature's old
 * setting. ChatGPT without one: the feature's family (`sol`, `terra`, `luna`), which `oneShot`
 * resolves to that family's newest model when it runs (D-310).
 */
export function aiChoice(config: JigConfig, id: AiFeatureId): { provider: AiProvider; model: string } {
  const choice = config.ai[id];
  const feature = aiFeature(id);
  // Following the chats (D-424): their provider, on the feature's default model there; a model picked
  // for one provider never goes to the other.
  if (choice.provider === "default") {
    const provider = chatProviderAi(config);
    return { provider, model: provider === "claude" ? feature.fallback(config) : feature.chatgpt };
  }
  const provider = choice.provider;
  const model = choice.model || (provider === "claude" ? feature.fallback(config) : feature.chatgpt);
  return { provider, model };
}

/** Who runs your chats, as an AI feature provider: Codex chats are ChatGPT (D-424). */
export function chatProviderAi(config: JigConfig): AiProvider {
  return config.engine.provider === "codex" ? "chatgpt" : "claude";
}

/** "Claude" / "ChatGPT", for messages ("ChatGPT's answer wasn't…"). */
export function providerName(provider: AiProvider): string {
  return provider === "chatgpt" ? "ChatGPT" : "Claude";
}
