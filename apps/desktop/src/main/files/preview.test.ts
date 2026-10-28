import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { previewFile, resolveFileUrl, serveFile } from "./preview";

async function project() {
  const root = await mkdtemp(join(tmpdir(), "jig-preview-"));
  await mkdir(join(root, "docs", "img"), { recursive: true });
  await writeFile(join(root, "docs", "README.md"), "# Hello\n![logo](img/logo.png)");
  await writeFile(join(root, "docs", "img", "logo.png"), Buffer.from([137, 80, 78, 71]));
  await writeFile(join(root, "data.csv"), "a,b\n1,2\n");
  await writeFile(join(root, "tool.bin"), Buffer.from([1, 0, 2, 0]));
  return root;
}

describe("file previews", () => {
  it("reads text kinds and grants the project folder", async () => {
    const root = await project();
    const md = await previewFile(join(root, "docs", "README.md"), [root]);
    expect(md).toMatchObject({ kind: "markdown", name: "README.md", text: "# Hello\n![logo](img/logo.png)" });
    expect(md.baseUrl).toMatch(/^jig-file:\/\/[0-9a-f]+\/docs\/$/);
    // A relative image resolves inside the grant.
    expect(resolveFileUrl(`${md.baseUrl}img/logo.png`)).toBe(join(root, "docs", "img", "logo.png"));
    expect((await previewFile(join(root, "data.csv"), [root])).kind).toBe("csv");
    expect(await previewFile(join(root, "tool.bin"), [root])).toMatchObject({ kind: "text", binary: true });
  });

  it("serves only files inside a grant, with ranges", async () => {
    const root = await project();
    const md = await previewFile(join(root, "docs", "README.md"), [root]);
    const token = new URL(md.url).hostname;
    expect(resolveFileUrl(`jig-file://${token}/..%2F..%2Fetc%2Fpasswd`)).toBeUndefined();
    expect(resolveFileUrl("jig-file://nope/README.md")).toBeUndefined();
    // `..` is collapsed by the URL parser, so the path stays inside the grant (and doesn't exist).
    expect((await serveFile(new Request(`jig-file://${token}/../../etc/passwd`))).status).toBe(404);
    expect((await serveFile(new Request("jig-file://nope/README.md"))).status).toBe(403);
    const part = await serveFile(new Request(md.url, { headers: { range: "bytes=2-6" } }));
    expect(part.status).toBe(206);
    expect(await part.text()).toBe("Hello");
  });

  it("extracts Office documents", async () => {
    const root = await project();
    const docx = zipSync({
      "word/document.xml": new TextEncoder().encode(
        "<w:document><w:body><w:p><w:r><w:t>Quarterly plan</w:t></w:r></w:p></w:body></w:document>",
      ),
    });
    await writeFile(join(root, "plan.docx"), docx);
    expect((await previewFile(join(root, "plan.docx"), [root])).document).toContain("Quarterly plan");
  });
});
