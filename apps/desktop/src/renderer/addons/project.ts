import type { AddonProject } from "@jig/sdk";
import type { ProjectInfo } from "../../shared/projects";
import { useConfig } from "../stores/config";

/** Who runs a project's new chats, as add-ons name it: its own provider, else Jig's (D-309). */
export const providerOf = (
  p: { provider?: string },
  fallback: string | undefined = useConfig.getState().config?.engine.provider,
): AddonProject["provider"] => ((p.provider ?? fallback) === "codex" ? "chatgpt" : "claude");

/** A project as add-ons see it (`useProjectList`, context menus). */
export const toProject = (p: ProjectInfo, fallback?: string): AddonProject => ({
  id: p.id,
  provider: providerOf(p, fallback ?? useConfig.getState().config?.engine.provider),
  name: p.name,
  path: p.path,
  isGitRepo: p.isGitRepo,
  exists: p.exists,
  repos: p.repos ?? [],
  focusRepo: p.focusRepo,
  color: p.color,
});
