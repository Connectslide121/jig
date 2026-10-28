import { strFromU8, unzipSync } from "fflate";

/**
 * Text from Office Open XML files (.docx, .xlsx, .pptx are zip files of XML). Enough structure for
 * Claude to understand them: headings, lists and tables in Word; one CSV block per Excel sheet; one
 * section per slide with its notes in PowerPoint.
 */

function decode(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

function unzip(bytes: Uint8Array, wanted: (name: string) => boolean): Record<string, string> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => wanted(f.name) });
  } catch {
    throw new Error("This isn't a valid Office file (it may be password-protected or damaged)");
  }
  return Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strFromU8(v)]));
}

const attr = (tag: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];

/** Relationship id → target, from a `_rels/*.rels` file. */
function rels(xml: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of (xml ?? "").matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id");
    const target = attr(m[0], "Target");
    if (id && target) out[id] = target;
  }
  return out;
}

/** Resolves a relationship target against the folder of the part that refers to it. */
function resolvePart(base: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

// ------------------------------------------------------------------------------------------------ Word

function wordParagraph(p: string): string {
  let text = "";
  for (const m of p.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>|<w:cr\/>/g)) {
    if (m[1] !== undefined) text += decode(m[1]);
    else text += m[0] === "<w:tab/>" ? "\t" : "\n";
  }
  const style = /<w:pStyle w:val="([^"]+)"/.exec(p)?.[1] ?? "";
  const heading =
    /^(?:Heading|Rubrik|berschrift|Titre)\s*(\d)$/i.exec(style)?.[1] ??
    (/^Title$/i.test(style) ? "1" : undefined);
  if (heading && text.trim()) return `${"#".repeat(Number(heading))} ${text.trim()}`;
  if ((/<w:numPr>/.test(p) || /^List/i.test(style)) && text.trim()) return `- ${text.trim()}`;
  return text;
}

export function docxToText(bytes: Uint8Array): string {
  const files = unzip(bytes, (n) => n === "word/document.xml");
  const xml = files["word/document.xml"];
  if (!xml) throw new Error("This .docx has no document");
  const body = /<w:body>([\s\S]*)<\/w:body>/.exec(xml)?.[1] ?? xml;
  const out: string[] = [];
  // Tables become rows of "cell | cell"; everything else paragraph by paragraph.
  for (const m of body.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g)) {
    const block = m[0];
    if (block.startsWith("<w:tbl>")) {
      const rows = [...block.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((r) =>
        [...r[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)]
          .map((c) =>
            [...c[0].matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((p) => wordParagraph(p[0]).trim()).join(" "),
          )
          .join(" | "),
      );
      out.push(rows.map((r) => `| ${r} |`).join("\n"));
    } else out.push(wordParagraph(block));
  }
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ----------------------------------------------------------------------------------------------- Excel

/** "BC12" → 54 (0-based column of a cell reference). */
export function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0]?.toUpperCase() ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** The sheets of an .xlsx: name and rows of cell texts (formulas without a cached value as `=…`). */
export function xlsxToSheets(
  bytes: Uint8Array,
  maxRowsPerSheet = 5000,
): Array<{ name: string; rows: string[][]; truncated: boolean }> {
  const files = unzip(bytes, (n) => (n.startsWith("xl/") && n.endsWith(".xml")) || n.endsWith(".rels"));
  const workbook = files["xl/workbook.xml"];
  if (!workbook) throw new Error("This .xlsx has no workbook");
  const shared = [...(files["xl/sharedStrings.xml"] ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1]!.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decode(t[1]!)).join(""),
  );
  const links = rels(files["xl/_rels/workbook.xml.rels"]);
  const sheets: Array<{ name: string; rows: string[][]; truncated: boolean }> = [];
  for (const sheet of workbook.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const name = decode(attr(sheet[0], "name") ?? "Sheet");
    const rid = attr(sheet[0], "r:id");
    const path = rid && links[rid] ? resolvePart("xl/workbook.xml", links[rid]!) : undefined;
    const xml = path ? files[path] : undefined;
    if (!xml) continue;
    const rows: string[][] = [];
    let truncated = false;
    for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g)) {
      if (rows.length >= maxRowsPerSheet) {
        truncated = true;
        break;
      }
      const cells: string[] = [];
      for (const c of (row[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1] ?? "";
        const inner = c[2] ?? "";
        const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
        const ref = /\br="([^"]+)"/.exec(attrs)?.[1];
        const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        let value =
          type === "s"
            ? (shared[Number(raw)] ?? "")
            : type === "inlineStr"
              ? [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decode(t[1]!)).join("")
              : type === "b"
                ? raw === "1"
                  ? "TRUE"
                  : "FALSE"
                : decode(raw ?? "");
        if (!value && /<f>/.test(inner)) value = `=${decode(/<f>([\s\S]*?)<\/f>/.exec(inner)?.[1] ?? "")}`;
        const index = ref ? columnIndex(ref) : cells.length;
        while (cells.length < index) cells.push("");
        cells[index] = value;
      }
      if (cells.some((c) => c !== "")) rows.push(cells);
    }
    sheets.push({ name, rows, truncated });
  }
  return sheets;
}

export function xlsxToText(bytes: Uint8Array, maxRowsPerSheet = 5000): string {
  return xlsxToSheets(bytes, maxRowsPerSheet)
    .map((sheet) => {
      const rows = sheet.rows.map((cells) => cells.map(csvCell).join(","));
      if (sheet.truncated) rows.push("[… more rows cut by Jig]");
      return `## Sheet: ${sheet.name}\n${rows.join("\n") || "(empty)"}`;
    })
    .join("\n\n")
    .trim();
}

// ------------------------------------------------------------------------------------------ PowerPoint

function slideText(xml: string): string {
  return [...xml.matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)]
    .map((p) =>
      [...p[0].matchAll(/<a:t>([\s\S]*?)<\/a:t>|<a:br\/>/g)]
        .map((t) => (t[1] !== undefined ? decode(t[1]) : "\n"))
        .join(""),
    )
    .filter((line) => line.trim())
    .join("\n");
}

export function pptxToText(bytes: Uint8Array): string {
  const files = unzip(bytes, (n) => n.startsWith("ppt/") && (n.endsWith(".xml") || n.endsWith(".rels")));
  const presentation = files["ppt/presentation.xml"];
  if (!presentation) throw new Error("This .pptx has no presentation");
  const links = rels(files["ppt/_rels/presentation.xml.rels"]);
  const out: string[] = [];
  let n = 0;
  for (const id of presentation.matchAll(/<p:sldId\b[^>]*\/>/g)) {
    const rid = attr(id[0], "r:id");
    const path = rid && links[rid] ? resolvePart("ppt/presentation.xml", links[rid]!) : undefined;
    const xml = path ? files[path] : undefined;
    if (!path || !xml) continue;
    n++;
    let section = `## Slide ${n}\n${slideText(xml) || "(no text)"}`;
    const slideRels = rels(files[path.replace(/([^/]+)$/, "_rels/$1.rels")]);
    const notesTarget = Object.values(slideRels).find((t) => t.includes("notesSlide"));
    const notes = notesTarget ? files[resolvePart(path, notesTarget)] : undefined;
    const notesText = notes ? slideText(notes).replace(/^\d+$/m, "").trim() : "";
    if (notesText) section += `\n\nNotes: ${notesText}`;
    out.push(section);
  }
  return out.join("\n\n").trim();
}

/** Text of an Office file by extension. */
export function officeToText(ext: string, bytes: Uint8Array): string {
  if (ext === "docx") return docxToText(bytes);
  if (ext === "xlsx" || ext === "xlsm") return xlsxToText(bytes);
  if (ext === "pptx") return pptxToText(bytes);
  throw new Error(`.${ext} isn't an Office file Jig can read`);
}
