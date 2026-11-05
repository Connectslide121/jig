/**
 * Pasted or dropped files without content. Windows tools can put an empty entry on the clipboard
 * next to a screenshot, and files dragged from a browser, Outlook or a zip can arrive as 0-byte
 * placeholders. Those are skipped; only when nothing else came with them is the user told.
 */
export interface PastedFiles<F> {
  /** The files with content, to attach. */
  files: F[];
  /** What to tell the user when every entry was empty, else undefined. */
  notice?: { title: string; message: string };
}

export function withoutEmptyFiles<F extends { size: number; name: string }>(
  list: Iterable<F>,
): PastedFiles<F> {
  const all = [...list];
  const files = all.filter((file) => file.size > 0);
  if (files.length > 0 || all.length === 0) return { files };
  const names = all.map((file) => file.name).filter(Boolean);
  const what = names.length === 1 ? names[0]! : names.length > 1 ? `${names.length} files` : "the file";
  return {
    files,
    notice: {
      title: `Couldn't attach ${what}`,
      message: `${names.length > 1 ? "They" : "It"} came through empty. Save ${names.length > 1 ? "them" : "it"} to disk first, then attach ${names.length > 1 ? "them" : "it"} with the paperclip.`,
    },
  };
}
