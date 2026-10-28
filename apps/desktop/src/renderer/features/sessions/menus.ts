import { Archive, ArchiveRestore, Bot, Check, Pencil, Power, Shield, Trash2 } from "lucide-react";
import { PERMISSION_MODE_LABELS, PERMISSION_MODES, type SessionMeta } from "../../../shared/engine";
import { closeTabsWhere } from "../../../shared/layout";
import { call } from "../../lib/host";
import { confirmDialog, type MenuEntry, promptDialog } from "../../ui";
import { updateLayout } from "../../workbench/store";
import { compactMenu } from "./ContextMeter";
import { forgetSession } from "./store";

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
