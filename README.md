<p align="center">
  <img src="apps/desktop/build/icon.png?v=13" alt="Jig" width="112">
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
  <img src="apps/desktop/src/renderer/features/about/shots/chat.jpg?v=13" alt="A chat with Claude Code next to the Git view of a workspace with four repositories" width="900">
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
- **Everything Claude Code's terminal does, with menus.**
  - Commands and skills on `/`, files on `@`, shell on `!`, memory on `#`.
  - Todo lists, plan approval, diffs, subagent progress and background tasks.
  - Rewind and edit, effort levels, MCP status.
  - An overview card beside each chat (tool calls, skills, subagents, MCP, files, tokens), with the full breakdown a click away.
- **Models for the work.** Opus plans and Sonnet executes by default, with configurable subagent, helper and tester models. A few top-bar menus (Chats, Code, Build, View) hold every action.
- **Many chats, many repositories.** Run several sessions at once across projects. Jig shows which one
  needs you, and a **chats board** puts every chat in columns: needs you, working, unread, errors.
- **A task queue.** Queue prompts (or ask Claude to make one task per spec); Claude does them in order,
  each in a new chat or continuing the one before, and reports how each went — outcome, summary,
  things to know, follow-ups — in one table with links to the chats.
- **Projects you manage.** Group chats into projects the way you think about your work, each with a
  default folder and repo, model and permission defaults, and instructions for Claude. Drag chats
  between them; pin the ones you keep.
- **Open your whole repos folder.** A folder of repositories works as one workspace: one Git panel that
  follows the repo you work in (show others next to it when you need them, Repos below for all of
  them at a glance, with fetch, pull, push and a branch switcher), every repo's scripts, and chats that can look at another repo for inspiration.
- **Files and a real editor.** The project's tree with git colours, and code that is editable right in
  Preview: your theme's code colours, indentation guides, closing brackets, several cursors, folding,
  find and replace, go to line and a status line. Two tabs side by side when you need both.
- **Releases with discipline.** Per repository, a release policy Claude helps you set up (or that
  adopts what you already do). Jig shows what's unreleased, drafts the changelog and notes with Claude,
  and releases in one action; it warns when production gets a build without a version.
- **Jig learns how you work.** Locally, it notices what you repeat, what slows you down and what you
  tell Claude you do by hand, and suggests what would help: a tool, a **workflow**, a CLAUDE.md line, a
  routine, a tip. One page shows everything it knows, and you can edit or delete it. Workflows can run
  on a schedule, after you push, or when a pipeline finishes.
- **Tools you build by asking.** Describe a button, a view or a watcher and Jig's builder writes it as
  an add-on. You review it before it's kept. When an add-on can't do it, the builder writes a
  development request (spec, prompt, mockup) that one button emails to the developers. Share add-ons
  as a file, or install them from an **add-on gallery**: a git repository or folder your team keeps.
- **Claude in parallel.** Hand one task to several Claude Code chats at once, each in its own git
  worktree and from its own angle; Claude judges the results and you keep the best.
- **Claude checks its own work.** Claude opens your dev server in its own browser inside Jig,
  clicks through it, takes screenshots at phone, tablet and desktop sizes and reads the console and the network requests, while you
  watch live and can take over. Its
  dev servers run in Jig terminals you can see.
- **Routines and artifacts.** Your Claude Code routines in one tab (schedules, runs, logs, Run now),
  and Claude's published artifacts open right in Jig.
- **Configure it by talking.** "Use a darker theme", "move Git to the right": Claude changes Jig's
  settings and layout for you, with an Undo on every change.
- **Menus for everything.** Claude Code's shortcuts (`/`, `@`, `!`, `#`, Shift+Tab) work, and every
  one of them is also a visible button or menu item, so there is nothing to memorise.

## A tour

<table>
  <tr>
    <td colspan="2" valign="top">
      <img src="apps/desktop/src/renderer/features/about/shots/chat-tools.jpg?v=13" alt="A chat with Claude's todo list, an edit with its diff and a plan to approve">
      <b>Claude Code, in a window.</b> Everything its terminal shows, as cards:
      <ul>
        <li>Claude's todo list as a checklist, and plans you approve or send back with feedback.</li>
        <li>Every edit's diff, subagents with their progress, and background tasks with Stop.</li>
        <li>In the message box: <code>/</code> for Claude Code's commands and skills, <code>@</code> for
          files, <code>!</code> for shell commands, <code>#</code> to remember things, ↑ for history,
          and Shift+Tab for modes.</li>
        <li>Rewind to before any message and edit it, pick a model and effort, and find in the chat.</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="apps/desktop/src/renderer/features/about/shots/dashboard.jpg?v=13" alt="Workspace dashboard">
      <b>A Home for every project.</b> Type what Claude should do and press Enter. Recent chats, next
      steps and every repo's scripts are right below. Add your whole repos folder once: Jig finds the
      repositories inside (three levels deep).
    </td>
    <td width="50%" valign="top">
      <img src="apps/desktop/src/renderer/features/about/shots/git.jpg?v=13" alt="Git view and diff">
      <b>Git for every repo.</b> The repo you work in (or any set of them) in one panel: stage, commit, push, pull,
      branches, history, side-by-side or inline diffs, image diffs. <b>Write</b> asks Claude for the
      commit message; any change or repo can be explained or reviewed by Claude in one click.
    </td>
  </tr>
  <tr>
    <td colspan="2" valign="top">
      <img src="apps/desktop/src/renderer/features/about/shots/files.jpg?v=13" alt="The file tree, a file being edited and a Markdown preview beside it">
      <b>Files and editing.</b> The project's tree with git colours and a filter. Code and text open
      editable in your theme's colours; Ctrl+S saves, and if Claude changes the file meanwhile Jig asks
      before replacing your edits. Split the main area to keep a preview, a chat or a diff beside it.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <img src="apps/desktop/src/renderer/features/about/shots/releases.jpg?v=13" alt="A repository's release policy and a release drafted with Claude">
      <b>Releases.</b> Each repository gets a release policy (<code>.jig/release.json</code>, shared
      with your team): planned releases, continuous deploys, or none. See what's unreleased, let Claude
      suggest the bump and write the changelog and customer notes, then release: version, changelog,
      commit, tag and push in one step. "What's live" shows each environment.
    </td>
    <td valign="top">
      <img src="apps/desktop/src/renderer/features/about/shots/workflows.jpg?v=13" alt="A release workflow half-way">
      <b>Workflows.</b> The things you repeat, as steps per project. Jig runs the commands, scripts,
      pipelines and messages to Claude it can, asks before others and leaves the rest to you. Schedule
      them, export them as a Claude Code skill, or move them to the cloud.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <img src="apps/desktop/src/renderer/features/about/shots/configure.jpg?v=13" alt="Claude changing Jig's theme from a chat">
      <b>Claude configures Jig.</b> Ask in any chat to change the theme, fonts, layout or add-ons. Each
      change shows as a card with Undo. Billing settings are never touched from a chat.
    </td>
    <td valign="top">
      <img src="apps/desktop/src/renderer/features/about/shots/build.jpg?v=13" alt="The builder with a new add-on ready to review">
      <b>The builder.</b> "A button that runs the tests of the active project" becomes an add-on.
      You see the files and a live preview, then Accept or Discard.
    </td>
  </tr>
  <tr>
    <td colspan="2" valign="top">
      <img src="apps/desktop/src/renderer/features/about/shots/attempts.jpg?v=13" alt="Three attempts at the same task, with Claude's verdict">
      <b>Try several ways.</b> One task, 2–4 Claude Code chats at once, each in its own git worktree and
      from a different angle (simplest, cleanest, most thorough…). Compare their changes, let Claude judge,
      and keep the winner: it lands in your working copy, the rest disappears.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <img src="apps/desktop/src/renderer/features/about/shots/tour.jpg?v=13" alt="A guided tour of changes">
      <b>Guided tours of changes.</b> Claude orders your uncommitted changes for understanding and explains
      each step next to its highlighted diff. Also: check before committing, and commit messages in your
      repo's style.
    </td>
    <td valign="top">
      <img src="apps/desktop/src/renderer/features/about/shots/preview.jpg?v=13" alt="A Markdown preview with a Mermaid diagram">
      <b>Previews for everything Claude writes.</b> Markdown with Mermaid diagrams, HTML, PDF, CSV and Excel
      tables, JSON, notebooks, media and code. Previews follow the file as it changes, with Ask Claude
      one click away.
    </td>
  </tr>
  <tr>
    <td colspan="2" valign="top">
      <img src="apps/desktop/src/renderer/features/about/shots/browser.jpg?v=13" alt="Claude checking a shop page in its own browser, with the screenshot in the chat">
      <b>Claude's browser.</b> Claude opens your dev server in a real browser inside Jig, reads the page,
      clicks and types like a person, takes screenshots (shown in the chat) and reads the console. You
      watch it live next to the chat, switch to tablet or phone size, and take over with your own mouse
      and keyboard. Testing runs on a small model (Haiku): chats hand it to the jig-tester helper, or
      use Tools → Test something…. Long-running commands Claude starts run in Jig terminals you can
      see and stop.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <img src="apps/desktop/src/renderer/features/about/shots/suggestions.jpg?v=13" alt="A suggestion based on repeated actions">
      <b>Suggestions.</b> Jig notices what you repeat, what slows you down and what you mention to
      Claude (locally, on your machine) and suggests a tool, a workflow, a CLAUDE.md line, a routine or a
      tip, each with its evidence and one-click action. A week later it checks whether it helped.
    </td>
    <td valign="top">
      <img src="apps/desktop/src/renderer/features/about/shots/usage.jpg?v=13" alt="Plan usage card">
      <b>Your plan limits, always visible.</b> The 5-hour and weekly windows of your Claude plan, in
      the status bar and on a ring in every chat. Hover for when each one resets.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <img src="apps/desktop/src/renderer/features/about/shots/context.jpg?v=13" alt="Context window breakdown with a Compact button">
      <b>Context window and Compact.</b> How full each chat's context is and what fills it, as Claude
      Code reports it. From 70% a <b>Compact</b> button appears; one click runs Claude Code's /compact.
    </td>
    <td valign="top">
      <img src="apps/desktop/src/renderer/features/about/shots/settings.jpg?v=13" alt="Appearance settings">
      <b>Styled your way.</b> Jig Dark and Jig Light, any VS Code colour theme (from your VS Code or the
      marketplace) and VS Code file icon themes like Material Icon Theme.
    </td>
  </tr>
  <tr>
    <td colspan="2" valign="top">
      <img src="apps/desktop/src/renderer/features/about/shots/knowledge.jpg?v=13" alt="What Jig knows about me">
      <b>What Jig knows about you, in plain sight.</b> Your profile (how you work), the notes Claude saved
      from your chats, your activity by kind, and how you worked this week — lines by Claude vs by hand.
      All local; edit or delete anything. An optional weekly check-in fills in the gaps.
    </td>
  </tr>
  <tr>
    <td colspan="2" valign="top">
      <img src="apps/desktop/src/renderer/features/about/shots/about.jpg?v=13" alt="The What Jig can do page">
      <b>Everything in one page.</b> "What Jig can do" is the welcome screen (until your first project) and always one click away
      in the <b>Jig menu</b> (the logo, top left): every feature, the extension slots, your add-ons and
      skills, keyboard shortcuts, and examples you can try in one click.
    </td>
  </tr>
</table>

And more:
- **In a chat:**
  - Paste screenshots, and drop PDF, Word, Excel and PowerPoint files.
  - Permission cards with Allow once / Always / Deny.
  - Queue messages while Claude works, or send one into the running turn with Ctrl+Enter.
  - Next-message suggestions.
  - Restore files to before any message, and fork a chat.
  - Start a chat in its own git worktree, and apply its changes when you like them.
  - Images from tools.
  - MCP server status, extra folders for a chat, and export to Markdown.
- **Around the chats:**
  - Turn a chat into a tool.
  - Ask Claude when a script fails.
  - A standup written from your commits and chats.
  - Desktop notifications when a chat needs you.
- **The workbench:**
  - **Go to** (Ctrl+P): jump to any chat, view, action or file.
  - Resizable panes, split sidebars (a lower half with its own tabs), named layouts to switch
    between, and Reset layout.
  - Drag any view anywhere: a sidebar, the bottom panel or the main area as a tab. Views you use now
    and then (Releases, Workflows, Links, Suggestions) open as tabs from the menus.
  - A scripts runner with groups, and Azure DevOps pipelines as compact rows (details in a dialog) —
    hide, reorder and group them.
  - Links per project (Azure resources, sites, boards), also picked from your `az` login.
  - A Tools menu with keyboard shortcuts.

## Build your own tools

Ask from the Tools menu, a chat, a suggestion or a slot on the "What Jig can do" page. The builder
(itself a Claude Code session) picks the lightest thing that works:

| | What it makes | Example |
|---|---|---|
| **1. Layout and settings** | Moves views, changes defaults | "Put the Git view on the right and the terminals at the bottom" |
| **2. An add-on** | Views, tabs, buttons, menus, watchers: React components plus optional host code | "A view with my Azure DevOps pipelines and their last run" |
| **3. A development request** | When no extension point fits: a package with a spec, a prompt for Claude Code in Jig's repository and a clickable mockup. You try the demo first and ask for changes until it's right; then **Email to developers** opens a new email to support@sprinta.se with it attached | "Let add-ons add columns to the Repos overview" |

Every build is previewed and kept only when you accept it. **Jig never edits its own source code:**
it grows through add-ons and the extension points you choose to add.

## Extension slots

Add-ons are folders in `~/.jig/addons` with an `addon.json`, React components and optional host code.
They can plug into 17 places:

<p align="center">
  <img src="apps/desktop/src/renderer/features/about/shots/slots.jpg?v=13" alt="The extension slots on the What Jig can do page" width="900">
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
| `claude.tool` | a tool Claude can use in every chat | `claude.context` | what Claude knows in every turn |

Built in: **Git**, **Repos**, **Files**, **Scripts**, **Pipelines** (Azure DevOps), **Releases**, **Notes**,
**Workflows** and **Tasks** are add-ons too, written against the same API. Guide: [`docs/guides/writing-addons.md`](docs/guides/writing-addons.md) ·
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

Then **Add project…** and pick a repository or your whole repos folder.
After that, the main area is your project's **Home**: type what Claude should do and press Enter.
Lost? The `?` and the **Jig menu** (top left) show everything Jig can do.

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
