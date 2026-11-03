/**
 * A PDF's text, page by page (D-256): Mozilla's pdf.js through `unpdf`, in the main process. A
 * scanned PDF has no text layer; that is said instead of keeping an empty document.
 */
export async function pdfText(bytes: Uint8Array, name = "The PDF"): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  let pages: string[];
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    pages = (await extractText(pdf, { mergePages: false })).text;
  } catch {
    throw new Error(`${name} couldn't be read as a PDF (damaged or password-protected?)`);
  }
  if (!pages.some((p) => p.trim()))
    throw new Error(
      `${name} has no text to read (a scanned PDF?); save it with text recognition (OCR) first`,
    );
  return pages
    .map((page, i) => (pages.length > 1 ? `--- Page ${i + 1} ---\n${page.trim()}` : page.trim()))
    .join("\n\n");
}
