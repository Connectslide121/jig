import { handle } from "../ipc/router";
import { projectStore } from "../projects";
import { listSkills } from "./skills";

/** Data for the "What Jig can do" page that only the host can read. */
export function registerAboutHandlers(): void {
  handle("about.skills", async () => {
    const state = await projectStore().state();
    const active = state.projects.find((p) => p.id === state.activeId);
    return listSkills(active?.path);
  });
}
