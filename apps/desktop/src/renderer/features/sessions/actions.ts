import { call, errorMessage } from "../../lib/host";
import { useProjects } from "../../workbench/projects";
import { workbench } from "../../workbench/store";
import { notify } from "../../workbench/toasts";
import { setDraft } from "./drafts";
import { useSessions } from "./store";

/**
 * Creates a session in a project (in `cwd`, a folder inside it, when given) and opens it, with
 * `draft` in the composer (not sent).
 */
export async function newSession(
  projectId?: string,
  cwd?: string,
  draft?: string,
): Promise<string | undefined> {
  const id = projectId ?? useProjects.getState().activeId;
  if (!id) {
    notify({
      title: "Add a project first",
      message: "A chat runs Claude Code in a project folder.",
      tone: "warning",
    });
    return undefined;
  }
  try {
    const meta = await call("sessions.create", { projectId: id, cwd });
    useSessions.setState((s) => ({
      metas: { ...s.metas, [meta.id]: meta },
      transcripts: { ...s.transcripts, [meta.id]: { items: [], queue: [] } },
    }));
    if (draft) setDraft(meta.id, draft);
    workbench.openTab("jig.chat", { sessionId: meta.id });
    return meta.id;
  } catch (error) {
    notify({ title: "Couldn't start a chat", message: errorMessage(error), tone: "danger" });
    return undefined;
  }
}
