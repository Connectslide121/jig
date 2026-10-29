import { FolderPlus } from "lucide-react";
import { useState } from "react";
import { create } from "zustand";
import {
  EFFORT_LEVELS,
  type EffortLevel,
  PERMISSION_MODE_LABELS,
  PERMISSION_MODES,
  type PermissionMode,
} from "../../../shared/engine";
import { PROJECT_COLORS, type ProjectColor, type ProjectInfo } from "../../../shared/projects";
import { call, errorMessage } from "../../lib/host";
import { Button, cn, Dialog, Input, Select, Textarea } from "../../ui";
import { useProjects } from "../../workbench/projects";
import { workbench } from "../../workbench/store";
import { modelChoices } from "../sessions/menus";
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
  const [model, setModel] = useState(project?.model ?? "");
  const [effort, setEffort] = useState<EffortLevel | "">(project?.effort ?? "");
  const [mode, setMode] = useState<PermissionMode | "">(project?.permissionMode ?? "");
  const [instructions, setInstructions] = useState(project?.instructions ?? "");
  const [starters, setStarters] = useState((project?.starters ?? []).join("\n"));
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
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
        model,
        effort,
        permissionMode: mode,
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
        <div className="grid grid-cols-3 gap-2">
          <Field label="Model">
            <Select value={model} onChange={(e) => setModel(e.target.value)} data-testid="project-model">
              {modelChoices().map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id ? m.label : "Jig's default"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Effort">
            <Select value={effort} onChange={(e) => setEffort(e.target.value as EffortLevel | "")}>
              <option value="">Model's default</option>
              {EFFORT_LEVELS.map((level) => (
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
              {PERMISSION_MODES.map((m) => (
                <option key={m} value={m}>
                  {PERMISSION_MODE_LABELS[m]}
                </option>
              ))}
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
