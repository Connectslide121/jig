import { FolderOpen, FolderSearch, LayoutDashboard, Palette, Pencil, Settings2, Trash2 } from "lucide-react";
import { closeTabsWhere } from "../../../shared/layout";
import { PROJECT_COLORS, type ProjectInfo } from "../../../shared/projects";
import { call } from "../../lib/host";
import { confirmDialog, type MenuEntry, promptDialog } from "../../ui";
import { contributedEntries } from "../../workbench/contextMenus";
import { updateLayout, workbench } from "../../workbench/store";
import { projectColorLabel } from "./colors";
import { openProjectDialog } from "./ProjectDialog";

export async function renameProject(project: ProjectInfo): Promise<void> {
  const name = await promptDialog({ title: "Rename project", initial: project.name, confirmLabel: "Rename" });
  if (name) await call("projects.update", { id: project.id, name });
}

export async function removeProject(project: ProjectInfo): Promise<void> {
  const ok = await confirmDialog({
    title: `Remove ${project.name}?`,
    message: "Jig forgets this project. Its chats move to “No project”; folders and files are not touched.",
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
      label: "Project settings…",
      icon: Settings2,
      onSelect: () => openProjectDialog(project.id),
      testId: "project-settings",
    },
    {
      label: "Open dashboard",
      icon: LayoutDashboard,
      onSelect: () => workbench.openTab("jig.project", { projectId: project.id }),
    },
    {
      label: "Open its workspace folder",
      icon: FolderOpen,
      onSelect: () => void call("app.openPath", { path: project.path }),
    },
    ...(!project.isGitRepo
      ? [
          {
            label: "Look for repositories inside again",
            icon: FolderSearch,
            onSelect: () => void call("projects.rescanRepos", { id: project.id }),
          },
        ]
      : []),
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
