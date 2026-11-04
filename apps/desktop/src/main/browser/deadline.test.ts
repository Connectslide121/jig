import { describe, expect, it } from "vitest";
import { TimeoutError, withTimeout } from "./deadline";

describe("withTimeout", () => {
  it("passes a result that comes in time", async () => {
    await expect(withTimeout(Promise.resolve(4), 1000, "test")).resolves.toBe(4);
  });

  it("passes the promise's own error", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 1000, "test")).rejects.toThrow("boom");
  });

  it("gives up with a labelled TimeoutError on a promise that never settles", async () => {
    const error = await withTimeout(new Promise(() => {}), 20, "load").catch((e) => e);
    expect(error).toBeInstanceOf(TimeoutError);
    expect((error as TimeoutError).label).toBe("load");
  });

  it("stops waiting when the signal aborts, with its reason", async () => {
    const controller = new AbortController();
    const waiting = withTimeout(new Promise(() => {}), 10_000, "call", controller.signal);
    controller.abort(new Error("The chat was stopped"));
    await expect(waiting).rejects.toThrow("The chat was stopped");
  });

  it("rejects at once on an already aborted signal", async () => {
    const controller = new AbortController();
    controller.abort(new Error("gone"));
    await expect(withTimeout(Promise.resolve(1), 1000, "call", controller.signal)).rejects.toThrow("gone");
  });
});
