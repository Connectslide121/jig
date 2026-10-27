import { call, errorMessage } from "../../lib/host";
import { useProjects } from "../../workbench/projects";
import { workbench } from "../../workbench/store";
import { notify } from "../../workbench/toasts";
import { useSessions } from "./store";

/** Creates a session in a project and opens it. */
export async function newSession(projectId?: string): Promise<string | undefined> {
  const id = projectId ?? useProjects.getState().activeId;
  if (!id) {
    notify({
      title: "Add a project first",
      message: "A session runs Claude Code in a project folder.",
      tone: "warning",
    });
    return undefined;
  }
  try {
    const meta = await call("sessions.create", { projectId: id });
    useSessions.setState((s) => ({
      metas: { ...s.metas, [meta.id]: meta },
      transcripts: { ...s.transcripts, [meta.id]: { items: [], queue: [] } },
    }));
    workbench.openTab("jig.chat", { sessionId: meta.id });
    return meta.id;
  } catch (error) {
    notify({ title: "Couldn't start a session", message: errorMessage(error), tone: "danger" });
    return undefined;
  }
}
