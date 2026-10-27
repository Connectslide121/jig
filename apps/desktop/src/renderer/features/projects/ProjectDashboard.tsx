import { FolderOpen, FolderX, GitBranch, MoreHorizontal } from "lucide-react";
import { call } from "../../lib/host";
import { Badge, Button, Card, cn, Empty, IconButton, openMenuAt } from "../../ui";
import { useProjects } from "../../workbench/projects";
import type { TabProps } from "../../workbench/registry";
import { projectTextClass } from "./colors";
import { projectMenu } from "./projectMenu";
import { useDashboardWidgets } from "./widgets";

/** The project dashboard tab: facts about the project and the widgets add-ons contribute (phase 6). */
export function ProjectDashboard({ params }: TabProps) {
  const project = useProjects((s) => s.projects.find((p) => p.id === params.projectId));
  const widgets = useDashboardWidgets();
  if (!project) return <Empty icon={FolderX} title="This project was removed" />;
  return (
    <div className="h-full overflow-y-auto" data-testid="project-dashboard">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className={cn("truncate text-2xl font-semibold", projectTextClass(project.color))}>
              {project.name}
            </h1>
            <div className="selectable mt-1 truncate font-mono text-xs text-muted">{project.path}</div>
            <div className="mt-2 flex gap-1.5">
              {project.isGitRepo && (
                <Badge tone="info">
                  <GitBranch className="mr-1 size-3" /> git
                </Badge>
              )}
              {!project.exists && <Badge tone="danger">folder not found</Badge>}
            </div>
          </div>
          <Button icon={FolderOpen} onClick={() => void call("app.openPath", { path: project.path })}>
            Open folder
          </Button>
          <IconButton
            icon={MoreHorizontal}
            label="Project options"
            onClick={(e) => openMenuAt(e.currentTarget, projectMenu(project), true)}
          />
        </div>
        {widgets.length === 0 ? (
          <Card className="p-4 text-sm text-muted">
            Widgets from add-ons (pipelines, scripts, repo status…) appear here.
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {widgets.map(({ id, render }) => (
              <div key={id}>{render(project)}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
