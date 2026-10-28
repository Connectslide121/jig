import { create } from "zustand";
import type { ProjectInfo, ProjectsState } from "../../shared/projects";

export const useProjects = create<ProjectsState>(() => ({
  workspaces: [],
  projects: [],
  activeId: undefined,
}));

export function useActiveProject(): ProjectInfo | undefined {
  return useProjects((s) => s.projects.find((p) => p.id === s.activeId));
}
