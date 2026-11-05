import { describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLDS, profileFromTakes, wakeThresholds } from "./tuning";

describe("wakeThresholds", () => {
  it("keeps the defaults without training", () => {
    expect(wakeThresholds(null)).toEqual(DEFAULT_THRESHOLDS);
  });
  it("lowers the gate and the voice score for a soft voice, within limits", () => {
    const soft = wakeThresholds({ level: 0.018, voice: 0.7 });
    expect(soft.gate).toBeCloseTo(0.006);
    expect(soft.start).toBeCloseTo(0.5);
    expect(soft.keep).toBeCloseTo(0.3);
    expect(soft.keepGate).toBeCloseTo(0.004);
    const whisper = wakeThresholds({ level: 0.001, voice: 0.3 });
    expect(whisper.gate).toBe(0.005);
    expect(whisper.start).toBe(0.45);
  });
  it("never makes a loud, clear voice harder to hear than the defaults", () => {
    expect(wakeThresholds({ level: 0.3, voice: 0.99 })).toEqual(DEFAULT_THRESHOLDS);
  });
});

describe("profileFromTakes", () => {
  it("keeps the transcriptions, learns the misses once and takes medians", () => {
    const profile = profileFromTakes(
      [
        { text: "Hey Jig.", level: 0.02, voice: 0.9 },
        { text: "Hey, you.", level: 0.03, voice: 0.8 },
        { text: "Hey you", level: 0.5, voice: 0.85 },
        { text: "Hey, big.", level: 0.025, voice: 0.95 },
        { text: "Age.", level: 0.01, voice: 0.7 },
      ],
      new Date("2026-11-05T10:00:00Z"),
    );
    expect(profile).toEqual({
      trainedAt: "2026-11-05T10:00:00.000Z",
      heard: ["Hey Jig.", "Hey, you.", "Hey you", "Hey, big.", "Age."],
      variants: ["hey you", "age"],
      level: 0.025,
      voice: 0.85,
    });
  });
});
