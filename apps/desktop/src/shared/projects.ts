import { z } from "zod";
import { EFFORT_LEVELS, type EffortLevel, PERMISSION_MODES, type PermissionMode } from "./engine";

/** Project colours are token names, so a project's colour follows the theme. */
export const PROJECT_COLORS = ["accent", "info", "success", "warning", "danger", "muted"] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];

/**
 * A workspace: a folder you added (a git repository, or a folder of repositories, D-075). Jig finds
 * its repositories, scripts and files there. Projects point at one as their default.
 */
export const WorkspaceSchema = z.object({
  id: z.string(),
  /** Absolute folder path, as the user picked it. */
  path: z.string(),
  addedAt: z.string(),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

/**
 * A project: a group you make and manage yourself (D-101, D-102), like projects in the Claude app.
 * Chats belong to a project only when you put them there; a project never follows folders.
 */
export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** The default workspace for new chats (absolute folder path; a chat can start in any other). */
  path: z.string(),
  color: z.enum(PROJECT_COLORS).default("accent"),
  addedAt: z.string(),
  /** The default Git repository of the project (absolute path), shown first in the Git panel. */
  focusRepo: z.string().optional(),
  /** Defaults for new chats in this project; empty = Jig's own defaults. */
  model: z.string().optional(),
  effort: z.enum(EFFORT_LEVELS).optional(),
  permissionMode: z.enum(PERMISSION_MODES).optional(),
  /** Appended to Claude's system prompt in this project's chats (never replacing it). */
  instructions: z.string().max(20_000).optional(),
  /** Quick prompts on the project's Home; empty = Jig's defaults. */
  starters: z.array(z.string().max(500)).max(12).optional(),
});
export type Project = z.infer<typeof ProjectSchema>;

/** What `projects.update` can change; an empty string or list clears a preference. */
export type ProjectPatch = Partial<
  Pick<Project, "name" | "color" | "path" | "model" | "instructions" | "starters">
> & { effort?: EffortLevel | ""; permissionMode?: PermissionMode | "" };

export const ProjectsFileSchema = z.object({
  workspaces: z.array(WorkspaceSchema).default([]),
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

/** A workspace with what the disk says about it. */
export interface WorkspaceInfo extends Workspace {
  /** The folder's name. */
  name: string;
  exists: boolean;
  isGitRepo: boolean;
  /** The repositories inside a folder of repositories; empty for a single repository. */
  repos: ProjectRepo[];
}

/**
 * What the renderer gets: the stored project plus facts about its default workspace (`path`), so code
 * that needs "the project's folder" keeps using `path`, `isGitRepo` and `repos`.
 */
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
  workspaces: WorkspaceInfo[];
  projects: ProjectInfo[];
  activeId: string | undefined;
}
