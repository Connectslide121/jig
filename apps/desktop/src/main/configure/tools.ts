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
import {
  type ChatItem,
  type ConfigUndo,
  EFFORT_LEVELS,
  PERMISSION_MODES,
  type SessionMeta,
} from "../../shared/engine";
import type { Layout } from "../../shared/layout";
import {
  defaultLinkLabel,
  guessLinkType,
  LINK_TYPE_IDS,
  LINK_TYPES,
  type LinkGroup,
  type LinkType,
} from "../../shared/links";
import { PROJECT_COLORS, type Project, type ProjectPatch, type ProjectsState } from "../../shared/projects";
import type { FileIconThemeList, OpenVsxExtension } from "../../shared/themes";
import { allViews, applyLayoutOps } from "../builder/tools";
import type { JigTool } from "../engine/jigTools";

/**
 * Tools that let Claude configure Jig from any chat (D-077): everything already configurable — settings
 * (theme, fonts, density, file icons, terminal, learning, …), layout, add-ons on/off, projects (create,
 * settings, which chats are in them) — plus finding and installing themes. Each change leaves a card in the chat with Undo. Protected
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
  createProject(input: { name: string; path: string } & ProjectPatch): Promise<Project>;
  updateProject(id: string, patch: ProjectPatch): Promise<unknown>;
  removeProject(id: string): Promise<unknown>;
  setFocusRepo(id: string, repo: string | undefined): Promise<unknown>;
  /** Chats, most recent first. */
  chats(): Promise<SessionMeta[]>;
  setChatProject(sessionId: string, projectId: string | undefined): Promise<void>;
  setChatPinned(sessionId: string, pinned: boolean): Promise<void>;
  /** Adds a change card to the chat. */
  addCard(sessionId: string, item: ChatItem): Promise<void>;
  /** Learning 2: a note saved from a chat, and the profile (for Undo of their cards). */
  removeEvidence?(id: string): Promise<unknown>;
  setProfile?(text: string): Promise<unknown>;
  /** An add-on's stored data (Undo of Claude's changes to it); `undefined` deletes the key. */
  setAddonData?(id: string, key: string, value: unknown | undefined): Promise<unknown>;
}

/** What each setting does, for Claude (keep in sync with shared/config.ts and docs/reference/state.md). */
export const SETTINGS_GUIDE = `appearance.themeId: colour theme id (see jig_list_themes); followSystem: switch between lightThemeId and darkThemeId with the OS; density: compact|comfortable; radius: sharp|soft|round; uiFont / monoFont: font family names; fontSize: 11–18; fileIconTheme: "vscode" (same as VS Code) | "jig" | an icon theme id from jig_list_themes.
engine.defaultModel: model alias or id for new chats ("" = Claude Code's default; e.g. "opus", "sonnet"); engine.defaultPermissionMode: default|acceptEdits|plan|bypassPermissions; engine.promptSuggestions: true|false, Claude Code suggests the next message; engine.fileCheckpoints: true|false, keep file copies so a chat can restore files to before a message; engine.testerModel: model alias or id for testing in Claude's browser (the jig-tester subagent and Test something…; default "haiku").
editor.wordWrap: true|false, long lines wrap in the file editor (Preview); editor.showWhitespace: true|false, show spaces and tabs; editor.closeBrackets: true|false, typing a bracket or quote adds the closing one; editor.tabSize: 1–8, indentation for files that don't show their own (the editor follows each file's own indentation).
notifications.desktop: true|false, a system notification when a chat needs the user or finishes while Jig is in the background.
browser.showWhenUsed: true|false, open the Claude's browser view when Claude starts using its browser (default true; false: it stays out of sight and the user opens the view from Tools). The page has its own size either way, so the view's size never limits Claude.
projects.repoScanDepth: 1–5, how deep workspaces are searched for repositories.
learning.recording: true|false; retentionDays: 7–3650; exclusions: array of strings never recorded; schedule: { enabled, day (0=Sunday), hour, minute } of the weekly pattern run; model: model for it; checkIn: off|weekly|biweekly, a short check-in chat about how the user works (off by default).
setup.firstRunDone: true|false.
Not changeable here (Settings page only): engine.claudePath, engine.allowApiKey, terminal.shell (they decide billing or run programs), updates.*.`;

const show = (v: unknown) => (typeof v === "string" ? `"${v}"` : JSON.stringify(v));

function valueAt(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);
}

export function card(summary: string, details: string[], undo?: ConfigUndo): ChatItem {
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
  const projectFor = async (id: string | undefined, meta: SessionMeta) => {
    const projectId = id ?? meta.projectId;
    const project = (await deps.projects()).projects.find((p) => p.id === projectId);
    if (!projectId || !project)
      throw new Error("Project not found (this chat is in no project; pass projectId)");
    return project;
  };
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
            testerModel: engine.testerModel,
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
          const below = (v: string) =>
            layout.sections[v]?.length
              ? ` with below it: ${layout.sections[v].map((s) => `${title(s)} [${s}]`).join(", ")}`
              : "";
          return `${r} (${reg.collapsed ? "collapsed" : "open"}, ${reg.size}px): ${reg.views.map((v) => `${title(v)} [${v}]${v === reg.active ? " (shown)" : ""}${below(v)}`).join(", ") || "empty"}`;
        });
        return [
          ...regions,
          `hidden: ${layout.hidden.map((v) => `${title(v)} [${v}]`).join(", ") || "none"}`,
          `All views: ${views.map((v) => `${v.id} (${v.title})`).join("; ")}`,
          'Change it with jig_change_layout ops: { op: "move", view, region } | { op: "hide", view } | { op: "show", view } | { op: "resize", region, size } | { op: "collapse" | "expand", region } | { op: "below", view, host } (view as a collapsible section under host, in the same tab; "move" puts it back in its own tab).',
        ].join("\n");
      },
    },
    {
      name: "jig_change_layout",
      description:
        "Move, hide, show or resize views, show a view below another (a collapsible section in the same tab), or collapse/expand a region. Applied at once; the user can undo it from the chat.",
      shape: {
        ops: z.array(
          z.object({
            op: z.enum(["move", "hide", "show", "resize", "collapse", "expand", "below"]),
            host: z.string().optional(),
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
          [o.op, o.view, o.host && `under ${o.host}`, o.region && `→ ${o.region}`, o.size && `${o.size}px`]
            .filter(Boolean)
            .join(" "),
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
      name: "jig_list_projects",
      readOnly: true,
      description:
        "The user's projects (groups of chats they manage, each with a default workspace folder, default Git repository and defaults for its chats), the workspace folders with their repositories, and recent chats with their project. Read this before changing projects or moving chats.",
      shape: {},
      handler: async (_args, meta: SessionMeta) => {
        const state = await deps.projects();
        const name = (id?: string) => state.projects.find((p) => p.id === id)?.name ?? "no project";
        const projects = state.projects.map((p) =>
          [
            `- ${p.name} [${p.id}]${p.id === state.activeId ? " (active)" : ""}: workspace ${p.path}`,
            p.focusRepo ? `default repo ${p.focusRepo}` : "",
            p.model ? `model ${p.model}` : "",
            p.effort ? `effort ${p.effort}` : "",
            p.permissionMode ? `permissions ${p.permissionMode}` : "",
            p.instructions ? `instructions: ${JSON.stringify(p.instructions)}` : "",
            p.starters?.length ? `starters: ${JSON.stringify(p.starters)}` : "",
            p.links?.length
              ? `links: ${p.links.map((g) => `${g.title} [${g.links.map((l) => `${l.label || l.url} (${l.type}) ${l.url}`).join(", ")}]`).join("; ")}`
              : "",
          ]
            .filter(Boolean)
            .join("; "),
        );
        const workspaces = state.workspaces.map(
          (w) =>
            `- ${w.path}${w.repos.length ? `: ${w.repos.map((r) => r.name).join(", ")}` : w.isGitRepo ? " (a repository)" : ""}`,
        );
        const chats = (await deps.chats())
          .filter((c) => c.kind !== "builder" && !c.archived)
          .slice(0, 30)
          .map(
            (c) =>
              `- "${c.title}" [${c.id}] in ${name(c.projectId)}${c.pinned ? ", pinned" : ""}${c.id === meta.id ? " (this chat)" : ""}`,
          );
        return [
          `Projects:\n${projects.join("\n") || "none"}`,
          `Workspaces:\n${workspaces.join("\n") || "none"}`,
          `Recent chats:\n${chats.join("\n") || "none"}`,
        ].join("\n\n");
      },
    },
    {
      name: "jig_create_project",
      description: `Create a project: a name and a default workspace folder (an absolute path, usually one of the workspaces), optionally a default Git repository inside it, colour (${PROJECT_COLORS.join(", ")}), model, effort, permission mode, instructions appended to Claude's system prompt in its chats, and starter prompts. It becomes the active project.`,
      shape: { name: z.string(), path: z.string(), ...projectFields },
      handler: async (args, meta: SessionMeta) => {
        const { defaultRepo, ...settings } = args as Record<string, unknown>;
        const project = await deps.createProject({
          ...(settings as ProjectPatch),
          name: String(args.name),
          path: String(args.path),
        });
        if (typeof defaultRepo === "string" && defaultRepo) await deps.setFocusRepo(project.id, defaultRepo);
        const details = describeProjectPatch(args as Record<string, unknown>);
        await deps.addCard(
          meta.id,
          card(`Created project ${project.name}`, details, { type: "projectCreated", id: project.id }),
        );
        return `Created ${project.name} [${project.id}]:\n${details.join("\n")}`;
      },
    },
    {
      name: "jig_update_project",
      description: `Change a project: name, colour (${PROJECT_COLORS.join(", ")}), default workspace folder (path), default Git repository (defaultRepo, a repository of its workspace; "" for none), and the defaults for its new chats: model, effort, permissionMode, instructions (appended to Claude's system prompt in its chats), starters (prompts on its Home). An empty string or list clears a preference. Without projectId: this chat's project.`,
      shape: {
        projectId: z.string().optional(),
        name: z.string().optional(),
        path: z.string().optional(),
        ...projectFields,
      },
      handler: async (args, meta: SessionMeta) => {
        const id = (args.projectId as string | undefined) ?? meta.projectId;
        const project = (await deps.projects()).projects.find((p) => p.id === id);
        if (!id || !project)
          throw new Error("Project not found (this chat is in no project; pass projectId)");
        const { projectId: _id, defaultRepo, ...patch } = args as Record<string, unknown>;
        const keys = Object.keys(patch).filter((k) => patch[k] !== undefined);
        if (!keys.length && defaultRepo === undefined) return "Nothing to change.";
        // Undo puts back what was there ("" clears what wasn't set).
        const before: Record<string, unknown> = {};
        for (const k of keys) {
          const old = (project as unknown as Record<string, unknown>)[k];
          before[k] = old === undefined ? (k === "starters" ? [] : "") : old;
        }
        if (keys.length) await deps.updateProject(id, patch as ProjectPatch);
        if (defaultRepo !== undefined) {
          before.defaultRepo = project.focusRepo ?? "";
          await deps.setFocusRepo(id, String(defaultRepo) || undefined);
        }
        const details = describeProjectPatch({
          ...patch,
          ...(defaultRepo !== undefined ? { defaultRepo } : {}),
        });
        await deps.addCard(
          meta.id,
          card(`Changed project ${project.name}`, details, { type: "project", id, patch: before }),
        );
        return `Done:\n${details.join("\n")}`;
      },
    },
    {
      name: "jig_add_project_links",
      description: `Add links to a project (its Azure resources, sites, Azure DevOps, docs…) in a group such as "Stage" or "Prod" (made if missing). Each link: url (http/https; for an Azure resource the portal address https://portal.azure.com/#@/resource<resource id>), optional label (default: from the address), optional type (${LINK_TYPE_IDS.join(", ")}; default: guessed from the address). Without projectId: this chat's project. To reorganise or remove links, read them with jig_list_projects and use jig_set_project_links.`,
      shape: {
        projectId: z.string().optional(),
        group: z.string(),
        links: z.array(linkInput).min(1).max(50),
      },
      handler: async (args, meta: SessionMeta) => {
        const project = await projectFor(args.projectId as string | undefined, meta);
        const before = project.links ?? [];
        const input = args.links as Array<{ url: string; label?: string; type?: LinkType }>;
        const links = addLinkGroups(before, String(args.group), input);
        await deps.updateProject(project.id, { links });
        const details = input.map(
          (l) =>
            `${args.group}: ${l.label || defaultLinkLabel(l.url)} (${LINK_TYPES[l.type ?? guessLinkType(l.url)].label})`,
        );
        await deps.addCard(
          meta.id,
          card(`Added links to ${project.name}`, details, {
            type: "project",
            id: project.id,
            patch: { links: before },
          }),
        );
        return `Done:\n${details.join("\n")}`;
      },
    },
    {
      name: "jig_set_project_links",
      description:
        "Replace all of a project's links with these groups, in this order (to rename, regroup, reorder or remove links; read the current ones with jig_list_projects first). Without projectId: this chat's project.",
      shape: {
        projectId: z.string().optional(),
        groups: z.array(z.object({ title: z.string(), links: z.array(linkInput).max(200) })).max(50),
      },
      handler: async (args, meta: SessionMeta) => {
        const project = await projectFor(args.projectId as string | undefined, meta);
        const before = project.links ?? [];
        let links: LinkGroup[] = [];
        for (const g of args.groups as Array<{
          title: string;
          links: Array<{ url: string; label?: string; type?: LinkType }>;
        }>)
          links = g.links.length
            ? addLinkGroups(links, g.title, g.links)
            : [...links, { id: randomUUID(), title: g.title, links: [] }];
        await deps.updateProject(project.id, { links });
        const details = links.map(
          (g) =>
            `${g.title}: ${g.links.map((l) => l.label || defaultLinkLabel(l.url)).join(", ") || "(empty)"}`,
        );
        await deps.addCard(
          meta.id,
          card(`Changed the links of ${project.name}`, details, {
            type: "project",
            id: project.id,
            patch: { links: before },
          }),
        );
        return `Done:\n${details.join("\n")}`;
      },
    },
    {
      name: "jig_move_chat",
      description:
        "Put a chat in a project, move it to another, or take it out (leave projectId out), and/or pin it to the top of its project. Without chatId: this chat. Chat and project ids come from jig_list_projects.",
      shape: {
        chatId: z.string().optional(),
        projectId: z.string().optional(),
        pinned: z.boolean().optional(),
      },
      handler: async (args, meta: SessionMeta) => {
        const chatId = (args.chatId as string | undefined) ?? meta.id;
        const chat = (await deps.chats()).find((c) => c.id === chatId);
        if (!chat) throw new Error("Chat not found");
        const state = await deps.projects();
        const projectId = args.projectId as string | undefined;
        if (projectId && !state.projects.some((p) => p.id === projectId))
          throw new Error("Project not found");
        const pinned = args.pinned as boolean | undefined;
        const nameOf = (id?: string) => state.projects.find((p) => p.id === id)?.name ?? "No project";
        const details: string[] = [];
        // Moving is what the call is for unless it only pins.
        const moves = projectId !== undefined || pinned === undefined;
        if (moves && projectId !== chat.projectId) {
          await deps.setChatProject(chatId, projectId);
          details.push(`project: ${nameOf(chat.projectId)} → ${nameOf(projectId)}`);
        }
        if (pinned !== undefined && pinned !== Boolean(chat.pinned)) {
          await deps.setChatPinned(chatId, pinned);
          details.push(pinned ? "pinned" : "unpinned");
        }
        if (!details.length) return "Nothing to change.";
        await deps.addCard(
          meta.id,
          card(`Organised the chat "${chat.title}"`, details, {
            type: "chat",
            id: chatId,
            projectId: chat.projectId,
            pinned: Boolean(chat.pinned),
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
  else if (undo.type === "project") {
    const { defaultRepo, ...patch } = undo.patch;
    if (Object.keys(patch).length) await deps.updateProject(undo.id, patch as ProjectPatch);
    if (defaultRepo !== undefined) await deps.setFocusRepo(undo.id, String(defaultRepo) || undefined);
  } else if (undo.type === "projectCreated") await deps.removeProject(undo.id);
  else if (undo.type === "chat") {
    await deps.setChatProject(undo.id, undo.projectId);
    await deps.setChatPinned(undo.id, undo.pinned);
  } else if (undo.type === "evidence") await deps.removeEvidence?.(undo.id);
  else if (undo.type === "profile") await deps.setProfile?.(undo.text);
  else if (undo.type === "addonData")
    await deps.setAddonData?.(undo.id, undo.key, undo.existed ? undo.value : undefined);
}

/** A link as Claude gives it. */
const linkInput = z.object({
  url: z.string().regex(/^https?:\/\//i, "http(s) addresses only"),
  label: z.string().optional(),
  type: z.enum(LINK_TYPE_IDS as [LinkType, ...LinkType[]]).optional(),
});

/** Adds links to the group `title` (made if missing), with ids and guessed types. */
function addLinkGroups(
  groups: LinkGroup[],
  title: string,
  links: Array<{ url: string; label?: string; type?: LinkType }>,
): LinkGroup[] {
  const name = title.trim() || "Links";
  const made = links.map((l) => ({
    id: randomUUID(),
    url: l.url,
    label: l.label?.trim() || undefined,
    type: l.type ?? guessLinkType(l.url),
  }));
  const existing = groups.find((g) => g.title.toLowerCase() === name.toLowerCase());
  return existing
    ? groups.map((g) => (g === existing ? { ...g, links: [...g.links, ...made] } : g))
    : [...groups, { id: randomUUID(), title: name, links: made }];
}

/** The project settings Claude can set (shared by create and update). */
const projectFields = {
  color: z.enum(PROJECT_COLORS).optional(),
  defaultRepo: z.string().optional().describe("Absolute path of a repository inside the default workspace"),
  model: z.string().optional().describe('Model alias or id for new chats ("" = Jig\'s default)'),
  effort: z.enum([...EFFORT_LEVELS, ""]).optional(),
  permissionMode: z.enum([...PERMISSION_MODES, ""]).optional(),
  instructions: z.string().optional().describe("Appended to Claude's system prompt in this project's chats"),
  starters: z.array(z.string()).optional().describe("Prompts shown on the project's Home"),
};

function describeProjectPatch(patch: Record<string, unknown>): string[] {
  const labels: Record<string, string> = {
    name: "name",
    path: "default workspace",
    color: "colour",
    defaultRepo: "default repository",
    model: "model",
    effort: "effort",
    permissionMode: "permissions",
    instructions: "instructions",
    starters: "starter prompts",
  };
  return Object.entries(patch)
    .filter(([k, v]) => labels[k] && v !== undefined)
    .map(([k, v]) => {
      const value = Array.isArray(v)
        ? v.length
          ? v.join(" · ")
          : "(none)"
        : v === ""
          ? "(default)"
          : String(v);
      return `${labels[k]}: ${value.length > 120 ? `${value.slice(0, 120)}…` : value}`;
    });
}
