import { describe, expect, it } from "vitest";
import type { BoardColumn, WorkItem } from "./boards";
import {
  emptyFilter,
  facets,
  isFiltering,
  lastPart,
  ME,
  matches,
  matchesText,
  personKey,
  pickedCount,
  readFilter,
  toggle,
  UNASSIGNED,
} from "./filter";

const item = (id: number, extra: Partial<WorkItem> = {}): WorkItem => ({
  id,
  title: `Card ${id}`,
  type: "User Story",
  state: "New",
  url: `https://dev.azure.com/contoso/_workitems/edit/${id}`,
  ...extra,
});
const ann = { assignedTo: "Ann Demo", assignedEmail: "ann.demo@contoso.com" };
const ITEMS = [
  item(101, { title: "Checkout fails", type: "Bug", state: "Active", tags: ["checkout"], ...ann }),
  item(102, { title: "Add a wish list", iteration: "Shop\\Sprint 4", area: "Shop\\Web" }),
  item(103, {
    title: "Release notes",
    state: "Closed",
    assignedTo: "Ben Sample",
    tags: ["docs", "checkout"],
  }),
];
const f = (extra: Partial<ReturnType<typeof emptyFilter>>) => ({ ...emptyFilter(), ...extra });
const ids = (filter: ReturnType<typeof emptyFilter>, me?: string) =>
  ITEMS.filter((i) => matches(i, filter, me)).map((i) => i.id);

describe("readFilter", () => {
  it("reads a stored filter, odd fields become empty", () => {
    expect(readFilter(undefined)).toEqual(emptyFilter());
    expect(readFilter({ text: "x", types: ["Bug", 3], people: "nope" })).toEqual(
      f({ text: "x", types: ["Bug"] }),
    );
  });
});

describe("counts", () => {
  it("counts picked values and says when filtering", () => {
    expect(pickedCount(f({ types: ["Bug"], tags: ["a", "b"] }))).toBe(3);
    expect(isFiltering(emptyFilter())).toBe(false);
    expect(isFiltering(f({ text: "  " }))).toBe(false);
    expect(isFiltering(f({ text: "x" }))).toBe(true);
    expect(isFiltering(f({ states: ["New"] }))).toBe(true);
  });
  it("toggles a value", () => {
    expect(toggle(["a"], "b")).toEqual(["a", "b"]);
    expect(toggle(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("matchesText", () => {
  it("finds id, title, tags and assignee, every word", () => {
    expect(matchesText(ITEMS[0]!, "101")).toBe(true);
    expect(matchesText(ITEMS[0]!, "#101")).toBe(true);
    expect(matchesText(ITEMS[0]!, "CHECKOUT ann")).toBe(true);
    expect(matchesText(ITEMS[0]!, "ann.demo@")).toBe(true);
    expect(matchesText(ITEMS[0]!, "checkout ben")).toBe(false);
    expect(matchesText(ITEMS[2]!, "docs")).toBe(true);
    expect(matchesText(ITEMS[1]!, "")).toBe(true);
  });
});

describe("matches", () => {
  it("passes everything without a filter", () => {
    expect(ids(emptyFilter())).toEqual([101, 102, 103]);
  });
  it("is OR within a picker and AND across pickers", () => {
    expect(ids(f({ states: ["New", "Closed"] }))).toEqual([102, 103]);
    expect(ids(f({ states: ["New", "Closed"], tags: ["checkout"] }))).toEqual([103]);
    expect(ids(f({ types: ["Bug"], text: "fails" }))).toEqual([101]);
  });
  it("matches people by e-mail or name, unassigned and @Me", () => {
    expect(ids(f({ people: ["ann.demo@contoso.com"] }))).toEqual([101]);
    expect(ids(f({ people: ["ben sample"] }))).toEqual([103]);
    expect(ids(f({ people: [UNASSIGNED] }))).toEqual([102]);
    expect(ids(f({ people: [ME] }), "Ann.Demo@contoso.com")).toEqual([101]);
    expect(ids(f({ people: [ME] }))).toEqual([]);
    expect(ids(f({ people: [ME, UNASSIGNED] }), "ann.demo@contoso.com")).toEqual([101, 102]);
  });
  it("filters by iteration and area", () => {
    expect(ids(f({ iterations: ["Shop\\Sprint 4"] }))).toEqual([102]);
    expect(ids(f({ areas: ["Shop\\Other"] }))).toEqual([]);
  });
});

describe("facets", () => {
  const columns: BoardColumn[] = [
    { id: "c1", name: "New", columnType: "incoming", itemLimit: 0, stateMappings: { Bug: "New" } },
    { id: "c2", name: "Doing", columnType: "inProgress", itemLimit: 0, stateMappings: { Bug: "Active" } },
    { id: "c3", name: "Done", columnType: "outgoing", itemLimit: 0, stateMappings: { Bug: "Closed" } },
  ];
  it("lists the board's values with counts, states in column order", () => {
    const all = facets(ITEMS, columns);
    expect(all.types.map((t) => [t.value, t.count])).toEqual([
      ["Bug", 1],
      ["User Story", 2],
    ]);
    expect(all.states.map((s) => s.value)).toEqual(["New", "Active", "Closed"]);
    expect(all.people).toEqual([
      { value: "ann.demo@contoso.com", label: "Ann Demo", count: 1, email: "ann.demo@contoso.com" },
      { value: "ben sample", label: "Ben Sample", count: 1 },
    ]);
    expect(all.unassigned).toBe(1);
    expect(all.tags.map((t) => [t.value, t.count])).toEqual([
      ["checkout", 2],
      ["docs", 1],
    ]);
    expect(all.iterations).toEqual([{ value: "Shop\\Sprint 4", label: "Sprint 4", count: 1 }]);
  });
  it("keeps picked values no card has any more, with count 0", () => {
    const all = facets(ITEMS, columns, f({ tags: ["gone"], people: [ME, "cy@contoso.com"] }));
    expect(all.tags.find((t) => t.value === "gone")?.count).toBe(0);
    expect(all.people.map((p) => p.value)).toEqual(["ann.demo@contoso.com", "ben sample", "cy@contoso.com"]);
  });
});

describe("helpers", () => {
  it("keys people and shortens paths", () => {
    expect(personKey(ann)).toBe("ann.demo@contoso.com");
    expect(personKey({ assignedTo: "Ben Sample" })).toBe("ben sample");
    expect(personKey({})).toBeUndefined();
    expect(lastPart("Shop\\Web\\Checkout")).toBe("Checkout");
    expect(lastPart("Shop")).toBe("Shop");
  });
});
