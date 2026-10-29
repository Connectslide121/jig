import { guessDelimiter, parseDelimited } from "@jig/documents";
import { ChevronRight } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import type { FilePreview } from "../../../shared/preview";
import { extensionOf } from "../../../shared/preview";
import { Button, CodeBlock, cn, Markdown, Mermaid, SearchInput } from "../../ui";
import { parseJsonLoose } from "./paths";

/** Rows shown in a table before "show more" (the DOM stays fast). */
const PAGE_ROWS = 1000;

export function TableView({ rows, header = true }: { rows: string[][]; header?: boolean }) {
  const [filter, setFilter] = useState("");
  const [shown, setShown] = useState(PAGE_ROWS);
  const columns = Math.max(0, ...rows.map((r) => r.length));
  const head = header ? rows[0] : undefined;
  const body = header ? rows.slice(1) : rows;
  const needle = filter.trim().toLowerCase();
  const matching = needle ? body.filter((r) => r.some((c) => c.toLowerCase().includes(needle))) : body;
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="preview-table">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3 text-xs text-muted">
        <SearchInput
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onClear={() => setFilter("")}
          placeholder="Filter rows"
          boxClassName="h-6 max-w-64"
          aria-label="Filter rows"
        />
        <span>
          {needle ? `${matching.length} of ${body.length}` : body.length} rows · {columns} columns
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="border-collapse font-mono text-xs">
          {head && (
            <thead className="sticky top-0 bg-surface">
              <tr>
                <th className="border border-line px-2 py-1 text-right text-hint">#</th>
                {Array.from({ length: columns }, (_, i) => (
                  <th key={i} className="border border-line px-2 py-1 text-left font-semibold text-fg">
                    {head[i] ?? ""}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {matching.slice(0, shown).map((row, r) => (
              <tr key={r} className="hover:bg-hover">
                <td className="border border-line px-2 py-0.5 text-right text-hint">{r + 1}</td>
                {Array.from({ length: columns }, (_, i) => (
                  <td
                    key={i}
                    className="max-w-96 truncate border border-line px-2 py-0.5 text-fg"
                    title={row[i]}
                  >
                    {row[i] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {matching.length > shown && (
          <div className="p-3">
            <Button size="sm" onClick={() => setShown((n) => n + PAGE_ROWS)}>
              Show {Math.min(PAGE_ROWS, matching.length - shown)} more rows
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function CsvView({ preview }: { preview: FilePreview }) {
  const parsed = useMemo(() => {
    const text = preview.text ?? "";
    const delimiter = extensionOf(preview.path) === "tsv" ? "\t" : guessDelimiter(text);
    return parseDelimited(text, delimiter);
  }, [preview.text, preview.path]);
  return <TableView rows={parsed.rows} />;
}

export function SheetsView({ preview }: { preview: FilePreview }) {
  const sheets = preview.sheets ?? [];
  const [index, setIndex] = useState(0);
  const sheet = sheets[Math.min(index, sheets.length - 1)];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">{sheet ? <TableView rows={sheet.rows} header={false} /> : null}</div>
      <div
        className="flex h-8 shrink-0 items-center gap-1 overflow-x-auto border-t border-line px-2"
        role="tablist"
      >
        {sheets.map((s, i) => (
          <button
            key={s.name}
            type="button"
            role="tab"
            aria-selected={i === index}
            onClick={() => setIndex(i)}
            className={cn(
              "h-6 shrink-0 rounded-sm px-2 text-xs",
              i === index ? "bg-active text-fg" : "text-muted hover:bg-hover hover:text-fg",
            )}
          >
            {s.name}
            {s.truncated ? " (first rows)" : ""}
          </button>
        ))}
      </div>
    </div>
  );
}

function JsonNode({ name, value, depth }: { name?: string; value: unknown; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const label = name !== undefined && <span className="text-accent">{name}: </span>;
  if (value === null || typeof value !== "object") {
    const tone =
      typeof value === "string" ? "text-success" : typeof value === "number" ? "text-info" : "text-warning";
    return (
      <div className="pl-4 whitespace-pre-wrap break-all">
        {label}
        <span className={tone}>{typeof value === "string" ? JSON.stringify(value) : String(value)}</span>
      </div>
    );
  }
  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value);
  const summary = Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`;
  return (
    <div>
      <button
        type="button"
        className="flex items-center gap-0.5 hover:text-fg"
        onClick={() => setOpen(!open)}
      >
        <ChevronRight className={cn("size-3 text-hint transition-transform", open && "rotate-90")} />
        {label}
        <span className="text-hint">{summary}</span>
      </button>
      {open && (
        <div className="ml-1.5 border-l border-line pl-1">
          {entries.slice(0, 2000).map(([k, v]) => (
            <JsonNode key={k} name={k} value={v} depth={depth + 1} />
          ))}
          {entries.length > 2000 && <div className="pl-4 text-hint">… {entries.length - 2000} more</div>}
        </div>
      )}
    </div>
  );
}

export function JsonView({ preview }: { preview: FilePreview }) {
  const parsed = useMemo(() => {
    try {
      return { value: parseJsonLoose(preview.text ?? "") };
    } catch (error) {
      return { error: (error as Error).message };
    }
  }, [preview.text]);
  if ("error" in parsed)
    return (
      <div className="flex flex-col gap-2 p-4">
        <div className="text-xs text-danger">Not valid JSON: {parsed.error}</div>
        <CodeBlock code={preview.text ?? ""} lang="json" />
      </div>
    );
  return (
    <div className="selectable p-4 font-mono text-xs text-muted" data-testid="preview-json">
      <JsonNode value={parsed.value} depth={0} />
    </div>
  );
}

interface NotebookCell {
  cell_type: string;
  source: string | string[];
  outputs?: Array<{
    output_type: string;
    text?: string | string[];
    data?: Record<string, string | string[]>;
    ename?: string;
    evalue?: string;
  }>;
}
const joined = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join("") : (v ?? ""));

/** A Jupyter notebook: Markdown cells, code cells and their outputs (text, images, errors). */
export function NotebookView({ preview }: { preview: FilePreview }) {
  const notebook = useMemo(() => {
    try {
      return JSON.parse(preview.text ?? "") as {
        cells?: NotebookCell[];
        metadata?: { language_info?: { name?: string } };
      };
    } catch {
      return undefined;
    }
  }, [preview.text]);
  if (!notebook?.cells) return <TextView preview={preview} />;
  const lang = notebook.metadata?.language_info?.name ?? "python";
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-3 p-6" data-testid="preview-notebook">
      {notebook.cells.map((cell, i) =>
        cell.cell_type === "markdown" ? (
          <Markdown key={i} text={joined(cell.source)} baseUrl={preview.baseUrl} />
        ) : (
          <div key={i} className="flex flex-col gap-1">
            <CodeBlock code={joined(cell.source)} lang={cell.cell_type === "code" ? lang : undefined} />
            {cell.outputs?.map((out, j) => {
              const png = out.data?.["image/png"];
              const svg = out.data?.["image/svg+xml"];
              const text = joined(out.text ?? out.data?.["text/plain"]);
              return (
                <div key={j} className="pl-3">
                  {png ? (
                    <img src={`data:image/png;base64,${joined(png).trim()}`} alt="" className="max-w-full" />
                  ) : svg ? (
                    <img
                      src={`data:image/svg+xml;utf8,${encodeURIComponent(joined(svg))}`}
                      alt=""
                      className="max-w-full"
                    />
                  ) : out.output_type === "error" ? (
                    <pre className="text-xs whitespace-pre-wrap text-danger">
                      {out.ename}: {out.evalue}
                    </pre>
                  ) : text ? (
                    <pre className="selectable max-h-80 overflow-auto font-mono text-xs whitespace-pre-wrap text-muted">
                      {text}
                    </pre>
                  ) : null}
                </div>
              );
            })}
          </div>
        ),
      )}
    </div>
  );
}

/** Unified diff text with added and removed lines coloured. */
export function DiffLines({
  text,
  testId,
  className,
}: {
  text: string;
  testId?: string;
  className?: string;
}) {
  const lines = text.split("\n");
  return (
    <pre className={cn("selectable p-4 font-mono text-xs leading-5", className)} data-testid={testId}>
      {lines.map((line, i) => (
        <div
          key={i}
          className={cn(
            "px-2 whitespace-pre-wrap",
            line.startsWith("+") && !line.startsWith("+++") && "bg-success-soft text-fg",
            line.startsWith("-") && !line.startsWith("---") && "bg-danger-soft text-fg",
            line.startsWith("@@") && "text-info",
            (line.startsWith("diff ") || line.startsWith("+++") || line.startsWith("---")) &&
              "font-semibold text-fg",
          )}
        >
          {line || " "}
        </div>
      ))}
    </pre>
  );
}

/** A .diff/.patch file. */
export function DiffFileView({ preview }: { preview: FilePreview }) {
  return <DiffLines text={preview.text ?? ""} testId="preview-diff" />;
}

/** Highlighting gets slow on huge files: above this, plain text. */
const HIGHLIGHT_LIMIT = 300_000;

export function TextView({ preview }: { preview: FilePreview }) {
  const text = preview.text ?? "";
  if (text.length > HIGHLIGHT_LIMIT)
    return <pre className="selectable p-4 font-mono text-xs whitespace-pre text-fg">{text}</pre>;
  return (
    <div className="p-4">
      <CodeBlock code={text} lang={extensionOf(preview.path) || undefined} />
    </div>
  );
}

/** Word and PowerPoint: the text Jig extracts, on a page. */
export function DocumentView({ preview }: { preview: FilePreview }) {
  const slides = preview.kind === "slides";
  return (
    <div className="mx-auto max-w-3xl p-6">
      <div
        className="selectable rounded-lg border border-line bg-raised p-8 text-sm leading-relaxed whitespace-pre-wrap text-fg shadow-card"
        data-testid="preview-document"
      >
        {slides ? <Markdown text={preview.document ?? ""} /> : preview.document || "(no text)"}
      </div>
      <div className="mt-2 text-center text-2xs text-hint">
        Text only: layout, images and formatting are not shown. Open the file for the full document.
      </div>
    </div>
  );
}

export function MediaView({ preview }: { preview: FilePreview }) {
  if (preview.kind === "audio")
    return (
      <div className="flex h-full items-center justify-center p-8">
        {/* biome-ignore lint/a11y/useMediaCaption: a local file has no captions to offer. */}
        <audio controls src={preview.url} data-testid="preview-audio" />
      </div>
    );
  return (
    <div className="flex h-full items-center justify-center bg-canvas p-4">
      {/* biome-ignore lint/a11y/useMediaCaption: a local file has no captions to offer. */}
      <video controls src={preview.url} className="max-h-full max-w-full" data-testid="preview-video" />
    </div>
  );
}

export function ImageFileView({ preview }: { preview: FilePreview }) {
  const [actual, setActual] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setActual(!actual)}
      title={actual ? "Fit to window" : "Actual size"}
      className={cn(
        "flex h-full w-full bg-canvas p-4",
        actual
          ? "cursor-zoom-out items-start justify-start overflow-auto"
          : "cursor-zoom-in items-center justify-center",
      )}
    >
      <img
        src={preview.url}
        alt={preview.name}
        className={actual ? "max-w-none" : "max-h-full max-w-full object-contain"}
        data-testid="preview-image"
      />
    </button>
  );
}

export function HtmlView({ preview, scripts }: { preview: FilePreview; scripts: boolean }) {
  return (
    <iframe
      key={`${preview.mtimeMs}-${scripts}`}
      title={preview.name}
      src={preview.url}
      // Never same-origin: a page can't reach Jig. Scripts only when you turn them on.
      sandbox={scripts ? "allow-scripts allow-popups allow-forms" : ""}
      className="h-full w-full border-0"
      data-testid="preview-html"
    />
  );
}

export function PdfView({ preview }: { preview: FilePreview }) {
  return (
    <iframe
      key={preview.mtimeMs}
      title={preview.name}
      src={preview.url}
      className="h-full w-full border-0"
      data-testid="preview-pdf"
    />
  );
}

export function MermaidFileView({ preview }: { preview: FilePreview }) {
  return (
    <div className="p-6">
      <Mermaid code={preview.text ?? ""} />
    </div>
  );
}

export function Frame({ children }: { children: ReactNode }) {
  return <div className="h-full min-h-0 overflow-auto">{children}</div>;
}
