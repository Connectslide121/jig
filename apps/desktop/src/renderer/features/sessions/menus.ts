import {
  Archive,
  ArchiveRestore,
  ArrowRightLeft,
  Bot,
  Check,
  Download,
  FolderInput,
  FolderPlus,
  Gauge,
  GitFork,
  ListChecks,
  type LucideIcon,
  Map as MapIcon,
  Pencil,
  Pin,
  PinOff,
  Plug,
  Power,
  Shield,
  Smartphone,
  Trash2,
  Wand2,
} from "lucide-react";
import {
  chatProvider,
  type EffortLevel,
  type ModelInfo,
  otherProvider,
  PERMISSION_MODE_LABELS,
  PERMISSION_MODES,
  type PermissionMode,
  type SessionMeta,
} from "../../../shared/engine";
import { closeTabsWhere } from "../../../shared/layout";
import { modelName, modelOptions } from "../../../shared/models";
import {
  CHATGPT_FAMILIES,
  CHATGPT_FAMILY_LABELS,
  chatGptModelChoices,
  resolveChatGptModel,
} from "../../../shared/providers";
import { call, errorMessage } from "../../lib/host";
import { loadProviderModels, useProviderModels, useProviders } from "../../stores/providers";
import { confirmDialog, type MenuEntry, openMenuAt, promptDialog } from "../../ui";
import { useProjects } from "../../workbench/projects";
import { updateLayout, workbench } from "../../workbench/store";
import { notify } from "../../workbench/toasts";
import { openBuildDialog } from "../builder/BuildDialog";
import { startPhone, usePhone } from "../phone/store";
import { startTour } from "../tour/actions";
import { worktreeMenu } from "../worktrees";
import { compactMenu } from "./ContextMeter";
import { handOverToOther, handoverState } from "./HandoverDialog";
import { CHAT_PROVIDER_NAMES, capabilitiesOf, providerName } from "./provider";
import { chatRecipe } from "./recipe";
import { openFoldersDialog, openMcpDialog } from "./SessionDialogs";
import { ensureTranscript, forgetSession, useSessions } from "./store";

/** The chat's model list: its provider's (Claude Code's own, or the one Codex reports). */
const modelsOf = (meta: SessionMeta): ModelInfo[] | undefined =>
  useProviders.getState().models[chatProvider(meta)];

/** The chat's model as the picker names it ("Opus Plan Mode", "Sol", not `opusplan`), with its effort. */
export function useModelLabel(meta: SessionMeta): string {
  useProviderModels(chatProvider(meta));
  return modelLabel(meta);
}

/** "default" is how Claude Code names its default; Jig stores it as an empty model. */
const modelId = (value: string) => (value === "default" ? "" : value);

/** Stable family aliases plus Claude Code's discovered explicit versions (Claude chats' picker lists). */
export function modelChoices(): Array<{ id: string; label: string }> {
  return modelOptions(useProviders.getState().models.claude);
}

/** A ChatGPT model's name: the family ("Sol"), else the version's display name, else the slug. */
function chatGptModelName(model: string, models: ModelInfo[] = []): string {
  const family = CHATGPT_FAMILIES.find((f) => f === model.toLowerCase());
  if (family) return CHATGPT_FAMILY_LABELS[family];
  return models.find((m) => m.value === model)?.displayName ?? (model || "Codex's default");
}

export function modelLabel(meta: SessionMeta): string {
  const models = modelsOf(meta);
  const name =
    chatProvider(meta) === "codex" ? chatGptModelName(meta.model, models) : modelName(meta.model, models);
  return meta.effort ? `${name} · ${meta.effort}` : name;
}

const EFFORT_LABELS: Record<EffortLevel, string> = {
  low: "Low — quick answers",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max — thinks the longest",
  ultra: "Ultra — longer than Max",
};
/** A level Jig has no words for (a new Codex level) shows as Codex names it. */
const effortLabel = (level: string) => EFFORT_LABELS[level as EffortLevel] ?? level;

/** The models a chat can pick: Claude's aliases and versions, or ChatGPT's families then versions. */
function modelEntries(meta: SessionMeta, models: ModelInfo[] | undefined): MenuEntry[] {
  const pick = (model: string) => () => void call("sessions.setModel", { id: meta.id, model });
  if (chatProvider(meta) === "codex") {
    const { families, versions } = chatGptModelChoices(models ?? []);
    const known = [...families, ...versions].some((m) => m.value === meta.model);
    return [
      ...families.map((f) => ({
        label: f.label,
        checked: f.value === meta.model,
        testId: `model-${f.value}`,
        onSelect: pick(f.value),
      })),
      { separator: true } as const,
      ...versions.map((v) => ({
        label: v.label,
        checked: v.value === meta.model,
        testId: `model-${v.value}`,
        onSelect: pick(v.value),
      })),
      ...(known || !meta.model ? [] : [{ label: meta.model, checked: true, icon: Check }]),
    ];
  }
  const choices = modelOptions(models);
  return [
    ...choices.map((m) => ({
      label: m.label,
      checked: m.id === meta.model,
      testId: `model-${m.id || "default"}`,
      onSelect: pick(m.id),
    })),
    // A model of your own (Other model…): its id, as you gave it.
    ...(choices.some((m) => m.id === meta.model) ? [] : [{ label: meta.model, checked: true, icon: Check }]),
  ];
}

export function modelMenu(meta: SessionMeta): MenuEntry[] {
  const models = modelsOf(meta);
  const codex = chatProvider(meta) === "codex";
  // A ChatGPT family takes the efforts of the version it runs on now; any other model its own.
  const resolved = codex ? resolveChatGptModel(meta.model, models ?? []).model : meta.model;
  const current = models?.find((m) => modelId(m.value) === resolved);
  const efforts: readonly string[] =
    current?.efforts ?? (current && !codex ? [] : capabilitiesOf(meta).effortLevels);
  return [
    { heading: "Model" },
    ...modelEntries(meta, models),
    { separator: true },
    {
      label: `Effort: ${meta.effort ? effortLabel(meta.effort).split(" —")[0] : "model default"}`,
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
          label: effortLabel(level),
          checked: meta.effort === level,
          testId: `effort-${level}`,
          onSelect: () => void call("sessions.setEffort", { id: meta.id, effort: level as EffortLevel }),
        })),
      ],
    },
    {
      label: `Permissions: ${PERMISSION_MODE_LABELS[meta.permissionMode]}`,
      icon: permissionIcon(meta.permissionMode),
      testId: "permission-submenu",
      submenu: permissionMenu(meta),
    },
    {
      label: "Other model…",
      icon: Bot,
      onSelect: async () => {
        const model = await promptDialog({
          title: "Model",
          message: codex
            ? "A ChatGPT model family (sol, terra, luna) or an exact model, as Codex lists it."
            : "A model alias or full model id, as Claude Code accepts it.",
          initial: meta.model,
          confirmLabel: "Use",
        });
        if (model) await call("sessions.setModel", { id: meta.id, model });
      },
    },
  ];
}

/** Opens the model menu with the provider's own model list (waits briefly for it the first time). */
export async function openModelMenu(anchor: HTMLElement, meta: SessionMeta): Promise<void> {
  await Promise.race([
    loadProviderModels(chatProvider(meta), meta.id),
    new Promise((r) => setTimeout(r, 2500)),
  ]);
  openMenuAt(anchor, modelMenu(useSessions.getState().metas[meta.id] ?? meta), true);
}

/** The permission modes a chat offers: Plan only only where its provider has plan mode. */
export const permissionModesOf = (meta: Pick<SessionMeta, "provider">): PermissionMode[] =>
  PERMISSION_MODES.filter((mode) => mode !== "plan" || capabilitiesOf(meta).planMode);

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

/** A permission mode's icon, the same in the header, the model menu and the modes' list. */
export const permissionIcon = (mode: PermissionMode): LucideIcon => (mode === "plan" ? ListChecks : Shield);

/** A permission mode's colour: red when nothing is asked, the accent when it's not the default. */
export const permissionTone = (mode: PermissionMode): string =>
  mode === "bypassPermissions" ? "text-danger" : mode === "default" ? "text-muted" : "text-accent";

/** The modes a chat can switch to (the header's chip, the model menu's Permissions, /permissions). */
export function permissionMenu(meta: SessionMeta): MenuEntry[] {
  return [
    { heading: `When ${providerName(meta)} wants to change things` },
    ...permissionModesOf(meta).map((mode) => ({
      label: PERMISSION_MODE_LABELS[mode],
      icon: permissionIcon(mode),
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

/** The ⋯ menu's handover entry: greyed out with the reason while it can't happen (a turn runs). */
function handoverEntryState(meta: SessionMeta): { disabled: boolean; detail?: string } {
  const state = handoverState(meta, otherProvider(chatProvider(meta)));
  return { disabled: !state.ok, detail: state.why };
}

/** Open on my phone (D-350): the chat as a room in your Telegram, when the phone is connected. */
function phoneMenu(meta: SessionMeta): MenuEntry[] {
  startPhone();
  const phone = usePhone.getState().state;
  if (meta.kind || phone?.status !== "connected") return [];
  return [
    {
      label: "Open on my phone",
      icon: Smartphone,
      disabled: !phone.topics,
      detail: phone.topics ? undefined : "Turn on topics for your bot (Settings → Phone)",
      onSelect: () =>
        void call("phone.open", { sessionId: meta.id })
          .then(() => notify({ tone: "success", title: "Open on your phone", message: "It's in a topic of its own." }))
          .catch((error) => notify({ tone: "danger", title: "Couldn't open it", message: errorMessage(error) })),
      testId: "session-open-phone",
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
    ...phoneMenu(meta),
    // Claude ⇄ ChatGPT between turns, through the handover dialog (D-339); builder chats stay on Claude.
    ...(meta.kind
      ? []
      : [
          {
            label: `Hand over to ${CHAT_PROVIDER_NAMES[otherProvider(chatProvider(meta))]}…`,
            icon: ArrowRightLeft,
            ...handoverEntryState(meta),
            onSelect: () => void handOverToOther(meta),
            testId: "session-handover",
          },
        ]),
    // Codex chats can't fork (D-309): the entry isn't there rather than greyed out.
    ...(capabilitiesOf(meta).fork
      ? [
          {
            label: "Fork chat",
            icon: GitFork,
            disabled: !meta.engineSessionId,
            onSelect: () => void forkSession(meta),
            testId: "session-fork",
          },
        ]
      : []),
    ...worktreeMenu(meta),
    {
      label: chatProvider(meta) === "codex" ? "Stop Codex process" : "Stop Claude Code process",
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
