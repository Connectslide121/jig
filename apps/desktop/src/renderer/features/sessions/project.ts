import { call } from "../../lib/host";
import { useProjects } from "../../workbench/projects";

/** Makes a chat's project the active one (D-163); a chat without a project changes nothing. */
export function showProjectOf(projectId: string | undefined): void {
  if (projectId && useProjects.getState().activeId !== projectId)
    void call("projects.setActive", { id: projectId });
}
