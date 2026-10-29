import {
  FolderTree,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCw,
  Square,
  SquareTerminal,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import type { ProjectInfo } from "../../../shared/projects";
import type { Script, ScriptGroup } from "../../../shared/terminals";
import { call, errorMessage } from "../../lib/host";
import { Badge, Button, Card, confirmDialog, Dialog, Empty, IconButton, Input, Spinner } from "../../ui";
import { notify } from "../../workbench/toasts";
import { showTerminal } from "../terminals/actions";
import { useProjectScripts } from "./useScripts";

const KIND_LABEL: Record<Script["kind"], string> = {
  npm: "npm",
  ps1: "PowerShell",
  sh: "shell",
  cmd: "cmd",
  "dotnet-run": ".NET",
  "dotnet-watch": ".NET watch",
  func: "Functions",
};

async function run(projectId: string, scriptId: string) {
  try {
    const t = await call("scripts.run", { projectId, scriptId });
    showTerminal(t.id);
  } catch (error) {
    notify({ title: "Couldn't start the script", message: errorMessage(error), tone: "danger" });
  }
}

function GroupDialog({
  open,
  onClose,
  project,
  scripts,
  group,
}: {
  open: boolean;
  onClose: () => void;
  project: ProjectInfo;
  scripts: Script[];
  group?: ScriptGroup;
}) {
  const [name, setName] = useState(group?.name ?? "Start local");
  const [selected, setSelected] = useState<string[]>(group?.scriptIds ?? []);
  const save = async () => {
    await call("scripts.saveGroup", {
      projectId: project.id,
      group: { id: group?.id, name, scriptIds: selected },
    });
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={group ? "Edit group" : "New script group"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!name.trim() || selected.length === 0}
            onClick={() => void save()}
            data-testid="group-save"
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Group name"
          data-testid="group-name"
        />
        <div className="text-xs text-muted">Scripts to start together (in this order):</div>
        <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
          {scripts.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-accent"
                data-testid={`group-pick-${s.name}`}
                checked={selected.includes(s.id)}
                onChange={(e) =>
                  setSelected((list) => (e.target.checked ? [...list, s.id] : list.filter((x) => x !== s.id)))
                }
              />
              <span className="truncate">{s.folder ? `${s.folder}: ${s.name}` : s.name}</span>
            </label>
          ))}
        </div>
      </div>
    </Dialog>
  );
}

/** Scripts of a project with Run / Stop / Restart, and groups that start several at once. */
export function ScriptsPanel({ project, compact }: { project: ProjectInfo; compact?: boolean }) {
  const { data, error, reload, running } = useProjectScripts(project.id);
  const [editing, setEditing] = useState<{ group?: ScriptGroup } | undefined>();
  if (error) return <div className="p-3 text-sm text-danger">{error}</div>;
  if (!data) return <Spinner center />;
  const byFolder = new Map<string, Script[]>();
  for (const s of data.scripts) byFolder.set(s.folder, [...(byFolder.get(s.folder) ?? []), s]);
  return (
    <div className="flex flex-col gap-3" data-testid="scripts-panel">
      <div className="flex items-center gap-2">
        {!compact && <h2 className="flex-1 text-base font-semibold">Scripts</h2>}
        {compact && <div className="flex-1" />}
        <IconButton icon={RefreshCw} size="sm" label="Rescan scripts" onClick={reload} />
        <Button
          size="sm"
          icon={Plus}
          onClick={() => setEditing({})}
          disabled={data.scripts.length === 0}
          data-testid="group-new"
        >
          Group
        </Button>
      </div>
      {data.groups.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.groups.map((g) => {
            const allRunning = g.scriptIds.every((id) => running.has(id));
            return (
              <div
                key={g.id}
                className="flex items-center gap-1 rounded-md border border-line bg-surface p-1 pl-2 text-sm"
              >
                <span className="font-medium">{g.name}</span>
                <span className="text-xs text-hint">({g.scriptIds.length})</span>
                {allRunning ? (
                  <IconButton
                    icon={Square}
                    size="sm"
                    label={`Stop ${g.name}`}
                    onClick={() =>
                      g.scriptIds.forEach(
                        (id) => void call("scripts.stop", { projectId: project.id, scriptId: id }),
                      )
                    }
                  />
                ) : (
                  <IconButton
                    icon={Play}
                    size="sm"
                    label={`Start ${g.name}`}
                    data-testid={`group-run-${g.name}`}
                    onClick={() =>
                      void call("scripts.runGroup", { projectId: project.id, groupId: g.id })
                        .then((ts) => ts[0] && showTerminal(ts[0].id))
                        .catch((e) =>
                          notify({
                            title: "Couldn't start the group",
                            message: errorMessage(e),
                            tone: "danger",
                          }),
                        )
                    }
                  />
                )}
                <IconButton
                  icon={Pencil}
                  size="sm"
                  label="Edit group"
                  onClick={() => setEditing({ group: g })}
                />
                <IconButton
                  icon={Trash2}
                  size="sm"
                  label="Delete group"
                  onClick={async () => {
                    if (
                      await confirmDialog({
                        title: `Delete the group “${g.name}”?`,
                        confirmLabel: "Delete",
                        danger: true,
                      })
                    )
                      await call("scripts.deleteGroup", { projectId: project.id, groupId: g.id });
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
      {data.scripts.length === 0 ? (
        <Empty icon={SquareTerminal} title="No scripts found">
          Jig looks for package.json scripts, .ps1/.sh files in the root and scripts/, .NET projects and Azure
          Functions apps.
        </Empty>
      ) : (
        [...byFolder.entries()].map(([folder, scripts]) => (
          <Card key={folder || "."} className="overflow-hidden">
            <div className="flex h-7 items-center gap-1.5 border-b border-line bg-surface px-3 text-xs text-muted">
              <FolderTree className="size-3.5" /> {folder || project.name}
            </div>
            {scripts.map((s) => {
              const terminal = running.get(s.id);
              return (
                <div
                  key={s.id}
                  className="group flex h-8 items-center gap-2 px-3 text-sm hover:bg-hover"
                  data-testid={`script-${s.name}`}
                >
                  <span
                    className={
                      terminal ? "size-1.5 rounded-full bg-success" : "size-1.5 rounded-full bg-line-strong"
                    }
                  />
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left"
                    title={s.detail ?? s.command}
                    onClick={() => (terminal ? showTerminal(terminal.id) : void run(project.id, s.id))}
                  >
                    {s.name}
                    {s.detail && <span className="ml-2 font-mono text-xs text-hint">{s.detail}</span>}
                  </button>
                  <Badge>{KIND_LABEL[s.kind]}</Badge>
                  {terminal ? (
                    <>
                      <IconButton
                        icon={RotateCw}
                        size="sm"
                        label="Restart"
                        onClick={() =>
                          void call("scripts.restart", { projectId: project.id, scriptId: s.id }).then((t) =>
                            showTerminal(t.id),
                          )
                        }
                      />
                      <IconButton
                        icon={Square}
                        size="sm"
                        label="Stop"
                        data-testid={`script-stop-${s.name}`}
                        onClick={() => void call("scripts.stop", { projectId: project.id, scriptId: s.id })}
                      />
                    </>
                  ) : (
                    <IconButton
                      icon={Play}
                      size="sm"
                      label="Run"
                      data-testid={`script-run-${s.name}`}
                      onClick={() => void run(project.id, s.id)}
                    />
                  )}
                </div>
              );
            })}
          </Card>
        ))
      )}
      {editing && (
        <GroupDialog
          open
          onClose={() => setEditing(undefined)}
          project={project}
          scripts={data.scripts}
          group={editing.group}
        />
      )}
    </div>
  );
}
