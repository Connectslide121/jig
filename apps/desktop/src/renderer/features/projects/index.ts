import { FolderGit2, LayoutDashboard } from "lucide-react";
import { useProjects } from "../../workbench/projects";
import { registerTabType, registerView } from "../../workbench/registry";
import { ProjectDashboard } from "./ProjectDashboard";
import { ProjectsHeaderActions, ProjectsView } from "./ProjectsView";

export function registerProjects(): void {
  registerView({
    id: "jig.projects",
    title: "Projects",
    icon: FolderGit2,
    defaultRegion: "left",
    component: ProjectsView,
    headerActions: ProjectsHeaderActions,
    owner: "core",
  });
  registerTabType({
    type: "jig.project",
    title: (params) =>
      useProjects.getState().projects.find((p) => p.id === params.projectId)?.name ?? "Project",
    useTitle: (params) => useProjects((s) => s.projects.find((p) => p.id === params.projectId)?.name ?? ""),
    icon: LayoutDashboard,
    component: ProjectDashboard,
    owner: "core",
  });
}
