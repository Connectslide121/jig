import { BookOpen, Download, FilePlus2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { create } from "zustand";
import type { KnowledgeDoc } from "../../../shared/knowledge";
import type { ProjectInfo } from "../../../shared/projects";
import { call, errorMessage, useHostEvent } from "../../lib/host";
import { Badge, Button, cn, Dialog, FileIcon, IconButton, Spinner } from "../../ui";
import { notify } from "../../workbench/toasts";
import { openClaudeImportDialog } from "./ClaudeImportDialog";

const sizeLabel = (chars: number) =>
  chars < 1000 ? `${chars} characters` : `${Math.round(chars / 1000)}k characters`;

const useReader = create<{ open?: { projectId: string; doc: KnowledgeDoc } }>(() => ({}));

/** A knowledge document's text, in a modal (read-only). */
export function KnowledgeReaderHost() {
  const open = useReader((s) => s.open);
  const [text, setText] = useState<string>();
  useEffect(() => {
    setText(undefined);
    if (open)
      void call("knowledge.read", { projectId: open.projectId, id: open.doc.id })
        .then((r) => setText(r.text))
        .catch((e) => setText(`Couldn't read it: ${errorMessage(e)}`));
  }, [open]);
  if (!open) return null;
  return (
    <Dialog open title={open.doc.name} width="xl" onClose={() => useReader.setState({ open: undefined })}>
      <div className="relative h-96 overflow-y-auto rounded-md border border-line bg-canvas">
        {text === undefined ? (
          <Spinner center />
        ) : (
          <pre className="selectable p-3 font-mono text-xs whitespace-pre-wrap text-fg">{text}</pre>
        )}
      </div>
    </Dialog>
  );
}

/**
 * The project's knowledge on its Home (D-256): documents every chat in the project can read. Add
 * files (or drop them here), import claude.ai projects, open one to read it, remove one.
 */
export function KnowledgeCard({ project }: { project: ProjectInfo }) {
  const [docs, setDocs] = useState<KnowledgeDoc[]>();
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      void call("knowledge.list", { projectId: project.id })
        .then(setDocs)
        .catch(() => setDocs([])),
    [project.id],
  );
  useEffect(() => load(), [load]);
  useHostEvent("knowledge.changed", ({ projectId }) => {
    if (projectId === project.id) load();
  });
  const add = async (paths?: string[]) => {
    setBusy(true);
    try {
      const { skipped } = await call("knowledge.addFiles", {
        projectId: project.id,
        ...(paths ? { paths } : {}),
      });
      if (skipped.length)
        notify({ title: "Some files weren't added", message: skipped.join("\n"), tone: "warning" });
    } catch (e) {
      notify({ title: "Couldn't add the files", message: errorMessage(e), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="flex flex-col gap-2"
      data-testid="home-knowledge"
      onDragOver={(e) => {
        if ([...e.dataTransfer.items].some((i) => i.kind === "file")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        setDragging(false);
        const paths = [...e.dataTransfer.files].map((f) => window.jig.pathForFile(f)).filter(Boolean);
        if (!paths.length) return;
        e.preventDefault();
        void add(paths);
      }}
    >
      <div className="flex h-7 items-center gap-2">
        <h2 className="flex-1 text-xs font-semibold tracking-wide text-hint uppercase">Knowledge</h2>
        {busy && <Spinner size="sm" />}
        <Button size="sm" variant="ghost" icon={Download} onClick={openClaudeImportDialog}>
          Import from claude.ai…
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={FilePlus2}
          onClick={() => void add()}
          data-testid="knowledge-add"
        >
          Add files…
        </Button>
      </div>
      <div
        className={cn(
          "rounded-lg border bg-surface p-1",
          dragging ? "border-accent" : docs?.length ? "border-line" : "border-dashed border-line-strong",
        )}
      >
        {docs === undefined ? (
          <div className="relative h-16">
            <Spinner center />
          </div>
        ) : docs.length === 0 ? (
          <div className="flex h-16 items-center gap-3 px-3">
            <BookOpen className="size-5 shrink-0 text-hint" />
            <div className="min-w-0 flex-1 text-xs text-muted">
              Documents Claude reads in this project's chats: specs, style guides, notes (text, PDF, Word, Excel, PowerPoint). Drop files here, add
              them, or{" "}
              <button type="button" className="text-accent hover:underline" onClick={openClaudeImportDialog}>
                bring your claude.ai projects
              </button>
              .
            </div>
          </div>
        ) : (
          docs.map((d) => (
            <div
              key={d.id}
              role="button"
              tabIndex={0}
              title={`Read ${d.name}`}
              data-testid="knowledge-doc"
              onClick={() => useReader.setState({ open: { projectId: project.id, doc: d } })}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
                e.preventDefault();
                useReader.setState({ open: { projectId: project.id, doc: d } });
              }}
              className="group flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent"
            >
              <FileIcon path={d.name} className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-sm">{d.name}</span>
              <span className="w-24 shrink-0 text-right text-2xs text-hint tabular-nums">
                {sizeLabel(d.chars)}
              </span>
              <span className="flex w-16 shrink-0 justify-end">
                {d.source === "claude.ai" && <Badge>claude.ai</Badge>}
              </span>
              <IconButton
                icon={X}
                size="sm"
                label={`Remove ${d.name} from the knowledge`}
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  void call("knowledge.remove", { projectId: project.id, id: d.id });
                }}
              />
            </div>
          ))
        )}
      </div>
    </section>
  );
}
