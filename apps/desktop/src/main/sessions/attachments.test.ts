import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { addImage, readImages, removeAttachments } from "./attachments";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("chat image attachments", () => {
  it("saves pasted images and copies files into the session's folder, and reads them back", async () => {
    const root = await mkdtemp(join(tmpdir(), "jig-att-"));
    const pasted = await addImage(join(root, "att"), "s1", {
      data: png.toString("base64"),
      mime: "image/png",
    });
    expect(pasted.mime).toBe("image/png");
    expect(pasted.path.startsWith(join(root, "att", "s1"))).toBe(true);
    expect(await readFile(pasted.path)).toEqual(png);
    await writeFile(join(root, "shot.PNG"), png);
    const copied = await addImage(join(root, "att"), "s1", { path: join(root, "shot.PNG") });
    expect(copied.path).not.toBe(join(root, "shot.PNG"));
    const read = await readImages(join(root, "att"), "s1", [pasted, copied]);
    expect(read).toEqual([
      { mime: "image/png", data: png.toString("base64") },
      { mime: "image/png", data: png.toString("base64") },
    ]);
    await removeAttachments(join(root, "att"), "s1");
    await expect(readImages(join(root, "att"), "s1", [pasted])).rejects.toThrow();
  });

  it("refuses other types, huge images and files from elsewhere", async () => {
    const root = await mkdtemp(join(tmpdir(), "jig-att-"));
    const att = join(root, "att");
    await expect(addImage(att, "s1", { data: "PHN2Zy8+", mime: "image/svg+xml" })).rejects.toMatchObject({
      code: "not_supported",
    });
    const huge = Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64");
    await expect(addImage(att, "s1", { data: huge, mime: "image/png" })).rejects.toMatchObject({
      code: "too_large",
    });
    await expect(addImage(att, "s1", { path: join(root, "missing.png") })).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(addImage(att, "../x", { data: "AA==", mime: "image/png" })).rejects.toMatchObject({
      code: "invalid_args",
    });
    await writeFile(join(root, "elsewhere.png"), png);
    await expect(
      readImages(att, "s1", [{ path: join(root, "elsewhere.png"), mime: "image/png" }]),
    ).rejects.toMatchObject({
      code: "invalid_args",
    });
  });
});
