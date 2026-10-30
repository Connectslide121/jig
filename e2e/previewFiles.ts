import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { zipSync } from "fflate";

/** A tiny valid one-page PDF. */
function pdf(): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    "<< /Length 44 >>\nstream\nBT /F1 24 Tf 40 70 Td (Hello PDF) Tj ET\nendstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
}

export async function previewFolder(dir: string) {
  await mkdir(join(dir, "docs", "img"), { recursive: true });
  await writeFile(
    join(dir, "docs", "README.md"),
    "# Shop\n\nSee the [setup guide](setup.md).\n\n| Step | Who |\n|---|---|\n| Build | CI |\n\n```mermaid\nflowchart LR\n  Cart --> Checkout --> Paid\n```\n",
  );
  await writeFile(join(dir, "docs", "setup.md"), "# Setup\n\nRun `npm install`.\n");
  await writeFile(join(dir, "orders.csv"), 'id,customer,total\n1,"Ann, Ltd",12.50\n2,Bo,7\n3,Cy,99\n');
  await writeFile(
    join(dir, "config.json"),
    '{ "name": "shop", "features": { "discounts": true }, "ports": [3000, 3001] }',
  );
  await writeFile(
    join(dir, "page.html"),
    "<!doctype html><h1 id=t>Static page</h1><script>document.getElementById('t').textContent='Scripted page'</script>",
  );
  await writeFile(
    join(dir, "sidebar.component.html"),
    '@if (open()) {\n  <nav>{{ "menu" | translate }}</nav>\n}\n',
  );
  await writeFile(join(dir, "manual.pdf"), pdf());
  await writeFile(
    join(dir, "analysis.ipynb"),
    JSON.stringify({
      cells: [
        { cell_type: "markdown", source: ["## Sales"] },
        {
          cell_type: "code",
          source: ["sum([1, 2])"],
          outputs: [{ output_type: "execute_result", data: { "text/plain": ["3"] } }],
        },
      ],
      metadata: { language_info: { name: "python" } },
    }),
  );
  const enc = (s: string) => new TextEncoder().encode(s);
  await writeFile(
    join(dir, "budget.xlsx"),
    zipSync({
      "xl/workbook.xml": enc('<workbook><sheets><sheet name="Q1" r:id="rId1"/></sheets></workbook>'),
      "xl/_rels/workbook.xml.rels": enc(
        '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      ),
      "xl/worksheets/sheet1.xml": enc(
        '<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>Item</t></is></c><c r="B1" t="inlineStr"><is><t>Cost</t></is></c></row><row><c r="A2" t="inlineStr"><is><t>Servers</t></is></c><c r="B2"><v>1200</v></c></row></sheetData></worksheet>',
      ),
    }),
  );
  await writeFile(
    join(dir, "flow.mmd"),
    "sequenceDiagram\n  Jig->>Claude: prompt\n  Claude-->>Jig: answer\n",
  );
  await writeFile(
    join(dir, "fix.patch"),
    "--- a/cart.ts\n+++ b/cart.ts\n@@ -1 +1 @@\n-const total = 1;\n+const total = 2;\n",
  );
  await writeFile(
    join(dir, "cart.ts"),
    "export const total = (items: number[]) => items.reduce((a, b) => a + b, 0);\n",
  );
}
