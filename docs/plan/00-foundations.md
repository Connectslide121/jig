# Phase 0 — Foundations

**Goal:** a repository a person or an agent can pick up: docs structure, instructions, tooling, checks.

**Done when:** the docs below exist, dependencies install, and `npm run check` runs.

## Checklist

- [x] Repository created (`Connectslide121/jig`), npm workspaces monorepo
- [x] `docs/vision.md` — what and why, principles, non-goals
- [x] `docs/architecture.md` — the design
- [x] `docs/plan/` — phases with checklists
- [x] `docs/decisions.md` — decision log (who decided, why)
- [x] `docs/status.md` — what works today and how to try it
- [x] `docs/README.md` — docs index
- [x] `AGENTS.md` + `CLAUDE.md` (root) — instructions for coding agents
- [x] Dependencies pinned to exact versions at least two weeks old (security patches excepted)
- [x] TypeScript project references, Biome, Vitest, Playwright configured
- [x] `npm run check` (typecheck + lint + test + token check)

## Notes

- npm needs `legacy-peer-deps=true` (in `.npmrc`) because of an npm arborist crash on the
  `@types/node` peer range of Vitest. See D-012.
