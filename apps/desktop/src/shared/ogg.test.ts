import { describe, expect, it } from "vitest";
import { oggCrc, oggOpus, oggPages } from "./ogg";

describe("oggCrc", () => {
  // CRC-32/MPEG-2's check value without its init and final xor: Ogg's variant of "123456789".
  it("matches Ogg's CRC for a known input", () =>
    expect(oggCrc(new TextEncoder().encode("123456789"))).toBe(0x89a1897f));
});

describe("oggOpus", () => {
  const packet = (n: number, fill: number) => new Uint8Array(n).fill(fill);

  it("writes OpusHead, OpusTags, then the audio, with valid pages", () => {
    const packets = Array.from({ length: 120 }, (_, i) => packet(i % 3 === 0 ? 300 : 60, i));
    const pages = oggPages(oggOpus(packets, { samples: 120 * 960 - 500 }));
    expect(pages.every((p) => p.crcOk)).toBe(true);
    expect(new TextDecoder().decode(pages[0]!.packets[0]!.subarray(0, 8))).toBe("OpusHead");
    expect(pages[0]!.flags).toBe(0x02);
    expect(new TextDecoder().decode(pages[1]!.packets[0]!.subarray(0, 8))).toBe("OpusTags");
    const audio = pages.slice(2).flatMap((p) => p.packets);
    expect(audio).toHaveLength(120);
    expect(audio[3]).toEqual(packet(300, 3));
    expect(pages.at(-1)!.flags).toBe(0x04);
    // The last page's granule cuts the padding: pre-skip plus the audio's own length.
    expect(pages.at(-1)!.granule).toBe(BigInt(312 + 120 * 960 - 500));
    const granules = pages.slice(2).map((p) => p.granule);
    expect([...granules].sort((a, b) => (a < b ? -1 : 1))).toEqual(granules);
  });
});
