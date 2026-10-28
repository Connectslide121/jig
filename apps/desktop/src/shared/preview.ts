/** File previews (the Preview tab): which viewer a file gets, and what the host sends for it. */
export type PreviewKind =
  | "markdown"
  | "html"
  | "pdf"
  | "csv"
  | "json"
  | "notebook"
  | "svg"
  | "image"
  | "audio"
  | "video"
  | "word"
  | "spreadsheet"
  | "slides"
  | "mermaid"
  | "diff"
  | "text";

const BY_EXTENSION: Record<string, PreviewKind> = {
  md: "markdown",
  markdown: "markdown",
  mdx: "markdown",
  html: "html",
  htm: "html",
  pdf: "pdf",
  csv: "csv",
  tsv: "csv",
  json: "json",
  jsonc: "json",
  geojson: "json",
  webmanifest: "json",
  ipynb: "notebook",
  svg: "svg",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  bmp: "image",
  ico: "image",
  avif: "image",
  mp3: "audio",
  wav: "audio",
  ogg: "audio",
  m4a: "audio",
  flac: "audio",
  mp4: "video",
  webm: "video",
  mov: "video",
  m4v: "video",
  docx: "word",
  xlsx: "spreadsheet",
  pptx: "slides",
  mmd: "mermaid",
  mermaid: "mermaid",
  diff: "diff",
  patch: "diff",
};

export function extensionOf(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** The viewer for a file name; anything else is shown as text if it is text. */
export function previewKind(path: string): PreviewKind {
  return BY_EXTENSION[extensionOf(path)] ?? "text";
}

/** Kinds shown as a rendered view with a Source toggle. */
export const HAS_SOURCE: ReadonlySet<PreviewKind> = new Set([
  "markdown",
  "html",
  "json",
  "notebook",
  "svg",
  "mermaid",
  "csv",
  "diff",
]);

export interface FilePreview {
  path: string;
  name: string;
  kind: PreviewKind;
  size: number;
  mtimeMs: number;
  /** `jig-file://…` address of the file (PDF, media, HTML pages and the images next to a document). */
  url: string;
  /** Base address of the folder the preview may load from (relative links in Markdown and HTML). */
  baseUrl: string;
  /** Text formats: the content (cut at `MAX_PREVIEW_TEXT`). */
  text?: string;
  truncated?: boolean;
  /** Word and PowerPoint: the extracted text. */
  document?: string;
  /** Excel: the sheets. */
  sheets?: Array<{ name: string; rows: string[][]; truncated: boolean }>;
  /** A file that isn't text and has no viewer. */
  binary?: boolean;
}

/** Most text a preview shows (2 MB). */
export const MAX_PREVIEW_TEXT = 2_000_000;
