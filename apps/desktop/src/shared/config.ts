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
    })
    .prefault({}),
  engine: z
    .object({
      /** Path to the user's own `claude` binary; empty = the one shipped with the Claude Agent SDK. */
      claudePath: z.string().default(""),
      /** Keep ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN in session environments (pay-as-you-go). */
      allowApiKey: z.boolean().default(false),
      /** Model alias or id for new sessions; empty = Claude Code's default. */
      defaultModel: z.string().default(""),
      defaultPermissionMode: z
        .enum(["default", "acceptEdits", "plan", "bypassPermissions"])
        .default("default"),
    })
    .prefault({}),
  builder: z
    .object({
      /** Jig's own source repository for level-3 changes; empty = the repo Jig runs from (development). */
      sourcePath: z.string().default(""),
      /** Run in the worktree before you see a level-3 change. */
      checkCommand: z.string().default("npm run check"),
      buildCommand: z.string().default("npm run build"),
      /** Run when a level-3 change touches package.json / package-lock.json. */
      installCommand: z.string().default("npm install"),
    })
    .prefault({}),
  setup: z
    .object({
      /** The Get started checklist was closed (it opens on the first start of an installed Jig). */
      firstRunDone: z.boolean().default(false),
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
