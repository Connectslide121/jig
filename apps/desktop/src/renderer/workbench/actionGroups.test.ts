import { describe, expect, it } from "vitest";
import { filterActions } from "./actionGroups";
import type { ActionDef } from "./registry";

const a = (id: string, title: string, group: string, extra: Partial<ActionDef> = {}): ActionDef => ({
  id,
  title,
  group,
  run: () => {},
  ...extra,
});

const actions = [
  a("theme", "Change theme…", "Appearance", { keywords: ["colour", "dark"] }),
  a("add", "Add project…", "Projects"),
  a("x", "Zebra", "My add-on"),
  a("hidden", "Secret", "Projects", { visible: () => false }),
  a("left", "Toggle left sidebar", "Layout"),
];

describe("filterActions", () => {
  it("groups in a fixed order with add-on groups last", () => {
    expect(filterActions(actions, "").map((g) => g.group)).toEqual([
      "Projects",
      "Layout",
      "Appearance",
      "My add-on",
    ]);
  });

  it("matches every word against title, group and keywords", () => {
    expect(filterActions(actions, "dark").flatMap((g) => g.actions.map((x) => x.id))).toEqual(["theme"]);
    expect(filterActions(actions, "toggle side").flatMap((g) => g.actions.map((x) => x.id))).toEqual([
      "left",
    ]);
    expect(filterActions(actions, "projects add").flatMap((g) => g.actions.map((x) => x.id))).toEqual([
      "add",
    ]);
    expect(filterActions(actions, "nothing")).toEqual([]);
  });

  it("hides invisible actions", () => {
    expect(filterActions(actions, "secret")).toEqual([]);
  });
});
