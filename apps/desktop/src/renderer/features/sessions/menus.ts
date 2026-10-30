import {
  Archive,
  ArchiveRestore,
  Bot,
  Check,
  Download,
  FolderInput,
  FolderPlus,
  Gauge,
  GitFork,
  Map as MapIcon,
  Pencil,
  Pin,
  PinOff,
  Plug,
  Power,
  Shield,
  Trash2,
  Wand2,
} from "lucide-react";
import { useEffect } from "react";
import { create } from "zustand";
import {
  EFFORT_LEVELS,
  type EffortLevel,
  type ModelInfo,
  PERMISSION_MODE_LABELS,
  PERMISSION_MODES,
  type SessionMeta,
} from "../../../shared/engine";
import { closeTabsWhere } from "../../../shared/layout";
import { call, errorMessage } from "../../lib/host";
import { confirmDialog, type MenuEntry, openMenuAt, promptDialog } from "../../ui";
import { useProjects } from "../../workbench/projects";
import { updateLayout, workbench } from "../../workbench/store";
import { notify } from "../../workbench/toasts";
import { openBuildDialog } from "../builder/BuildDialog";
import { startTour } from "../tour/actions";
import { worktreeMenu } from "../worktrees";
import { compactMenu } from "./ContextMeter";
import { chatRecipe } from "./recipe";
import { openFoldersDialog, openMcpDialog } from "./SessionDialogs";
import { ensureTranscript, forgetSession, useSessions } from "./store";

export const MODEL_CHOICES = [
  { id: "", label: "Default model" },
  { id: "opus", label: "Opus" },
  { id: "sonnet", label: "Sonnet" },
  { id: "haiku", label: "Haiku" },
  { id: "opusplan", label: "Opus Plan Mode" },
];

/** The models Claude Code offers, asked once (it starts Claude Code for the chat if needed). */
let models: ModelInfo[] | undefined;
let loadingModels: Promise<ModelInfo[] | undefined> | undefined;
/** The same list for components, so a label re-renders when it comes. */
const useModelList = create<{ list?: ModelInfo[] }>(() => ({}));
const keep = (list: ModelInfo[] | undefined) => {
  if (!list?.length) return list;
  models = list;
  useModelList.setState({ list });
  return list;
};
let askedApp = false;
/**
 * Claude Code's model list for the whole app, asked once at the first message box: a no-prompt
 * request (as Settings does), so no chat's Claude Code is started for it.
 */
function ensureModels(): void {
  if (models || askedApp) return;
  askedApp = true;
  void call("engine.models")
    .then(keep)
    .catch(() => {
      askedApp = false;
    });
}

/** The chat's model as the picker names it ("Opus Plan Mode", not `opusplan`), with its effort. */
export function useModelLabel(meta: SessionMeta): string {
  useModelList((s) => s.list);
  useEffect(ensureModels, []);
  return modelLabel(meta);
}

function loadModels(sessionId: string): Promise<ModelInfo[] | undefined> {
  if (models) return Promise.resolve(models);
  loadingModels ??= call("sessions.models", { id: sessionId })
    .then(keep)
    .catch(() => undefined)
    .finally(() => {
      loadingModels = undefined;
    });
  return loadingModels;
}

/** "default" is how Claude Code names its default; Jig stores it as an empty model. */
const modelId = (value: string) => (value === "default" ? "" : value);

/**
 * Aliases Claude Code accepts but doesn't list: added to its list, so the picker names the chat's
 * model the way the button does ("Opus Plan Mode", not `opusplan`) and you can pick it again.
 */
const ALIASES = [{ id: "opusplan", label: "Opus Plan Mode", description: "Opus plans, Sonnet executes" }];
function withAliases<T extends { id: string; label: string; description?: string }>(
  list: T[],
): Array<T | (typeof ALIASES)[number]> {
  return [...list, ...ALIASES.filter((a) => !list.some((m) => m.id === a.id))];
}

/** Models to choose from outside a chat: Claude Code's list once a chat asked for it, else the aliases. */
export function modelChoices(): Array<{ id: string; label: string }> {
  if (!models?.length) return MODEL_CHOICES;
  const list = withAliases(models.map((m) => ({ id: modelId(m.value), label: m.displayName })));
  return list.some((m) => m.id === "") ? list : [MODEL_CHOICES[0]!, ...list];
}

export function modelLabel(meta: SessionMeta): string {
  const known = models?.find((m) => modelId(m.value) === meta.model);
  const name = known?.displayName ?? MODEL_CHOICES.find((m) => m.id === meta.model)?.label ?? meta.model;
  return meta.effort ? `${name} · ${meta.effort}` : name;
}

const EFFORT_LABELS: Record<EffortLevel, string> = {
  low: "Low — quick answers",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max — thinks the longest",
};

export function modelMenu(meta: SessionMeta): MenuEntry[] {
  const choices = models
    ? withAliases(
        models.map((m) => ({ id: modelId(m.value), label: m.displayName, description: m.description })),
      )
    : MODEL_CHOICES;
  const known = choices.some((m) => m.id === meta.model);
  const current = models?.find((m) => modelId(m.value) === meta.model);
  const efforts = current ? (current.efforts ?? []) : [...EFFORT_LEVELS];
  return [
    { heading: "Model" },
    ...choices.map((m) => ({
      label: m.label,
      checked: m.id === meta.model,
      testId: `model-${m.id || "default"}`,
      onSelect: () => void call("sessions.setModel", { id: meta.id, model: m.id }),
    })),
    // A model of your own (Other model…): its id, as you gave it.
    ...(known ? [] : [{ label: meta.model, checked: true, icon: Check }]),
    { separator: true },
    {
      label: `Effort: ${meta.effort ? EFFORT_LABELS[meta.effort].split(" —")[0] : "model default"}`,
      icon: Gauge,
      disabled: efforts.length === 0,
      testId: "effort-menu",
      submenu: [
        {
          label: "Model default",
          checked: !meta.effort,
          onSelect: () => void call("sessions.setEffort", { id: meta.id }),
        },
        ...efforts.map((level) => ({
          label: EFFORT_LABELS[level],
          checked: meta.effort === level,
          testId: `effort-${level}`,
          onSelect: () => void call("sessions.setEffort", { id: meta.id, effort: level }),
        })),
      ],
    },
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

/** Opens the model menu with Claude Code's own model list (waits briefly for it the first time). */
export async function openModelMenu(anchor: HTMLElement, meta: SessionMeta): Promise<void> {
  await Promise.race([loadModels(meta.id), new Promise((r) => setTimeout(r, 2500))]);
  openMenuAt(anchor, modelMenu(useSessions.getState().metas[meta.id] ?? meta), true);
}

/** Saves the chat as a Markdown file. */
export async function exportChat(meta: SessionMeta): Promise<void> {
  try {
    const path = await call("sessions.export", { id: meta.id });
    if (path)
      notify({
        title: "Chat saved",
        message: path,
        tone: "success",
        actions: [{ label: "Show in folder", run: () => void call("app.showItemInFolder", { path }) }],
      });
  } catch (error) {
    notify({ title: "Couldn't save the chat", message: errorMessage(error), tone: "danger" });
  }
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
  const title = await promptDialog({ title: "Rename chat", initial: meta.title, confirmLabel: "Rename" });
  if (title) await call("sessions.rename", { id: meta.id, title });
}

export async function deleteSession(meta: SessionMeta): Promise<void> {
  const ok = await confirmDialog({
    title: `Delete “${meta.title}”?`,
    message: "Removes the chat from Jig. Claude Code's own transcript file stays on disk.",
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  await call("sessions.delete", { id: meta.id });
  updateLayout((l) => closeTabsWhere(l, (t) => t.type === "jig.chat" && t.params.sessionId === meta.id));
  forgetSession(meta.id);
}

/** Pin / move to a project: the same as dragging the chat in the Chats list. */
function organiseMenu(meta: SessionMeta): MenuEntry[] {
  const projects = useProjects.getState().projects;
  return [
    {
      label: meta.pinned ? "Unpin" : "Pin to the top",
      icon: meta.pinned ? PinOff : Pin,
      onSelect: () => void call("sessions.setPinned", { id: meta.id, pinned: !meta.pinned }),
      testId: "session-pin",
    },
    {
      label: "Move to project",
      icon: FolderInput,
      testId: "session-move",
      submenu: [
        ...projects.map((p) => ({
          label: p.name,
          checked: meta.projectId === p.id,
          testId: `session-move-${p.name}`,
          onSelect: () => void call("sessions.setProject", { id: meta.id, projectId: p.id }),
        })),
        { separator: true } as const,
        {
          label: "No project",
          checked: !meta.projectId,
          testId: "session-move-none",
          onSelect: () => void call("sessions.setProject", { id: meta.id }),
        },
      ],
    },
  ];
}

export function sessionMenu(meta: SessionMeta): MenuEntry[] {
  return [
    { label: "Rename…", icon: Pencil, onSelect: () => void renameSession(meta), testId: "session-rename" },
    ...organiseMenu(meta),
    { separator: true },
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
    { label: "MCP servers…", icon: Plug, onSelect: () => openMcpDialog(meta.id), testId: "session-mcp" },
    {
      label: "Folders for this chat…",
      icon: FolderPlus,
      onSelect: () => openFoldersDialog(meta.id),
      testId: "session-folders",
    },
    {
      label: "Export as Markdown…",
      icon: Download,
      onSelect: () => void exportChat(meta),
      testId: "session-export",
    },
    {
      label: "Fork chat",
      icon: GitFork,
      disabled: !meta.engineSessionId,
      onSelect: () => void forkSession(meta),
      testId: "session-fork",
    },
    ...worktreeMenu(meta),
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
