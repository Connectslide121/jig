/** Messages between the main process and the natural voice's background process (D-243). */
export type ToVoiceHost =
  | { t: "load"; id: number }
  | { t: "say"; id: number; text: string; voice: string; speed: number };

/**
 * About a request: `part` is the audio of the next of `say`'s pieces, sent as soon as it is made
 * (so playing starts before the rest is ready); the request's last message has no `part`: done
 * (after `parts` pieces), or what went wrong.
 */
export interface FromVoiceHost {
  id: number;
  part?: Float32Array;
  parts?: number;
  error?: string;
}

/**
 * Kokoro reads at most 510 phoneme tokens: long text goes in pieces of at most `max` characters,
 * split after punctuation. The first piece is at most `firstMax`, so it is made (and heard) sooner
 * while the rest is made (D-411).
 */
export function pieces(text: string, max = 300, firstMax = max): string[] {
  const out: string[] = [];
  let current = "";
  for (const part of text.split(/(?<=[.!?;:,])\s+/)) {
    if (current && current.length + part.length + 1 > (out.length ? max : firstMax)) {
      out.push(current);
      current = "";
    }
    current = current ? `${current} ${part}` : part;
    while (current.length > max) {
      const cut = current.lastIndexOf(" ", max);
      const at = cut > 0 ? cut : max;
      out.push(current.slice(0, at));
      current = current.slice(at).trim();
    }
  }
  if (current.trim()) out.push(current);
  return out;
}
