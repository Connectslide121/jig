/** Messages between the main process and the natural voice's background process (D-243). */
export type ToVoiceHost =
  | { t: "load"; id: number }
  | { t: "say"; id: number; text: string; voice: string; speed: number };

/** The answer to a request: audio for `say`, nothing for `load`, or what went wrong. */
export interface FromVoiceHost {
  id: number;
  audio?: Float32Array;
  error?: string;
}

/** Kokoro reads at most 510 phoneme tokens: long text goes in pieces, split after punctuation. */
export function pieces(text: string, max = 300): string[] {
  const out: string[] = [];
  let current = "";
  for (const part of text.split(/(?<=[.!?;:,])\s+/)) {
    if (current && current.length + part.length + 1 > max) {
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
