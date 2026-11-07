import { describe, expect, it } from "vitest";
import { mixArgs, musicFile } from "./audio";

const graph = (args: string[]) => args[args.indexOf("-filter_complex") + 1] ?? "";

describe("audio mix", () => {
  it("adds nothing without voice or music", () => {
    expect(mixArgs({ video: "v.mp4", out: "o.mp4", seconds: 10, voices: [] })).toBeUndefined();
    expect(
      mixArgs({ video: "v.mp4", out: "o.mp4", seconds: 10, voices: [], music: { path: "m.mp3", volume: 0 } }),
    ).toBeUndefined();
  });

  it("lays each voice at its time and keeps the picture as it is", () => {
    const args = mixArgs({
      video: "v.mp4",
      out: "o.mp4",
      seconds: 12,
      voices: [
        { path: "a.wav", at: 0.3 },
        { path: "b.wav", at: 5.25 },
        { path: "late.wav", at: 13 },
      ],
    })!;
    expect(args.filter((a) => a.endsWith(".wav"))).toEqual(["a.wav", "b.wav"]);
    expect(graph(args)).toContain("adelay=300|300");
    expect(graph(args)).toContain("adelay=5250|5250");
    expect(graph(args)).toContain("amix=inputs=2");
    expect(args.slice(args.indexOf("-c:v"), args.indexOf("-c:v") + 2)).toEqual(["-c:v", "copy"]);
    expect(args.at(-1)).toBe("o.mp4");
    expect(args[args.indexOf("-t") + 1]).toBe("12");
  });

  it("loops music with fades and ducks it under the voice", () => {
    const args = mixArgs({
      video: "v.mp4",
      out: "o.mp4",
      seconds: 20,
      voices: [{ path: "a.wav", at: 0.3 }],
      music: { path: "m.mp3", volume: 0.5 },
    })!;
    expect(args).not.toContain("-stream_loop");
    const g = graph(args);
    expect(g).toContain("aloop=loop=-1");
    expect(g).toContain("[2:a]");
    expect(g).toContain("volume=0.5");
    expect(g).toContain("afade=t=out:st=18:d=2");
    expect(g).toContain("sidechaincompress");
  });

  it("plays music alone when there is no voice", () => {
    const g = graph(
      mixArgs({ video: "v.mp4", out: "o.mp4", seconds: 8, voices: [], music: { path: "m.mp3", volume: 1 } })!,
    );
    expect(g).toContain("[1:a]");
    expect(g).not.toContain("sidechaincompress");
  });
});

describe("musicFile", () => {
  it("names a track's copy the same way on every system", () => {
    expect(musicFile("C:\\Music\\Calm Morning (Loop).MP3")).toBe("media/music-calm-morning-loop.mp3");
    expect(musicFile("/home/a/!!!.wav")).toBe("media/music-track.wav");
  });
});
