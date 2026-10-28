import { BrowserWindow, dialog } from "electron";
import { publishActivity } from "../activity/bus";
import { getConfig, onConfigChange } from "../config";
import { emit, handle } from "../ipc/router";
import { paths } from "../state/paths";
import { ProjectStore } from "./store";

let store: ProjectStore | undefined;

export function projectStore(): ProjectStore {
  if (!store) throw new Error("Projects not started");
  return store;
}

export function startProjects(): void {
  store = new ProjectStore(paths.projects(), () => getConfig().projects.repoScanDepth);
  store.onChange((state) => emit("projects.changed", state));
  let depth = getConfig().projects.repoScanDepth;
  onConfigChange((config) => {
    if (config.projects.repoScanDepth === depth) return;
    depth = config.projects.repoScanDepth;
    void store?.refresh();
  });

  handle("projects.list", () => projectStore().state());
  handle("projects.add", async ({ path }, ctx) => {
    const folder = path ?? (await pickFolder(ctx.sender, "Add a project folder"));
    return folder ? (await projectStore().add(folder)).project : undefined;
  });
  handle("projects.create", async (input) => (await projectStore().create(input)).project);
  handle("projects.update", ({ id, ...patch }) => projectStore().update(id, patch));
  handle("workspaces.add", async ({ path }, ctx) => {
    const folder = path ?? (await pickFolder(ctx.sender, "Add a workspace folder"));
    return folder ? (await projectStore().addWorkspace(folder)).workspace : undefined;
  });
  handle("workspaces.remove", ({ id }) => projectStore().removeWorkspace(id));
  handle("projects.remove", ({ id }) => projectStore().remove(id));
  handle("projects.setActive", async ({ id }) => {
    const state = await projectStore().setActive(id);
    const project = state.projects.find((p) => p.id === id);
    if (project)
      publishActivity({ kind: "project.switch", text: `switch to ${project.name}`, projectId: id });
    return state;
  });
  handle("projects.reorder", ({ ids }) => projectStore().reorder(ids));
  handle("projects.rescanRepos", ({ id }) => projectStore().rescanRepos(id));
  handle("projects.setFocusRepo", ({ id, repo }) => projectStore().setFocusRepo(id, repo));
}

/** The folder picker, over the window that asked; `undefined` when cancelled. */
async function pickFolder(sender: Electron.WebContents, title: string): Promise<string | undefined> {
  const window = BrowserWindow.fromWebContents(sender);
  const options = { title, properties: ["openDirectory" as const] };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  return result.canceled ? undefined : result.filePaths[0];
}
