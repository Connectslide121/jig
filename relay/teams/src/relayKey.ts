import { createHash, timingSafeEqual } from "node:crypto";

/** Shorter keys are a setup mistake: the relay refuses to run with one. Jig makes 43-character ones. */
export const MIN_KEY_LENGTH = 32;

/**
 * Whether `given` is the relay key, in constant time: both are hashed first, so neither their content
 * nor their length shows in how long the comparison takes.
 */
export function relayKeyMatches(given: string | null | undefined, expected: string | undefined): boolean {
  if (!expected || expected.length < MIN_KEY_LENGTH || !given) return false;
  const a = createHash("sha256").update(given, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}
