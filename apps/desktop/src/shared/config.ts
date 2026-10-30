import { z } from "zod";

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
      /** Keep ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN in session environments (pay-as-you-go). */
      allowApiKey: z.boolean().default(false),
      /** Model alias or id for new sessions; opusplan = Opus planning, Sonnet execution. */
      defaultModel: z.string().default("opusplan"),
      /** Fallback for subagents without an explicit model; empty respects Claude Code settings. */
      subagentModel: z.string().default("sonnet"),
      /** No-tools questions from add-ons (commit messages, reviews and other helpers). */
      helperModel: z.string().default("sonnet"),
      defaultPermissionMode: z.enum(["default", "acceptEdits", "plan", "bypassPermissions"]).default("plan"),
      /** Claude Code suggests your next message after a turn (nearly free: it reuses the prompt cache). */
      promptSuggestions: z.boolean().default(true),
      /** Claude Code keeps a copy of files before it edits them, so a chat can restore them later. */
      fileCheckpoints: z.boolean().default(true),
      /** Model for testing in Claude's browser (the jig-tester subagent and Test something…, D-124). */
      testerModel: z.string().default("haiku"),
      /**
       * Claude Code loads the connectors of your claude.ai account (Asana, Notion, Linear…) into every
       * chat, and Jig warned about each one that wasn't signed in. Off (default): none are loaded
       * (`ENABLE_CLAUDEAI_MCP_SERVERS=false`); the MCP servers in your own Claude Code settings stay (D-160).
       */
      claudeAiConnectors: z.boolean().default(false),
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
    })
    .prefault({}),
  chat: z
    .object({
      /**
       * `compact` (default): what you and Claude say, with each run of steps (commands, reads,
       * edits, thinking) folded into one line you can open; `detailed`: every step as its card.
       */
      view: z.enum(["compact", "detailed"]).default("compact"),
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
 * program runs as Claude Code, and shell commands Jig runs (updates). D-077.
 */
export const PROTECTED_SETTINGS = [
  "engine.claudePath",
  "engine.allowApiKey",
  "terminal.shell",
  "updates",
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
