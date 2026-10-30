import { Code, Eye, FileX, FolderOpen, Play, Save, Sparkles, SquareArrowOutUpRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { lineEnding } from "../../../shared/indent";
import { unifiedDiff } from "../../../shared/lineDiff";
import { type FilePreview, HAS_SOURCE, isHtmlPage, type PreviewKind } from "../../../shared/preview";
import { call, errorMessage } from "../../lib/host";
import { Badge, Button, cn, Empty, FileIcon, IconButton, Markdown, Spinner } from "../../ui";
import { setTabDirty } from "../../workbench/dirty";
import { useProjects } from "../../workbench/projects";
import type { TabProps } from "../../workbench/registry";
import { formatShortcut } from "../../workbench/shortcuts";
import { notify } from "../../workbench/toasts";
import { newSession } from "../sessions/actions";
import { openPreview } from "./actions";
import { CodeEditor } from "./CodeEditor";
import { linkedPath } from "./paths";
import {
  CsvView,
  DiffFileView,
  DiffLines,
  DocumentView,
  Frame,
  HtmlView,
  ImageFileView,
  JsonView,
  MediaView,
  MermaidFileView,
  NotebookView,
  PdfView,
  SheetsView,
  TextView,
} from "./viewers";

const KIND_LABEL: Record<PreviewKind, string> = {
  markdown: "Markdown",
  html: "HTML",
  pdf: "PDF",
  csv: "Table",
  json: "JSON",
  notebook: "Notebook",
  svg: "SVG",
  image: "Image",
  audio: "Audio",
  video: "Video",
  word: "Word",
  spreadsheet: "Excel",
  slides: "PowerPoint",
  mermaid: "Diagram",
  diff: "Diff",
  text: "Text",
};

/** What "Ask Claude" asks about a file, by kind. */
function askDraft(p: FilePreview): string {
  switch (p.kind) {
    case "markdown":
    case "word":
    case "slides":
      return `Read ${p.path} and review it: what's unclear, wrong or missing? Suggest concrete improvements.`;
    case "csv":
    case "spreadsheet":
    case "json":
      return `Look at the data in ${p.path}: summarise what it contains and point out anything odd (gaps, outliers, inconsistent values).`;
    case "html":
      return `Look at ${p.path}: explain what this page does and point out problems (markup, accessibility, scripts).`;
    case "image":
    case "svg":
      return `Look at the image ${p.path} and describe what it shows.`;
    case "mermaid":
      return `Explain the diagram in ${p.path}, and suggest how to make it clearer.`;
    case "notebook":
      return `Read the notebook ${p.path}: summarise the analysis and its results, and point out mistakes.`;
    default:
      return `Read ${p.path} and explain what it does.`;
  }
}

const sizeText = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;

function Viewer({ preview, source, scripts }: { preview: FilePreview; source: boolean; scripts: boolean }) {
  const onLocalLink = useCallback(
    (url: string) => {
      const path = linkedPath(url, preview.path, preview.baseUrl);
      if (path) openPreview(path);
    },
    [preview.path, preview.baseUrl],
  );
  if (preview.binary)
    return (
      <Empty icon={FileX} title="No preview for this file">
        It isn't text, and Jig has no viewer for this type. Open it with its own program.
      </Empty>
    );
  if (source && HAS_SOURCE.has(preview.kind))
    return (
      <Frame>
        <TextView preview={preview} />
      </Frame>
    );
  switch (preview.kind) {
    case "markdown":
      return (
        <Frame>
          <div className="mx-auto max-w-3xl px-8 py-6" data-testid="preview-markdown">
            <Markdown
              allowHtml
              text={preview.text ?? ""}
              baseUrl={preview.baseUrl}
              onLocalLink={onLocalLink}
              className="jig-document"
            />
          </div>
        </Frame>
      );
    case "html":
      return <HtmlView preview={preview} scripts={scripts} />;
    case "pdf":
      return <PdfView preview={preview} />;
    case "csv":
      return <CsvView preview={preview} />;
    case "spreadsheet":
      return <SheetsView preview={preview} />;
    case "json":
      return (
        <Frame>
          <JsonView preview={preview} />
        </Frame>
      );
    case "notebook":
      return (
        <Frame>
          <NotebookView preview={preview} />
        </Frame>
      );
    case "svg":
    case "image":
      return <ImageFileView preview={preview} />;
    case "audio":
    case "video":
      return <MediaView preview={preview} />;
    case "word":
    case "slides":
      return (
        <Frame>
          <DocumentView preview={preview} />
        </Frame>
      );
    case "mermaid":
      return (
        <Frame>
          <MermaidFileView preview={preview} />
        </Frame>
      );
    case "diff":
      return (
        <Frame>
          <DiffFileView preview={preview} />
        </Frame>
      );
    default:
      return (
        <Frame>
          <TextView preview={preview} />
        </Frame>
      );
  }
}

/**
 * A file, shown the way it's meant to be read: rendered Markdown with diagrams, tables for CSV and
 * Excel, a JSON tree, notebooks, PDFs, media, pages… It follows the file while Claude edits it.
 */
export function PreviewTab({ params, active, tabId }: TabProps) {
  const path = String(params.path ?? "");
  const [preview, setPreview] = useState<FilePreview>();
  const [error, setError] = useState<string>();
  const [source, setSource] = useState(false);
  // A component template or fragment opens as source; a page as a preview (D-154). Decided once,
  // when the file first loads: switching by hand sticks.
  const decided = useRef(false);
  useEffect(() => {
    if (!preview || decided.current) return;
    decided.current = true;
    if (preview.kind === "html" && !isHtmlPage(preview.path, preview.text)) setSource(true);
  }, [preview]);
  const [scripts, setScripts] = useState(false);
  const projects = useProjects((s) => s.projects);
  // Your unsaved edits (undefined = none), and the file on disk when it changed under them.
  const [draft, setDraft] = useState<string>();
  const [theirs, setTheirs] = useState<FilePreview>();
  const [showDiff, setShowDiff] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirty = draft !== undefined && draft !== preview?.text?.replaceAll("\r\n", "\n");
  // The tab bar shows it, and closing the tab asks first.
  useEffect(() => {
    setTabDirty(tabId, dirty ? (path.split(/[\\/]/).pop() ?? path) : undefined);
  }, [tabId, dirty, path]);
  useEffect(() => () => setTabDirty(tabId, undefined), [tabId]);

  const load = useCallback(async () => {
    try {
      setPreview(await call("files.preview", { path }));
      setError(undefined);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [path]);
  useEffect(() => {
    void load();
  }, [load]);
  // Follow the file while the tab is visible: Claude (or you) may be editing it. With unsaved edits,
  // a change on disk doesn't replace them: the bar asks what to do.
  useEffect(() => {
    if (!active || !preview || theirs) return;
    const timer = setInterval(() => {
      void call("files.stat", { path })
        .then(async (s) => {
          if (!s) setError(`${path} was deleted or moved`);
          else if (s.mtimeMs !== preview.mtimeMs || s.size !== preview.size) {
            if (dirty) setTheirs(await call("files.preview", { path }));
            else void load();
          }
        })
        .catch(() => {});
    }, 1500);
    return () => clearInterval(timer);
  }, [active, preview, path, load, dirty, theirs]);

  /** Saves your edits; `over` is the disk version you chose to overwrite (Keep mine). */
  const save = async (over?: FilePreview) => {
    if (!preview || draft === undefined || saving) return;
    const crlf = (preview.text ?? "").includes("\r\n");
    const saved = draft;
    setSaving(true);
    try {
      await call("files.write", {
        path,
        text: crlf ? draft.replaceAll("\n", "\r\n") : draft,
        expectedMtimeMs: (over ?? preview).mtimeMs,
      });
      setTheirs(undefined);
      setShowDiff(false);
      await load();
      // Typing that went on while saving stays.
      setDraft((d) => (d === saved ? undefined : d));
    } catch (e) {
      if ((e as { code?: string }).code === "changed") setTheirs(await call("files.preview", { path }));
      else notify({ title: "Not saved", message: errorMessage(e), tone: "danger" });
    } finally {
      setSaving(false);
    }
  };
  const loadTheirs = () => {
    if (!theirs) return;
    setPreview(theirs);
    setDraft(undefined);
    setTheirs(undefined);
    setShowDiff(false);
  };

  const ask = () => {
    if (!preview) return;
    const norm = (p: string) => p.replaceAll("\\", "/").toLowerCase();
    const project = projects.find((p) => norm(preview.path).startsWith(`${norm(p.path)}/`));
    void newSession(project?.id, undefined, askDraft(preview));
  };

  if (error && !preview)
    return (
      <Empty icon={FileX} title="Can't preview this file">
        {error}
      </Empty>
    );
  if (!preview)
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  const folder = preview.path.slice(0, preview.path.length - preview.name.length).replace(/[\\/]$/, "");
  // Code and text files are always editable (D-101); kinds with a rendered form, in Source.
  const editable =
    preview.text !== undefined &&
    !preview.truncated &&
    !preview.binary &&
    (preview.kind === "text" || (source && HAS_SOURCE.has(preview.kind)));
  return (
    <div className="flex h-full flex-col" data-testid="preview" data-kind={preview.kind}>
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <FileIcon path={preview.name} className="size-4" />
        <span className="truncate text-sm font-medium text-fg">{preview.name}</span>
        <span className="min-w-0 truncate text-xs text-hint" title={preview.path}>
          {folder}
        </span>
        <Badge>{KIND_LABEL[preview.kind]}</Badge>
        <span className="shrink-0 text-2xs text-hint">
          {sizeText(preview.size)}
          {preview.truncated ? " · first 2 MB" : ""}
        </span>
        {error && <span className="truncate text-xs text-warning">{error}</span>}
        <div className="flex-1" />
        {editable && dirty && (
          <Button
            size="sm"
            variant="primary"
            icon={Save}
            disabled={saving}
            onClick={() => void save()}
            data-testid="preview-save"
            title={`Save (${formatShortcut("Mod+S")})`}
          >
            Save
          </Button>
        )}
        {HAS_SOURCE.has(preview.kind) && (
          <div className="flex rounded-md border border-line p-0.5" role="tablist">
            {[
              { on: false, label: "Preview", icon: Eye },
              { on: true, label: "Source", icon: Code },
            ].map((m) => (
              <button
                key={m.label}
                type="button"
                role="tab"
                aria-selected={source === m.on}
                data-testid={`preview-mode-${m.label.toLowerCase()}`}
                onClick={() => setSource(m.on)}
                className={cn(
                  "flex h-5 items-center gap-1 rounded-sm px-1.5 text-xs",
                  source === m.on ? "bg-active text-fg" : "text-muted hover:text-fg",
                )}
              >
                <m.icon className="size-3" /> {m.label}
              </button>
            ))}
          </div>
        )}
        {preview.kind === "html" && !source && (
          <Button
            size="sm"
            variant={scripts ? "secondary" : "ghost"}
            icon={Play}
            onClick={() => setScripts(!scripts)}
            title="Run the page's scripts (sandboxed: the page can't reach Jig or your files)"
          >
            {scripts ? "Scripts on" : "Run scripts"}
          </Button>
        )}
        <Button size="sm" variant="ghost" icon={Sparkles} onClick={ask} data-testid="preview-ask">
          Ask Claude
        </Button>
        <IconButton
          icon={SquareArrowOutUpRight}
          size="sm"
          label="Open with its program"
          onClick={() => void call("app.openPath", { path: preview.path })}
        />
        <IconButton
          icon={FolderOpen}
          size="sm"
          label="Show in folder"
          onClick={() => void call("app.showItemInFolder", { path: preview.path })}
        />
      </header>
      {theirs && (
        <div
          className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-warning-soft px-3 py-1.5 text-xs"
          data-testid="preview-conflict"
        >
          <span className="min-w-0 flex-1 text-fg">
            This file changed on disk (Claude, or another program) while you have unsaved edits.
          </span>
          <Button size="sm" onClick={() => void save(theirs)} data-testid="conflict-keep">
            Keep mine
          </Button>
          <Button size="sm" onClick={loadTheirs} data-testid="conflict-theirs">
            Load theirs
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowDiff(!showDiff)}
            data-testid="conflict-diff"
          >
            {showDiff ? "Hide diff" : "Show diff"}
          </Button>
        </div>
      )}
      {theirs && showDiff && (
        <div
          className="max-h-1/2 shrink-0 overflow-auto border-b border-line"
          data-testid="conflict-diff-view"
        >
          <div className="px-3 pt-2 text-2xs text-hint">Lines marked − are on disk; + are yours.</div>
          <DiffLines text={unifiedDiff(theirs.text ?? "", draft ?? "") || " (the same)"} className="p-3" />
        </div>
      )}
      <div className="min-h-0 flex-1">
        {editable ? (
          <CodeEditor
            path={preview.path}
            value={draft ?? (preview.text ?? "").replaceAll("\r\n", "\n")}
            onChange={(text) => setDraft(text)}
            onSave={() => void save()}
            eol={lineEnding(preview.text ?? "")}
          />
        ) : (
          <Viewer preview={preview} source={source} scripts={scripts} />
        )}
      </div>
    </div>
  );
}
