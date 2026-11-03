import { describe, expect, it } from "vitest";
import type { BoardData, WorkItem } from "./boards";
import {
  cacheKey,
  Flights,
  isFresh,
  isSignInProblem,
  keyTenant,
  mergeBoard,
  pruneCache,
  readCache,
  updatedAgo,
} from "./cache";

const board = { org: "Contoso", project: "Shop", team: "Shop Team", boardId: "b1" };
const item = (id: number, extra: Partial<WorkItem> = {}): WorkItem => ({
  id,
  title: `Card ${id}`,
  type: "User Story",
  state: "New",
  column: "New",
  url: `https://dev.azure.com/contoso/_workitems/edit/${id}`,
  ...extra,
});
const data = (items: WorkItem[]): BoardData => ({
  columns: [
    { id: "c1", name: "New", columnType: "incoming", itemLimit: 0, stateMappings: { "User Story": "New" } },
    {
      id: "c2",
      name: "Done",
      columnType: "outgoing",
      itemLimit: 0,
      stateMappings: { "User Story": "Closed" },
    },
  ],
  items,
  columnField: "WEF_X_Kanban.Column",
});
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe("cacheKey", () => {
  it("is the tenant and the board's identity, case-insensitive", () => {
    expect(cacheKey(board)).toBe("default|contoso|shop|shop team|b1");
    expect(cacheKey({ ...board, org: "CONTOSO" })).toBe(cacheKey(board));
  });
  it("differs per tenant, so another tenant's cards are never found", () => {
    expect(cacheKey({ ...board, tenant: "t-fabrikam" })).not.toBe(cacheKey(board));
    expect(keyTenant(cacheKey({ ...board, tenant: "t-fabrikam" }))).toBe("t-fabrikam");
  });
});

describe("isFresh", () => {
  it("is true only within the age", () => {
    expect(isFresh({ at: 1000 }, 50_000, 60_000)).toBe(true);
    expect(isFresh({ at: 1000 }, 61_000, 60_000)).toBe(false);
    expect(isFresh(undefined, 0, 60_000)).toBe(false);
  });
});

describe("pruneCache / readCache", () => {
  it("keeps only followed boards", () => {
    const cache = { a: { at: 1, data: data([]) }, b: { at: 2, data: data([]) } };
    expect(Object.keys(pruneCache(cache, ["b", "c"]))).toEqual(["b"]);
  });
  it("skips entries that aren't a board's answer", () => {
    const read = readCache({
      ok: { at: 1, data: data([item(1)]) },
      noAt: { data: data([]) },
      elsewhere: { at: 1, data: { columns: [], items: [], elsewhere: { tenant: "x" } } },
      junk: 3,
    });
    expect(Object.keys(read)).toEqual(["ok"]);
    expect(readCache(undefined)).toEqual({});
    expect(readCache("text")).toEqual({});
  });
});

describe("mergeBoard", () => {
  it("returns the next data when there was none", () => {
    const next = data([item(1)]);
    expect(mergeBoard(undefined, next)).toBe(next);
  });
  it("returns the same object when nothing changed (nothing renders again)", () => {
    const prev = data([item(1), item(2)]);
    expect(mergeBoard(prev, clone(prev))).toBe(prev);
  });
  it("keeps unchanged cards and columns, replaces changed ones", () => {
    const prev = data([item(1), item(2)]);
    const next = clone(prev);
    next.items[1] = item(2, { column: "Done", state: "Closed" });
    const merged = mergeBoard(prev, next);
    expect(merged).not.toBe(prev);
    expect(merged.columns).toBe(prev.columns);
    expect(merged.items[0]).toBe(prev.items[0]);
    expect(merged.items[1]).not.toBe(prev.items[1]);
    expect(merged.items[1]?.column).toBe("Done");
  });
  it("follows added, removed and reordered cards", () => {
    const prev = data([item(1), item(2)]);
    const added = mergeBoard(prev, data([item(1), item(2), item(3)]));
    expect(added.items.map((i) => i.id)).toEqual([1, 2, 3]);
    expect(added.items[0]).toBe(prev.items[0]);
    const removed = mergeBoard(prev, data([item(2)]));
    expect(removed.items).toEqual([prev.items[1]]);
    expect(removed.items[0]).toBe(prev.items[1]);
    const reordered = mergeBoard(prev, data([item(2), item(1)]));
    expect(reordered.items).not.toBe(prev.items);
    expect(reordered.items[0]).toBe(prev.items[1]);
  });
  it("notices a changed WIP limit or state mapping", () => {
    const prev = data([]);
    const next = clone(prev);
    next.columns[0]!.itemLimit = 5;
    next.columns[1]!.stateMappings = { "User Story": "Done" };
    const merged = mergeBoard(prev, next);
    expect(merged.columns[0]).not.toBe(prev.columns[0]);
    expect(merged.columns[1]?.stateMappings).toEqual({ "User Story": "Done" });
  });
  it("notices a new area or column field", () => {
    const prev = data([]);
    expect(mergeBoard(prev, { ...clone(prev), area: "Shop\\Web" }).area).toBe("Shop\\Web");
  });
});

describe("updatedAgo", () => {
  it("says how long ago, rounded down", () => {
    expect(updatedAgo(0, 30_000)).toBe("updated just now");
    expect(updatedAgo(0, 4 * 60_000 + 59_000)).toBe("updated 4 min ago");
    expect(updatedAgo(0, 2 * 3_600_000)).toBe("updated 2 h ago");
    expect(updatedAgo(0, 3 * 86_400_000)).toBe("updated 3 d ago");
    expect(updatedAgo(10_000, 0)).toBe("updated just now");
  });
});

describe("isSignInProblem", () => {
  it("is az's signed-out and expired problems only", () => {
    expect(isSignInProblem({ problem: "signedOut" })).toBe(true);
    expect(isSignInProblem({ problem: "expired" })).toBe(true);
    expect(isSignInProblem({ problem: "failed" })).toBe(false);
    expect(isSignInProblem(new Error("x"))).toBe(false);
    expect(isSignInProblem(undefined)).toBe(false);
  });
});

describe("Flights", () => {
  const deferred = () => {
    let resolve!: (v: number) => void;
    const promise = new Promise<number>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  };

  it("shares the request already running", async () => {
    const f = new Flights<number>();
    const d = deferred();
    let calls = 0;
    const load = () => {
      calls++;
      return d.promise;
    };
    const a = f.run("k", load);
    const b = f.run("k", load);
    expect(a).toBe(b);
    expect(f.has("k")).toBe(true);
    d.resolve(1);
    expect(await a).toBe(1);
    expect(calls).toBe(1);
    await Promise.resolve();
    expect(f.has("k")).toBe(false);
  });

  it("starts one follow-up for fresh callers, after the running one", async () => {
    const f = new Flights<number>();
    const first = deferred();
    const second = deferred();
    const loads = [first.promise, second.promise];
    let calls = 0;
    const load = () => loads[calls++]!;
    const a = f.run("k", load);
    const b = f.run("k", load, true);
    const c = f.run("k", load);
    const d = f.run("k", load, true);
    expect(b).not.toBe(a);
    expect(c).toBe(b);
    expect(d).toBe(b);
    expect(calls).toBe(1);
    first.resolve(1);
    expect(await a).toBe(1);
    second.resolve(2);
    expect(await b).toBe(2);
    expect(calls).toBe(2);
  });

  it("runs the follow-up even when the running one fails", async () => {
    const f = new Flights<number>();
    let calls = 0;
    const load = () => (++calls === 1 ? Promise.reject(new Error("no")) : Promise.resolve(2));
    const a = f.run("k", load);
    const b = f.run("k", load, true);
    await expect(a).rejects.toThrow("no");
    expect(await b).toBe(2);
  });

  it("keeps keys apart", () => {
    const f = new Flights<number>();
    const d = deferred();
    expect(f.run("a", () => d.promise)).not.toBe(f.run("b", () => d.promise));
  });
});
