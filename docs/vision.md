# Jig — vision and principles

> In woodworking, a **jig** is a custom tool you make yourself so a repetitive job gets faster and
> more precise. Jig the app does the same for your work: it notices what you repeat and builds the
> tool for it.

## What Jig is

Jig is a personal, desktop **agentic workbench** built around **Claude Code**. It combines three things
that today live in different places:

1. **A chat with the agent** — several Claude Code sessions at once, across several projects, all in one
   window (what the Claude desktop app's Code tab does today).
2. **An IDE around the agent** — repos and their git status, commits, diffs, pipelines, scripts,
   terminals: the "quality of life" tools that were missing and that were previously hacked together as
   Claude Code plugins in the Claude desktop sidebar.
3. **An app that builds itself** — you ask, from anywhere, for a new tool or a change, and Jig builds it.
   It also watches how you work (locally) and suggests tools when it sees a repeated pattern.

It is designed first for one person (Jon), on Windows, working in many repositories at the same time.
Sharing with colleagues is possible later but never drives a decision today.

## Who it is for

A developer who already lives in Claude Code, runs several sessions in parallel across several
projects, and wants:

- everything in one place, styled the way they like;
- the version-control, pipeline and script tools they miss from VS Code;
- the ability to get a new tool by asking for it, instead of writing a plugin.

## Principles

These are durable. Every feature follows them; `docs/architecture.md` explains how the structure
enforces them.

1. **Claude Code is the only engine.** Jig runs the official, unmodified Claude Code through the Claude
   Agent SDK. Jig never assembles its own agent loop or a second runtime. The user's Claude Code setup
   (CLAUDE.md files, skills, plugins, MCP servers, settings) keeps working inside Jig.
2. **Your subscription, your login — never touched.** Usage draws on the user's own Claude plan because
   Jig launches Claude Code, which is signed in through Anthropic's own flow. Jig has **no login
   screen**, and never reads, copies, stores or forwards Claude credentials or tokens. (Anthropic's
   policy: third-party apps may not offer Claude.ai login or intermediate credentials; signing in to the
   unmodified Claude Code with your own subscription is allowed.)
3. **Your own tools and credentials.** Git, GitHub, Azure and Azure DevOps go through the user's own
   CLIs (`git`, `gh`, `az`). Jig keeps no accounts or tokens of its own.
4. **Menus, not commands.** Every capability is visible and clickable — a Tools menu, buttons, `⋯` menus,
   right-click menus. Nothing requires remembering a slash command. Plain language in a chat also works.
5. **Build the lightest thing that fully works.** When Jig builds something for you it tries, in order:
   1. a **layout or settings change** (instant, no code);
   2. an **add-on** in one of the extension **slots** — and it **looks at the existing add-ons first and
      prefers changing one** over creating a new one;
   3. when no slot can do it, a **proposal for a new extension point** — Jig never edits its own code;
      you add the slot to Jig's source, and the next similar request is an add-on (D-074).
6. **Nothing changes without your OK.** Every built change is previewed and must be accepted. Every
   accepted change is a git commit and can be rolled back. A broken add-on is switched off, never fatal.
7. **Learning is local and quiet.** Activity is recorded on the machine only. Pattern detection runs
   when you press a button or on a schedule (default: Mondays 10:00) — never continuously with AI.
   Suggestions wait in an inbox and never interrupt.
8. **Design is a feature.** One design system with tokens for every colour, space and type size; themes
   (including any VS Code theme) recolour the whole app — including add-ons the agent writes — while
   the design itself stays Jig's.
9. **Documented as it is built.** The plan, the architecture, the decisions and the guides are kept up to
   date in the same change as the code. A well-documented codebase is also what makes an agent good
   at helping you change Jig itself.

## Non-goals (for now)

- A second agent runtime, an API-key mode as the default, or any Jig account/login.
- A public extension marketplace.
- Re-implementing VS Code. Jig opens files in your editor when you need a full editor; it has viewers
  and light editing, not a full IDE editor.
- Running VS Code extensions (themes are imported as colour data only — nothing from an extension is
  ever executed).
