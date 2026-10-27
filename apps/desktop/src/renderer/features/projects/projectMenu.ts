import { FolderOpen, LayoutDashboard, Palette, Pencil, Trash2 } from "lucide-react";
import { closeTabsWhere } from "../../../shared/layout";
import { PROJECT_COLORS, type ProjectInfo } from "../../../shared/projects";
import { call } from "../../lib/host";
import { confirmDialog, type MenuEntry, promptDialog } from "../../ui";
import { contributedEntries } from "../../workbench/contextMenus";
import { updateLayout, workbench } from "../../workbench/store";
import { projectColorLabel } from "./colors";

export async function renameProject(project: ProjectInfo): Promise<void> {
  const name = await promptDialog({ title: "Rename project", initial: project.name, confirmLabel: "Rename" });
  if (name) await call("projects.update", { id: project.id, name });
}

export async function removeProject(project: ProjectInfo): Promise<void> {
  const ok = await confirmDialog({
    title: `Remove ${project.name}?`,
    message: "Jig forgets this project. The folder and its files are not touched.",
    confirmLabel: "Remove",
    danger: true,
  });
  if (!ok) return;
  await call("projects.remove", { id: project.id });
  updateLayout((l) => closeTabsWhere(l, (t) => t.params.projectId === project.id));
}

export function projectMenu(project: ProjectInfo): MenuEntry[] {
  const extra = contributedEntries({ slot: "context.project", project });
  return [
    {
      label: "Open dashboard",
      icon: LayoutDashboard,
      onSelect: () => workbench.openTab("jig.project", { projectId: project.id }),
    },
    {
      label: "Open folder in Explorer",
      icon: FolderOpen,
      onSelect: () => void call("app.openPath", { path: project.path }),
    },
    ...(extra.length ? [{ separator: true } as const, ...extra] : []),
    { separator: true },
    { label: "Rename…", icon: Pencil, onSelect: () => void renameProject(project), testId: "project-rename" },
    {
      label: "Colour",
      icon: Palette,
      submenu: PROJECT_COLORS.map((color) => ({
        label: projectColorLabel[color],
        checked: project.color === color,
        onSelect: () => void call("projects.update", { id: project.id, color }),
      })),
    },
    { separator: true },
    {
      label: "Remove from Jig…",
      icon: Trash2,
      danger: true,
      onSelect: () => void removeProject(project),
      testId: "project-remove",
    },
  ];
}
