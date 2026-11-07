import { describe, expect, it } from "vitest";
import { wavBytes } from "./wav";

describe("wavBytes", () => {
  it("writes a 16-bit mono PCM header and clamped samples", () => {
    const wav = wavBytes(new Float32Array([0, 1, -1, 2, -0.5]), 24000);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
    expect(wav.readUInt32LE(4)).toBe(36 + 10);
    expect(wav.readUInt16LE(20)).toBe(1);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.readUInt32LE(28)).toBe(48000);
    expect(wav.readUInt32LE(40)).toBe(10);
    expect([0, 1, 2, 3, 4].map((i) => wav.readInt16LE(44 + i * 2))).toEqual([
      0, 32767, -32768, 32767, -16384,
    ]);
  });
});
