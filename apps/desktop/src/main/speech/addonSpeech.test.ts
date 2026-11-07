import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addonSay, fakeSay, VOICE_RATE } from "./addonSpeech";

let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("addonSay", () => {
  it("writes the speech as a WAV in the add-on's folder and reuses it", async () => {
    dir = await mkdtemp(join(tmpdir(), "jig-say-"));
    const say = vi.fn(async () => new Float32Array(VOICE_RATE * 2));
    const first = await addonSay({ text: "Hello there", voice: "af_heart", speed: 1 }, dir, say);
    expect(first.seconds).toBe(2);
    expect(first.path.startsWith(join(dir, "speech"))).toBe(true);
    expect((await readFile(first.path)).toString("ascii", 0, 4)).toBe("RIFF");
    const again = await addonSay({ text: "Hello there", voice: "af_heart", speed: 1 }, dir, say);
    expect(again).toEqual(first);
    expect(say).toHaveBeenCalledTimes(1);
    const other = await addonSay({ text: "Hello there", voice: "am_puck", speed: 1 }, dir, say);
    expect(other.path).not.toBe(first.path);
  });

  it("has a fake voice whose length follows the words", async () => {
    expect((await fakeSay("one two three four five", "af_heart", 1)).length / VOICE_RATE).toBeCloseTo(1.9, 1);
    expect((await fakeSay("hi", "af_heart", 1)).length / VOICE_RATE).toBeCloseTo(0.8, 1);
  });
});
