import { describe, expect, it } from "vitest";
import { FinishedTerminals } from "./autoClose";

const setup = () => {
  const closed: string[] = [];
  return { closed, f: new FinishedTerminals((id) => closed.push(id)) };
};

describe("finished Claude terminals close by themselves (D-373)", () => {
  it("closes one that succeeded right away when you aren't looking at it", () => {
    const { closed, f } = setup();
    f.watch("other");
    f.done("a", false);
    expect(closed).toEqual(["a"]);
  });

  it("keeps the one you are looking at until you switch away", () => {
    const { closed, f } = setup();
    f.watch("a");
    f.done("a", false);
    expect(closed).toEqual([]);
    f.watch(undefined);
    expect(closed).toEqual(["a"]);
  });

  it("keeps one that failed until you have looked at it and switched away", () => {
    const { closed, f } = setup();
    f.done("a", true);
    f.watch("b");
    expect(closed).toEqual([]);
    f.watch("a");
    expect(closed).toEqual([]);
    f.watch("b");
    expect(closed).toEqual(["a"]);
  });

  it("counts a failure that happened on screen as seen", () => {
    const { closed, f } = setup();
    f.watch("a");
    f.done("a", true);
    f.watch(undefined);
    expect(closed).toEqual(["a"]);
  });

  it("waits while jig_terminal_run is still answering", () => {
    const { closed, f } = setup();
    f.hold("a");
    f.done("a", false);
    expect(closed).toEqual([]);
    f.release("a");
    expect(closed).toEqual(["a"]);
  });

  it("forgets terminals closed some other way, and running ones never close", () => {
    const { closed, f } = setup();
    f.done("a", false);
    f.watch("b");
    f.watch(undefined);
    f.forget("c");
    f.release("d");
    expect(closed).toEqual(["a"]);
  });
});
