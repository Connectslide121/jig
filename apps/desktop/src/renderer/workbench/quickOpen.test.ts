import { describe, expect, it } from "vitest";
import { type QuickItem, quickGroups, quickScore } from "./quickOpen";

const items: QuickItem[] = [
  { kind: "chat", id: "c1", label: "Fix the cart total", detail: "Shop", recency: "2026-10-01" },
  { kind: "chat", id: "c2", label: "Cart tests", detail: "Shop", recency: "2026-10-05" },
  { kind: "view", id: "v1", label: "Releases" },
  { kind: "action", id: "a1", label: "Reset layout", detail: "Layout" },
  { kind: "file", id: "/r/src/cart.ts", label: "cart.ts", detail: "src" },
];

describe("Go to…", () => {
  it("needs every word, and ranks a label prefix above a word inside it above the detail", () => {
    expect(quickScore(items[1]!, "cart")).toBeGreaterThan(quickScore(items[0]!, "cart"));
    expect(quickScore(items[0]!, "cart shop")).toBeGreaterThan(0);
    expect(quickScore(items[0]!, "cart nope")).toBe(0);
    expect(quickScore(items[3]!, "layout")).toBeGreaterThan(quickScore(items[0]!, "shop"));
  });

  it("groups chats, views, actions and files in that order, newest chat first on a tie", () => {
    const groups = quickGroups(items, "");
    expect(groups.map((g) => g.title)).toEqual(["Chats", "Views", "Actions", "Files"]);
    expect(groups[0]!.items.map((i) => i.id)).toEqual(["c2", "c1"]);
    const cart = quickGroups(items, "cart");
    expect(cart.map((g) => g.kind)).toEqual(["chat", "file"]);
    expect(quickGroups(items, "zzz", 1).map((g) => g.kind)).toEqual(["file"]);
    expect(quickGroups(items, "", 1)[0]!.items).toHaveLength(1);
  });
});
