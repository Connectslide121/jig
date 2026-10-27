# Jig

> A **jig** is a custom tool you make yourself so a repetitive job gets faster and more precise.

Jig is a personal desktop workbench around **Claude Code**: several agent sessions across several
projects in one window, the tools you miss from VS Code (repos, pipelines, scripts, terminals), styled
your way with any VS Code theme. And it **builds its own tools**: ask from anywhere for a new tool or a
change, or let Jig notice what you repeat and suggest one.

- Runs the official Claude Code on **your own Claude subscription** — Jig never touches your login.
- **Menus, not commands** — everything is a visible button or menu item.
- Builds the **lightest thing that works**: a layout tweak, then an add-on (changing an existing one
  first), and only as a last resort a change to Jig's own code — always previewed, always reversible.

## Status

Early development. See [`docs/status.md`](docs/status.md) for what works today and
[`docs/plan/`](docs/plan/README.md) for the roadmap.

## Getting started (development)

Requirements: Node.js ≥ 22.12, git, and Claude Code signed in with your Claude account
(run `claude` once and `/login`).

```bash
npm install
npm run dev
```

More in [`docs/guides/developing.md`](docs/guides/developing.md).

## Documentation

Everything is in [`docs/`](docs/README.md): vision, architecture, the plan, decisions, reference and
guides.
