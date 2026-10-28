import { randomUUID } from "node:crypto";
import type { ThemeSummary } from "@jig/themes";
import { z } from "zod";
import type { AddonInfo } from "../../shared/addons";
import type { LayoutOp } from "../../shared/builds";
import {
  ConfigSchema,
  type DeepPartial,
  deepMerge,
  inversePatch,
  type JigConfig,
  patchPaths,
  protectedIn,
} from "../../shared/config";
import type { ChatItem, ConfigUndo, SessionMeta } from "../../shared/engine";
import type { Layout } from "../../shared/layout";
import { PROJECT_COLORS, type ProjectColor, type ProjectsState } from "../../shared/projects";
import type { FileIconThemeList, OpenVsxExtension } from "../../shared/themes";
import { allViews, applyLayoutOps } from "../builder/tools";
import type { JigTool } from "../engine/jigTools";

/**
 * Tools that let Claude configure Jig from any chat (D-077): everything already configurable — settings
 * (theme, fonts, density, file icons, terminal, learning, …), layout, add-ons on/off, project name and
 * colour — plus finding and installing themes. Each change leaves a card in the chat with Undo. Protected
 * settings (billing, the Claude Code binary, update commands) stay Settings-only.
 */
export interface ConfigureDeps {
  config(): JigConfig;
  updateConfig(patch: DeepPartial<JigConfig>): Promise<unknown>;
  themes(): Promise<ThemeSummary[]>;
  iconThemes(): Promise<FileIconThemeList>;
  searchThemes(query: string): Promise<OpenVsxExtension[]>;
  installTheme(namespace: string, name: string): Promise<ThemeSummary[]>;
  layout(): Promise<Layout>;
  setLayout(layout: Layout): Promise<unknown>;
  addons(): AddonInfo[];
  setAddonEnabled(id: string, enabled: boolean): Promise<void>;
  projects(): Promise<ProjectsState>;
  updateProject(id: string, patch: { name?: string; color?: ProjectColor }): Promise<unknown>;
  /** Adds a change card to the chat. */
  addCard(sessionId: string, item: ChatItem): Promise<void>;
}

/** What each setting does, for Claude (keep in sync with shared/config.ts and docs/reference/state.md). */
export const SETTINGS_GUIDE = `appearance.themeId: colour theme id (see jig_list_themes); followSystem: switch between lightThemeId and darkThemeId with the OS; density: compact|comfortable; radius: sharp|soft|round; uiFont / monoFont: font family names; fontSize: 11–18; fileIconTheme: "vscode" (same as VS Code) | "jig" | an icon theme id from jig_list_themes.
engine.defaultModel: model alias or id for new chats ("" = Claude Code's default; e.g. "opus", "sonnet"); engine.defaultPermissionMode: default|acceptEdits|plan|bypassPermissions; engine.promptSuggestions: true|false, Claude Code suggests the next message; engine.fileCheckpoints: true|false, keep file copies so a chat can restore files to before a message.
notifications.desktop: true|false, a system notification when a chat needs the user or finishes while Jig is in the background.
projects.repoScanDepth: 1–5, how deep workspaces are searched for repositories.
learning.recording: true|false; retentionDays: 7–3650; exclusions: array of strings never recorded; schedule: { enabled, day (0=Sunday), hour, minute } of the weekly pattern run; model: model for it.
setup.firstRunDone: true|false.
Not changeable here (Settings page only): engine.claudePath, engine.allowApiKey, terminal.shell (they decide billing or run programs), updates.*.`;

const show = (v: unknown) => (typeof v === "string" ? `"${v}"` : JSON.stringify(v));

function valueAt(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);
}

function card(summary: string, details: string[], undo?: ConfigUndo): ChatItem {
  return {
    kind: "change",
    id: `change-${randomUUID()}`,
    at: new Date().toISOString(),
    summary,
    details,
    undo,
  };
}

export function configureTools(deps: ConfigureDeps): JigTool[] {
  const viewIds = () => allViews(deps.addons()).map((v) => v.id);
  return [
    {
      name: "jig_get_settings",
      readOnly: true,
      description:
        "Jig's current settings (JSON) and what each one does. Read this before changing settings.",
      shape: {},
      handler: async () => {
        const { engine, updates: _u, ...rest } = deps.config();
        const visible = {
          ...rest,
          engine: {
            defaultModel: engine.defaultModel,
            defaultPermissionMode: engine.defaultPermissionMode,
            promptSuggestions: engine.promptSuggestions,
            fileCheckpoints: engine.fileCheckpoints,
          },
        };
        return `${JSON.stringify(visible, null, 2)}\n\nWhat they mean:\n${SETTINGS_GUIDE}`;
      },
    },
    {
      name: "jig_update_settings",
      description:
        'Change Jig settings with a partial JSON patch, e.g. { "appearance": { "themeId": "…", "density": "compact" } }. Theme ids come from jig_list_themes. Applied at once; the user can undo it from the chat.',
      shape: {
        patch: z.record(z.string(), z.unknown()).describe("Partial settings, same shape as jig_get_settings"),
      },
      handler: async (args, meta) => {
        const patch = (args.patch ?? {}) as DeepPartial<JigConfig>;
        const blocked = protectedIn(patch);
        if (blocked.length)
          throw new Error(
            `${blocked.join(", ")} can only be changed in Settings (they affect billing or run programs).`,
          );
        const before = deps.config();
        const check = ConfigSchema.safeParse(deepMerge(before, patch));
        if (!check.success)
          throw new Error(
            `Invalid settings: ${check.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
          );
        const themeIds = new Set((await deps.themes()).map((t) => t.id));
        for (const key of ["themeId", "lightThemeId", "darkThemeId"] as const) {
          const id = patch.appearance?.[key];
          if (id !== undefined && !themeIds.has(id))
            throw new Error(`Unknown theme "${id}". Use an id from jig_list_themes.`);
        }
        const icon = patch.appearance?.fileIconTheme;
        if (icon !== undefined && icon !== "vscode" && icon !== "jig") {
          const icons = await deps.iconThemes();
          if (!icons.themes.some((t) => t.id === icon))
            throw new Error(
              `Unknown file icon theme "${icon}". Use "vscode", "jig" or an id from jig_list_themes.`,
            );
        }
        const changed = patchPaths(patch).filter(
          (p) => JSON.stringify(valueAt(before, p)) !== JSON.stringify(valueAt(check.data, p)),
        );
        if (changed.length === 0) return "Nothing to change: the settings already have these values.";
        await deps.updateConfig(patch);
        const details = changed.map(
          (p) => `${p}: ${show(valueAt(before, p))} → ${show(valueAt(check.data, p))}`,
        );
        await deps.addCard(
          meta.id,
          card("Changed Jig's settings", details, {
            type: "settings",
            patch: inversePatch(before, patch) as Record<string, unknown>,
          }),
        );
        return `Done:\n${details.join("\n")}`;
      },
    },
    {
      name: "jig_list_themes",
      readOnly: true,
      description:
        "Installed colour themes (Jig's, VS Code's, Open VSX, your files) and file icon themes, with the ones in use.",
      shape: {},
      handler: async () => {
        const a = deps.config().appearance;
        const themes = (await deps.themes()).map(
          (t) => `- ${t.id} — ${t.label} (${t.appearance}, ${t.source})`,
        );
        const icons = await deps.iconThemes();
        return [
          `In use: themeId=${a.themeId}${a.followSystem ? ` (following the OS: light=${a.lightThemeId}, dark=${a.darkThemeId})` : ""}, fileIconTheme=${a.fileIconTheme}`,
          "Colour themes:",
          ...themes,
          `File icon themes: "vscode" (same as VS Code${icons.vscodeSetting ? `: ${icons.vscodeSetting}` : ""}), "jig"${icons.themes.length ? "," : ""}`,
          ...icons.themes.map((t) => `- ${t.id} — ${t.label} (${t.source})`),
          "To get more, use jig_find_themes and jig_install_theme.",
        ].join("\n");
      },
    },
    {
      name: "jig_find_themes",
      readOnly: true,
      description:
        "Search Open VSX for colour or file icon theme extensions to install (e.g. 'catppuccin', 'material icon').",
      shape: { query: z.string() },
      handler: async (args) => {
        const found = await deps.searchThemes(String(args.query ?? ""));
        if (found.length === 0) return "No theme extensions found.";
        return found
          .slice(0, 15)
          .map(
            (e) =>
              `- ${e.namespace}.${e.name} — ${e.displayName} (${e.downloads.toLocaleString("en")} downloads)${e.description ? `: ${e.description}` : ""}`,
          )
          .join("\n");
      },
    },
    {
      name: "jig_install_theme",
      description:
        "Install a theme extension from Open VSX (namespace and name from jig_find_themes). Only its theme files are downloaded; nothing runs. Then switch to it with jig_update_settings.",
      shape: { namespace: z.string(), name: z.string() },
      handler: async (args, meta) => {
        const added = await deps.installTheme(String(args.namespace), String(args.name));
        const details = added.length
          ? added.map((t) => `${t.id} — ${t.label}`)
          : ["(a file icon theme: see jig_list_themes)"];
        await deps.addCard(meta.id, card(`Installed ${args.namespace}.${args.name}`, details));
        return `Installed. New themes:\n${details.join("\n")}`;
      },
    },
    {
      name: "jig_get_layout",
      readOnly: true,
      description:
        "Jig's layout: the views in the left/right sidebars and the bottom panel, sizes, hidden views, and every view id.",
      shape: {},
      handler: async () => {
        const layout = await deps.layout();
        const views = allViews(deps.addons());
        const title = (id: string) => views.find((v) => v.id === id)?.title ?? id;
        const regions = (["left", "right", "bottom"] as const).map((r) => {
          const reg = layout[r];
          return `${r} (${reg.collapsed ? "collapsed" : "open"}, ${reg.size}px): ${reg.views.map((v) => `${title(v)} [${v}]${v === reg.active ? " (shown)" : ""}`).join(", ") || "empty"}`;
        });
        return [
          ...regions,
          `hidden: ${layout.hidden.map((v) => `${title(v)} [${v}]`).join(", ") || "none"}`,
          `All views: ${views.map((v) => `${v.id} (${v.title})`).join("; ")}`,
          'Change it with jig_change_layout ops: { op: "move", view, region } | { op: "hide", view } | { op: "show", view } | { op: "resize", region, size } | { op: "collapse" | "expand", region }.',
        ].join("\n");
      },
    },
    {
      name: "jig_change_layout",
      description:
        "Move, hide, show or resize views, or collapse/expand a region. Applied at once; the user can undo it from the chat.",
      shape: {
        ops: z.array(
          z.object({
            op: z.enum(["move", "hide", "show", "resize", "collapse", "expand"]),
            view: z.string().optional(),
            region: z.enum(["left", "right", "bottom"]).optional(),
            size: z.number().optional(),
          }),
        ),
      },
      handler: async (args, meta) => {
        const ops = (args.ops ?? []) as LayoutOp[];
        const before = await deps.layout();
        const next = applyLayoutOps(before, ops, viewIds());
        await deps.setLayout(next);
        const details = ops.map((o) =>
          [o.op, o.view, o.region && `→ ${o.region}`, o.size && `${o.size}px`].filter(Boolean).join(" "),
        );
        await deps.addCard(
          meta.id,
          card("Changed Jig's layout", details, { type: "layout", layout: before }),
        );
        return `Done:\n${details.join("\n")}`;
      },
    },
    {
      name: "jig_set_addon_enabled",
      description: "Switch an add-on on or off (ids from jig_list_addons).",
      shape: { id: z.string(), enabled: z.boolean() },
      handler: async (args, meta) => {
        const id = String(args.id);
        const addon = deps.addons().find((a) => a.id === id && !a.preview);
        if (!addon) throw new Error(`No add-on "${id}". Use an id from jig_list_addons.`);
        const enabled = Boolean(args.enabled);
        if (addon.enabled === enabled) return `${addon.name} is already ${enabled ? "on" : "off"}.`;
        await deps.setAddonEnabled(id, enabled);
        await deps.addCard(
          meta.id,
          card(`${enabled ? "Switched on" : "Switched off"} ${addon.name}`, [], {
            type: "addon",
            id,
            enabled: !enabled,
          }),
        );
        return `${addon.name} is now ${enabled ? "on" : "off"}.`;
      },
    },
    {
      name: "jig_update_project",
      description: `Rename a project or change its colour (${PROJECT_COLORS.join(", ")}). Without projectId: this chat's project.`,
      shape: {
        projectId: z.string().optional(),
        name: z.string().optional(),
        color: z.enum(PROJECT_COLORS).optional(),
      },
      handler: async (args, meta: SessionMeta) => {
        const id = (args.projectId as string | undefined) ?? meta.projectId;
        const project = (await deps.projects()).projects.find((p) => p.id === id);
        if (!project) throw new Error("Project not found");
        const name = (args.name as string | undefined)?.trim();
        const color = args.color as ProjectColor | undefined;
        if (!name && !color) return "Nothing to change.";
        await deps.updateProject(id, { name, color });
        const details = [
          ...(name ? [`name: "${project.name}" → "${name}"`] : []),
          ...(color ? [`colour: ${project.color} → ${color}`] : []),
        ];
        await deps.addCard(
          meta.id,
          card(`Changed project ${project.name}`, details, {
            type: "project",
            id,
            ...(name ? { name: project.name } : {}),
            ...(color ? { color: project.color } : {}),
          }),
        );
        return `Done:\n${details.join("\n")}`;
      },
    },
  ];
}

/** Applies a change card's Undo. */
export async function applyUndo(deps: ConfigureDeps, undo: ConfigUndo): Promise<void> {
  if (undo.type === "settings") await deps.updateConfig(undo.patch as DeepPartial<JigConfig>);
  else if (undo.type === "layout") await deps.setLayout(undo.layout as Layout);
  else if (undo.type === "addon") await deps.setAddonEnabled(undo.id, undo.enabled);
  else if (undo.type === "project")
    await deps.updateProject(undo.id, { name: undo.name, color: undo.color as ProjectColor | undefined });
}
