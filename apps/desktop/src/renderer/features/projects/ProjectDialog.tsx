import { isRenamedDefault, pinnedTenant } from "@jig/azure";
import { FolderPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { create } from "zustand";
import {
  type ChatProvider,
  type EffortLevel,
  ENGINE_CAPABILITIES,
  LIMIT_POLICIES,
  LIMIT_POLICY_LABELS,
  type LimitPolicy,
  PERMISSION_MODE_LABELS,
  PERMISSION_MODES,
  type PermissionMode,
} from "../../../shared/engine";
import { modelOptions } from "../../../shared/models";
import { PROJECT_COLORS, type ProjectColor, type ProjectInfo } from "../../../shared/projects";
import { chatGptModelChoices } from "../../../shared/providers";
import { call, errorMessage } from "../../lib/host";
import { useConfig } from "../../stores/config";
import { useChatGptStatus, useProviderModels } from "../../stores/providers";
import { Button, cn, Dialog, Input, Select, Textarea } from "../../ui";
import { useProjects } from "../../workbench/projects";
import { workbench } from "../../workbench/store";
import { startTenants, useTenants } from "../azure/store";
import { CHAT_PROVIDER_NAMES } from "../sessions/provider";
import { projectColorLabel, projectDotClass } from "./colors";

const useProjectDialog = create<{ open: { projectId?: string } | undefined }>(() => ({ open: undefined }));

/** A new project: name, default workspace, default Git repository, defaults for its chats. */
export const openNewProjectDialog = () => useProjectDialog.setState({ open: {} });
/** Edits a project's settings. */
export const openProjectDialog = (projectId: string) => useProjectDialog.setState({ open: { projectId } });

export function ProjectDialogHost() {
  const open = useProjectDialog((s) => s.open);
  const project = useProjects((s) => s.projects.find((p) => p.id === open?.projectId));
  if (!open || (open.projectId && !project)) return null;
  return (
    <ProjectDialog
      key={open.projectId ?? "new"}
      project={project}
      onClose={() => useProjectDialog.setState({ open: undefined })}
    />
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is the child.
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="text-2xs text-hint">{hint}</span>}
    </label>
  );
}

function ProjectDialog({ project, onClose }: { project: ProjectInfo | undefined; onClose: () => void }) {
  const workspaces = useProjects((s) => s.workspaces);
  const [name, setName] = useState(project?.name ?? "");
  const [color, setColor] = useState<ProjectColor | undefined>(project?.color);
  const [path, setPath] = useState(project?.path ?? workspaces[0]?.path ?? "");
  const [repo, setRepo] = useState(project?.focusRepo ?? "");
  const [provider, setProvider] = useState<ChatProvider | "">(project?.provider ?? "");
  const [onLimit, setOnLimit] = useState<LimitPolicy | "">(project?.onLimit ?? "");
  const [model, setModel] = useState(project?.model ?? "");
  const [effort, setEffort] = useState<EffortLevel | "">(project?.effort ?? "");
  const [mode, setMode] = useState<PermissionMode | "">(project?.permissionMode ?? "");
  const [instructions, setInstructions] = useState(project?.instructions ?? "");
  const [starters, setStarters] = useState((project?.starters ?? []).join("\n"));
  const tenants = useTenants((s) => s.state);
  useEffect(startTenants, []);
  // A pin whose tenant was removed counts as Default (D-286): the select shows Default, a note says why.
  const removedPin = Boolean(tenants && pinnedTenant(tenants, project?.azureTenant).removed);
  const [tenant, setTenant] = useState(removedPin ? "" : (project?.azureTenant ?? ""));
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const globalProvider = useConfig((s) => s.config?.engine.provider) ?? "claude";
  const globalOnLimit = useConfig((s) => s.config?.engine.onLimit) ?? "ask";
  const chatgpt = useChatGptStatus();
  // The model and effort lists are those of the provider this project's chats run on (D-314).
  const runsOn = provider || globalProvider;
  const models = useProviderModels(runsOn);
  const modelItems: Array<{ id: string; label: string } | null> =
    runsOn === "codex"
      ? (() => {
          const { families, versions } = chatGptModelChoices(models ?? []);
          return [
            ...families.map((f) => ({ id: f.value, label: f.label })),
            null,
            ...versions.map((v) => ({ id: v.value, label: v.label })),
          ];
        })()
      : modelOptions(models).filter((m) => m.id);
  const workspace = workspaces.find((w) => w.path === path);
  const repos = workspace?.repos ?? [];

  const addFolder = async () => {
    try {
      const added = await call("workspaces.add", {});
      if (added) {
        setPath(added.path);
        setRepo("");
        if (!name.trim()) setName(added.path.split(/[\\/]/).pop() ?? "");
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const save = async () => {
    setError(undefined);
    if (!name.trim()) return setError("Give the project a name.");
    if (!path) return setError("Choose a default workspace (a folder).");
    setBusy(true);
    try {
      const settings = {
        name,
        path,
        provider,
        onLimit,
        model,
        effort,
        permissionMode: mode,
        azureTenant: tenant,
        instructions,
        starters: starters.split("\n"),
        ...(color ? { color } : {}),
      };
      let id = project?.id;
      if (id) await call("projects.update", { id, ...settings });
      else id = (await call("projects.create", settings)).id;
      await call("projects.setFocusRepo", { id, repo: repo || undefined });
      if (!project) workbench.openTab("jig.project", { projectId: id });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={project ? `${project.name}: settings` : "New project"}
      testId="project-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void save()} data-testid="project-save">
            {project ? "Save" : "Create project"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-xs text-muted">
          A project groups your chats. You choose which chats are in it; folders never decide that.
        </p>
        <Field label="Name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My project"
            data-testid="project-name"
          />
        </Field>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Colour</span>
          <div className="flex gap-1.5">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                title={projectColorLabel[c]}
                aria-label={projectColorLabel[c]}
                aria-pressed={(color ?? project?.color) === c}
                onClick={() => setColor(c)}
                className={cn(
                  "flex size-6 items-center justify-center rounded-md border",
                  (color ?? project?.color) === c ? "border-focus" : "border-transparent hover:border-line",
                )}
              >
                <span className={cn("size-3 rounded-xs", projectDotClass(c))} />
              </button>
            ))}
          </div>
        </div>
        <Field
          label="Default workspace"
          hint="The folder new chats in this project start in. You can pick another one when you start a chat."
        >
          <div className="flex gap-1.5">
            <Select
              className="min-w-0 flex-1"
              value={path}
              onChange={(e) => {
                setPath(e.target.value);
                setRepo("");
              }}
              data-testid="project-workspace"
            >
              {!path && <option value="">Choose a folder…</option>}
              {workspaces.map((w) => (
                <option key={w.id} value={w.path}>
                  {w.name} — {w.path}
                </option>
              ))}
            </Select>
            <Button icon={FolderPlus} onClick={() => void addFolder()} data-testid="project-add-folder">
              Add folder…
            </Button>
          </div>
        </Field>
        {repos.length > 0 && (
          <Field
            label="Default Git repository"
            hint="Shown first in the Git panel while this project is active."
          >
            <Select value={repo} onChange={(e) => setRepo(e.target.value)} data-testid="project-repo">
              <option value="">All repositories</option>
              {repos.map((r) => (
                <option key={r.path} value={r.path}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Azure tenant">
          <Select value={tenant} onChange={(e) => setTenant(e.target.value)} data-testid="project-tenant">
            <option value="">Default (the tenant in use stays)</option>
            {(tenants?.tenants ?? []).map((t) => (
              <option key={t.key} value={t.key}>
                {t.isDefault
                  ? isRenamedDefault(t)
                    ? `${t.label} — your own az login`
                    : t.label
                  : t.user
                    ? `${t.label} — ${t.user}`
                    : t.label}
              </option>
            ))}
            {!tenants && tenant && <option value={tenant}>{tenant}</option>}
          </Select>
          {removedPin ? (
            <span className="text-2xs text-warning" data-testid="project-tenant-removed">
              The tenant this project was pinned to was removed from Jig, so it uses Default. Pick another
              one, or save to keep Default.
            </span>
          ) : (
            <span className="text-2xs text-hint">
              Switching to this project switches Azure, Azure DevOps and az to this tenant. Add tenants from
              the avatar at the top right.
            </span>
          )}
        </Field>
        <Field
          label="Chats run on"
          hint="Who runs new chats in this project; a new chat can still pick the other one."
        >
          <Select
            value={provider}
            onChange={(e) => {
              // The model and effort belong to the provider, so they start again at its defaults.
              setProvider(e.target.value as ChatProvider | "");
              setModel("");
              setEffort("");
            }}
            data-testid="project-provider"
          >
            <option value="">Jig's default ({CHAT_PROVIDER_NAMES[globalProvider]})</option>
            <option value="claude">Claude</option>
            <option value="codex" disabled={provider !== "codex" && chatgpt?.ready !== true}>
              {chatgpt?.ready === false ? "ChatGPT (sign in on Get started)" : "ChatGPT"}
            </option>
          </Select>
        </Field>
        <Field
          label="When a chat hits its limit"
          hint="Its plan's limit stops a chat: ask, carry on in the same chat with the other provider, or wait for the reset and resume."
        >
          <Select
            value={onLimit}
            onChange={(e) => setOnLimit(e.target.value as LimitPolicy | "")}
            data-testid="project-on-limit"
          >
            <option value="">Jig's default ({LIMIT_POLICY_LABELS[globalOnLimit]})</option>
            {LIMIT_POLICIES.map((policy) => (
              <option key={policy} value={policy}>
                {LIMIT_POLICY_LABELS[policy]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Model">
            <Select value={model} onChange={(e) => setModel(e.target.value)} data-testid="project-model">
              <option value="">Jig's default</option>
              {modelItems.map((m, i) =>
                m ? (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ) : (
                  <hr key={`divider-${i}`} />
                ),
              )}
              {model && !modelItems.some((m) => m?.id === model) && <option value={model}>{model}</option>}
            </Select>
          </Field>
          <Field label="Effort">
            <Select
              value={effort}
              onChange={(e) => setEffort(e.target.value as EffortLevel | "")}
              data-testid="project-effort"
            >
              <option value="">Model's default</option>
              {ENGINE_CAPABILITIES[runsOn].effortLevels.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Permissions">
            <Select
              value={mode}
              onChange={(e) => setMode(e.target.value as PermissionMode | "")}
              data-testid="project-mode"
            >
              <option value="">Jig's default</option>
              {PERMISSION_MODES.filter((m) => m !== "plan" || ENGINE_CAPABILITIES[runsOn].planMode).map(
                (m) => (
                  <option key={m} value={m}>
                    {PERMISSION_MODE_LABELS[m]}
                  </option>
                ),
              )}
            </Select>
          </Field>
        </div>
        <Field
          label="Instructions for Claude"
          hint="Added to Claude's instructions in this project's chats, e.g. how you name branches or which language release notes are in."
        >
          <Textarea
            rows={3}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            data-testid="project-instructions"
          />
        </Field>
        <Field label="Starter prompts" hint="One per line. Shown on the project's Home; empty = Jig's own.">
          <Textarea
            rows={3}
            value={starters}
            onChange={(e) => setStarters(e.target.value)}
            data-testid="project-starters"
          />
        </Field>
        {error && <div className="text-xs text-danger">{error}</div>}
      </div>
    </Dialog>
  );
}
