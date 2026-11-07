import { describe, expect, it } from "vitest";
import { candidates, exe, FFMPEG_BUILDS, ffmpegAssets, nodeMajor, parseProgress, RENDERER } from "./install";

describe("install sources", () => {
  it("pins every FFmpeg download to an https URL and a sha256", () => {
    for (const assets of Object.values(FFMPEG_BUILDS)) {
      expect(assets.map((a) => a.tool)).toEqual(["ffmpeg", "ffprobe"]);
      for (const a of assets) {
        expect(a.url).toMatch(
          /^https:\/\/github\.com\/eugeneware\/ffmpeg-static\/releases\/download\/b6\.0\//,
        );
        expect(a.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(a.bytes).toBeGreaterThan(1_000_000);
      }
    }
    expect(ffmpegAssets("win32", "x64")?.[0]?.url).toContain("ffmpeg-win32-x64.gz");
    expect(ffmpegAssets("linux", "riscv")).toBeUndefined();
  });
  it("pins the renderer to one version with its integrity", () => {
    expect(RENDERER.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(RENDERER.integrity).toMatch(/^sha512-/);
  });
});

describe("finding FFmpeg", () => {
  it("looks at the setting, then PATH", () => {
    expect(candidates("ffmpeg", "/opt/ff/", "/usr/bin:/bin", "linux")).toEqual([
      "/opt/ff/ffmpeg",
      "/usr/bin/ffmpeg",
      "/bin/ffmpeg",
    ]);
    expect(candidates("ffprobe", "C:\\ff\\ffmpeg.exe", "C:\\Windows;", "win32")).toEqual([
      "C:\\ff\\ffprobe.exe",
      "C:\\Windows\\ffprobe.exe",
    ]);
    expect(candidates("ffmpeg", "", "", "linux")).toEqual([]);
    expect(exe("ffmpeg", "win32")).toBe("ffmpeg.exe");
  });
  it("reads node's major version", () => {
    expect(nodeMajor("v22.3.0\n")).toBe(22);
    expect(nodeMajor("nope")).toBeUndefined();
  });
});

describe("parseProgress", () => {
  it("reads frames and percentages", () => {
    expect(parseProgress("Rendering frame 120/480")).toBe(0.25);
    expect(parseProgress("Encoding 45%")).toBe(0.45);
    expect(parseProgress("Loaded 3/4 fonts")).toBeUndefined();
    expect(parseProgress("hello")).toBeUndefined();
  });
});
