import {
  Archive,
  ArchiveRestore,
  Bot,
  Check,
  GitFork,
  Map as MapIcon,
  Pencil,
  Power,
  Shield,
  Trash2,
  Wand2,
} from "lucide-react";
import { PERMISSION_MODE_LABELS, PERMISSION_MODES, type SessionMeta } from "../../../shared/engine";
import { closeTabsWhere } from "../../../shared/layout";
import { call, errorMessage } from "../../lib/host";
import { confirmDialog, type MenuEntry, promptDialog } from "../../ui";
import { updateLayout, workbench } from "../../workbench/store";
import { notify } from "../../workbench/toasts";
import { openBuildDialog } from "../builder/BuildDialog";
import { startTour } from "../tour/actions";
import { compactMenu } from "./ContextMeter";
import { chatRecipe } from "./recipe";
import { ensureTranscript, forgetSession, useSessions } from "./store";

export const MODEL_CHOICES = [
  { id: "", label: "Default model" },
  { id: "opus", label: "Opus" },
  { id: "sonnet", label: "Sonnet" },
  { id: "haiku", label: "Haiku" },
];

export function modelLabel(meta: SessionMeta): string {
  return MODEL_CHOICES.find((m) => m.id === meta.model)?.label ?? meta.model;
}

export function modelMenu(meta: SessionMeta): MenuEntry[] {
  const known = MODEL_CHOICES.some((m) => m.id === meta.model);
  return [
    { heading: "Model" },
    ...MODEL_CHOICES.map((m) => ({
      label: m.label,
      checked: m.id === meta.model,
      onSelect: () => void call("sessions.setModel", { id: meta.id, model: m.id }),
    })),
    ...(known ? [] : [{ label: meta.model, checked: true, icon: Check }]),
    { separator: true },
    {
      label: "Other model…",
      icon: Bot,
      onSelect: async () => {
        const model = await promptDialog({
          title: "Model",
          message: "A model alias or full model id, as Claude Code accepts it.",
          initial: meta.model,
          confirmLabel: "Use",
        });
        if (model) await call("sessions.setModel", { id: meta.id, model });
      },
    },
  ];
}

export function permissionMenu(meta: SessionMeta): MenuEntry[] {
  return [
    { heading: "When Claude wants to change things" },
    ...PERMISSION_MODES.map((mode) => ({
      label: PERMISSION_MODE_LABELS[mode],
      icon: Shield,
      checked: mode === meta.permissionMode,
      testId: `mode-${mode}`,
      onSelect: () => void call("sessions.setPermissionMode", { id: meta.id, mode }),
    })),
  ];
}

export async function renameSession(meta: SessionMeta): Promise<void> {
  const title = await promptDialog({ title: "Rename session", initial: meta.title, confirmLabel: "Rename" });
  if (title) await call("sessions.rename", { id: meta.id, title });
}

export async function deleteSession(meta: SessionMeta): Promise<void> {
  const ok = await confirmDialog({
    title: `Delete “${meta.title}”?`,
    message: "Removes the session from Jig. Claude Code's own transcript file stays on disk.",
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  await call("sessions.delete", { id: meta.id });
  updateLayout((l) => closeTabsWhere(l, (t) => t.type === "jig.chat" && t.params.sessionId === meta.id));
  forgetSession(meta.id);
}

export function sessionMenu(meta: SessionMeta): MenuEntry[] {
  return [
    { label: "Rename…", icon: Pencil, onSelect: () => void renameSession(meta), testId: "session-rename" },
    ...compactMenu(meta),
    {
      label: "Walk me through the changes",
      icon: MapIcon,
      disabled: meta.turns === 0,
      onSelect: () => void startTour(meta.cwd, `Changes made in the chat "${meta.title}"`),
      testId: "session-tour",
    },
    {
      label: "Turn this chat into a tool…",
      icon: Wand2,
      disabled: meta.turns === 0,
      onSelect: () => void chatToTool(meta),
      testId: "session-to-tool",
    },
    {
      label: "Fork chat",
      icon: GitFork,
      disabled: !meta.engineSessionId,
      onSelect: () => void forkSession(meta),
      testId: "session-fork",
    },
    {
      label: "Stop Claude Code process",
      icon: Power,
      onSelect: () => void call("sessions.stop", { id: meta.id }),
    },
    meta.archived
      ? {
          label: "Unarchive",
          icon: ArchiveRestore,
          onSelect: () => void call("sessions.archive", { id: meta.id, archived: false }),
        }
      : {
          label: "Archive",
          icon: Archive,
          onSelect: () => void call("sessions.archive", { id: meta.id, archived: true }),
        },
    { separator: true },
    {
      label: "Delete…",
      icon: Trash2,
      danger: true,
      onSelect: () => void deleteSession(meta),
      testId: "session-delete",
    },
  ];
}

/** A new chat that continues this one as a branch, to try another approach (Claude Code's fork). */
export async function forkSession(meta: SessionMeta): Promise<void> {
  try {
    const fork = await call("sessions.fork", { id: meta.id });
    await ensureTranscript(fork.id);
    workbench.openTab("jig.chat", { sessionId: fork.id });
  } catch (error) {
    notify({ title: "Couldn't fork the chat", message: errorMessage(error), tone: "danger" });
  }
}

/**
 * Hands what you did in a chat to the builder, to make it a tool you can run again (a button, an
 * action, a watcher…): your requests, the commands run and the files touched, in order.
 */
export async function chatToTool(meta: SessionMeta): Promise<void> {
  await ensureTranscript(meta.id);
  const items = useSessions.getState().transcripts[meta.id]?.items ?? [];
  openBuildDialog({ goal: chatRecipe(meta.title, items), origin: "chat" });
}
