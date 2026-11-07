import { describe, expect, it } from "vitest";
import { chunks, cues, srt, vtt } from "./captions";
import { DEFAULT_SETTINGS, type Scene } from "./storyboard";

const scene = (over: Partial<Scene>): Scene => ({ id: "a", type: "statement", title: "T", ...over });

describe("captions", () => {
  it("breaks a script at sentences, then at words, within the limit", () => {
    expect(chunks("Hello there. How are you?")).toEqual(["Hello there.", "How are you?"]);
    const long = Array(30).fill("word").join(" ");
    const parts = chunks(long, 20);
    expect(parts.every((p) => p.length <= 20)).toBe(true);
    expect(parts.join(" ")).toBe(long);
    expect(chunks("   ")).toEqual([]);
  });

  it("times lines across the scene's voice, after its lead", () => {
    const list = cues(
      {
        scenes: [
          scene({ id: "a", duration: 4 }),
          scene({ id: "b", voice: "First line. Second one here.", voiceSeconds: 3 }),
        ],
      },
      DEFAULT_SETTINGS,
    );
    expect(list).toHaveLength(2);
    expect(list[0]!.start).toBeCloseTo(4.3);
    expect(list[1]!.end).toBeCloseTo(7.3);
    expect(list[0]!.end).toBe(list[1]!.start);
    expect(list[0]!.text).toBe("First line.");
  });

  it("never runs past a scene with a fixed length", () => {
    const [cue] = cues(
      { scenes: [scene({ voice: "Short", voiceSeconds: 9, duration: 2 })] },
      DEFAULT_SETTINGS,
    );
    expect(cue!.end).toBeLessThanOrEqual(2);
  });

  it("writes SubRip and WebVTT", () => {
    const list = [
      { start: 0.3, end: 1.25, text: "Hello" },
      { start: 61.5, end: 3725.004, text: "Bye" },
    ];
    expect(srt(list)).toBe(
      "1\n00:00:00,300 --> 00:00:01,250\nHello\n\n2\n00:01:01,500 --> 01:02:05,004\nBye\n",
    );
    expect(vtt(list)).toBe(
      "WEBVTT\n\n00:00:00.300 --> 00:00:01.250\nHello\n\n00:01:01.500 --> 01:02:05.004\nBye\n",
    );
  });
});
