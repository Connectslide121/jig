import { describe, expect, it } from "vitest";
import type { Scene } from "./storyboard";
import { scenesFromTool, toolKind, videoLine } from "./tools";

describe("scenesFromTool", () => {
  it("gives new scenes ids and cleans their fields", () => {
    const out = scenesFromTool([
      { type: "title", title: "  Shop 2.0 " },
      { type: "nonsense", title: "x", bullets: ["a", "", "b"], duration: 99 },
    ]);
    expect(out).toEqual([
      { id: "s1", type: "title", title: "Shop 2.0" },
      { id: "s2", type: "statement", title: "x", bullets: ["a", "b"], duration: 60 },
    ]);
  });

  it("keeps an existing scene's media, marks and voice by id, and drops a changed voice's file", () => {
    const existing: Scene[] = [
      { id: "s1", type: "title", title: "Old" },
      {
        id: "s2",
        type: "capture",
        title: "Pay",
        media: { path: "media/pay.png", kind: "image" },
        voice: "Pay in one tap.",
        voiceFile: "media/voice-s2-abc.wav",
        voiceSeconds: 1.4,
      },
      { id: "s3", type: "outro", title: "Bye", voice: "Bye", voiceFile: "media/v.wav", voiceSeconds: 1 },
    ];
    const out = scenesFromTool(
      [{ id: "s2" }, { id: "s1", title: "New" }, { title: "Added" }, { id: "s3", voice: "See you" }],
      existing,
    );
    expect(out.map((s) => s.id)).toEqual(["s2", "s1", "s4", "s3"]);
    expect(out[0]).toEqual(existing[1]);
    expect(out[1]?.title).toBe("New");
    expect(out[3]).toEqual({ id: "s3", type: "outro", title: "Bye", voice: "See you" });
  });

  it("refuses what isn't a list of scenes", () => {
    expect(() => scenesFromTool("x")).toThrow(/list/);
    expect(() => scenesFromTool([])).toThrow(/at least one/);
    expect(() => scenesFromTool([3])).toThrow(/Scene 1/);
  });

  it("removes a voice set to empty", () => {
    const out = scenesFromTool(
      [{ id: "s1", voice: "" }],
      [{ id: "s1", type: "title", title: "A", voice: "Hi" }],
    );
    expect(out[0]?.voice).toBeUndefined();
  });
});

describe("toolKind and videoLine", () => {
  it("knows the kinds and writes one line per video", () => {
    expect(toolKind("whats-new")).toBe("whats-new");
    expect(toolKind("film")).toBeUndefined();
    expect(
      videoLine({
        id: "v_12345678",
        title: "Shop",
        kind: "teaser",
        seconds: 31.6,
        status: "rendered",
        aspect: "16:9",
        renders: [{ n: 2 }],
        updatedAt: "2025-01-02T03:04:05Z",
      }),
    ).toBe('- v_12345678: "Shop", teaser, 32 s, 16:9, rendered (render 2), updated 2025-01-02 03:04');
  });
});
