import {
  ChevronDown,
  Eye,
  FolderPlus,
  LayoutDashboard,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Settings,
  Wrench,
} from "lucide-react";
import { projectDotClass } from "../features/projects/colors";
import { call } from "../lib/host";
import type { MenuEntry } from "../ui";
import { cn, IconButton, openMenuAt } from "../ui";
import { addProject, hiddenViews, openSettings } from "./actions";
import { useActiveProject, useProjects } from "./projects";
import { useRegistry } from "./registry";
import { useWorkbench, workbench } from "./store";
import { openToolsMenu } from "./ToolsMenu";

function projectMenu(): MenuEntry[] {
  const { projects, activeId } = useProjects.getState();
  return [
    ...(projects.length ? [{ heading: "Projects" } as const] : []),
    ...projects.map((p) => ({
      label: p.name,
      checked: p.id === activeId,
      testId: `project-item-${p.name}`,
      onSelect: () => void call("projects.setActive", { id: p.id }),
    })),
    ...(projects.length ? [{ separator: true } as const] : []),
    { label: "Add project…", icon: FolderPlus, onSelect: () => void addProject(), testId: "project-add" },
    ...(activeId
      ? [
          {
            label: "Project dashboard",
            icon: LayoutDashboard,
            onSelect: () => workbench.openTab("jig.project", { projectId: activeId }),
          },
        ]
      : []),
  ];
}

function layoutMenu(): MenuEntry[] {
  const layout = useWorkbench.getState().layout;
  const views = useRegistry.getState().views;
  const hidden = hiddenViews();
  const regionEntries = (["left", "right", "bottom"] as const).map((r) => ({
    label: { left: "Left sidebar", right: "Right sidebar", bottom: "Bottom panel" }[r],
    icon: { left: PanelLeft, right: PanelRight, bottom: PanelBottom }[r],
    checked: layout ? !layout[r].collapsed && layout[r].views.some((v) => views[v]) : false,
    onSelect: () => workbench.toggleRegion(r),
  }));
  return [
    { heading: "Show" },
    ...regionEntries,
    { separator: true },
    {
      label: "Views",
      icon: Eye,
      submenu: Object.values(views)
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((v) => ({
          label: v.title,
          icon: v.icon,
          checked: !hidden.includes(v),
          onSelect: () => (hidden.includes(v) ? workbench.showView(v.id) : workbench.hideView(v.id)),
        })),
    },
  ];
}

export function Topbar() {
  const project = useActiveProject();
  const mac = navigator.platform.startsWith("Mac");
  return (
    <header
      className={cn(
        "drag topbar-insets flex h-10 shrink-0 items-center gap-1 border-b border-line bg-titlebar px-2 text-sm",
      )}
    >
      {!mac && <span className="mr-1 ml-1 font-semibold tracking-tight text-accent">Jig</span>}
      <button
        type="button"
        data-testid="project-switcher"
        className="no-drag flex h-7 max-w-64 items-center gap-1.5 rounded-md px-2 hover:bg-hover"
        onClick={(e) => openMenuAt(e.currentTarget, projectMenu())}
      >
        {project ? (
          <>
            <span className={cn("size-2 shrink-0 rounded-full", projectDotClass(project.color))} />
            <span className="truncate font-medium">{project.name}</span>
          </>
        ) : (
          <span className="text-muted">No project</span>
        )}
        <ChevronDown className="size-3.5 text-muted" />
      </button>
      <button
        type="button"
        data-testid="tools-button"
        className="no-drag flex h-7 items-center gap-1.5 rounded-md px-2 text-fg hover:bg-hover"
        onClick={(e) => openToolsMenu(e.currentTarget)}
      >
        <Wrench className="size-4 text-muted" />
        Tools
      </button>
      <div className="flex-1" />
      <IconButton
        icon={PanelLeft}
        label="Layout and views"
        data-testid="layout-button"
        onClick={(e) => openMenuAt(e.currentTarget, layoutMenu(), true)}
      />
      <IconButton
        icon={Settings}
        label="Settings"
        data-testid="settings-button"
        onClick={() => openSettings()}
      />
    </header>
  );
}
