import {
  Bug,
  Eye,
  FolderOpen,
  FolderPlus,
  LayoutDashboard,
  Palette,
  PanelBottom,
  PanelLeft,
  PanelRight,
  RefreshCw,
  RotateCcw,
  Settings,
  Wrench,
  X,
} from "lucide-react";
import { cycleTab, defaultLayout, findView } from "../../shared/layout";
import { openNewProjectDialog } from "../features/projects/ProjectDialog";
import { call, errorMessage } from "../lib/host";
import { useProjects } from "./projects";
import { registerAction, useRegistry } from "./registry";
import { updateLayout, useWorkbench, workbench } from "./store";
import { openToolsMenu } from "./ToolsMenu";
import { notify } from "./toasts";

/** A new project: the dialog asks for its name, default workspace and defaults (D-101). */
export async function addProject(): Promise<void> {
  openNewProjectDialog();
}

/** Adds a folder as a workspace (folder picker). */
export async function addWorkspace(): Promise<void> {
  try {
    const workspace = await call("workspaces.add", {});
    if (workspace) notify({ title: `Added ${workspace.path}`, tone: "success" });
  } catch (error) {
    notify({ title: "Couldn't add the folder", message: errorMessage(error), tone: "danger" });
  }
}

export function openSettings(section?: string): void {
  workbench.openTab("jig.settings", section ? { section } : {});
}

/** Core actions in the Tools menu. Features register their own next to their code. */
export function registerCoreActions(): void {
  registerAction({
    id: "jig.addProject",
    title: "New project…",
    group: "Projects",
    icon: FolderPlus,
    keywords: ["add project", "create project"],
    run: addProject,
  });
  registerAction({
    id: "jig.addWorkspace",
    title: "Add workspace folder…",
    group: "Projects",
    icon: FolderPlus,
    keywords: ["folder", "repos", "repository"],
    run: addWorkspace,
  });
  registerAction({
    id: "jig.openProjectDashboard",
    title: "Open project dashboard",
    group: "Projects",
    icon: LayoutDashboard,
    visible: () => Boolean(useProjects.getState().activeId),
    run: () => {
      const id = useProjects.getState().activeId;
      if (id) workbench.openTab("jig.project", { projectId: id });
    },
  });
  registerAction({
    id: "jig.revealProject",
    title: "Open project folder in Explorer",
    group: "Projects",
    icon: FolderOpen,
    visible: () => Boolean(useProjects.getState().activeId),
    run: () => {
      const { projects, activeId } = useProjects.getState();
      const project = projects.find((p) => p.id === activeId);
      if (project) void call("app.openPath", { path: project.path });
    },
  });
  registerAction({
    id: "jig.tools",
    title: "Tools: every action",
    group: "Jig",
    icon: Wrench,
    shortcut: "Mod+K",
    run: () => openToolsMenu(),
  });
  registerAction({
    id: "jig.settings",
    title: "Settings",
    group: "Jig",
    icon: Settings,
    shortcut: "Mod+,",
    run: () => openSettings(),
  });
  registerAction({
    id: "jig.theme",
    title: "Change theme…",
    group: "Appearance",
    icon: Palette,
    keywords: ["colour", "color", "dark", "light", "vs code"],
    run: () => openSettings("appearance"),
  });
  registerAction({
    id: "jig.toggleLeft",
    title: "Toggle left sidebar",
    group: "Layout",
    icon: PanelLeft,
    shortcut: "Mod+B",
    run: () => workbench.toggleRegion("left"),
  });
  registerAction({
    id: "jig.toggleRight",
    title: "Toggle right sidebar",
    group: "Layout",
    icon: PanelRight,
    shortcut: "Mod+Alt+B",
    run: () => workbench.toggleRegion("right"),
  });
  registerAction({
    id: "jig.toggleBottom",
    title: "Toggle bottom panel",
    group: "Layout",
    icon: PanelBottom,
    shortcut: "Mod+J",
    run: () => workbench.toggleRegion("bottom"),
  });
  registerAction({
    id: "jig.showHiddenViews",
    title: "Show a hidden view…",
    group: "Layout",
    icon: Eye,
    visible: () => (useWorkbench.getState().layout?.hidden.length ?? 0) > 0,
    run: () => openSettings("layout"),
  });
  registerAction({
    id: "jig.resetLayout",
    title: "Reset layout",
    group: "Layout",
    icon: RotateCcw,
    run: () => updateLayout((l) => ({ ...defaultLayout(), main: l.main })),
  });
  registerAction({
    id: "jig.closeTab",
    title: "Close tab",
    group: "Layout",
    icon: X,
    shortcut: "Mod+W",
    visible: () => false,
    run: () => {
      const tab = workbench.activeTab();
      if (tab) workbench.closeTab(tab.id);
    },
  });
  registerAction({
    id: "jig.nextTab",
    title: "Next tab",
    group: "Layout",
    shortcut: "Ctrl+Tab",
    visible: () => false,
    run: () => updateLayout((l) => cycleTab(l, 1)),
  });
  registerAction({
    id: "jig.previousTab",
    title: "Previous tab",
    group: "Layout",
    shortcut: "Ctrl+Shift+Tab",
    visible: () => false,
    run: () => updateLayout((l) => cycleTab(l, -1)),
  });
  registerAction({
    id: "jig.reload",
    title: "Reload window",
    group: "Jig",
    icon: RefreshCw,
    run: () => void call("app.reload"),
  });
  registerAction({
    id: "jig.devtools",
    title: "Toggle developer tools",
    group: "Jig",
    icon: Bug,
    shortcut: "Mod+Shift+I",
    run: () => void call("app.toggleDevTools"),
  });
}

/** Views that are hidden, for the Views menu. */
export function hiddenViews() {
  const layout = useWorkbench.getState().layout;
  const views = useRegistry.getState().views;
  return Object.values(views).filter((v) => layout && findView(layout, v.id) === "hidden");
}
