import { describe, expect, it } from "vitest";
import { extensionOf, imageMime, isImagePath } from "./files";

describe("image files", () => {
  it("recognises image extensions, case-insensitively, on any path style", () => {
    expect(isImagePath("C:\\Users\\me\\Shot.PNG")).toBe(true);
    expect(isImagePath("src/logo.svg")).toBe(true);
    expect(isImagePath("README.md")).toBe(false);
    expect(isImagePath(".png")).toBe(false);
    expect(extensionOf("a/b.tar.gz")).toBe("gz");
    expect(imageMime("x.jpg")).toBe("image/jpeg");
  });
});
