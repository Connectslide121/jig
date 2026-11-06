/**
 * Extension slots: every place an add-on can contribute to. Documented in docs/reference/slots.md —
 * keep both in sync. The manifest key for each slot is in `MANIFEST_KEY`.
 */
export const SLOTS = {
  view: "A view in a sidebar or the bottom panel (the layout decides where; the user can move it).",
  "workbench.tab": "A tab type for the main area, opened with ctx.openTab().",
  "topbar.item":
    'A small item in the top bar (button, badge); placement "right-start" puts it first on the right, before Suggestions.',
  "statusbar.item": "A small item in the status bar, left or right.",
  "dashboard.widget": "A card on the project dashboard.",
  "tools.action": "An action in the grouped top-bar menus and search (optionally with a keyboard shortcut).",
  "tools.menuGroup":
    "Live entries in a top-bar menu, computed each time it opens (Start/Stop by state, one entry per project).",
  "context.file": "An entry in the right-click menu of a file (Git changes, commit files).",
  "context.project": "An entry in the right-click menu of a project.",
  "context.repo": "An entry in the right-click menu of a repository (Repos overview).",
  "context.message": "An entry in the menu of a chat message.",
  "chat.toolbar": "A button above the chat composer.",
  "chat.overview":
    "A collapsible section in a chat's overview card, below Jig's own numbers; re-rendered when a turn finishes.",
  "chat.toolRenderer": "A custom card for a tool's result in the chat.",
  "chat.permissionRenderer":
    "A custom approval card for one of the add-on's tools in the chat: the user can change what Jig asked before allowing it.",
  prompt: "A reusable prompt shown as a button above the composer.",
  watcher: "Host code that runs on an interval (e.g. check pipeline runs).",
  "claude.tool": "A tool Jig can use in every chat (host code; read-only tools run without asking).",
  "claude.context": "What Jig should know in every turn of a chat (host code returning text).",
  "jig.event":
    "Host code that runs when something happens in Jig: a chat finished or needs you, a commit, a branch switch, another active project.",
  "search.provider":
    "Results in Jig's search (top bar, Ctrl+P), e.g. work items or pipelines by name or number.",
  "app.quitGuard":
    "Host code Jig asks before it quits: a reason to wait (a running timer, unsaved work) with buttons such as Stop and quit.",
  "settings.page": "A page in Settings.",
  theme: "A colour theme (Jig or VS Code format JSON).",
} as const;

export type SlotId = keyof typeof SLOTS;

export const MANIFEST_KEY: Record<SlotId, string> = {
  view: "views",
  "workbench.tab": "tabs",
  "topbar.item": "topbar",
  "statusbar.item": "statusbar",
  "dashboard.widget": "dashboard",
  "tools.action": "actions",
  "tools.menuGroup": "menuGroups",
  "context.file": "menus",
  "context.project": "menus",
  "context.repo": "menus",
  "context.message": "menus",
  "chat.toolbar": "chatToolbar",
  "chat.overview": "chatOverview",
  "chat.toolRenderer": "toolRenderers",
  "chat.permissionRenderer": "permissionRenderers",
  prompt: "prompts",
  watcher: "watchers",
  "claude.tool": "tools",
  "claude.context": "context",
  "jig.event": "events",
  "search.provider": "search",
  "app.quitGuard": "quitGuards",
  "settings.page": "settings",
  theme: "themes",
};

export const CONTEXT_SLOTS = ["context.file", "context.project", "context.repo", "context.message"] as const;
export type ContextSlot = (typeof CONTEXT_SLOTS)[number];

/** Full ids used in Jig's registries, so add-ons never collide with core or each other. */
export const addonViewId = (addonId: string, viewId: string) => `addon.${addonId}.${viewId}`;
export const addonTabType = (addonId: string, type: string) => `addon.${addonId}.${type}`;
export const addonActionId = (addonId: string, id: string) => `addon.${addonId}.${id}`;
/** The name Claude sees for an add-on's tool (`mcp__jig__addon_releases_changes`). */
export const addonToolName = (addonId: string, toolId: string) =>
  `addon_${addonId.replace(/[^a-z0-9]/g, "_")}_${toolId}`;
