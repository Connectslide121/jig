import { type Storyboard, timeline, type VideoSettings, VOICE_LEAD, voiceLength } from "./storyboard";

/**
 * Captions from the voice scripts (M2): each scene's script in short lines, timed across its voice
 * by each line's share of the characters. The same cues are burned into the video and written as
 * `.srt` and `.vtt` beside the MP4. Pure.
 */

export interface Cue {
  start: number;
  end: number;
  text: string;
}

/** At most two short lines on screen. */
export const CUE_CHARS = 84;

/** A script in pieces of at most `max` characters, breaking at sentence ends first, then words. */
export function chunks(text: string, max = CUE_CHARS): string[] {
  const out: string[] = [];
  const sentences =
    text
      .replace(/\s+/g, " ")
      .trim()
      .match(/[^.!?…]+[.!?…]*["')\]]*\s*/g) ?? [];
  for (const sentence of sentences) {
    let line = "";
    for (const word of sentence.trim().split(" ")) {
      if (!word) continue;
      if (line && line.length + 1 + word.length > max) {
        out.push(line);
        line = "";
      }
      line = line ? `${line} ${word}` : word.slice(0, max);
    }
    if (line) out.push(line);
  }
  return out;
}

const ms = (n: number) => Math.round(n * 1000) / 1000;

/** Every caption with its time in the video. */
export function cues(board: Pick<Storyboard, "scenes">, s: Pick<VideoSettings, "motion" | "type">): Cue[] {
  const out: Cue[] = [];
  for (const slot of timeline(board, s).slots) {
    const length = voiceLength(slot.scene);
    if (!length) continue;
    const pieces = chunks(slot.scene.voice ?? "");
    const total = pieces.reduce((n, p) => n + p.length, 0) || 1;
    const sceneEnd = slot.start + slot.duration;
    let at = slot.start + Math.min(VOICE_LEAD, slot.duration / 4);
    const span = Math.min(length, sceneEnd - at);
    for (const text of pieces) {
      const end = Math.min(sceneEnd, at + (span * text.length) / total);
      if (end - at >= 0.05) out.push({ start: ms(at), end: ms(end), text });
      at = end;
    }
  }
  return out;
}

function stamp(seconds: number, comma: boolean): string {
  const total = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor(total / 60_000) % 60;
  const s = Math.floor(total / 1000) % 60;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}${comma ? "," : "."}${pad(total % 1000, 3)}`;
}

/** SubRip: numbered cues, `00:00:01,250 --> 00:00:03,000`. */
export function srt(list: Cue[]): string {
  return list
    .map((c, i) => `${i + 1}\n${stamp(c.start, true)} --> ${stamp(c.end, true)}\n${c.text}\n`)
    .join("\n");
}

/** WebVTT: a header, then `00:00:01.250 --> 00:00:03.000` cues. */
export function vtt(list: Cue[]): string {
  return `WEBVTT\n\n${list.map((c) => `${stamp(c.start, false)} --> ${stamp(c.end, false)}\n${c.text}\n`).join("\n")}`;
}
