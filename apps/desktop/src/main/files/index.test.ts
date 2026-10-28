import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readImage } from "./index";

describe("readImage", () => {
  it("returns a data URL for images and refuses anything else", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jig-img-"));
    await writeFile(join(dir, "a.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
    await writeFile(join(dir, "notes.txt"), "secret");
    const image = await readImage(join(dir, "a.svg"));
    expect(image.mime).toBe("image/svg+xml");
    expect(image.dataUrl.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(image.bytes).toBe(41);
    await expect(readImage(join(dir, "notes.txt"))).rejects.toMatchObject({ code: "not_image" });
    await expect(readImage(join(dir, "missing.png"))).rejects.toMatchObject({ code: "not_found" });
  });
});
