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
});
export type Project = z.infer<typeof ProjectSchema>;

export const ProjectsFileSchema = z.object({
  projects: z.array(ProjectSchema).default([]),
  activeId: z.string().optional(),
});
export type ProjectsFile = z.infer<typeof ProjectsFileSchema>;

/** What the renderer gets: the stored project plus a few facts checked on the disk. */
export interface ProjectInfo extends Project {
  exists: boolean;
  isGitRepo: boolean;
}

export interface ProjectsState {
  projects: ProjectInfo[];
  activeId: string | undefined;
}
