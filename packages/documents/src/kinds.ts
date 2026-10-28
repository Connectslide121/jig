export type AttachmentKind = "image" | "pdf" | "office" | "text";

const IMAGES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};
const OFFICE: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
/** Old binary Office formats: Jig can't read them; the user is asked to save as the newer format. */
const LEGACY: Record<string, string> = { doc: "docx", xls: "xlsx", ppt: "pptx" };
const TEXT = new Set(
  (
    "txt md markdown csv tsv json jsonc xml html htm css scss less yml yaml toml ini cfg conf log sql " +
    "ts tsx js jsx mjs cjs py cs fs vb java kt go rs rb php c h cpp hpp swift sh bash zsh ps1 psm1 bat cmd " +
    "csproj sln props targets bicep tf graphql gql vue svelte dart lua r rst tex env gitignore dockerfile " +
    "makefile razor cshtml svg"
  ).split(" "),
);

export const ATTACHMENT_LIMITS = {
  /** Claude's limits: 5 MB per image, 32 MB per request (so per PDF too). */
  imageBytes: 5 * 1024 * 1024,
  pdfBytes: 30 * 1024 * 1024,
  /** Office and text files read from disk. */
  fileBytes: 30 * 1024 * 1024,
  /** Text Jig sends for one Office or text file (about 100k tokens). */
  textChars: 400_000,
};

export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : base.toLowerCase();
}

export type AttachmentType = { kind: AttachmentKind; mime: string } | { kind: "unsupported"; reason: string };

/** How a file can be attached, by name (and the browser's type for pasted files without a name). */
export function attachmentType(name: string, mime = ""): AttachmentType {
  const ext = extensionOf(name);
  if (IMAGES[ext] || Object.values(IMAGES).includes(mime))
    return { kind: "image", mime: IMAGES[ext] ?? mime };
  if (ext === "pdf" || mime === "application/pdf") return { kind: "pdf", mime: "application/pdf" };
  if (OFFICE[ext]) return { kind: "office", mime: OFFICE[ext]! };
  if (LEGACY[ext])
    return {
      kind: "unsupported",
      reason: `Old .${ext} files can't be read. Save it as .${LEGACY[ext]} (File → Save As) and attach that.`,
    };
  if (TEXT.has(ext) || mime.startsWith("text/"))
    return { kind: "text", mime: mime.startsWith("text/") ? mime : "text/plain" };
  return {
    kind: "unsupported",
    reason:
      "Claude can take images, PDFs, Word, Excel and PowerPoint files (.docx, .xlsx, .pptx) and text files.",
  };
}

/** Text from a file, cut to the limit with a note. */
export function limitText(
  text: string,
  max = ATTACHMENT_LIMITS.textChars,
): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return {
    text: `${text.slice(0, max)}\n\n[… cut by Jig: the file has ${text.length.toLocaleString("en")} characters]`,
    truncated: true,
  };
}

/** How an attached file's text is put in front of Claude. */
export function wrapDocument(name: string, text: string, note?: string): string {
  const safe = name.replace(/"/g, "'");
  return `<document name="${safe}"${note ? ` note="${note.replace(/"/g, "'")}"` : ""}>\n${text}\n</document>`;
}
