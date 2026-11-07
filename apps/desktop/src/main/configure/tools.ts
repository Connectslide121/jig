import { randomUUID } from "node:crypto";
import { findTenant, pinnedTenant, type TenantsState } from "@jig/azure";
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
  ANY_EFFORT_LEVELS,
  type ChatItem,
  type ConfigUndo,
  PERMISSION_MODES,
  type SessionMeta,
} from "../../shared/engine";
import { BOTTOM_SPANS, type Layout, SIDE_REGIONS } from "../../shared/layout";
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
  /** The Azure tenants, to resolve and name a project's pinned tenant (D-286). */
  tenants?(): TenantsState;
}

/** What each setting does, for Claude (keep in sync with shared/config.ts and docs/reference/state.md). */
export const SETTINGS_GUIDE = `appearance.themeId: colour theme id (see jig_list_themes); followSystem: switch between lightThemeId and darkThemeId with the OS; density: compact|comfortable; radius: sharp|soft|round; uiFont / monoFont: font family names; fontSize: 11–18; fileIconTheme: "vscode" (same as VS Code) | "jig" | an icon theme id from jig_list_themes.
engine.helperModel / engine.quickModel: the Claude models AI features fall back to when the user picked none in Settings → AI features (helper default "sonnet", quick default "haiku"); engine.subagentModel: the Claude chats' helper fallback model, for subagents without a model of their own (empty respects Claude Code; Settings → Chats → Claude chats → Helper fallback model); engine.defaultModel: model alias or id for new Claude chats ("" = Claude Code's default; e.g. "opus", "sonnet"); engine.effort: reasoning effort for new Claude chats when their project sets none, "" (the model's default) | "low" | "medium" | "high" | "xhigh" | "max" (a model without effort levels ignores it); engine.defaultPermissionMode: default|acceptEdits|plan|bypassPermissions, for new chats on either provider; engine.dontAskWaitSeconds: 0-600 (default 60), in Don't ask mode how long a request a chat still asks (its own safety checks, e.g. Claude Code's for rm -rf on a critical path) waits for the user before Jig declines it; 0 = decline at once; it never approves anything; engine.idleStopMinutes: 0-1440 (default 20), minutes an idle chat keeps its Claude Code or Codex process before Jig stops it to free memory (the next message resumes the conversation); 0 = keep it until the chat closes; engine.promptSuggestions: true|false, chats on either provider suggest the next message after a turn; engine.aiTitles (an AI model, picked in AI features → Chat names, names each new chat from its first message, default on) is protected: point the user to Settings → Chats; engine.fileCheckpoints: true|false, Claude chats keep file copies so a chat can restore files to before a message; engine.testerModel: Claude chats' tester model, alias or id, for testing in Jig's browser (the jig-tester subagent and Test something…; default "haiku"); engine.searchModel: Claude chats' search model, alias or id, for the jig-search subagent the chat hands code searches to (default "haiku"; "" = no search subagent); engine.claudeAiConnectors: true|false, load the connectors of the user's claude.ai account (Asana, Notion, Linear…) into new chats (default false: none are loaded, so none is flagged as needing sign-in). engine.codexModel: model for new Codex chats, a ChatGPT family "sol" (default) | "terra" | "luna" (each always the newest version of that family) or an exact slug like "gpt-6.1-sol". engine.codexEffort: reasoning effort for new Codex chats when their project sets none, "" (the model's default) | "low" | "medium" | "high" | "xhigh" | "max" | "ultra". engine.codexInstructions: "claude" (default: Codex chats get the user's personal Claude Code instructions, ~/.claude/CLAUDE.md with its @imports) | "off". engine.codexSkills: "claude" (default: Codex chats also get Claude Code's skills: the project's and the user's .claude/skills and Jig's built-in skills, besides Codex's own .agents/skills; nothing is copied) | "off". engine.codexSearchModel (default "luna"), engine.codexTesterModel (default "luna") and engine.codexHelperFallbackModel (default "terra"): the models of Codex chats' search and tester helpers (jig_search_code, jig_test_page: separate Codex calls, D-337), each a ChatGPT family or an exact slug; "" = the helper fallback model, whose "" = Codex's default; they are protected: point the user to Settings → Chats → ChatGPT chats. Settings → Chats shows the settings for every chat (All chats: onLimit, defaultPermissionMode, dontAskWaitSeconds, promptSuggestions, idleStopMinutes, aiTitles, notifications, browser) above the Claude chats and ChatGPT chats groups, which list the same model rows in the same order (Default model, Reasoning effort, Helper fallback model, Tester model, Search model). engine.provider ("claude" | "codex": who runs new chats; a project can override it, a chat keeps its own), engine.codexPath (the user's own codex binary) and engine.codexAllowApiKey (keep OpenAI API keys in Codex chats) are protected: point the user to Settings.
factory.concurrency: 1–6 (default 3), how many stage chats Jig factory runs at once across all its runs; more waiting stages start as running ones finish.
factory.designSources: a list of DESIGN.md libraries (repository addresses or folders, e.g. github.com/VoltAgent/awesome-design-md) that Jig factory's design directions, interview ("Feels like?") and critic use as references (D-444).
skills.overrides: per bundled skill id, { enabled: boolean, excludedProjects: string[] }; missing entries follow the skill's default (enabled everywhere, except Jig factory's skills that start off: web-artifacts, theme-factory, webapp-testing, web-design-guidelines, impeccable, demo-quality). Global off wins; project ids in excludedProjects are excluded. New projects are included by default. Changes apply before the next message, without interrupting work. These controls affect only Jig's bundled library; the user's own personal/project skills stay independent.
chat.overview: true|false, the small overview card at the top right of each chat (turns, tool calls, files, skills, subagents, add-ons, MCP, tokens; Show details opens the full breakdown), default on; chat.view: "compact" (each run of steps folds into one line, the default) or "detailed" (every step as its card), how chats show the assistant's work; chat.times: true|false (default off), a time beside every message and step in chats (off, times show on hover); chatList.view: "project" (default) | "status" (pinned, needs you, working, error, idle) | "recent" (pinned, today, yesterday, last 7 days, older) | "all" (one list), how the Chats list groups chats (chatList.pinnedOrder is set by dragging pinned chats, don't edit it); editor.wordWrap: true|false, long lines wrap in the file editor (Preview), keeping their indentation; editor.showWhitespace: true|false, show spaces and tabs; editor.closeBrackets: true|false, typing a bracket or quote adds the closing one; editor.tabSize: 1–8, indentation for files that don't show their own (the editor follows each file's own indentation); editor.completionProvider ("copilot" | "claude" | "chatgpt"), editor.claudeCompletionModel and editor.chatgptCompletionModel (code completion with Claude or ChatGPT, it spends the user's plan) are protected: point the user to Settings → Editor, and GitHub Copilot is set up there or from the editor's status line; editor.languageServers: true|false (default on), errors, hover, go to definition, rename and formatting from language servers the user installed (Settings → Editor lists them with Install).
notifications.desktop: true|false, a system notification when a chat needs the user or finishes while Jig is in the background. phone.* (Jig on the user's phone through their own bot: channel "telegram" (default) | "teams" (one at a time; switching pauses the other and keeps its setup, so switching back is connected again), enabled, when "away" | "always", awayMinutes 1–60, finished, keepAwake, screenshots) is protected: it decides what leaves the computer, so point the user to Settings → Phone; the bot is paired there.
meetings.aiTranslation: when Teams can't translate a meeting's live captions (it needs Teams Premium), an AI model (AI features → Caption translation) translates each finished caption into the language picked in the meeting (default true; protected: spends the user's plan); meetings.translationModel: the model for it (default "haiku"; protected); meetings.localTranscription: when Teams captions aren't available in a meeting or call, transcribe it on this computer with Whisper (the speech.model; audio never leaves the computer, nothing is recorded; default true; also in the transcript panel's ⋯ menu); meetings.noiseSuppression: noise suppression on the user's microphone in meeting and call audio: Azure Communication Services' deep noise suppression (typing, fans), the browser's own where that isn't supported (default true; also in the call's ⋯ menu and Devices…; a call in progress follows at once); speech.model: "tiny" | "base" (default) | "small", the Whisper model dictation runs on this computer (a bigger one is more accurate, slower and downloads more on first use); speech.language: language code the user speaks ("en", "es"…; "" = recognised automatically); speech.engine: "natural" (default; Kokoro, a realistic voice that runs on this computer, about 330 MB downloaded once) | "system" (the system's own voices) for reading messages aloud; speech.naturalVoice: the natural voice's id (default "af_heart"; American English af_heart, af_bella, af_nicole, af_aoede, af_kore, af_sarah, af_nova, af_alloy, af_sky (women), am_michael, am_fenrir, am_puck (men); British English bf_emma, bf_isabella, bm_george, bm_fable; Spanish ef_dora, em_alex, em_santa); speech.voice: name of the system voice used when speech.engine is "system" ("" = system default); speech.gpu: run Whisper on the graphics card when there is one (default true); speech.live: show words while speaking (default true); speech.pause: ms of silence that ends the user's turn when talking with Jig (400–4000, default 1000); speech.inputDevice / speech.outputDevice: the microphone and speaker speech uses, as browser media device ids ("" = the system's default; the user picks them in Settings → Speech or the talking window's Audio devices, so leave them to the user); speech.noiseFilter: "strong" (default) | "light" | "off", how strictly talking with Jig ignores noise that isn't a voice (dishes, typing, a sniff; a voice detector on this computer; "off" = loudness alone); speech.rate: reading-aloud speed (0.5–2, default 1); speech.workSound: a soft note while Jig thinks during talking, and a chime when work handed over by voice finishes or needs the user (default true). speech.wake: listen for "Hey Jig" voice commands while Jig runs, also minimized (default false; protected: keeps the microphone open, so only the user turns it on: Settings → Speech or a click on the status bar's Hey Jig); speech.wakeProfile: what Train Hey Jig learned from the user's voice (null = not trained; text and numbers only, never audio; protected: only the user trains it, in Settings → Speech → Hey Jig → Train…); speech.announce: with speech.wake, say out loud when a chat finishes or needs the user (default true).
browser.showWhenUsed: true|false, open the browser view when a chat opens a new page in Jig's browser, not on later calls on it (default true; false: it stays out of sight and the user opens the view from Tools). The page has its own size either way, so the view's size never limits the chat. browser.pageSessions: "shared" (default: every chat's page shares cookies and logins, so one sign-in to a dev server carries over, and a logout in one chat logs out the others) | "separate" (each chat's page has its own cookies and storage, gone when the page closes); applies to pages opened afterwards.
projects.repoScanDepth: 1–5, how deep workspaces are searched for repositories.
learning.recording: true|false; retentionDays: 7–3650; exclusions: array of strings never recorded; schedule: { enabled, day (0=Sunday), hour, minute } of the weekly pattern run; model: its Claude model when ai.learning picks none; checkIn: off|weekly|biweekly, a short check-in chat about how the user works (off by default).
ai.<feature> { provider: "claude" | "chatgpt" | "default", model } for each of Jig's one-shot AI features (commitMessage, commitCheck, releaseNotes, tour, attemptsJudge, standup, taskRunReport, chatTitles, learning, meetingTranslation, meetingNotes, taskQueueReorganize, addonQuick, addonHelper); "default" follows who runs the user's chats (engine.provider) on the feature's default model there and is meetingNotes' default (Meetings → Generate notes: Sonnet on Claude, terra on ChatGPT; it sends the meeting's transcript to that provider); on Claude, model "" = the feature's old Claude model; on ChatGPT the model is a family "sol" | "terra" | "luna" (the newest of that family, worked out when the feature runs) or an exact slug, and "" = the feature's default family. Protected (it decides which plan pays): point the user to Settings → AI features.
setup.firstRunDone: true|false.
Not changeable here (Settings page only): engine.claudePath, engine.codexPath, engine.provider, engine.onLimit (when a chat hits its plan limit: "ask" | "switch" (carry on with the other provider in the same chat) | "wait" (resume at the reset); a project can set its own in its dialog; D-338), engine.allowApiKey, engine.codexAllowApiKey, terminal.shell (they decide billing or run programs), azure.activeTenant (the Azure tenant every az Jig runs uses: a key of a tenant added in Jig, "" = the user's own az login; it decides which credentials programs run with, so the user switches it; a project can pin a tenant instead: jig_update_project azureTenant, which switches to it whenever that project becomes active), updates.*, addonGallery.sources (git URLs or folders add-ons are installed from; the user adds them in Add-on gallery), factory.demoKitPath (the demo kit folder Jig factory builds and checks demos with by running its npm scripts; "" = not set; Settings → Jig factory).`;

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
            subagentModel: engine.subagentModel,
            helperModel: engine.helperModel,
            quickModel: engine.quickModel,
            defaultPermissionMode: engine.defaultPermissionMode,
            dontAskWaitSeconds: engine.dontAskWaitSeconds,
            idleStopMinutes: engine.idleStopMinutes,
            promptSuggestions: engine.promptSuggestions,
            aiTitles: engine.aiTitles,
            fileCheckpoints: engine.fileCheckpoints,
            testerModel: engine.testerModel,
            searchModel: engine.searchModel,
            claudeAiConnectors: engine.claudeAiConnectors,
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
        const regions = SIDE_REGIONS.map((r) => {
          const reg = layout[r];
          return `${r} (${reg.collapsed ? "collapsed" : "open"}, ${reg.size}px): ${reg.views.map((v) => `${title(v)} [${v}]${v === reg.active ? " (shown)" : ""}`).join(", ") || "empty"}`;
        });
        return [
          ...regions,
          `hidden: ${layout.hidden.map((v) => `${title(v)} [${v}]`).join(", ") || "none"}`,
          `bottom panel width: ${layout.bottomSpan} (center = under the centre only, both sidebars full height; left / right = also under that sidebar; full = the whole window width)`,
          `named layouts: ${layout.saved.map((l) => l.name).join(", ") || "none"}`,
          `All views: ${views.map((v) => `${v.id} (${v.title})`).join("; ")}`,
          'Change it with jig_change_layout ops: { op: "move", view, region } | { op: "hide", view } | { op: "show", view } | { op: "resize", region, size } | { op: "collapse" | "expand", region } | { op: "below", view, host } (view in the lower half of the host sidebar, a split sidebar; regions: left, left2 = lower left, right, right2 = lower right, bottom) | { op: "span", span: "center" | "left" | "right" | "full" } (how far the bottom panel reaches; sizes stay) | { op: "save", name } (save where every view is as a named layout) | { op: "use", name } (switch to a named layout).',
        ].join("\n");
      },
    },
    {
      name: "jig_change_layout",
      description:
        "Move, hide, show or resize views, put a view in the lower half of a sidebar (a split sidebar), collapse/expand a region, set how far the bottom panel reaches (span: center, left, right or full width), or save / switch to a named layout. Applied at once; the user can undo it from the chat.",
      shape: {
        ops: z.array(
          z.object({
            op: z.enum([
              "move",
              "hide",
              "show",
              "resize",
              "collapse",
              "expand",
              "below",
              "span",
              "save",
              "use",
            ]),
            span: z.enum(BOTTOM_SPANS).optional(),
            name: z.string().max(60).optional(),
            host: z.string().optional(),
            view: z.string().optional(),
            region: z.enum(SIDE_REGIONS).optional(),
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
          [
            o.op,
            o.name && `"${o.name}"`,
            o.view,
            o.host && `under ${o.host}`,
            o.region && `→ ${o.region}`,
            o.span && `→ ${o.span}`,
            o.size && `${o.size}px`,
          ]
            .filter(Boolean)
            .join(" "),
        );
        await deps.addCard(
          meta.id,
          card("Changed Jig's layout", details, {
            type: "layout",
            layout: before,
          }),
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
            p.provider ? `chats on ${p.provider}` : "",
            p.model ? `model ${p.model}` : "",
            p.effort ? `effort ${p.effort}` : "",
            p.permissionMode ? `permissions ${p.permissionMode}` : "",
            p.azureTenant ? `Azure tenant ${tenantName(deps, p.azureTenant)}` : "",
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
      description: `Create a project: a name and a default workspace folder (an absolute path, usually one of the workspaces), optionally a default Git repository inside it, colour (${PROJECT_COLORS.join(", ")}), model, effort, permission mode, instructions added to the system prompt of its chats, and starter prompts. It becomes the active project.`,
      shape: { name: z.string(), path: z.string(), ...projectFields },
      handler: async (args, meta: SessionMeta) => {
        const { defaultRepo, ...settings } = withTenantKey(deps, args as Record<string, unknown>);
        const project = await deps.createProject({
          ...(settings as ProjectPatch),
          name: String(args.name),
          path: String(args.path),
        });
        if (typeof defaultRepo === "string" && defaultRepo) await deps.setFocusRepo(project.id, defaultRepo);
        const details = describeProjectPatch(deps, { ...settings, defaultRepo });
        await deps.addCard(
          meta.id,
          card(`Created project ${project.name}`, details, {
            type: "projectCreated",
            id: project.id,
          }),
        );
        return `Created ${project.name} [${project.id}]:\n${details.join("\n")}`;
      },
    },
    {
      name: "jig_update_project",
      description: `Change a project: name, colour (${PROJECT_COLORS.join(", ")}), default workspace folder (path), default Git repository (defaultRepo, a repository of its workspace; "" for none), and the defaults for its new chats: model, effort, permissionMode, instructions (added to the system prompt of its chats), starters (prompts on its Home), and azureTenant (the Azure tenant Jig switches to when the project becomes active; "" = Default, the tenant in use stays). An empty string or list clears a preference. Without projectId: this chat's project.`,
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
        const {
          projectId: _id,
          defaultRepo,
          ...patch
        } = withTenantKey(deps, args as Record<string, unknown>);
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
        const details = describeProjectPatch(deps, {
          ...patch,
          ...(defaultRepo !== undefined ? { defaultRepo } : {}),
        });
        await deps.addCard(
          meta.id,
          card(`Changed project ${project.name}`, details, {
            type: "project",
            id,
            patch: before,
          }),
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
        const input = args.links as Array<{
          url: string;
          label?: string;
          type?: LinkType;
        }>;
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
  effort: z.enum([...ANY_EFFORT_LEVELS, ""]).optional(),
  permissionMode: z.enum([...PERMISSION_MODES, ""]).optional(),
  instructions: z.string().optional().describe("Added to the system prompt of this project's chats"),
  starters: z.array(z.string()).optional().describe("Prompts shown on the project's Home"),
  azureTenant: z
    .string()
    .optional()
    .describe(
      'Azure tenant Jig switches to when the project becomes active: a tenant\'s key, name, domain or tenant id from jig_azure_tenants ("default" = the user\'s own az login; "" = Default, the tenant in use stays)',
    ),
};

/** Turns the `azureTenant` Claude gave (key, name, domain…) into a tenant key; "" stays (Default). */
function withTenantKey(deps: ConfigureDeps, args: Record<string, unknown>): Record<string, unknown> {
  const wanted = args.azureTenant;
  if (typeof wanted !== "string" || !wanted.trim() || !deps.tenants) return args;
  const state = deps.tenants();
  const tenant = findTenant(state, wanted);
  if (!tenant)
    throw new Error(
      `No Azure tenant ${JSON.stringify(wanted)}. Jig has: ${state.tenants.map((t) => `${t.label} [${t.key}]`).join(", ")}`,
    );
  return { ...args, azureTenant: tenant.key };
}

/** A pinned tenant by name; one that was removed says it counts as Default. */
function tenantName(deps: ConfigureDeps, key: string): string {
  const state = deps.tenants?.();
  if (!state) return key;
  if (pinnedTenant(state, key).removed) return `${key} (removed, so Default)`;
  return state.tenants.find((t) => t.key === key)?.label ?? key;
}

function describeProjectPatch(deps: ConfigureDeps, patch: Record<string, unknown>): string[] {
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
    azureTenant: "Azure tenant",
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
          : k === "azureTenant"
            ? tenantName(deps, String(v))
            : String(v);
      return `${labels[k]}: ${value.length > 120 ? `${value.slice(0, 120)}…` : value}`;
    });
}
