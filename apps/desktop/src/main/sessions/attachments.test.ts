import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  addAddonAttachment,
  addAttachment,
  copyAddonAttachments,
  readAttachments,
  removeAddonAttachments,
  removeAttachments,
} from "./attachments";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const docx = Buffer.from(
  zipSync({
    "word/document.xml": strToU8(
      "<w:document><w:body><w:p><w:r><w:t>Ship it</w:t></w:r></w:p></w:body></w:document>",
    ),
  }),
);

describe("chat attachments", () => {
  it("keeps images, PDFs, Office and text files, and turns them into what Claude takes", async () => {
    const root = await mkdtemp(join(tmpdir(), "jig-att-"));
    const att = join(root, "att");
    const image = await addAttachment(att, "s1", { data: png.toString("base64"), mime: "image/png" });
    expect(image).toMatchObject({ mime: "image/png", kind: "image", name: "pasted" });
    expect(image.path.startsWith(join(att, "s1"))).toBe(true);
    await writeFile(join(root, "spec.pdf"), "%PDF-1.4 fake");
    await writeFile(join(root, "plan.docx"), docx);
    await writeFile(join(root, "notes.md"), "# Notes");
    const pdf = await addAttachment(att, "s1", { path: join(root, "spec.pdf") });
    const word = await addAttachment(att, "s1", { path: join(root, "plan.docx") });
    const text = await addAttachment(att, "s1", {
      data: Buffer.from("a,b").toString("base64"),
      name: "data.csv",
      mime: "text/csv",
    });
    expect([pdf.kind, word.kind, text.kind]).toEqual(["pdf", "office", "text"]);
    expect(await readFile(word.path)).toEqual(docx);
    const parts = await readAttachments(att, "s1", [image, pdf, word, text]);
    expect(parts).toEqual([
      { type: "image", mime: "image/png", data: png.toString("base64") },
      { type: "pdf", name: "spec.pdf", data: Buffer.from("%PDF-1.4 fake").toString("base64") },
      {
        type: "text",
        name: "plan.docx",
        text: '<document name="plan.docx" note="text extracted by Jig">\nShip it\n</document>',
      },
      { type: "text", name: "data.csv", text: '<document name="data.csv">\na,b\n</document>' },
    ]);
    await removeAttachments(att, "s1");
    await expect(readAttachments(att, "s1", [image])).rejects.toThrow();
  });

  it("refuses other types, old Office files, damaged files, huge images and files from elsewhere", async () => {
    const root = await mkdtemp(join(tmpdir(), "jig-att-"));
    const att = join(root, "att");
    await expect(addAttachment(att, "s1", { data: "AAAA", name: "movie.mp4" })).rejects.toMatchObject({
      code: "not_supported",
    });
    await expect(addAttachment(att, "s1", { data: "AAAA", name: "old.doc" })).rejects.toThrow(
      /Save it as \.docx/,
    );
    await expect(addAttachment(att, "s1", { data: "AAAA", name: "broken.xlsx" })).rejects.toMatchObject({
      code: "unreadable",
    });
    const huge = Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64");
    await expect(addAttachment(att, "s1", { data: huge, mime: "image/png" })).rejects.toMatchObject({
      code: "too_large",
    });
    await expect(addAttachment(att, "s1", { path: join(root, "missing.pdf") })).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(addAttachment(att, "../x", { data: "AA==", mime: "image/png" })).rejects.toMatchObject({
      code: "invalid_args",
    });
    await writeFile(join(root, "elsewhere.png"), png);
    await expect(
      readAttachments(att, "s1", [{ path: join(root, "elsewhere.png"), mime: "image/png", kind: "image" }]),
    ).rejects.toMatchObject({ code: "invalid_args" });
  });

  it("keeps an add-on's files apart, copies them into a chat on send, and deletes only its own", async () => {
    const root = await mkdtemp(join(tmpdir(), "jig-att-"));
    const att = join(root, "att");
    const kept = await addAddonAttachment(att, "tasks", {
      data: png.toString("base64"),
      mime: "image/png",
      name: "shot.png",
    });
    expect(kept.path.startsWith(join(att, "addon-tasks"))).toBe(true);
    const [copy] = await copyAddonAttachments(att, "tasks", "s1", [kept]);
    expect(copy).toMatchObject({ name: "shot.png", kind: "image", mime: "image/png" });
    expect(copy!.path.startsWith(join(att, "s1"))).toBe(true);
    expect(await readAttachments(att, "s1", [copy!])).toEqual([
      { type: "image", mime: "image/png", data: png.toString("base64") },
    ]);
    // Another add-on's files, or a chat's, can't be sent or deleted as this one's.
    const other = await addAddonAttachment(att, "notes", { data: png.toString("base64"), mime: "image/png" });
    await expect(copyAddonAttachments(att, "tasks", "s1", [other])).rejects.toThrow(/isn't an attachment/);
    await expect(addAddonAttachment(att, "../x", { data: "eA==", name: "a.txt" })).rejects.toThrow(
      /add-on id/,
    );
    await removeAddonAttachments(att, "tasks", [kept.path, other.path, copy!.path]);
    await expect(readFile(kept.path)).rejects.toThrow();
    await expect(readFile(other.path)).resolves.toBeTruthy();
    await expect(readFile(copy!.path)).resolves.toBeTruthy();
    await expect(copyAddonAttachments(att, "tasks", "s1", [kept])).rejects.toThrow(/gone/);
  });
});
