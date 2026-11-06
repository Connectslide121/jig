import { describe, expect, it } from "vitest";
import { parseFrontMatter, setStatus, statusOf, updateFrontMatter, writeFrontMatter } from "./frontmatter";

const SPEC = `---
status: draft
recipe: spec
version: 1
run: fx-1
checks: [frontmatter, "words<=600"]
outputs:
  - spec.md
history:
  - { status: draft, by: jig, at: "2026-11-07T10:00:00Z", edited: false }
---
# Spec

Body: with a colon.
`;

describe("front-matter", () => {
  it("reads scalars, inline and block lists, and flow maps", () => {
    const { data, body } = parseFrontMatter(SPEC);
    expect(data).toEqual({
      status: "draft",
      recipe: "spec",
      version: 1,
      run: "fx-1",
      checks: ["frontmatter", "words<=600"],
      outputs: ["spec.md"],
      history: [{ status: "draft", by: "jig", at: "2026-11-07T10:00:00Z", edited: false }],
    });
    expect(body).toBe("# Spec\n\nBody: with a colon.\n");
    expect(statusOf(data)).toBe("draft");
    expect(statusOf({ status: "nope" })).toBeUndefined();
  });

  it("has nothing for a file without front-matter", () => {
    expect(parseFrontMatter("# Just text\n")).toEqual({ data: {}, body: "# Just text\n" });
  });

  it("writes what it reads", () => {
    const { data, body } = parseFrontMatter(SPEC);
    expect(parseFrontMatter(writeFrontMatter(data, body))).toEqual({ data, body });
    expect(writeFrontMatter({ note: "a: b", n: "12", list: [] }, "x")).toBe(
      '---\nnote: "a: b"\nn: "12"\nlist: []\n---\nx',
    );
  });

  it("adds front-matter to a file without, keeping its text", () => {
    const text = updateFrontMatter("# Pitch\n", { status: "draft", version: 2 });
    expect(text).toBe("---\nstatus: draft\nversion: 2\n---\n# Pitch\n");
  });

  it("moves the status on and records it in the history", () => {
    const text = setStatus(SPEC, { status: "approved", by: "me", at: "2026-11-07T11:00:00Z", edited: false });
    const { data, body } = parseFrontMatter(text);
    expect(data.status).toBe("approved");
    expect(data.history).toEqual([
      { status: "draft", by: "jig", at: "2026-11-07T10:00:00Z", edited: false },
      { status: "approved", by: "me", at: "2026-11-07T11:00:00Z", edited: false },
    ]);
    expect(body).toContain("Body: with a colon.");
  });
});
