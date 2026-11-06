import { ExternalLink, FileArchive, FolderPlus, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { create } from "zustand";
import type { ClaudeExportSummary } from "../../../shared/knowledge";
import { call, errorMessage } from "../../lib/host";
import { Button, cn, Dialog, Empty, Select, Spinner } from "../../ui";
import { useProjects } from "../../workbench/projects";
import { workbench } from "../../workbench/store";
import { notify } from "../../workbench/toasts";

const useDialog = create<{ open: boolean }>(() => ({ open: false }));

/** Opens "Import from claude.ai": the steps to get the export, then the projects in it (D-256). */
export function openClaudeImportDialog(): void {
  useDialog.setState({ open: true });
}

/**
 * The steps on claude.ai, as its help article "How can I export my Claude data?" describes them
 * (docs/plan/23-jons-notes.md keeps the source text; check it against a real export).
 */
const STEPS: React.ReactNode[] = [
  <>
    Open <b>claude.ai</b> in your web browser and sign in.
  </>,
  <>
    Click your <b>name</b> at the bottom left, then <b>Settings</b>.
  </>,
  <>
    Open <b>Privacy</b> and click <b>Export data</b>.
  </>,
  <>
    Wait for the email from Anthropic (minutes, or a few hours for large accounts). Its download link expires
    after about a day, so download the zip soon.
  </>,
  <>Don't unzip it: drop the zip below, or Browse… for it.</>,
];

function Body() {
  const workspaces = useProjects((s) => s.workspaces);
  const [summary, setSummary] = useState<ClaudeExportSummary>();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [folder, setFolder] = useState(workspaces[0]?.path ?? "");
  // A folder added from here (the first one) becomes the choice.
  useEffect(() => {
    if (!folder && workspaces[0]) setFolder(workspaces[0].path);
  }, [folder, workspaces]);
  const [busy, setBusy] = useState<"read" | "import">();
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const close = () => useDialog.setState({ open: false });
  const open = async (path?: string) => {
    setBusy("read");
    setError("");
    try {
      const found = await call("claudeImport.open", path ? { path } : {});
      if (!found) return;
      setSummary(found);
      setPicked(new Set(found.projects.map((p) => p.uuid)));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(undefined);
    }
  };
  const importNow = async () => {
    if (!summary) return;
    setBusy("import");
    setError("");
    try {
      const { projectIds } = await call("claudeImport.apply", {
        token: summary.token,
        uuids: [...picked],
        path: folder,
      });
      close();
      notify({
        title: `Imported ${projectIds.length} project${projectIds.length === 1 ? "" : "s"} from claude.ai`,
        message: "Their instructions and knowledge are in each project's settings and Home.",
        tone: "success",
      });
      if (projectIds[0]) workbench.openTab("jig.project", { projectId: projectIds[0] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(undefined);
    }
  };
  const toggle = (uuid: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  return (
    <Dialog
      open
      title="Import from claude.ai"
      width="lg"
      onClose={close}
      testId="claude-import"
      footer={
        <>
          <span className="mr-auto flex min-w-0 items-center gap-2 text-xs whitespace-nowrap text-muted">
            New projects start in
            {workspaces.length ? (
              <Select
                aria-label="Default workspace for the imported projects"
                className="h-7 w-44 text-xs"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.path}>
                    {w.name}
                  </option>
                ))}
              </Select>
            ) : (
              <Button
                size="sm"
                icon={FolderPlus}
                onClick={() =>
                  void call("workspaces.add", {})
                    .then((added) => added && setFolder(added.path))
                    .catch((e) => setError(errorMessage(e)))
                }
              >
                Add a folder…
              </Button>
            )}
          </span>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="primary"
            busy={busy === "import"}
            disabled={!summary || picked.size === 0 || !folder}
            onClick={() => void importNow()}
            data-testid="claude-import-apply"
          >
            {picked.size ? `Import ${picked.size} project${picked.size === 1 ? "" : "s"}` : "Import"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ol className="space-y-1.5">
          {STEPS.map((step, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list.
            <li key={i} className="flex gap-2.5 text-sm">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-2xs font-semibold text-accent">
                {i + 1}
              </span>
              <span className="min-w-0 text-fg">{step}</span>
            </li>
          ))}
        </ol>
        <div className="flex items-center gap-3">
          <Button size="sm" icon={ExternalLink} onClick={() => void call("claudeImport.openSettings")}>
            Open claude.ai settings
          </Button>
          <span className="text-xs text-hint">Opens in your browser. Jig never signs in to claude.ai.</span>
        </div>
        {/* One fixed-size space: the drop zone, then the projects found in the zip. */}
        <div
          className={cn(
            "relative h-56 overflow-hidden rounded-lg border",
            summary ? "border-line" : "border-dashed",
            dragging ? "border-accent bg-accent-soft" : summary ? "bg-surface" : "border-line-strong",
          )}
          data-testid="claude-import-zone"
          onDragOver={(e) => {
            if ([...e.dataTransfer.items].some((i) => i.kind === "file")) {
              e.preventDefault();
              setDragging(true);
            }
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (!file) return;
            e.preventDefault();
            void open(window.jig.pathForFile(file));
          }}
        >
          {busy === "read" ? (
            <Spinner center />
          ) : summary ? (
            <div className="flex h-full flex-col">
              <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line px-3 text-xs text-muted">
                <FileArchive className="size-3.5" />
                <span className="min-w-0 flex-1 truncate">
                  {summary.file}: {summary.projects.length} project{summary.projects.length === 1 ? "" : "s"}
                </span>
                <button type="button" className="text-accent hover:underline" onClick={() => void open()}>
                  Another file…
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-1">
                {summary.projects.length === 0 ? (
                  <p className="p-3 text-sm text-muted">This export has no projects of yours.</p>
                ) : (
                  summary.projects.map((p) => (
                    // biome-ignore lint/a11y/noLabelWithoutControl: the checkbox is inside.
                    <label
                      key={p.uuid}
                      className="flex h-10 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-hover"
                      data-testid="claude-import-project"
                    >
                      <input
                        type="checkbox"
                        className="accent-accent"
                        checked={picked.has(p.uuid)}
                        onChange={() => toggle(p.uuid)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{p.name}</span>
                        <span className="block truncate text-xs text-hint">
                          {p.instructions ? "Instructions" : "No instructions"} · {p.docs.length} document
                          {p.docs.length === 1 ? "" : "s"}
                        </span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          ) : (
            <Empty
              icon={FileArchive}
              title="Drop the zip here"
              className="h-full"
              actions={
                <Button size="sm" onClick={() => void open()} data-testid="claude-import-browse">
                  Browse…
                </Button>
              }
            />
          )}
        </div>
        <div className="flex gap-2 text-xs text-muted">
          <Info className="mt-px size-3.5 shrink-0" />
          <p>
            Don't see Export data? On Team and Enterprise plans your organisation's owner exports it. The zip
            holds all your conversations too; Jig reads only the projects (name, instructions, knowledge) and
            keeps nothing else.
          </p>
        </div>
        <p
          role={error ? "alert" : "status"}
          className={cn("h-4 text-xs", error ? "text-danger" : "text-hint")}
        >
          {error}
        </p>
      </div>
    </Dialog>
  );
}

export function ClaudeImportDialogHost() {
  const open = useDialog((s) => s.open);
  return open ? <Body /> : null;
}
