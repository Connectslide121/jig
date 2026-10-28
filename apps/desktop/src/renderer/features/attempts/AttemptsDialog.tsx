import { Split } from "lucide-react";
import { useState } from "react";
import { create } from "zustand";
import { ATTEMPT_ANGLES } from "../../../shared/attempts";
import { call, errorMessage } from "../../lib/host";
import { Button, cn, Dialog, Input, Select, Textarea } from "../../ui";
import { useProjects } from "../../workbench/projects";
import { workbench } from "../../workbench/store";
import { notify } from "../../workbench/toasts";

interface Open {
  task: string;
  projectId?: string;
}
const useDialog = create<{ open: Open | undefined }>(() => ({ open: undefined }));

/** Opens "Try several ways…" with a task (e.g. what's typed in the composer). */
export function openAttemptsDialog(open: Open): void {
  useDialog.setState({ open });
}

function Form({ open }: { open: Open }) {
  const projects = useProjects((s) => s.projects);
  const activeId = useProjects((s) => s.activeId);
  const project = projects.find((p) => p.id === (open.projectId ?? activeId));
  const repos = project
    ? project.repos?.length
      ? project.repos.map((r) => ({ path: r.path, name: r.name }))
      : project.isGitRepo
        ? [{ path: project.path, name: project.name }]
        : []
    : [];
  const [task, setTask] = useState(open.task);
  const [repo, setRepo] = useState(project?.focusRepo ?? repos[0]?.path ?? "");
  const [count, setCount] = useState(3);
  const [angles, setAngles] = useState(ATTEMPT_ANGLES);
  const [busy, setBusy] = useState(false);
  const close = () => useDialog.setState({ open: undefined });
  const start = async () => {
    if (!project) return;
    setBusy(true);
    try {
      const run = await call("attempts.start", {
        projectId: project.id,
        repo,
        task,
        hints: angles.slice(0, count),
      });
      close();
      workbench.openTab("jig.attempts", { runId: run.id });
    } catch (error) {
      notify({ title: "Couldn't start the attempts", message: errorMessage(error), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={close}
      title="Try several ways"
      width="lg"
      testId="attempts-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={Split}
            busy={busy}
            disabled={!task.trim() || !repo || busy}
            onClick={() => void start()}
            data-testid="attempts-start"
          >
            Start {count} attempts
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="text-xs text-muted">
          Claude works on the same task in {count} chats at once, each in its own copy of the repository (a
          git worktree from your last commit) and each from a different angle. Compare what they did, let
          Claude judge, and keep the best one. Your working copy isn't touched until you keep one.
        </div>
        <Textarea
          rows={4}
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="What should be done? e.g. Add a discount code field to checkout"
          data-testid="attempts-task"
        />
        {repos.length === 0 ? (
          <div className="text-xs text-warning">This project has no git repository; attempts need one.</div>
        ) : (
          repos.length > 1 && (
            <div className="flex items-center gap-2 text-xs text-muted">
              Repository
              <Select value={repo} onChange={(e) => setRepo(e.target.value)} aria-label="Repository">
                {repos.map((r) => (
                  <option key={r.path} value={r.path}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </div>
          )
        )}
        <div className="flex items-center gap-2 text-xs text-muted">
          Attempts
          {[2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCount(n)}
              aria-pressed={count === n}
              className={cn(
                "size-7 rounded-md border text-sm",
                count === n
                  ? "border-accent bg-accent-soft text-fg"
                  : "border-line text-muted hover:bg-hover",
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          {angles.slice(0, count).map((angle, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: one input per attempt number.
            <div key={i} className="flex items-center gap-2 text-xs text-muted">
              <span className="w-16 shrink-0">Attempt {i + 1}</span>
              <Input
                value={angle}
                onChange={(e) => setAngles((list) => list.map((a, j) => (j === i ? e.target.value : a)))}
                aria-label={`Angle of attempt ${i + 1}`}
              />
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  );
}

export function AttemptsDialogHost() {
  const open = useDialog((s) => s.open);
  return open ? <Form open={open} /> : null;
}
