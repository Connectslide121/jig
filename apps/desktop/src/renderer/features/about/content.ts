import type { SlotId } from "@jig/sdk";

/** Things to build, by level: chips on the page open the Build dialog with the goal filled in. */
export const BUILD_EXAMPLES: Array<{ level: string; what: string; goals: string[] }> = [
  {
    level: "Layout and settings",
    what: "Move views, change defaults, pick themes. Undo is one click.",
    goals: [
      "Put the Git view in the right sidebar and the terminals at the bottom",
      "Use a light theme during the day",
    ],
  },
  {
    level: "An add-on",
    what: "New views, tabs, buttons, menus and watchers. Claude writes it, Jig checks and loads it.",
    goals: [
      "A view that lists my Azure DevOps pipelines and their last run",
      "A status bar item with the current branch of the focus repo",
      "A chat button that asks Claude to write the commit message for my staged changes",
      "Warn me when a pipeline run fails (check every 5 minutes)",
    ],
  },
  {
    level: "A new extension point",
    what: "When no slot fits, the builder writes a proposal for a new slot. You add it to Jig's code yourself.",
    goals: ["Let add-ons add columns to the Repos overview"],
  },
];

/** What each slot is good for, and a manifest snippet to show. */
export const SLOT_EXAMPLES: Record<SlotId, { idea: string; snippet: string }> = {
  view: {
    idea: "A pipelines list, a todo list, a database browser",
    snippet:
      '"views": [{ "id": "pipelines", "title": "Pipelines", "icon": "rocket", "component": "PipelinesView" }]',
  },
  "workbench.tab": {
    idea: "A pipeline run's log, a big report, a form",
    snippet: '"tabs": [{ "type": "run", "title": "Pipeline run", "icon": "rocket", "component": "RunTab" }]',
  },
  "topbar.item": {
    idea: "An environment badge, a quick toggle",
    snippet: '"topbar": [{ "id": "env", "component": "EnvBadge" }]',
  },
  "statusbar.item": {
    idea: "The current branch, a build status dot",
    snippet: '"statusbar": [{ "id": "branch", "side": "left", "component": "Branch" }]',
  },
  "dashboard.widget": {
    idea: "Open pull requests, last deploy, test coverage",
    snippet: '"dashboard": [{ "id": "prs", "component": "OpenPrs", "order": 20 }]',
  },
  "tools.action": {
    idea: "Run something with a shortcut",
    snippet:
      '"actions": [{ "id": "deploy", "title": "Deploy to test", "shortcut": "Mod+Shift+D", "run": "deploy" }]',
  },
  "context.file": {
    idea: "“Explain this change” on a changed file",
    snippet:
      '"menus": [{ "slot": "context.file", "id": "explain", "title": "Explain change", "run": "explain" }]',
  },
  "context.project": {
    idea: "“Open in Azure DevOps” on a project",
    snippet:
      '"menus": [{ "slot": "context.project", "id": "ado", "title": "Open in Azure DevOps", "run": "openAdo" }]',
  },
  "context.repo": {
    idea: "“Pull all” or “Open pipelines” on a repository",
    snippet:
      '"menus": [{ "slot": "context.repo", "id": "pipes", "title": "Open pipelines", "run": "openPipes" }]',
  },
  "context.message": {
    idea: "“Save as note” on a chat message",
    snippet:
      '"menus": [{ "slot": "context.message", "id": "note", "title": "Save as note", "run": "saveNote" }]',
  },
  "chat.toolbar": {
    idea: "A button that adds the staged diff to the chat",
    snippet: '"chatToolbar": [{ "id": "diff", "component": "AddDiffButton" }]',
  },
  "chat.toolRenderer": {
    idea: "A nicer card for an MCP tool's result",
    snippet: '"toolRenderers": [{ "tool": "mcp__ado__get_run", "component": "RunCard" }]',
  },
  prompt: {
    idea: "“Review my changes”, “Write tests for this”",
    snippet: '"prompts": [{ "id": "review", "label": "Review", "text": "Review my uncommitted changes." }]',
  },
  watcher: {
    idea: "Poll pipelines, watch a queue, check a URL",
    snippet: '"watchers": [{ "id": "runs", "every": "5m", "run": "checkRuns" }]',
  },
  "claude.tool": {
    idea: "“What changed since the last release?”, “Which pipelines failed today?”",
    snippet:
      '"tools": [{ "id": "changes", "description": "Commits since the last release", "params": { "repo": { "optional": true } }, "readOnly": true, "run": "changes" }]',
  },
  "settings.page": {
    idea: "An add-on's own options",
    snippet: '"settings": { "title": "Pipelines", "component": "PipelineSettings" }',
  },
  theme: {
    idea: "Your own colours, or a VS Code theme",
    snippet: '"themes": [{ "label": "Night", "path": "themes/night.json" }]',
  },
};

/** Things to ask in a chat: "Try in a chat" opens a new chat with the text in the composer. */
export const CONFIGURE_EXAMPLES = [
  "Switch to a dark theme that is easy on the eyes",
  "Find and install the Dracula theme",
  "Make the chat font bigger and use JetBrains Mono in the terminal",
  "Move the Git view to the right sidebar",
  "Turn off the Pipelines add-on",
  "Look for repositories 4 folders deep in this workspace",
];

/** The tools Jig gives Claude in every chat (main/configure/tools.ts). */
export const CONFIGURE_TOOLS: Array<{ name: string; what: string }> = [
  { name: "jig_get_settings", what: "Read the settings and what each one does" },
  { name: "jig_update_settings", what: "Change settings (protected ones ask you first)" },
  { name: "jig_list_themes", what: "List the installed colour and icon themes" },
  { name: "jig_find_themes", what: "Search the VS Code marketplace for themes" },
  { name: "jig_install_theme", what: "Install a theme from the marketplace" },
  { name: "jig_get_layout", what: "See where views are" },
  { name: "jig_change_layout", what: "Move, show and hide views; resize panes" },
  { name: "jig_list_addons", what: "List add-ons" },
  { name: "jig_set_addon_enabled", what: "Turn an add-on on or off" },
  { name: "jig_list_projects", what: "See your projects, their settings and links" },
  { name: "jig_create_project", what: "Make a project with its folder, defaults and instructions" },
  { name: "jig_update_project", what: "Change a project: name, colour, defaults, instructions, starters" },
  { name: "jig_move_chat", what: "Move a chat to another project, or pin it" },
  { name: "jig_add_project_links", what: "Add links to a project (Azure resources, sites, boards)" },
  { name: "jig_get_addon", what: "Look inside an add-on: what it does, its files and its data" },
  { name: "jig_set_addon_data", what: "Create or change an add-on's data (e.g. a workflow), with Undo" },
  { name: "jig_delete_addon_data", what: "Delete an add-on's data, with Undo" },
  { name: "jig_note_evidence", what: "Note work you do by hand, for suggestions (a card you can remove)" },
  { name: "jig_update_profile", what: "Add to what Jig knows about how you work" },
  { name: "jig_request_build", what: "Hand something new to the builder (you review it first)" },
];
