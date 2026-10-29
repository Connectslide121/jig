import { describe, expect, it } from "vitest";
import { addNote, listing, type Note, nextId, noteText, parseLink, sorted, turnContext } from "./notes";

const note = (id: string, kind: Note["kind"], text: string, extra: Partial<Note> = {}): Note => ({
  id,
  kind,
  text,
  by: "you",
  createdAt: 0,
  ...extra,
});

describe("a chat's notes", () => {
  it("lists open waits first, then where, to-dos, notes and links, and what's done last", () => {
    const list = [
      note("1", "note", "Totals include VAT"),
      note("2", "todo", "Old checkout", { done: true }),
      note("3", "link", "", { url: "https://x.example" }),
      note("4", "wait", "API review"),
      note("5", "where", "", { repo: "shop", branch: "feature/cart" }),
    ];
    expect(sorted(list).map((n) => n.id)).toEqual(["4", "5", "1", "3", "2"]);
    expect(nextId(list)).toBe("6");
    expect(nextId([])).toBe("1");
    expect(addNote(list, { kind: "todo", text: "Tests", by: "claude" }, 9).at(-1)).toMatchObject({
      id: "6",
      createdAt: 9,
    });
  });

  it("reads links and writes each note on one line", () => {
    expect(parseLink("Design https://figma.example/x")).toEqual({
      url: "https://figma.example/x",
      text: "Design",
    });
    expect(parseLink("no address")).toBeNull();
    expect(noteText(note("1", "where", "the cart work", { repo: "shop", branch: "feature/cart" }))).toBe(
      "shop · feature/cart — the cart work",
    );
    expect(noteText(note("2", "link", "Design", { url: "https://f.example" }))).toBe(
      "Design (https://f.example)",
    );
  });

  it("answers Claude with every note and its id", () => {
    const text = listing(
      [note("1", "wait", "API review", { done: true }), note("2", "note", "VAT")],
      "Added note 2.",
    );
    expect(text).toBe("Added note 2.\n[2] Note: VAT\n[1] Waiting on: API review [cleared]");
    expect(listing([], "Notes:")).toBe("Notes:\n(no notes)");
  });

  it("tells Claude the notes and how to keep them with every message", () => {
    const empty = turnContext([]);
    expect(empty).toContain("This chat has no notes yet.");
    expect(empty).toContain("addon_notes_add");
    const text = turnContext([note("1", "wait", "API review"), note("2", "note", "VAT")]);
    expect(text).toContain("[1] Waiting on: API review");
    expect(text).toContain("shouldn't go ahead");
    expect(turnContext([note("1", "wait", "API review", { done: true })])).not.toContain(
      "shouldn't go ahead",
    );
  });
});
