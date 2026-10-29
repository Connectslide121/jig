import { describe, expect, it } from "vitest";
import type { SessionMeta } from "../../shared/engine";
import { notificationFor, notificationsAllowed } from "./notify";

const meta = (patch: Partial<SessionMeta>) =>
  ({ title: "Fix the cart", status: "idle", ...patch }) as SessionMeta;

describe("chat notifications", () => {
  it("notifies when a working chat needs you, finishes or fails", () => {
    expect(notificationFor("working", meta({ status: "needs_you" }))?.title).toBe(
      "Claude needs you: Fix the cart",
    );
    expect(notificationFor("working", meta({ status: "idle" }))?.title).toBe("Claude finished: Fix the cart");
    expect(notificationFor("working", meta({ status: "error", lastError: "Boom\nstack" }))?.body).toBe(
      "Boom",
    );
  });

  it("stays quiet otherwise", () => {
    expect(notificationFor(undefined, meta({ status: "idle" }))).toBeUndefined();
    expect(notificationFor("idle", meta({ status: "working" }))).toBeUndefined();
    expect(notificationFor("needs_you", meta({ status: "working" }))).toBeUndefined();
    expect(notificationFor("working", meta({ status: "working" }))).toBeUndefined();
    expect(notificationFor("working", meta({ status: "idle", kind: "builder" }))).toBeUndefined();
  });
});

describe("notificationsAllowed", () => {
  it("is off when you turned notifications off, and for a hidden Jig (tests)", () => {
    expect(notificationsAllowed(true, {})).toBe(true);
    expect(notificationsAllowed(false, {})).toBe(false);
    expect(notificationsAllowed(true, { JIG_HIDDEN: "1" })).toBe(false);
    expect(notificationsAllowed(true, { JIG_HIDDEN: "" })).toBe(true);
  });
});
