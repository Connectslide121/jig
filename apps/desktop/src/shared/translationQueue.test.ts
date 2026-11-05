import { describe, expect, it } from "vitest";
import {
  batchPrompt,
  cleanTranslation,
  languageName,
  MAX_BATCH,
  MAX_WAIT_MS,
  parseBatch,
  takeBatch,
  type WaitingCaption,
} from "./translationQueue";

const waiting = (n: number, at: (i: number) => number, extra: Partial<WaitingCaption> = {}) =>
  Array.from({ length: n }, (_, i) => ({
    meetingId: "m1",
    captionId: `c${i}`,
    text: `line ${i}`,
    language: "sv",
    at: at(i),
    ...extra,
  }));

describe("takeBatch", () => {
  it("sends everything waiting together when it is fresh and few", () => {
    const w = waiting(3, () => 1000);
    expect(takeBatch(w, 2000)).toEqual({ batch: w, skipped: [] });
  });
  it("keeps only the newest when the backlog is long", () => {
    const w = waiting(MAX_BATCH + 4, () => 1000);
    const { batch, skipped } = takeBatch(w, 2000);
    expect(batch.map((b) => b.captionId)).toEqual(w.slice(-MAX_BATCH).map((b) => b.captionId));
    expect(skipped.map((s) => s.captionId)).toEqual(["c0", "c1", "c2", "c3"]);
  });
  it("skips captions that waited too long", () => {
    const now = 100_000;
    const w = waiting(4, (i) => (i < 2 ? now - MAX_WAIT_MS - 1 : now - 1000));
    const { batch, skipped } = takeBatch(w, now);
    expect(batch.map((b) => b.captionId)).toEqual(["c2", "c3"]);
    expect(skipped.map((s) => s.captionId)).toEqual(["c0", "c1"]);
  });
  it("skips another meeting's or language's leftovers", () => {
    const w = [...waiting(2, () => 1000, { language: "de" }), ...waiting(1, () => 1000)];
    const { batch, skipped } = takeBatch(w, 2000);
    expect(batch).toHaveLength(1);
    expect(skipped).toHaveLength(2);
  });
  it("has nothing to do with nothing waiting", () => {
    expect(takeBatch([], 0)).toEqual({ batch: [], skipped: [] });
  });
});

describe("batch prompt and answer", () => {
  it("numbers the captions and names the language", () => {
    const prompt = batchPrompt(["Hej", "Tack"], "en");
    expect(prompt).toContain(`into ${languageName("en")} (en)`);
    expect(prompt).toContain('<caption n="1">\nHej\n</caption>');
    expect(prompt).toContain('<caption n="2">\nTack\n</caption>');
  });
  it("maps the answers back by number, in any order, and leaves out missing ones", () => {
    const answer = '<t n="2">Thanks</t>\n<t n="1"> "Hello" </t>\n<t n="9">Extra</t>';
    expect(parseBatch(answer, 3)).toEqual(["Hello", "Thanks", undefined]);
  });
  it("takes a plain answer for a single caption", () => {
    expect(parseBatch("Hello there", 1)).toEqual(["Hello there"]);
    expect(parseBatch("Hello there", 2)).toEqual([undefined, undefined]);
    expect(parseBatch("", 1)).toEqual([undefined]);
  });
  it("cleans tags, quotes and line breaks", () => {
    expect(cleanTranslation('<caption>"Hello\n  world"</caption>')).toBe("Hello world");
  });
});
