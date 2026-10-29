import { describe, expect, it } from "vitest";
import { addLinks, moveLink, removeGroup, removeLink, renameGroup, shiftGroup, updateLink } from "./model";

describe("link groups", () => {
  it("adds to a group by title, moves, edits and removes", () => {
    let g = addLinks([], "Stage", [{ url: "https://stage.shop.se", type: "website" }]);
    g = addLinks(g, "stage", [{ url: "https://dev.azure.com/c/S/_git/shop", type: "devops-repo" }]);
    g = addLinks(g, "Prod", [{ url: "https://shop.se", type: "website", label: "Shop" }]);
    expect(g.map((x) => [x.title, x.links.length])).toEqual([
      ["Stage", 2],
      ["Prod", 1],
    ]);
    const [first, second] = g[0]!.links;
    g = moveLink(g, second!.id, g[0]!.id, first!.id);
    expect(g[0]!.links.map((l) => l.type)).toEqual(["devops-repo", "website"]);
    g = moveLink(g, first!.id, g[1]!.id);
    expect(g[1]!.links.map((l) => l.url)).toEqual(["https://shop.se", "https://stage.shop.se"]);
    g = updateLink(g, first!.id, { label: "Stage site" });
    expect(g[1]!.links[1]!.label).toBe("Stage site");
    g = removeLink(g, first!.id);
    expect(g[1]!.links).toHaveLength(1);
    g = renameGroup(g, g[1]!.id, " Production ");
    g = shiftGroup(g, g[1]!.id, -1);
    expect(g.map((x) => x.title)).toEqual(["Production", "Stage"]);
    expect(removeGroup(g, g[0]!.id).map((x) => x.title)).toEqual(["Stage"]);
  });
});
