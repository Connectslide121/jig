import { afterEach, describe, expect, it, vi } from "vitest";
import type { MenuEntry } from "../ui/Menu";
import { collectLiveEntries, withLiveEntries } from "./menuGroups";
import type { MenuGroupDef } from "./registry";

const item = (label: string): MenuEntry => ({ label });
const def = (group: string, items: MenuGroupDef["items"], onError?: (e: Error) => void): MenuGroupDef => ({
  id: `${group}-${Math.random()}`,
  group,
  items,
  onError,
});

afterEach(() => {
  vi.useRealTimers();
});

describe("collectLiveEntries", () => {
  it("answers synchronously when every provider does, merged per group", () => {
    const live = collectLiveEntries([
      def("Time", () => [item("Start")]),
      def("Time", () => [item("Contoso")]),
      def("Shop", () => []),
    ]);
    expect(live).toEqual({ Time: [item("Start"), item("Contoso")] });
  });

  it("waits for a promise", async () => {
    const live = collectLiveEntries([
      def("Time", async () => [item("Stop")]),
      def("Shop", () => [item("A")]),
    ]);
    expect(live).toBeInstanceOf(Promise);
    expect(await live).toEqual({ Time: [item("Stop")], Shop: [item("A")] });
  });

  it("drops a provider that throws, rejects or returns something else, and tells it", async () => {
    const errors: string[] = [];
    const onError = (e: Error) => errors.push(e.message);
    const live = await collectLiveEntries([
      def(
        "A",
        () => {
          throw new Error("boom");
        },
        onError,
      ),
      def("B", () => Promise.reject(new Error("nope")), onError),
      def("C", () => "x" as unknown as MenuEntry[], onError),
      def("D", () => Promise.resolve([item("kept")]), onError),
    ]);
    expect(live).toEqual({ D: [item("kept")] });
    expect(errors).toEqual(["boom", "its menu entries aren't a list", "nope"]);
  });

  it("gives up on a provider slower than the timeout", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const live = collectLiveEntries(
      [def("Slow", () => new Promise(() => {}), onError), def("Fast", () => [item("now")])],
      300,
    );
    await vi.advanceTimersByTimeAsync(300);
    expect(await live).toEqual({ Fast: [item("now")] });
    expect(onError.mock.calls[0]?.[0].message).toBe("its menu entries took longer than 300 ms");
  });
});

describe("withLiveEntries", () => {
  it("puts live entries above the actions with one separator", () => {
    expect(withLiveEntries([item("Start")], [item("Open Time")])).toEqual([
      item("Start"),
      { separator: true },
      item("Open Time"),
    ]);
  });

  it("trims separators at the edges and skips the line without actions", () => {
    expect(
      withLiveEntries(
        [{ separator: true }, item("Start"), { separator: true }, item("B"), { separator: true }],
        [],
      ),
    ).toEqual([item("Start"), { separator: true }, item("B")]);
  });

  it("keeps the actions alone without live entries", () => {
    expect(withLiveEntries(undefined, [item("Open Time")])).toEqual([item("Open Time")]);
    expect(withLiveEntries([{ separator: true }], [item("Open Time")])).toEqual([item("Open Time")]);
  });
});
