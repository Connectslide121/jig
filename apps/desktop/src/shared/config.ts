import { z } from "zod";
import { AI_FEATURE_IDS, type AiFeatureId } from "./aiFeatures";
import { CHAT_PROVIDERS } from "./engine";
import { AI_PROVIDERS } from "./providers";

/** One AI feature's provider and model (D-297). */
const aiChoiceSchema = () =>
  z
    .object({
      provider: z.enum(AI_PROVIDERS).default("claude"),
      model: z.string().max(100).default(""),
    })
    .prefault({});
const aiChoices = Object.fromEntries(AI_FEATURE_IDS.map((id) => [id, aiChoiceSchema()])) as {
  [K in AiFeatureId]: ReturnType<typeof aiChoiceSchema>;
};

/**
 * User settings, stored in `~/.jig/config.json`. Every field has a default so a missing or partial
 * file is always valid. Documented in docs/reference/state.md — update it when adding a field.
 */
export const ConfigSchema = z.object({
  appearance: z
    .object({
      /** Theme used when `followSystem` is off. */
      themeId: z.string().default("jig-dark"),
      /** Follow the OS light/dark setting, switching between `lightThemeId` and `darkThemeId`. */
      followSystem: z.boolean().default(false),
      lightThemeId: z.string().default("jig-light"),
      darkThemeId: z.string().default("jig-dark"),
      density: z.enum(["compact", "comfortable"]).default("comfortable"),
      radius: z.enum(["sharp", "soft", "round"]).default("soft"),
      uiFont: z.string().default("Inter Variable"),
      monoFont: z.string().default("JetBrains Mono Variable"),
      fontSize: z.number().int().min(11).max(18).default(13),
      /** File icons: `vscode` = the icon theme your VS Code uses, `jig` = Jig's own, or a theme id. */
      fileIconTheme: z.string().default("vscode"),
    })
    .prefault({}),
  engine: z
    .object({
      /** Path to the user's own `claude` binary; empty = the one shipped with the Claude Agent SDK. */
      claudePath: z.string().default(""),
      /**
       * Who runs new chats (D-309): Claude Code, or OpenAI's Codex signed in with ChatGPT. A project
       * can override it (`Project.provider`); a chat keeps the provider it started with.
       */
      provider: z.enum(CHAT_PROVIDERS).default("claude"),
      /** Path to the user's own `codex` binary; empty = the one on PATH (D-294). */
      codexPath: z.string().default(""),
      /** Model for new Codex chats: a ChatGPT family (`sol`, `terra`, `luna`; D-310) or an exact slug. */
      codexModel: z.string().max(100).default("sol"),
      /**
       * Your personal instructions in Codex chats (D-312): `claude` follows Claude Code's
       * `~/.claude/CLAUDE.md` and its @imports, so one file stays the source; `off` leaves Codex with
       * its own `~/.codex/AGENTS.md`.
       */
      codexInstructions: z.enum(["claude", "off"]).default("claude"),
      /** Keep OPENAI_API_KEY / CODEX_API_KEY in Codex chats' environment (pay-as-you-go, D-311). */
      codexAllowApiKey: z.boolean().default(false),
      /** Keep ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN in session environments (pay-as-you-go). */
      allowApiKey: z.boolean().default(false),
      /** Model alias or id for new sessions; opusplan = Opus only in Plan mode, Sonnet otherwise. */
      defaultModel: z.string().default("opus"),
      /** Fallback for subagents without an explicit model; empty respects Claude Code settings. */
      subagentModel: z.string().default("sonnet"),
      /** No-tools questions from add-ons (commit messages, reviews and other helpers). */
      helperModel: z.string().default("sonnet"),
      /** Short, simple answers from add-ons that ask for `quick` (commit messages): a small model. */
      quickModel: z.string().default("haiku"),
      defaultPermissionMode: z.enum(["default", "acceptEdits", "plan", "bypassPermissions"]).default("plan"),
      /** Claude Code suggests your next message after a turn (nearly free: it reuses the prompt cache). */
      promptSuggestions: z.boolean().default(true),
      /** The quick model names a new chat from its first message (a few words; D-288). */
      aiTitles: z.boolean().default(true),
      /** Claude Code keeps a copy of files before it edits them, so a chat can restore them later. */
      fileCheckpoints: z.boolean().default(true),
      /** Model for testing in Claude's browser (the jig-tester subagent and Test something…, D-124). */
      testerModel: z.string().default("haiku"),
      /** Model for code searches the chat hands to the jig-search subagent; empty = no such subagent. */
      searchModel: z.string().default("haiku"),
      /**
       * Claude Code loads the connectors of your claude.ai account (Asana, Notion, Linear…) into every
       * chat, and Jig warned about each one that wasn't signed in. Off (default): none are loaded
       * (`ENABLE_CLAUDEAI_MCP_SERVERS=false`); the MCP servers in your own Claude Code settings stay (D-160).
       */
      claudeAiConnectors: z.boolean().default(false),
    })
    .prefault({}),
  /**
   * Which provider and model each simple AI feature runs on (D-297; ids and labels in
   * shared/aiFeatures.ts). `model: ""` = the model the feature used before (Claude), or Codex's
   * default (ChatGPT). Protected: it decides which plan pays.
   */
  ai: z.object(aiChoices).prefault({}),
  skills: z
    .object({
      /** Jig's bundled skills only. Missing entries are enabled for every project. */
      overrides: z
        .record(
          z.string(),
          z.object({
            enabled: z.boolean().default(true),
            excludedProjects: z.array(z.string()).default([]),
          }),
        )
        .default({}),
    })
    .prefault({}),
  editor: z
    .object({
      /** Long lines wrap in the Preview editor instead of scrolling sideways. */
      wordWrap: z.boolean().default(false),
      /** Spaces and tabs show as faint dots and arrows. */
      showWhitespace: z.boolean().default(false),
      /** Typing ( [ { " ' adds the closing one. */
      closeBrackets: z.boolean().default(true),
      /** Indentation for a file that doesn't show its own yet (Jig follows the file's otherwise). */
      tabSize: z.number().int().min(1).max(8).default(4),
      /**
       * Code completion with Claude (D-255): Claude Code suggests the code at the caret after a typing
       * pause, instead of GitHub Copilot. Off by default: it spends your Claude plan's usage.
       */
      claudeCompletion: z.boolean().default(false),
      /** The model Claude completes with (a value from Claude Code's model list); Haiku is quickest. */
      claudeCompletionModel: z.string().default("haiku"),
      /**
       * Language servers you installed (TypeScript, Python, C#…) give the editor errors, hover, go to
       * definition, references, rename and formatting (D-259). On by default; Jig only runs ones on PATH.
       */
      languageServers: z.boolean().default(true),
    })
    .prefault({}),
  chat: z
    .object({
      /**
       * `compact` (default): what you and Claude say, with each run of steps (commands, reads,
       * edits, thinking) folded into one line you can open; `detailed`: every step as its card.
       */
      view: z.enum(["compact", "detailed"]).default("compact"),
      /** The overview card floating at a chat's right (turns, tools, files, skills…; D-184). */
      overview: z.boolean().default(true),
      /** A time beside every message and step of a chat (D-306); off, times show on hover. */
      times: z.boolean().default(false),
    })
    .prefault({}),
  /** Talking to Claude (D-208): dictation runs Whisper on this computer; reading aloud uses a natural voice (D-243) or system voices. */
  speech: z
    .object({
      /** Whisper model for dictation: `tiny` (fast), `base` (balanced) or `small` (most accurate). */
      model: z.enum(["tiny", "base", "small"]).default("base"),
      /** Language you speak, as a code (`en`, `es`…); empty = Whisper recognises it. */
      language: z.string().max(10).default(""),
      /** What reads Claude's messages aloud: `natural` (Kokoro on this computer, D-243) or `system` voices. */
      engine: z.enum(["natural", "system"]).default("natural"),
      /** The natural voice (Kokoro voice id, e.g. `af_heart`, `ef_dora`). */
      naturalVoice: z.string().max(40).default("af_heart"),
      /** System voice for reading aloud when `engine` is `system` (its name); empty = the system's default. */
      voice: z.string().max(200).default(""),
      /** Run Whisper on the graphics card (WebGPU) when there is one; much faster. */
      gpu: z.boolean().default(true),
      /** Show the words while you speak (Whisper runs again every moment on what you said so far). */
      live: z.boolean().default(true),
      /** Talking with Claude: how long a pause (ms) ends what you say and sends it. */
      pause: z.number().int().min(400).max(4000).default(1000),
      /**
       * Talking with Claude: keeps noise from counting as your voice (D-275). `strong` and `light`
       * use a voice detector on this computer; `off` goes by loudness alone.
       */
      noiseFilter: z.enum(["strong", "light", "off"]).default("strong"),
      /** The microphone speech listens to (its device id); empty = the system's default. */
      inputDevice: z.string().max(200).default(""),
      /** The speaker the natural voice and talking sounds play on (device id); empty = the system's default. */
      outputDevice: z.string().max(200).default(""),
      /** Speed of the voice that reads aloud (1 = normal). */
      rate: z.number().min(0.5).max(2).default(1),
      /** Soft sounds while Claude works after you hand it a task by voice, and when it finishes (D-210). */
      workSound: z.boolean().default(true),
      /**
       * Listen for "Hey Jig" voice commands while Jig runs, also minimized (D-278). The microphone
       * stays open; commands are understood and run on this computer, without Claude.
       */
      wake: z.boolean().default(false),
      /** With `wake`: say out loud when a chat finishes or needs you. */
      announce: z.boolean().default(true),
    })
    .prefault({}),
  /** Teams meetings in Jig (D-217). */
  meetings: z
    .object({
      /**
       * When Teams can't translate captions (it needs Teams Premium), Claude translates each finished
       * caption into the language you pick (D-277). Only while you have picked one.
       */
      aiTranslation: z.boolean().default(true),
      /** The model that translates captions (a fast one: lines come every few seconds). */
      translationModel: z.string().max(100).default("haiku"),
    })
    .prefault({}),
  /** Azure tenants (D-282). */
  azure: z
    .object({
      /**
       * The tenant every `az` Jig runs uses: a key from `~/.jig/azure/tenants.json`, or empty for
       * your own az login (no override).
       */
      activeTenant: z.string().max(40).default(""),
    })
    .prefault({}),
  /** The Chats list: how it groups chats, and the order you gave pinned chats. */
  chatList: z
    .object({
      /** `project` (default), `status` (pinned, needs you, working…), `recent` (by day) or `all` (one list). */
      view: z.enum(["project", "status", "recent", "all"]).default("project"),
      /** Pinned chats' ids, in the order you dragged them; pinned chats not listed follow, newest first. */
      pinnedOrder: z.array(z.string()).default([]),
    })
    .prefault({}),
  notifications: z
    .object({
      /** A system notification when a chat needs you or finishes while Jig isn't in front. */
      desktop: z.boolean().default(true),
    })
    .prefault({}),
  browser: z
    .object({
      /** Open the Claude's browser view when Claude starts using it (off: it stays out of sight). */
      showWhenUsed: z.boolean().default(true),
    })
    .prefault({}),
  updates: z
    .object({
      /** Jig's source repository for "Pull, build and restart"; empty = the repo Jig runs from (development). */
      sourcePath: z.string().default(""),
      buildCommand: z.string().default("npm run build"),
      /** Run when an update touches package.json / package-lock.json. */
      installCommand: z.string().default("npm install"),
    })
    .prefault({}),
  setup: z
    .object({
      /** The Get started checklist was closed (it opens on the first start of an installed Jig). */
      firstRunDone: z.boolean().default(false),
    })
    .prefault({}),
  projects: z
    .object({
      /** How many folder levels Jig searches for repositories inside a workspace (`repos/client/api` = 3). */
      repoScanDepth: z.number().int().min(1).max(5).default(3),
    })
    .prefault({}),
  terminal: z
    .object({
      /** Shell executable; empty = PowerShell on Windows, $SHELL elsewhere. */
      shell: z.string().default(""),
    })
    .prefault({}),
  /** Add-on gallery sources (D-179): git URLs (https/ssh) or folders with add-on folders. */
  addonGallery: z
    .object({
      sources: z.array(z.string()).default([]),
    })
    .prefault({}),
  learning: z
    .object({
      recording: z.boolean().default(true),
      retentionDays: z.number().int().min(7).max(3650).default(90),
      /** Paths or text; activity containing any of them is not recorded. */
      exclusions: z.array(z.string()).default([]),
      schedule: z
        .object({
          enabled: z.boolean().default(true),
          /** 0 = Sunday … 6 = Saturday. */
          day: z.number().int().min(0).max(6).default(1),
          hour: z.number().int().min(0).max(23).default(10),
          minute: z.number().int().min(0).max(59).default(0),
        })
        .prefault({}),
      /** Model for the reflection step; a small model keeps quota use low. */
      model: z.string().default("haiku"),
      /** A short check-in chat about how you work (Learning 2); off until you turn it on. */
      checkIn: z.enum(["off", "weekly", "biweekly"]).default("off"),
    })
    .prefault({}),
});

export type JigConfig = z.infer<typeof ConfigSchema>;

export const defaultConfig = (): JigConfig => ConfigSchema.parse({});

export type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/** Merges `patch` into `base`; arrays and primitives are replaced, objects merged. */
export function deepMerge<T>(base: T, patch: DeepPartial<T> | undefined): T {
  if (patch === undefined) return base;
  if (typeof base !== "object" || base === null || Array.isArray(base)) return patch as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (value === undefined) continue;
    const current = out[key];
    out[key] =
      typeof current === "object" && current !== null && !Array.isArray(current) && typeof value === "object"
        ? deepMerge(current, value as DeepPartial<typeof current>)
        : value;
  }
  return out as T;
}

/**
 * Settings Claude may not change from a chat (Settings only): they decide billing (API keys), which
 * program runs as Claude Code, the credentials programs run with (the Azure tenant, D-282), shell
 * commands Jig runs (updates), and where add-on code comes from (the gallery's sources). D-077.
 */
export const PROTECTED_SETTINGS = [
  "ai",
  "engine.claudePath",
  "engine.codexPath",
  "engine.codexAllowApiKey",
  "engine.provider",
  "engine.allowApiKey",
  "editor.claudeCompletion",
  "editor.claudeCompletionModel",
  "engine.aiTitles",
  "meetings.aiTranslation",
  "meetings.translationModel",
  "azure.activeTenant",
  "speech.wake",
  "terminal.shell",
  "updates",
  "addonGallery",
] as const;

/** Dotted paths of the leaves a patch sets (`{ appearance: { themeId } }` → `appearance.themeId`). */
export function patchPaths(patch: unknown, prefix = ""): string[] {
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) return prefix ? [prefix] : [];
  return Object.entries(patch as Record<string, unknown>).flatMap(([k, v]) =>
    v === undefined ? [] : patchPaths(v, prefix ? `${prefix}.${k}` : k),
  );
}

/** The settings a patch touches that only the Settings page may change. */
export function protectedIn(patch: unknown): string[] {
  return patchPaths(patch).filter((path) =>
    PROTECTED_SETTINGS.some((p) => path === p || path.startsWith(`${p}.`)),
  );
}

/** A patch that restores `before` for every leaf `patch` changes (for Undo). */
export function inversePatch<T>(before: T, patch: DeepPartial<T>): DeepPartial<T> {
  const out: Record<string, unknown> = {};
  for (const path of patchPaths(patch)) {
    const keys = path.split(".");
    let value: unknown = before;
    for (const k of keys) value = (value as Record<string, unknown> | undefined)?.[k];
    let node = out;
    keys.slice(0, -1).forEach((k) => {
      node[k] = (node[k] as Record<string, unknown>) ?? {};
      node = node[k] as Record<string, unknown>;
    });
    node[keys.at(-1)!] = value;
  }
  return out as DeepPartial<T>;
}
