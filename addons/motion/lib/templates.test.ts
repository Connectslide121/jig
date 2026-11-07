import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validate } from "./storyboard";
import { checkTemplate, fill, fromTemplate, type Template } from "./templates";

const load = (id: string) =>
  JSON.parse(readFileSync(join(__dirname, "..", "templates", id, "template.json"), "utf8")) as Template;

describe("templates", () => {
  it("fills placeholders", () => {
    expect(fill("{{a}} {{ item.b }} {{missing}}", { a: "Shop", item: { b: 2 } })).toBe("Shop 2");
    expect(fill(undefined, {})).toBe("");
  });
  for (const id of ["teaser", "whats-new", "walkthrough"]) {
    it(`${id}: is well formed and its sample makes a valid storyboard`, () => {
      const t = load(id);
      expect(checkTemplate(t)).toEqual([]);
      const board = fromTemplate(t, t.sample ?? {});
      expect(board.kind).toBe(t.kind);
      expect(validate(board)).toEqual([]);
    });
  }
  it("repeats a scene per item, picks media kinds and drops empty scenes", () => {
    const t = load("teaser");
    const board = fromTemplate(t, {
      product: "Shop",
      values: [
        { title: "One", image: "media/one.png" },
        { title: "Two", image: "media/two.mp4" },
        { title: "Three", image: "../bad.png" },
      ],
    });
    expect(board.scenes.map((s) => s.type)).toEqual([
      "title",
      "statement",
      "feature",
      "feature",
      "feature",
      "outro",
    ]);
    expect(board.scenes[2]!.media).toEqual({ path: "media/one.png", kind: "image" });
    expect(board.scenes[3]!.media).toEqual({ path: "media/two.mp4", kind: "video" });
    expect(board.scenes[4]!.media).toBeUndefined();
    expect(new Set(board.scenes.map((s) => s.id)).size).toBe(board.scenes.length);
  });
  it("leaves out a bullets scene without bullets", () => {
    const t = load("whats-new");
    const board = fromTemplate(t, { product: "Shop", version: "2.4" });
    expect(board.scenes.map((s) => s.type)).toEqual(["title", "outro"]);
    expect(board.title).toBe("Shop 2.4");
  });
  it("names a broken template's problems", () => {
    expect(checkTemplate({ id: "X", kind: "film", scenes: [] })).toEqual(["id", "kind", "licence", "scenes"]);
  });
});
