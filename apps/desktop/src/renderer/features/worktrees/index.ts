import { FolderOpen, GitBranchPlus, Trash2, Undo2 } from "lucide-react";
import { useEffect } from "react";
import { create } from "zustand";
import type { SessionMeta } from "../../../shared/engine";
import type { WorktreeChat } from "../../../shared/worktrees";
import { call, errorMessage, useHostEvent } from "../../lib/host";
import { confirmDialog, type MenuEntry, promptDialog } from "../../ui";
import { useProjects } from "../../workbench/projects";
import { registerAction } from "../../workbench/registry";
import { workbench } from "../../workbench/store";
import { notify } from "../../workbench/toasts";
import { ensureTranscript } from "../sessions/store";

/**
 * Chats in their own git worktree (backlog: "Git worktree per chat"): the chat works on a copy of the
 * repository on its own branch; its ⋯ menu brings the changes back or removes the copy.
 */
export const useWorktrees = create<{ chats: WorktreeChat[] }>(() => ({ chats: [] }));

export function useWorktreesSync(): void {
  useEffect(() => {
    void call("worktrees.list").then((chats) => useWorktrees.setState({ chats }));
  }, []);
  useHostEvent("worktrees.changed", (chats) => useWorktrees.setState({ chats }));
}

const base = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

export async function newWorktreeChat(): Promise<void> {
  const { projects, activeId } = useProjects.getState();
  const project = projects.find((p) => p.id === activeId);
  const repo = project?.focusRepo ?? (project?.isGitRepo ? project.path : undefined);
  if (!project || !repo) {
    notify({
      title: "Pick a repository first",
      message: "A worktree is a copy of a git repository: choose the project's repository in the Git view.",
      tone: "warning",
    });
    return;
  }
  const name = await promptDialog({
    title: `New chat in a worktree of ${base(repo)}`,
    message:
      "Claude works on its own copy of the repository, on a new branch; your working copy isn't touched. What is it for?",
    placeholder: "Try the new checkout",
    confirmLabel: "Start",
  });
  if (name === undefined) return;
  try {
    const chat = await call("worktrees.start", { repo, name: name.trim(), projectId: project.id });
    await ensureTranscript(chat.sessionId);
    workbench.openTab("jig.chat", { sessionId: chat.sessionId });
    notify({ title: `Working on ${chat.branch}`, message: chat.path, tone: "success" });
  } catch (error) {
    notify({ title: "Couldn't make the worktree", message: errorMessage(error), tone: "danger" });
  }
}

/** The chat menu's worktree entries (nothing for a normal chat). */
export function worktreeMenu(meta: SessionMeta): MenuEntry[] {
  const chat = useWorktrees.getState().chats.find((c) => c.sessionId === meta.id);
  if (!chat) return [];
  return [
    { separator: true },
    { heading: `Worktree · ${chat.branch}` },
    {
      label: `Apply the changes to ${base(chat.repo)}`,
      icon: Undo2,
      testId: "worktree-apply",
      onSelect: async () => {
        try {
          await call("worktrees.apply", { sessionId: meta.id });
          notify({
            title: `Applied to ${base(chat.repo)}`,
            message: "The changes are in your working copy, not committed: review and commit them in Git.",
            tone: "success",
          });
        } catch (error) {
          notify({ title: "Couldn't apply", message: errorMessage(error), tone: "danger" });
        }
      },
    },
    {
      label: "Open the worktree folder",
      icon: FolderOpen,
      onSelect: () => void call("app.openPath", { path: chat.path }),
    },
    {
      label: "Remove the worktree…",
      icon: Trash2,
      danger: true,
      testId: "worktree-remove",
      onSelect: async () => {
        const ok = await confirmDialog({
          title: "Remove the worktree?",
          message: `${chat.path} and the branch ${chat.branch} are deleted (apply the changes first if you want them). The chat stays.`,
          confirmLabel: "Remove",
          danger: true,
        });
        if (!ok) return;
        try {
          await call("worktrees.remove", { sessionId: meta.id });
        } catch (error) {
          notify({ title: "Couldn't remove it", message: errorMessage(error), tone: "danger" });
        }
      },
    },
  ];
}

export function registerWorktrees(): void {
  registerAction({
    id: "jig.newWorktreeChat",
    title: "New chat in a worktree…",
    group: "Chats",
    icon: GitBranchPlus,
    keywords: ["branch", "isolated", "copy", "parallel"],
    visible: () => Boolean(useProjects.getState().activeId),
    run: () => void newWorktreeChat(),
  });
}
