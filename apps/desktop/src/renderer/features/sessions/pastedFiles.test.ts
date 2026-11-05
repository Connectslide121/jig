import { describe, expect, it } from "vitest";
import { withoutEmptyFiles } from "./pastedFiles";

const file = (name: string, size: number) => ({ name, size });

describe("withoutEmptyFiles", () => {
  it("skips empty entries quietly when another file came with them", () => {
    const shot = file("image.png", 120);
    expect(withoutEmptyFiles([file("", 0), shot])).toEqual({ files: [shot] });
  });

  it("names the file when the only entry was empty", () => {
    expect(withoutEmptyFiles([file("report.pdf", 0)])).toEqual({
      files: [],
      notice: {
        title: "Couldn't attach report.pdf",
        message: "It came through empty. Save it to disk first, then attach it with the paperclip.",
      },
    });
  });

  it("counts several empty entries and handles nameless ones", () => {
    expect(withoutEmptyFiles([file("a.png", 0), file("b.png", 0)]).notice?.title).toBe(
      "Couldn't attach 2 files",
    );
    expect(withoutEmptyFiles([file("", 0)]).notice?.title).toBe("Couldn't attach the file");
  });

  it("returns nothing for an empty list", () => {
    expect(withoutEmptyFiles([])).toEqual({ files: [] });
  });
});
