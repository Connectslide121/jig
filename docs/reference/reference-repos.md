# Reference repositories

Code worth reading while building Jig. **Read for ideas; don't copy blindly.** If you do copy code,
keep its licence: ThinkRail is Apache-2.0, so copied files need the licence and a NOTICE entry
(see D-011 in `docs/decisions.md`).

## ThinkRail (JetBrains) — the main reference

- Repo: https://github.com/JetBrains/thinkrail (public, Apache-2.0)
- Clone next to Jig for reading:
  ```bash
  git clone --depth 1 https://github.com/JetBrains/thinkrail ../thinkrail
  ```
- What it is: an agentic IDE around the `pi` coding agent: a Bun host and a React 19 + Zustand +
  Tailwind v4 UI, with worktree workspaces, a workbench, chats, diffs and themes. Jig chose Claude
  Code and Electron instead (D-002, D-003), so the engine and host parts don't carry over. The UI,
  design system, git and terminal parts do.
- Its canonical docs: `goal-and-requirements.md`, `architecture.md`, and a `SPEC.md` beside every module.

| Jig area | Look at in ThinkRail | Why |
|---|---|---|
| Themes (phase 2) | `apps/web/src/themes/` (`schema.ts`, `runtime.ts`, `shiki.ts`, `bundled/*.theme.json`, `theme.schema.json`) | Theme file format, applying CSS variables at runtime, Shiki theme from the app theme |
| Design-token enforcement (phase 2) | `apps/web/src/styles/` (`colorUsage.test.ts`, `spacingUsage.test.ts`, `typographyUsage.test.ts`, `buttonUsage.test.ts`, `COLOR.md`, `SPACING.md`, `TYPOGRAPHY.md`, `tokens.css`) | Tests that keep every colour, space and font size on the scale; Jig has `scripts/check-tokens.ts` and could add spacing/typography checks |
| Appearance settings (phase 2/3) | `apps/web/src/panels/AppearanceSettings.tsx`, `CustomThemesSettings.tsx` | Theme picker UX |
| Workbench layout (phase 3) | `apps/web/src/shell/layout/` (`model.ts`, `normalized.ts`, `presets.ts`, `Workbench.tsx`, `workbenchTabs.tsx`, `workbenchSide.tsx`, `workbenchBottom.tsx`) | Layout-as-data model, tabs, side/bottom panels |
| Chat UI (phase 4) | `apps/web/src/chat/` (`ChatView.tsx`, `ChatTranscript.tsx`, `Composer.tsx`, `ToolCard.tsx`, `Markdown.tsx`, `QueueStrip.tsx`, `ThinkingGroup`) | Streaming transcript, tool cards, queueing follow-ups, markdown |
| Terminals (phase 5) | `packages/server/src/terminal/` (`outputBatcher.ts`, `shellArgs.ts`, `ptyGrid.ts`) | Batching pty output, per-OS shell arguments |
| Git and the Git tab (phase 7) | `packages/server/src/git/` (`gitExec.ts`, `git.ts`, `refs.ts`, `diffScope.ts`), `packages/server/src/changes/`, `apps/web/src/panels/ChangesPanel.tsx`, `ChangesTree.tsx`, `DiffPane.tsx`, `DiffSurface.tsx`, `BranchPicker.tsx` | Running git safely, parsing status/log/diff, changed-files tree, diff view |
| Diff rendering (phase 7) | `packages/resource-renderers/src/renderers/code/` (`PierreDiff.tsx`, `changeBlocks.ts`, `diffCache.ts`); dependency `@pierre/diffs` | A good diff renderer with Shiki highlighting |
| Worktrees (backlog) | `packages/server/src/workspaces/` | Workspace = git worktree with its own branch |
| Windows paths (all) | `packages/server/src/host/directorySpelling.ts`, `test:windows-paths` script in its `package.json` | Path spelling pitfalls on Windows |

## Claude Agent SDK

- npm: `@anthropic-ai/claude-agent-sdk` (pinned in `apps/desktop/package.json`). The type definitions
  (`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`) are the best reference for `query()`,
  `Options`, `canUseTool`, `createSdkMcpServer`, `tool()` and the message types.
- Docs: https://code.claude.com/docs/en/agent-sdk/overview
- Policy on subscriptions vs API keys: https://code.claude.com/docs/en/legal-and-compliance and
  https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan
