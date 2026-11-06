import { describe, expect, it } from "vitest";
import { announceUpdate, beforeUpdate } from "./announce";

describe("announceUpdate", () => {
  it("waits for the listeners, skips one that fails, and stops waiting after the time limit (D-395)", async () => {
    const heard: Array<string | undefined> = [];
    beforeUpdate(async (info) => {
      heard.push(info.version);
    });
    beforeUpdate(async () => {
      throw new Error("boom");
    });
    await announceUpdate({ version: "1.2.3" });
    expect(heard).toEqual(["1.2.3"]);
    beforeUpdate(() => new Promise(() => {}));
    const start = Date.now();
    await announceUpdate({}, 50);
    expect(Date.now() - start).toBeLessThan(1_000);
    expect(heard).toEqual(["1.2.3", undefined]);
  });
});
