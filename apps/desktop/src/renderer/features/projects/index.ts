import { Download, FolderGit2, LayoutDashboard, Sparkles } from "lucide-react";
import { useProjects } from "../../workbench/projects";
import { registerAction, registerTabType, registerView } from "../../workbench/registry";
import { openCopilotDialog } from "../completion/CopilotDialog";
import { openClaudeImportDialog } from "../knowledge/ClaudeImportDialog";
import { ProjectDashboard } from "./ProjectDashboard";
import { ProjectsHeaderActions, ProjectsView } from "./ProjectsView";

export function registerProjects(): void {
  registerAction({
    id: "jig.importClaude",
    title: "Import from claude.ai…",
    group: "Projects",
    icon: Download,
    keywords: ["claude.ai", "export", "knowledge", "projects"],
    run: openClaudeImportDialog,
  });
  registerAction({
    id: "jig.copilot",
    title: "Set up GitHub Copilot…",
    group: "Jig",
    icon: Sparkles,
    keywords: ["completion", "copilot", "editor", "ghost text"],
    run: openCopilotDialog,
  });
  registerView({
    id: "jig.projects",
    title: "Projects",
    icon: FolderGit2,
    defaultRegion: "left",
    component: ProjectsView,
    headerActions: ProjectsHeaderActions,
    headerMenu: () => [
      {
        label: "Import from claude.ai…",
        icon: Download,
        onSelect: openClaudeImportDialog,
        testId: "projects-import-claude",
      },
    ],
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
