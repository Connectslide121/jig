# Jig documentation

Agent instructions live in the root [`AGENTS.md`](../AGENTS.md); the project's landing page is the
root [`README.md`](../README.md).

## Start here

| Document | What it is for |
|---|---|
| [status.md](status.md) | **Start here when coming back.** What works today, how to try it, what needs testing, known gaps |
| [vision.md](vision.md) | What Jig is, who it is for, the principles every feature follows, non-goals |
| [architecture.md](architecture.md) | How Jig is built: processes, IPC, engine, chat, workbench, themes, add-ons, builder, learning |
| [decisions.md](decisions.md) | Every decision, who made it and why — review the "Jig, on my own" ones |
| [plan/](plan/README.md) | The phased plan as checklists, with status per phase, and the backlog |
| [brand/](brand/) | The logo and brand colours |

## Reference (contracts)

| Document | What it covers |
|---|---|
| [ipc.md](reference/ipc.md) | Every host method and event between the UI and the main process, and the IPC checks |
| [state.md](reference/state.md) | Everything in `~/.jig` and every setting in `config.json` |
| [skills.md](reference/skills.md) | Curated native skill plugins, global/project controls, provenance and AI feature defaults |
| [engine.md](reference/engine.md) | Claude Code through the Agent SDK: engine, events, sessions, credentials, checkpoints, context, Jig's tools |
| [chat.md](reference/chat.md) | The chat next to Claude Code's terminal: `/` `@` `!` `#`, history, modes, rewind, todos, plans, diffs, subagents, MCP, effort |
| [ai-features.md](reference/ai-features.md) | AI features around the chats: tours, checks, commit messages, standup, failed scripts, notifications |
| [attempts.md](reference/attempts.md) | Try several ways: parallel attempts in git worktrees, judged by Jig |
| [routines.md](reference/routines.md) | Claude Code routines: the Routines tab, chat cards, guarded tool calls |
| [pages.md](reference/pages.md) | Pages: Jig's own artifacts, tools, storage, security (D-405) |
| [artifacts.md](reference/artifacts.md) | Why Jig has no Artifacts tab (D-404), and the card for old Artifact calls |
| [browser.md](reference/browser.md) | Browser: the offscreen page, its tools, the console and network log, and the live view |
| [terminals.md](reference/terminals.md) | Terminals, scripts, groups, and the terminals chats start |
| [preview.md](reference/preview.md) | File previews, editing in Preview, and the `jig-file:` protocol |
| [configure.md](reference/configure.md) | Configuring Jig from a chat: the tools, protected settings, Undo |
| [usage.md](reference/usage.md) | Plan usage (5-hour and weekly windows) |
| [layout.md](reference/layout.md) | Layout as data, regions, split sidebars, views, reset, split view, tabs, where views start, shortcuts |
| [slots.md](reference/slots.md) | The 17 extension slots |
| [addon-api.md](reference/addon-api.md) | The add-on API (`ctx`), manifest and permissions |
| [builder.md](reference/builder.md) | The builder: levels, jobs, worktrees, validation, proposals |
| [learning.md](reference/learning.md) | The activity log, friction and notes from chats, the profile, pattern mining, suggestions and their actions, check-ins, "How you worked" |
| [design-tokens.md](reference/design-tokens.md) | Colour, spacing, type and radius tokens |
| [file-icons.md](reference/file-icons.md) | File icon themes (VS Code's, Open VSX, Jig's own) |
| [setup.md](reference/setup.md) | Get started checks, updates and the launcher |
| [about.md](reference/about.md) | The "What Jig can do" page and how its screenshots are made |
| [reference-repos.md](reference/reference-repos.md) | Code to read for each part (ThinkRail) and the Agent SDK references |

## Built-in add-ons

Each built-in add-on has a README next to its code (and is also an example of the add-on API):

| Add-on | What it does |
|---|---|
| [Git](../addons/git/README.md) | Git for the project's repositories: changes, commits, branches, history, diffs, Jig's help |
| [Repos](../addons/repos/README.md) | Every repository at a glance, with fetch/pull/push and a branch switcher |
| [Files](../addons/files/README.md) | The project's file tree with git colours |
| [Scripts](../addons/scripts/README.md) | Scripts of every workspace folder, started and stopped in one click |
| [Pipelines](../addons/pipelines/README.md) | Azure DevOps pipelines through `az` |
| [Releases](../addons/releases/README.md) | Release policy, versions, changelogs, notes and deploys per repository |
| [Pages](../addons/pages/README.md) | Pages Jig publishes (reports, mockups, release notes), kept and previewed locally |
| [Workflows](../addons/workflows/README.md) | Steps you repeat, per project: by hand, with help, or on a schedule |
| [Tasks](../addons/tasks/README.md) | A task queue: prompts Jig does in order, each reported in a table (outcome, summary, follow-ups) |
| [Meetings](../addons/meetings/README.md) | Teams meeting room, screen sharing, live named captions, project-aware questions and reviewed actions |
| [Boards](../addons/boards/README.md) | Azure DevOps boards per project, laid out like Azure DevOps |
| [Tests](../addons/tests/README.md) | The project's test suites, run with one click, with results and history; Jig runs them too |
| [Factory](../addons/factory/README.md) | An idea → an interview → a demo → a pack of documents, approved at gates (phase 28; runs from a brief through stage chats and gates; reference: [factory.md](reference/factory.md)) |
| [Chat time](../addons/chat-time/README.md) | Where chats' working time goes (model, tests & builds, browser checks…), per chat, project or all projects, with how many chats worked at once (D-419) |

## Guides (how-tos)

| Document | What it covers |
|---|---|
| [developing.md](guides/developing.md) | Setting up, running and debugging Jig |
| [testing.md](guides/testing.md) | Unit and end-to-end tests, the fake engine and its trigger words, screenshots |
| [writing-addons.md](guides/writing-addons.md) | Writing an add-on by hand |
| [factory-recipes.md](guides/factory-recipes.md) | Writing and overriding Factory recipes |
| [themes.md](guides/themes.md) | Jig and VS Code themes |
| [teams-phone.md](guides/teams-phone.md) | Jig on your phone through Teams: setup in the Azure portal by hand, and what to ask an admin |
| [packaging.md](guides/packaging.md) | The Windows installer, installing and updating |
