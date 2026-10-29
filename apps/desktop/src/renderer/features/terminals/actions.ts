import { call, errorMessage } from "../../lib/host";
import { useProjects } from "../../workbench/projects";
import { workbench } from "../../workbench/store";
import { notify } from "../../workbench/toasts";
import { useTerminals } from "./store";

/** Shows the Terminals view and focuses a terminal. */
export function showTerminal(id: string): void {
  useTerminals.setState({ activeId: id });
  workbench.showView("jig.terminals");
}

export async function newTerminal(command?: string, title?: string): Promise<void> {
  try {
    const projectId = useProjects.getState().activeId;
    const t = await call("terminals.create", { projectId, command, title });
    showTerminal(t.id);
  } catch (error) {
    notify({ title: "Couldn't open a terminal", message: errorMessage(error), tone: "danger" });
  }
}

export async function claudeLogin(): Promise<void> {
  try {
    const t = await call("terminals.claudeLogin", { projectId: useProjects.getState().activeId });
    showTerminal(t.id);
    notify({
      title: "Sign in to Claude Code",
      message:
        "Follow the steps in the terminal. Jig tells you when you're signed in and closes it; it never sees your login.",
    });
  } catch (error) {
    notify({ title: "Couldn't start Claude Code", message: errorMessage(error), tone: "danger" });
  }
}
