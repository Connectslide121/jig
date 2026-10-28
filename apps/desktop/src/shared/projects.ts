import { z } from "zod";

/** Project colours are token names, so a project's colour follows the theme. */
export const PROJECT_COLORS = ["accent", "info", "success", "warning", "danger", "muted"] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Absolute folder path, as the user picked it. */
  path: z.string(),
  color: z.enum(PROJECT_COLORS).default("accent"),
  addedAt: z.string(),
  /** Workspaces: the repository Git actions and the status bar use (absolute path). */
  focusRepo: z.string().optional(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const ProjectsFileSchema = z.object({
  projects: z.array(ProjectSchema).default([]),
  activeId: z.string().optional(),
});
export type ProjectsFile = z.infer<typeof ProjectsFileSchema>;

/** A git repository inside a workspace project. */
export interface ProjectRepo {
  /** Absolute path. */
  path: string;
  /** Path relative to the project folder, with forward slashes (`client-a/api`). */
  name: string;
}

/** What the renderer gets: the stored project plus a few facts checked on the disk. */
export interface ProjectInfo extends Project {
  exists: boolean;
  isGitRepo: boolean;
  /**
   * For a folder that isn't a repository itself: the repositories inside it (a workspace, D-075).
   * Empty for a single repository.
   */
  repos: ProjectRepo[];
}

export interface ProjectsState {
  projects: ProjectInfo[];
  activeId: string | undefined;
}
