import { FolderGit2, FolderPlus, FolderX, GitBranch, MoreHorizontal } from "lucide-react";
import { call } from "../../lib/host";
import { cn, contextMenu, Empty, IconButton, ListRow, openMenuAt } from "../../ui";
import { addProject } from "../../workbench/actions";
import { useProjects } from "../../workbench/projects";
import { workbench } from "../../workbench/store";
import { projectDotClass } from "./colors";
import { projectMenu } from "./projectMenu";

export function ProjectsView() {
  const { projects, activeId } = useProjects();
  if (projects.length === 0)
    return (
      <Empty icon={FolderPlus} title="No projects yet">
        <p>A project is a folder, usually a git repository.</p>
        <button type="button" className="mt-2 text-accent hover:underline" onClick={() => void addProject()}>
          Add project…
        </button>
      </Empty>
    );
  return (
    <div
      role="listbox"
      aria-label="Projects"
      className="h-full overflow-y-auto p-1.5"
      data-testid="projects-view"
    >
      {projects.map((project) => (
        <ListRow
          key={project.id}
          data-testid={`project-${project.name}`}
          selected={project.id === activeId}
          onClick={() => void call("projects.setActive", { id: project.id })}
          onDoubleClick={() => workbench.openTab("jig.project", { projectId: project.id })}
          onContextMenu={contextMenu(() => projectMenu(project))}
          leading={<span className={cn("size-2 rounded-full", projectDotClass(project.color))} />}
          description={<span className="selectable">{project.path}</span>}
          trailing={
            <>
              {!project.exists && <FolderX className="size-3.5 text-danger" aria-label="Folder not found" />}
              {project.isGitRepo && <GitBranch className="size-3.5" aria-label="Git repository" />}
              {project.repos.length > 0 && (
                <span
                  className="flex items-center gap-0.5 text-2xs text-hint"
                  title={`Workspace: ${project.repos.length} git repositories inside`}
                  data-testid={`project-repos-${project.name}`}
                >
                  <FolderGit2 className="size-3.5" />
                  {project.repos.length}
                </span>
              )}
              <IconButton
                icon={MoreHorizontal}
                label="Project options"
                size="sm"
                className="opacity-0 group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  openMenuAt(e.currentTarget, projectMenu(project), true);
                }}
              />
            </>
          }
        >
          {project.name}
        </ListRow>
      ))}
    </div>
  );
}

export function ProjectsHeaderActions() {
  return <IconButton icon={FolderPlus} label="Add project…" size="sm" onClick={() => void addProject()} />;
}
