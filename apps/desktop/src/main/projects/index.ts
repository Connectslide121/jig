import { BrowserWindow, dialog } from "electron";
import { publishActivity } from "../activity/bus";
import { emit, handle } from "../ipc/router";
import { paths } from "../state/paths";
import { ProjectStore } from "./store";

let store: ProjectStore | undefined;

export function projectStore(): ProjectStore {
  if (!store) throw new Error("Projects not started");
  return store;
}

export function startProjects(): void {
  store = new ProjectStore(paths.projects());
  store.onChange((state) => emit("projects.changed", state));

  handle("projects.list", () => projectStore().state());
  handle("projects.add", async ({ path }, ctx) => {
    let folder = path;
    if (!folder) {
      const window = BrowserWindow.fromWebContents(ctx.sender);
      const options = { title: "Add a project folder", properties: ["openDirectory" as const] };
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled || !result.filePaths[0]) return undefined;
      folder = result.filePaths[0];
    }
    return (await projectStore().add(folder)).project;
  });
  handle("projects.update", ({ id, ...patch }) => projectStore().update(id, patch));
  handle("projects.remove", ({ id }) => projectStore().remove(id));
  handle("projects.setActive", async ({ id }) => {
    const state = await projectStore().setActive(id);
    const project = state.projects.find((p) => p.id === id);
    if (project)
      publishActivity({ kind: "project.switch", text: `switch to ${project.name}`, projectId: id });
    return state;
  });
  handle("projects.reorder", ({ ids }) => projectStore().reorder(ids));
}
