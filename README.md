<p align="center">
  <img src="apps/desktop/build/icon.png?v=5" alt="Jig" width="112">
</p>

<h1 align="center">Jig</h1>

<p align="center">
  <b>Your desktop workbench around Claude Code — that builds its own tools.</b><br>
  Chats, all your repositories, git, terminals and scripts in one window.<br>
  Ask for a tool you're missing, and Jig makes it.
</p>

<p align="center">
  <a href="#get-started">Get started</a> ·
  <a href="#build-your-own-tools">Build your own tools</a> ·
  <a href="#extension-slots">Extension slots</a> ·
  <a href="docs/README.md">Docs</a>
</p>

<p align="center">
  <img src="apps/desktop/src/renderer/features/about/shots/chat.jpg?v=5" alt="A chat with Claude Code next to the Git view of a workspace with four repositories" width="900">
</p>

> In woodworking, a **jig** is a custom tool you make yourself so a repetitive job gets faster and
> more precise. Jig does the same for your work with Claude Code. The logo is one: a corner jig, a
> fence that holds the piece exactly where it should be.

## Why Jig

If you live in Claude Code, your day is spread over terminals, an editor for git and diffs, a browser
for pipelines and a few scripts you keep retyping. Jig puts it in one place:

- **The real Claude Code.** Every chat is an official Claude Code session, with your CLAUDE.md files,
  skills, MCP servers, plugins and **your own subscription**. Jig adds a workbench around it; it
  doesn't replace the agent.
- **Many chats, many repositories.** Run several sessions at once across projects. Jig shows which one
  needs you.
- **Open your whole repos folder.** A folder of repositories works as one workspace: one Git panel for
  all of them, every repo's scripts, and chats that can look at another repo for inspiration.
- **Tools you build by asking.** Describe a button, a view or a watcher and Jig's builder writes it as
  an add-on. You review it before it's kept.
- **Claude in parallel.** Hand one task to several Claude Code chats at once, each in its own git
  worktree and from its own angle; Claude judges the results and you keep the best.
- **Claude checks its own work.** Claude opens your dev server in its own browser inside Jig, clicks
  through it, takes screenshots and reads the console, while you watch live and can take over. Its
  dev servers run in Jig terminals you can see.
- **Configure it by talking.** "Use a darker theme", "move Git to the right": Claude changes Jig's
  settings and layout for you, with an Undo on every change.
- **Menus, not commands.** Everything is a visible button or menu item. No syntax to remember.

## A tour

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="apps/desktop/src/renderer/features/about/shots/dashboard.jpg?v=5" alt="Workspace dashboard">
      <b>Workspaces.</b> Add your repos folder once. Jig finds the repositories inside (three levels
      deep), lists every repo's scripts and runs them in real terminals.
    </td>
    <td width="50%" valign="top">
      <img src="apps/desktop/src/renderer/features/about/shots/git.jpg?v=5" alt="Git view and diff">
      <b>Git for every repo.</b> Changes of all repositories in one panel: stage, commit, push, pull,
      branches, history, side-by-side or inline diffs, image diffs. <b>Write</b> asks Claude for the
      commit message; any change or repo can be explained or reviewed by Claude in one click.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <img src="apps/desktop/src/renderer/features/about/shots/configure.jpg?v=5" alt="Claude changing Jig's theme from a chat">
      <b>Claude configures Jig.</b> Ask in any chat to change the theme, fonts, layout or add-ons. Each
      change shows as a card with Undo. Billing settings are never touched from a chat.
    </td>
    <td valign="top">
      <img src="apps/desktop/src/renderer/features/about/shots/build.jpg?v=5" alt="The builder with a new add-on ready to review">
      <b>The builder.</b> "A button that runs the tests of the active project" becomes an add-on.
      You see the files and a live preview, then Accept or Discard.
    </td>
  </tr>
  <tr>
    <td colspan="2" valign="top">
      <img src="apps/desktop/src/renderer/features/about/shots/attempts.jpg?v=5" alt="Three attempts at the same task, with Claude's verdict">
      <b>Try several ways.</b> One task, 2–4 Claude Code chats at once, each in its own git worktree and
      from a different angle (simplest, cleanest, most thorough…). Compare their changes, let Claude judge,
      and keep the winner: it lands in your working copy, the rest disappears.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <img src="apps/desktop/src/renderer/features/about/shots/tour.jpg?v=5" alt="A guided tour of changes">
      <b>Guided tours of changes.</b> Claude orders your uncommitted changes for understanding and explains
      each step next to its highlighted diff. Also: check before committing, and commit messages in your
      repo's style.
    </td>
    <td valign="top">
      <img src="apps/desktop/src/renderer/features/about/shots/preview.jpg?v=5" alt="A Markdown preview with a Mermaid diagram">
      <b>Previews for everything Claude writes.</b> Markdown with Mermaid diagrams, HTML, PDF, CSV and Excel
      tables, JSON, notebooks, media and code. Previews follow the file as it changes, with Ask Claude
      one click away.
    </td>
  </tr>
  <tr>
    <td colspan="2" valign="top">
      <img src="apps/desktop/src/renderer/features/about/shots/browser.jpg?v=5" alt="Claude checking a shop page in its own browser, with the screenshot in the chat">
      <b>Claude's browser.</b> Claude opens your dev server in a real browser inside Jig, reads the page,
      clicks and types like a person, takes screenshots (shown in the chat) and reads the console. You
      watch it live next to the chat, switch to tablet or phone size, and take over with your own mouse
      and keyboard. Long-running commands Claude starts run in Jig terminals you can see and stop.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <img src="apps/desktop/src/renderer/features/about/shots/suggestions.jpg?v=5" alt="A suggestion based on repeated actions">
      <b>Suggestions.</b> Jig notices what you repeat (locally, on your machine) and suggests a tool
      for it, with an estimate of the time it saves.
    </td>
    <td valign="top">
      <img src="apps/desktop/src/renderer/features/about/shots/usage.jpg?v=5" alt="Plan usage card">
      <b>Your plan limits, always visible.</b> The 5-hour and weekly windows of your Claude plan, in
      the status bar and on a ring in every chat. Hover for when each one resets.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <img src="apps/desktop/src/renderer/features/about/shots/context.jpg?v=5" alt="Context window breakdown with a Compact button">
      <b>Context window and Compact.</b> How full each chat's context is and what fills it, as Claude
      Code reports it. From 70% a <b>Compact</b> button appears; one click runs Claude Code's /compact.
    </td>
    <td valign="top">
      <img src="apps/desktop/src/renderer/features/about/shots/settings.jpg?v=5" alt="Appearance settings">
      <b>Styled your way.</b> Jig Dark and Jig Light, any VS Code colour theme (from your VS Code or the
      marketplace) and VS Code file icon themes like Material Icon Theme.
    </td>
  </tr>
  <tr>
    <td colspan="2" valign="top">
      <img src="apps/desktop/src/renderer/features/about/shots/about.jpg?v=5" alt="The What Jig can do page">
      <b>Everything in one page.</b> "What Jig can do" is the welcome screen and always one click away
      in the <b>Jig menu</b> (the logo, top left): every feature, the extension slots, your add-ons and
      skills, keyboard shortcuts, and examples you can try in one click.
    </td>
  </tr>
</table>

And more: paste screenshots and drop PDF, Word, Excel and PowerPoint files into a chat; permission
cards with Allow once / Always / Deny; queue messages while Claude works; next-message suggestions;
restore files to before any message and fork a chat; images from tools in the chat; turn a chat into a tool; Ask Claude when a
script fails; a standup written from your commits and chats; desktop notifications when a chat needs
you; resizable panes; a scripts
runner with groups; Azure DevOps pipelines; a Tools menu with keyboard shortcuts.

## Build your own tools

Ask from the Tools menu, a chat, a suggestion or a slot on the "What Jig can do" page. The builder
(itself a Claude Code session) picks the lightest thing that works:

| | What it makes | Example |
|---|---|---|
| **1. Layout and settings** | Moves views, changes defaults | "Put the Git view on the right and the terminals at the bottom" |
| **2. An add-on** | Views, tabs, buttons, menus, watchers: React components plus optional host code | "A view with my Azure DevOps pipelines and their last run" |
| **3. A proposal** | When no extension point fits, a written proposal for a new slot. You add it to Jig's code yourself | "Let add-ons add columns to the Repos overview" |

Every build is previewed and kept only when you accept it. **Jig never edits its own source code:**
it grows through add-ons and the extension points you choose to add.

## Extension slots

Add-ons are folders in `~/.jig/addons` with an `addon.json`, React components and optional host code.
They can plug into 16 places:

<p align="center">
  <img src="apps/desktop/src/renderer/features/about/shots/slots.jpg?v=5" alt="The extension slots on the What Jig can do page" width="900">
</p>

| Slot | Where it shows | Slot | Where it shows |
|---|---|---|---|
| `view` | a sidebar or the bottom panel | `context.file` | right-click menu of a file |
| `workbench.tab` | a tab in the main area | `context.project` | right-click menu of a project |
| `topbar.item` | the top bar | `context.repo` | right-click menu of a repository |
| `statusbar.item` | the status bar | `context.message` | menu of a chat message |
| `dashboard.widget` | the project dashboard | `chat.toolbar` | a button above the composer |
| `tools.action` | the Tools menu, with a shortcut | `chat.toolRenderer` | a custom card for a tool's result |
| `prompt` | a reusable prompt button | `watcher` | host code on an interval |
| `settings.page` | a page in Settings | `theme` | a colour theme |

Built in: **Git**, **Repos**, **Scripts** and **Pipelines** (Azure DevOps) are add-ons too, written
against the same API. Guide: [`docs/guides/writing-addons.md`](docs/guides/writing-addons.md) ·
reference: [`docs/reference/slots.md`](docs/reference/slots.md),
[`docs/reference/addon-api.md`](docs/reference/addon-api.md).

## Your subscription, your credentials

- Jig runs the official **Claude Code** through the Claude Agent SDK. You sign in to Claude Code
  yourself (`claude`, then `/login`). **Jig never reads, stores or forwards your Claude login.**
- By default `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` are removed from chat sessions, so usage goes
  to your Claude plan, not to pay-as-you-go API billing.
- git, GitHub and Azure work with your own `git`, `gh` and `az`. Jig stores no tokens.
- Everything Jig keeps (settings, layout, chats, add-ons, the activity it learns from) is in `~/.jig`
  on your machine.

## Get started

**You need:** Windows 10/11 (macOS and Linux work for development), [Node.js](https://nodejs.org)
22.12 or newer, git, and [Claude Code](https://docs.claude.com/en/docs/claude-code) signed in with
your Claude account.

**Install** (builds the Windows installer on your machine):

```powershell
git clone https://github.com/Connectslide121/jig.git
cd jig
npm install
npm run dist     # → apps/desktop/release/Jig-Setup-<version>.exe
```

On first start, **Get started** checks Claude Code, git, gh, az and VS Code and links what's missing.
Later, **Jig menu → Check for updates…** pulls, builds and restarts. Details:
[`docs/guides/packaging.md`](docs/guides/packaging.md).

**Or run it from source:**

```bash
npm install
npm run dev                    # Electron with hot reload
JIG_ENGINE=fake npm run dev    # try it without Claude Code: a scripted fake engine
```

Then **Add project…**, pick a repository or your whole repos folder, and press **Ctrl+N** for a chat.
Lost? The welcome screen and the **Jig menu** (top left) show everything Jig can do.

## Develop

```bash
npm run check    # typecheck, lint, unit tests, design-token check — before every commit
npm run e2e      # build, then Playwright drives the real app (Linux: xvfb-run)
```

Electron + React + TypeScript, Tailwind with design tokens, Vitest and Playwright. Start with
[`AGENTS.md`](AGENTS.md) (the rules, for people and coding agents alike), then
[`docs/vision.md`](docs/vision.md), [`docs/architecture.md`](docs/architecture.md) and
[`docs/status.md`](docs/status.md). All documentation: [`docs/`](docs/README.md).

The screenshots here and on the "What Jig can do" page are generated from the real app with a demo
workspace: `JIG_SCREENSHOTS=1 xvfb-run -a npx playwright test e2e/screenshots.spec.ts`.

## Status

A personal project, built for one developer's daily work and growing from there. All planned
phases are done ([plan](docs/plan/README.md)); what works and what still needs testing on a real
Windows machine is in [`docs/status.md`](docs/status.md).
