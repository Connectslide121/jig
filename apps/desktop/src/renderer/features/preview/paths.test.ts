import { describe, expect, it } from "vitest";
import { linkedPath, parseJsonLoose } from "./paths";

describe("preview paths", () => {
  it("maps a link in a Markdown file to a local path", () => {
    const base = "jig-file://abc/docs/";
    expect(linkedPath("jig-file://abc/docs/guide.md", "/repo/docs/README.md", base)).toBe(
      "/repo/docs/guide.md",
    );
    expect(linkedPath("jig-file://abc/src/app.ts", "/repo/docs/README.md", base)).toBe("/repo/src/app.ts");
    expect(linkedPath("jig-file://other/x.md", "/repo/docs/README.md", base)).toBeUndefined();
    expect(linkedPath("jig-file://abc/docs/a%20b.md", "C:\\repo\\docs\\README.md", base)).toBe(
      "C:\\repo\\docs\\a b.md",
    );
  });

  it("reads JSON with comments and trailing commas", () => {
    expect(parseJsonLoose('{ // c\n "a": "http://x", /* b */ "b": [1, 2,], }')).toEqual({
      a: "http://x",
      b: [1, 2],
    });
  });
});
