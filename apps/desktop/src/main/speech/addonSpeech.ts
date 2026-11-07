import { createHash } from "node:crypto";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { wavBytes } from "./wav";

/** Kokoro's sample rate (D-243). */
export const VOICE_RATE = 24_000;

export interface AddonSayInput {
  text: string;
  voice: string;
  speed: number;
}

/**
 * `api.speech.say` (D-464): the text spoken by the natural voice, as a WAV file in the add-on's own
 * data folder (`speech/<hash>.wav`), reused when the same text, voice and speed come again. Nothing
 * leaves the computer.
 */
export async function addonSay(
  input: AddonSayInput,
  dataDir: string,
  say: (text: string, voice: string, speed: number) => Promise<Float32Array>,
): Promise<{ path: string; seconds: number }> {
  const hash = createHash("sha256")
    .update(`${input.voice}\n${input.speed}\n${input.text}`)
    .digest("hex")
    .slice(0, 20);
  const dir = join(dataDir, "speech");
  const path = join(dir, `${hash}.wav`);
  const known = await stat(path).catch(() => undefined);
  if (known && known.size > 44) return { path, seconds: round((known.size - 44) / 2 / VOICE_RATE) };
  const audio = await say(input.text, input.voice, input.speed);
  await mkdir(dir, { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, wavBytes(audio, VOICE_RATE));
  await rename(tmp, path);
  return { path, seconds: round(audio.length / VOICE_RATE) };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** The fake engine's voice (tests): silence about as long as the words would take. */
export async function fakeSay(text: string, _voice: string, speed: number): Promise<Float32Array> {
  const words = text.split(/\s+/).filter(Boolean).length;
  return new Float32Array(Math.round(Math.max(0.8, (words * 0.38) / speed) * VOICE_RATE));
}
