import type { SessionMeta } from "../../../shared/engine";
import { call, errorMessage } from "../../lib/host";
import { useProjects } from "../../workbench/projects";
import { notify } from "../../workbench/toasts";
import { canChangeProvider } from "./provider";

/** Makes a chat's project the active one (D-163); a chat without a project changes nothing. */
export function showProjectOf(projectId: string | undefined): void {
  if (projectId && useProjects.getState().activeId !== projectId)
    void call("projects.setActive", { id: projectId });
}

/** A new chat in a project nobody has written in yet can still go to another project (D-341). */
export const canChangeProject = (meta: SessionMeta, itemCount: number, queued: number): boolean =>
  Boolean(meta.draft && meta.projectId) && canChangeProvider(meta, itemCount, queued);

/**
 * Moves an unstarted chat to another project, with that project's folder and defaults (D-341); false
 * (and a toast) when it couldn't.
 */
export async function switchChatProject(id: string, projectId: string): Promise<boolean> {
  try {
    await call("sessions.switchProject", { id, projectId });
    return true;
  } catch (error) {
    notify({ title: "Couldn't move this chat", message: errorMessage(error), tone: "danger" });
    return false;
  }
}
