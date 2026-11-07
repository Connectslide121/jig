import { describe, expect, it } from "vitest";
import {
  clock,
  DEFAULT_SETTINGS,
  dimensions,
  isSafeMediaPath,
  normalizeSettings,
  readingSeconds,
  type Scene,
  type Storyboard,
  sceneId,
  sceneSeconds,
  timeline,
  validate,
} from "./storyboard";

const scene = (over: Partial<Scene> = {}): Scene => ({
  id: "a",
  type: "title",
  title: "Hello there",
  ...over,
});
const board = (scenes: Scene[]): Storyboard => ({
  version: 1,
  kind: "teaser",
  title: "Shop",
  language: "en",
  scenes,
});

describe("dimensions", () => {
  it("puts the resolution on the short side", () => {
    expect(dimensions({ aspect: "16:9", resolution: "1080p" })).toEqual({ width: 1920, height: 1080 });
    expect(dimensions({ aspect: "9:16", resolution: "1080p" })).toEqual({ width: 1080, height: 1920 });
    expect(dimensions({ aspect: "1:1", resolution: "720p" })).toEqual({ width: 720, height: 720 });
    expect(dimensions({ aspect: "4:5", resolution: "1080p" })).toEqual({ width: 1080, height: 1350 });
    expect(dimensions({ aspect: "16:9", resolution: "4k" })).toEqual({ width: 3840, height: 2160 });
  });
});

describe("timing", () => {
  it("gives a short scene at least 2.5 s and longer text more time", () => {
    expect(readingSeconds(scene({ title: "Hi" }), DEFAULT_SETTINGS)).toBe(2.5);
    const long = scene({ text: "one two three four five six seven eight nine ten eleven twelve" });
    expect(readingSeconds(long, DEFAULT_SETTINGS)).toBeGreaterThan(5);
  });
  it("takes more time for a slower pace and for media", () => {
    const s = scene({ text: "a b c d e f g h" });
    expect(readingSeconds(s, { ...DEFAULT_SETTINGS, motion: "calm" })).toBeGreaterThan(
      readingSeconds(s, { ...DEFAULT_SETTINGS, motion: "energetic" }),
    );
    expect(
      readingSeconds({ ...s, media: { path: "media/a.png", kind: "image" } }, DEFAULT_SETTINGS),
    ).toBeGreaterThan(readingSeconds(s, DEFAULT_SETTINGS));
  });
  it("follows a fixed duration, else the voice when it is longer", () => {
    expect(sceneSeconds(scene({ duration: 7 }), DEFAULT_SETTINGS)).toBe(7);
    expect(sceneSeconds(scene({ voiceSeconds: 9 }), DEFAULT_SETTINGS)).toBe(9.6);
  });
  it("puts scenes back to back", () => {
    const t = timeline(
      board([scene({ id: "a", duration: 3 }), scene({ id: "b", duration: 4.5 })]),
      DEFAULT_SETTINGS,
    );
    expect(t.slots.map((s) => [s.start, s.duration])).toEqual([
      [0, 3],
      [3, 4.5],
    ]);
    expect(t.total).toBe(7.5);
  });
  it("formats a clock", () => {
    expect(clock(48)).toBe("0:48");
    expect(clock(65.4)).toBe("1:05");
  });
});

describe("validate", () => {
  it("accepts a good storyboard", () => {
    expect(validate(board([scene()]))).toEqual([]);
  });
  it("names what is wrong", () => {
    expect(validate(null)).toEqual(["The storyboard isn't an object"]);
    expect(validate({ ...board([]), kind: "film" })).toEqual([
      "Kind must be one of teaser, whats-new, walkthrough",
      "The video needs at least one scene",
    ]);
    const errors = validate(
      board([
        scene({ id: "a" }),
        scene({
          id: "a",
          type: "poster" as never,
          media: { path: "../secret.png", kind: "image" },
          duration: 0.2,
        }),
      ]),
    );
    expect(errors).toEqual([
      'Scene 2\'s id "a" is used twice',
      "Scene 2's type must be one of title, statement, feature, bullets, capture, outro",
      "Scene 2's media must be a file in the video's folder (e.g. media/screen.png)",
      "Scene 2's duration must be 1–60 seconds",
    ]);
  });
  it("refuses a video longer than ten minutes", () => {
    const scenes = Array.from({ length: 11 }, (_, i) => scene({ id: `s${i}`, duration: 60 }));
    expect(validate(board(scenes))).toEqual(["The video is longer than 10 minutes"]);
  });
});

describe("helpers", () => {
  it("keeps media inside the video's folder", () => {
    expect(isSafeMediaPath("media/a.png")).toBe(true);
    for (const p of ["", "/etc/x", "C:/x", "..\\x", "media/../../x", "a\\b", "./a"])
      expect(isSafeMediaPath(p)).toBe(false);
  });
  it("makes unique scene ids", () => {
    expect(sceneId("Bulk edit!", [])).toBe("bulk-edit");
    expect(sceneId("Bulk edit", ["bulk-edit", "bulk-edit-2"])).toBe("bulk-edit-3");
    expect(sceneId("¡¿", [])).toBe("scene");
  });
  it("normalizes stored settings", () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    const s = normalizeSettings({
      aspect: "9:16",
      fps: 60,
      style: "../x",
      motion: "wild",
      music: { volume: 3 },
    });
    expect([s.aspect, s.fps, s.style, s.motion, s.music.volume]).toEqual([
      "9:16",
      60,
      "neutral",
      "normal",
      0.6,
    ]);
  });
});
