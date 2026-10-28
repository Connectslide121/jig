import { FolderX } from "lucide-react";
import { Empty } from "../../ui";
import { useProjects } from "../../workbench/projects";
import type { TabProps } from "../../workbench/registry";
import { Home } from "../home/Home";

/** The project dashboard tab: the project's Home (also shown when no tab is open). */
export function ProjectDashboard({ params }: TabProps) {
  const project = useProjects((s) => s.projects.find((p) => p.id === params.projectId));
  if (!project) return <Empty icon={FolderX} title="This project was removed" />;
  return (
    <div className="h-full" data-testid="project-dashboard">
      <Home project={project} />
    </div>
  );
}
