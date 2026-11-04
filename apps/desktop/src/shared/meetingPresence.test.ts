import { describe, expect, it } from "vitest";
import {
  PRESENCE_BATCH,
  presenceBatches,
  presenceId,
  presenceIds,
  presenceStatus,
  toPresence,
} from "./meetingPresence";

const ALEX = "22222222-2222-4222-8222-222222222222";

describe("Teams presence (D-329)", () => {
  it("takes Entra object ids and Teams participant ids, lower case, and nothing else", () => {
    expect(presenceId(ALEX.toUpperCase())).toBe(ALEX);
    expect(presenceId(`8:orgid:${ALEX}`)).toBe(ALEX);
    expect(presenceId("local")).toBeUndefined();
    expect(presenceId("alex")).toBeUndefined();
    expect(presenceId(undefined)).toBeUndefined();
    expect(presenceIds([ALEX, `8:orgid:${ALEX}`, "x", undefined])).toEqual([ALEX]);
  });

  it("asks Graph in batches it takes", () => {
    const ids = Array.from({ length: PRESENCE_BATCH + 2 }, (_, i) => String(i));
    expect(presenceBatches(ids).map((b) => b.length)).toEqual([PRESENCE_BATCH, 2]);
    expect(presenceBatches([])).toEqual([]);
  });

  it("reads a status like Teams shows it", () => {
    const s = (availability: string, activity: string) => presenceStatus({ availability, activity });
    expect(s("Available", "Available")).toEqual({ kind: "available", label: "Available" });
    expect(s("Busy", "InAMeeting")).toEqual({ kind: "busy", label: "Busy, in a meeting" });
    expect(s("Busy", "InACall")).toEqual({ kind: "busy", label: "In a call" });
    expect(s("Busy", "Busy")).toEqual({ kind: "busy", label: "Busy" });
    expect(s("DoNotDisturb", "Presenting")).toEqual({ kind: "dnd", label: "Presenting" });
    expect(s("DoNotDisturb", "DoNotDisturb")).toEqual({ kind: "dnd", label: "Do not disturb" });
    expect(s("Away", "BeRightBack")).toEqual({ kind: "away", label: "Away" });
    expect(s("BeRightBack", "BeRightBack")).toEqual({ kind: "away", label: "Be right back" });
    expect(s("AvailableIdle", "Available")).toEqual({ kind: "away", label: "Away" });
    expect(s("Offline", "OffWork")).toEqual({ kind: "offline", label: "Offline, off work" });
    expect(s("Offline", "OutOfOffice")).toEqual({ kind: "offline", label: "Out of office" });
    expect(s("Available", "OutOfOffice")).toEqual({ kind: "away", label: "Out of office" });
    expect(s("PresenceUnknown", "PresenceUnknown")).toBeUndefined();
    expect(presenceStatus(undefined)).toBeUndefined();
  });

  it("keeps Graph's answers by id, leaving out what has no id or availability", () => {
    expect(
      toPresence([
        { id: ALEX.toUpperCase(), availability: "Busy", activity: "InAMeeting" },
        { id: "nope", availability: "Busy" },
        { id: "33333333-3333-4333-8333-333333333333" },
      ]),
    ).toEqual({ [ALEX]: { availability: "Busy", activity: "InAMeeting" } });
    expect(toPresence(undefined)).toEqual({});
  });
});
