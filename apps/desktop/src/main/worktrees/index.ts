import { join } from "node:path";
import type { PermissionMode } from "../../shared/engine";
import { getConfig } from "../config";
import { emit, handle } from "../ipc/router";
import { projectStore } from "../projects";
import { sessionManager } from "../sessions";
import { jigHome } from "../state/paths";
import { WorktreeService } from "./service";

/** Chats in their own git worktree: `worktrees.*` (docs/reference/ipc.md). */
export function startWorktrees(): void {
  const s = new WorktreeService({
    file: join(jigHome(), "worktree-chats.json"),
    dir: join(jigHome(), "worktrees"),
    // The project's defaults first, then Jig's (as for any new chat).
    createSession: async ({ projectId, cwd, title }) => {
      const project = projectId ? await projectStore().get(projectId) : undefined;
      const { engine } = getConfig();
      return sessionManager().create({
        projectId,
        cwd,
        title,
        model: project?.model ?? engine.defaultModel,
        permissionMode: (project?.permissionMode ?? engine.defaultPermissionMode) as PermissionMode,
        effort: project?.effort,
      });
    },
    retireChat: (sessionId) => sessionManager().setArchived(sessionId, true),
    onChange: (chats) => emit("worktrees.changed", chats),
  });
  handle("worktrees.list", () => s.list());
  handle("worktrees.start", (input) => s.start(input));
  handle("worktrees.apply", ({ sessionId }) => s.apply(sessionId));
  handle("worktrees.remove", ({ sessionId }) => s.remove(sessionId));
}
