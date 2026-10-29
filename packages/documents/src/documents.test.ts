import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  attachmentType,
  columnIndex,
  docxToText,
  limitText,
  pptxToText,
  wrapDocument,
  xlsxToText,
} from "./index";

const zip = (files: Record<string, string>) =>
  zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));

describe("attachmentType", () => {
  it("knows what Claude can take", () => {
    expect(attachmentType("Shot.PNG")).toEqual({ kind: "image", mime: "image/png" });
    expect(attachmentType("", "image/webp")).toEqual({ kind: "image", mime: "image/webp" });
    expect(attachmentType("spec.pdf").kind).toBe("pdf");
    expect(attachmentType(".env").kind).toBe("text");
    expect(attachmentType("repo/.gitignore").kind).toBe("text");
    expect(attachmentType("plan.docx").kind).toBe("office");
    expect(attachmentType("budget.xlsx").kind).toBe("office");
    expect(attachmentType("deck.pptx").kind).toBe("office");
    expect(attachmentType("notes.md").kind).toBe("text");
    expect(attachmentType("data.csv").kind).toBe("text");
    expect(attachmentType("x.weird", "text/plain").kind).toBe("text");
    const old = attachmentType("old.doc");
    expect(old.kind === "unsupported" && old.reason).toContain("Save it as .docx");
    expect(attachmentType("movie.mp4").kind).toBe("unsupported");
  });

  it("limits and wraps text", () => {
    expect(limitText("abc", 5)).toEqual({ text: "abc", truncated: false });
    expect(limitText("abcdef", 3).text).toMatch(/^abc\n\n\[… cut by Jig: the file has 6 characters\]$/);
    expect(wrapDocument('a"b.docx', "hi", "text extracted by Jig")).toBe(
      '<document name="a\'b.docx" note="text extracted by Jig">\nhi\n</document>',
    );
  });
});

describe("Office text", () => {
  it("reads Word: headings, lists, tabs, tables and entities", () => {
    const doc = zip({
      "word/document.xml": `<?xml version="1.0"?><w:document><w:body>
        <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Plan</w:t></w:r></w:p>
        <w:p><w:r><w:t xml:space="preserve">Ship &amp; </w:t></w:r><w:r><w:t>test</w:t><w:tab/><w:t>now</w:t></w:r></w:p>
        <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>first</w:t></w:r></w:p>
        <w:p><w:pPr><w:pStyle w:val="ListBullet"/></w:pPr><w:r><w:t>second</w:t></w:r></w:p>
        <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Name</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Qty</w:t></w:r></w:p></w:tc></w:tr>
        <w:tr><w:tc><w:p><w:r><w:t>Cart</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>2</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
        <w:p/><w:sectPr/></w:body></w:document>`,
    });
    expect(docxToText(doc)).toBe("# Plan\nShip & test\tnow\n- first\n- second\n| Name | Qty |\n| Cart | 2 |");
  });

  it("reads Excel: sheets by name, shared and inline strings, gaps, booleans, formulas, CSV quoting", () => {
    expect(columnIndex("A1")).toBe(0);
    expect(columnIndex("AB7")).toBe(27);
    const book = zip({
      "xl/workbook.xml": `<workbook><sheets><sheet name="Budget" sheetId="1" r:id="rId1"/><sheet name="Empty" sheetId="2" r:id="rId2"/></sheets></workbook>`,
      "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>`,
      "xl/sharedStrings.xml": `<sst><si><t>Item</t></si><si><r><t>Co</t></r><r><t>st, total</t></r></si></sst>`,
      "xl/worksheets/sheet1.xml": `<worksheet><sheetData>
        <row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>
        <row r="2"><c r="A2" t="inlineStr"><is><t>Rent</t></is></c><c r="B2" t="b"><v>1</v></c><c r="C2"><v>1200.5</v></c></row>
        <row r="3"><c r="C3"><f>SUM(C2:C2)</f></c></row></sheetData></worksheet>`,
      "xl/worksheets/sheet2.xml": `<worksheet><sheetData/></worksheet>`,
    });
    expect(xlsxToText(book)).toBe(
      '## Sheet: Budget\nItem,,"Cost, total"\nRent,TRUE,1200.5\n,,=SUM(C2:C2)\n\n## Sheet: Empty\n(empty)',
    );
  });

  it("reads PowerPoint: slides in order with their notes", () => {
    const deck = zip({
      "ppt/presentation.xml": `<p:presentation><p:sldIdLst><p:sldId id="257" r:id="rId3"/><p:sldId id="256" r:id="rId2"/></p:sldIdLst></p:presentation>`,
      "ppt/_rels/presentation.xml.rels": `<Relationships><Relationship Id="rId2" Target="slides/slide1.xml"/><Relationship Id="rId3" Target="slides/slide2.xml"/></Relationships>`,
      "ppt/slides/slide1.xml": `<p:sld><a:p><a:r><a:t>Thanks</a:t></a:r></a:p></p:sld>`,
      "ppt/slides/slide2.xml": `<p:sld><a:p><a:r><a:t>Q3 &lt;review&gt;</a:t></a:r></a:p><a:p><a:r><a:t>Revenue up</a:t></a:r></a:p></p:sld>`,
      "ppt/slides/_rels/slide2.xml.rels": `<Relationships><Relationship Id="rId1" Target="../notesSlides/notesSlide1.xml"/></Relationships>`,
      "ppt/notesSlides/notesSlide1.xml": `<p:notes><a:p><a:r><a:t>Mention churn</a:t></a:r></a:p><a:p><a:r><a:t>2</a:t></a:r></a:p></p:notes>`,
    });
    expect(pptxToText(deck)).toBe(
      "## Slide 1\nQ3 <review>\nRevenue up\n\nNotes: Mention churn\n\n## Slide 2\nThanks",
    );
  });

  it("explains damaged files", () => {
    expect(() => docxToText(new Uint8Array([1, 2, 3]))).toThrow(/valid Office file/);
  });
});
