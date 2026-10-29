import { JigError } from "../../shared/ipc";
import { addonService } from "../addons";
import { getConfig, updateConfig } from "../config";
import { registerJigTools } from "../engine/jigTools";
import { handle } from "../ipc/router";
import { getLayout, setLayout } from "../layout";
import { knowledgeStore } from "../learning";
import { projectStore } from "../projects";
import { sessionManager } from "../sessions";
import { fileIconService, themeService } from "../themes";
import { applyUndo, type ConfigureDeps, configureTools } from "./tools";

/** Lets Claude configure Jig from any chat (docs/reference/configure.md). */
export function startConfigure(): void {
  const deps: ConfigureDeps = {
    config: getConfig,
    updateConfig: (patch) => updateConfig(patch),
    themes: () => themeService().list(),
    iconThemes: () => fileIconService().list(),
    searchThemes: (query) => themeService().searchOpenVsx(query),
    installTheme: (namespace, name) => themeService().installOpenVsx(namespace, name),
    layout: getLayout,
    setLayout: (layout) => setLayout(layout, "host"),
    addons: () => addonService().list(),
    setAddonEnabled: (id, enabled) => addonService().setEnabled(id, enabled),
    projects: () => projectStore().state(),
    createProject: async (input) => (await projectStore().create(input)).project,
    updateProject: (id, patch) => projectStore().update(id, patch),
    removeProject: (id) => projectStore().remove(id),
    setFocusRepo: (id, repo) => projectStore().setFocusRepo(id, repo),
    chats: () => sessionManager().list(),
    setChatProject: (id, projectId) => sessionManager().setProject(id, projectId),
    setChatPinned: (id, pinned) => sessionManager().setPinned(id, pinned),
    addCard: (sessionId, item) => sessionManager().addItem(sessionId, item),
    removeEvidence: (id) => knowledgeStore().remove(id),
    setProfile: (text) => knowledgeStore().setProfile(text),
  };
  registerJigTools(configureTools(deps));

  handle("sessions.undoChange", async ({ sessionId, itemId }) => {
    const m = sessionManager();
    const item = (await m.snapshot(sessionId)).items.find((i) => i.id === itemId);
    if (item?.kind !== "change" || !item.undo)
      throw new JigError("not_found", "There is nothing to undo here");
    if (item.undone) return;
    await applyUndo(deps, item.undo);
    await m.updateItem(sessionId, { ...item, undone: true });
  });
}
