import { describe, expect, it } from "vitest";
import { defaultLayout, normalizeLayout } from "../../shared/layout";
import { applyLayoutOps } from "./tools";

const views = [
  { id: "jig.sessions", defaultRegion: "left" as const },
  { id: "addon.git.git", defaultRegion: "left" as const },
  { id: "addon.repos.overview", defaultRegion: "right" as const },
];
const ids = views.map((v) => v.id);

describe("applyLayoutOps", () => {
  it("shows a view below another and moves it back to its own tab", () => {
    const layout = normalizeLayout(defaultLayout(), views);
    const below = applyLayoutOps(
      layout,
      [{ op: "below", view: "addon.repos.overview", host: "addon.git.git" }],
      ids,
    );
    expect(below.sections).toEqual({ "addon.git.git": ["addon.repos.overview"] });
    const own = applyLayoutOps(below, [{ op: "move", view: "addon.repos.overview", region: "right" }], ids);
    expect(own.sections).toEqual({});
    expect(own.right.views).toEqual(["addon.repos.overview"]);
  });

  it("refuses unknown views and incomplete operations", () => {
    const layout = normalizeLayout(defaultLayout(), views);
    expect(() =>
      applyLayoutOps(layout, [{ op: "below", view: "addon.repos.overview", host: "nope" }], ids),
    ).toThrow('Unknown view "nope"');
    expect(() => applyLayoutOps(layout, [{ op: "below", view: "addon.repos.overview" }], ids)).toThrow(
      "Incomplete",
    );
  });
});
