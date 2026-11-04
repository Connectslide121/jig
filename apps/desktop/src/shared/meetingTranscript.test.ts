import { describe, expect, it } from "vitest";
import {
  attributePiece,
  CAPTION_CODES,
  CAPTION_RETRY_DELAYS,
  capabilityPending,
  captionErrorText,
  captionStartDecision,
  keepLocalPiece,
  nextSource,
  pruneSpans,
  SpeechChunker,
  type SpeechPiece,
  UNKNOWN_SPEAKER,
} from "./meetingTranscript";

const sdkError = (message: string, code: number, subCode: number) =>
  Object.assign(new Error(message), { code, subCode });

describe("captionErrorText", () => {
  it("adds Teams' codes to the message", () => {
    expect(captionErrorText(sdkError("Captions feature is disabled in meeting policy.", 403, 45203))).toBe(
      "Captions feature is disabled in meeting policy. (403/45203)",
    );
  });
  it("keeps plain errors and strings readable", () => {
    expect(captionErrorText(new Error("Boom"))).toBe("Boom");
    expect(captionErrorText("nope")).toBe("nope");
    expect(captionErrorText(undefined)).toBe("Unknown error");
  });
});

describe("captionStartDecision", () => {
  const policy = sdkError(
    "Captions feature is disabled in meeting policy.",
    403,
    CAPTION_CODES.meetingPolicy,
  );

  it("treats captions someone else started as running", () => {
    const error = sdkError("Captions already active", 400, CAPTION_CODES.alreadyActive);
    expect(captionStartDecision({ error, attempt: 0 })).toEqual({ kind: "active" });
  });

  it("retries while the meeting's capabilities are still loading", () => {
    const decision = captionStartDecision({
      error: policy,
      attempt: 0,
      capability: { isPresent: false, reason: "NotInitialized" },
    });
    expect(decision).toMatchObject({ kind: "retry", delayMs: CAPTION_RETRY_DELAYS[0]! * 1000 });
  });

  it("gives up and names the policy when the organiser turned captions off", () => {
    const decision = captionStartDecision({
      error: policy,
      attempt: 0,
      capability: { isPresent: false, reason: "MeetingRestricted" },
    });
    expect(decision.kind).toBe("giveUp");
    expect(decision.kind === "giveUp" && decision.reason).toMatch(/MeetingRestricted.*organiser/);
    expect(decision.kind === "giveUp" && decision.reason).toMatch(/45203/);
  });

  it("gives up at once on errors no retry fixes", () => {
    const error = sdkError(
      "Spoken language requested is not supported.",
      400,
      CAPTION_CODES.languageUnsupported,
    );
    expect(captionStartDecision({ error, attempt: 0 }).kind).toBe("giveUp");
  });

  it("gives up after the last retry", () => {
    expect(captionStartDecision({ error: policy, attempt: CAPTION_RETRY_DELAYS.length - 1 }).kind).toBe(
      "retry",
    );
    expect(captionStartDecision({ error: policy, attempt: CAPTION_RETRY_DELAYS.length }).kind).toBe("giveUp");
  });

  it("knows a loading capability", () => {
    expect(capabilityPending({ isPresent: false, reason: "NotInitialized" })).toBe(true);
    expect(capabilityPending({ isPresent: true, reason: "Capable" })).toBe(false);
    expect(capabilityPending(undefined)).toBe(false);
  });
});

/** Feeds 100 ms frames: `pattern` has one character per frame, "#" voice and "." silence. */
function chunk(pattern: string, chunker = new SpeechChunker()): SpeechPiece[] {
  const out: SpeechPiece[] = [];
  [...pattern].forEach((c, i) => {
    const piece = chunker.push(i * 100, 100, c === "#" ? 0.1 : 0.001);
    if (piece) out.push(piece);
  });
  const rest = chunker.flush();
  if (rest) out.push(rest);
  return out;
}

describe("SpeechChunker", () => {
  it("ignores silence and starts a piece at the first voice", () => {
    const pieces = chunk(`${".".repeat(30)}${"#".repeat(50)}${".".repeat(10)}`);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]!.from).toBe(3000);
  });

  it("cuts at a silence once the piece is long enough", () => {
    const pieces = chunk(`${"#".repeat(45)}${".".repeat(8)}${"#".repeat(30)}`);
    expect(pieces).toHaveLength(2);
    expect(pieces[0]!.to).toBe(5200);
  });

  it("cuts long speech at ten seconds", () => {
    const pieces = chunk("#".repeat(250));
    expect(pieces.map((p) => p.to - p.from)).toEqual([10_000, 10_000, 5000]);
  });

  it("keeps a short remark followed by a long silence", () => {
    const pieces = chunk(`${"#".repeat(10)}${".".repeat(20)}`);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]!.voiceMs).toBe(1000);
  });

  it("drops clicks that are hardly any voice", () => {
    expect(chunk(`#${".".repeat(30)}##${".".repeat(30)}`)).toEqual([]);
  });
});

describe("attributePiece", () => {
  const alex = { id: "alex", name: "Alex" };
  const sam = { id: "sam", name: "Sam" };

  it("names whoever spoke through the piece", () => {
    expect(attributePiece([{ ...alex, from: 0, to: 9000 }], 1000, 8000)).toEqual(alex);
  });

  it("counts someone still speaking up to now", () => {
    expect(attributePiece([{ ...sam, from: 2000 }], 1000, 8000)).toEqual(sam);
  });

  it("adds up a person's spans", () => {
    const spans = [
      { ...alex, from: 0, to: 2000 },
      { ...alex, from: 3000, to: 7000 },
      { ...sam, from: 7000, to: 8000 },
    ];
    expect(attributePiece(spans, 0, 8000)).toEqual(alex);
  });

  it("says Unknown speaker when two people spoke about as much", () => {
    const spans = [
      { ...alex, from: 0, to: 4000 },
      { ...sam, from: 4000, to: 7000 },
    ];
    expect(attributePiece(spans, 0, 8000)).toEqual(UNKNOWN_SPEAKER);
  });

  it("says Unknown speaker when hardly anyone was marked as speaking", () => {
    expect(attributePiece([{ ...alex, from: 0, to: 1000 }], 0, 8000)).toEqual(UNKNOWN_SPEAKER);
    expect(attributePiece([], 0, 8000)).toEqual(UNKNOWN_SPEAKER);
  });

  it("forgets old spans but keeps open ones", () => {
    const spans = [
      { ...alex, from: 0, to: 1000 },
      { ...sam, from: 0 },
    ];
    expect(pruneSpans(spans, 120_000)).toEqual([{ ...sam, from: 0 }]);
  });
});

describe("Teams captions and the local transcript", () => {
  const none = { source: "none" as const, since: 0 };

  it("transcribes locally only after Teams captions failed and while it is allowed", () => {
    expect(nextSource(none, { teamsActive: false, teamsFailed: false, localAllowed: true }, 5)).toBe(none);
    expect(nextSource(none, { teamsActive: false, teamsFailed: true, localAllowed: true }, 5)).toEqual({
      source: "local",
      since: 5,
    });
    expect(nextSource(none, { teamsActive: false, teamsFailed: true, localAllowed: false }, 5)).toBe(none);
  });

  it("switches to Teams captions as soon as they run", () => {
    const local = { source: "local" as const, since: 5 };
    expect(nextSource(local, { teamsActive: true, teamsFailed: true, localAllowed: true }, 9)).toEqual({
      source: "teams",
      since: 9,
    });
  });

  it("keeps the same state object while nothing changes", () => {
    const local = { source: "local" as const, since: 5 };
    expect(nextSource(local, { teamsActive: false, teamsFailed: true, localAllowed: true }, 9)).toBe(local);
  });

  it("drops local pieces Teams' captions already have, without losing earlier ones", () => {
    const teams = { source: "teams" as const, since: 10_000 };
    expect(keepLocalPiece(teams, 2000, 9000)).toBe(true);
    expect(keepLocalPiece(teams, 6000, 12_000)).toBe(true);
    expect(keepLocalPiece(teams, 9000, 15_000)).toBe(false);
    expect(keepLocalPiece(teams, 11_000, 15_000)).toBe(false);
  });

  it("keeps pieces said while transcribing locally", () => {
    expect(keepLocalPiece({ source: "local", since: 1000 }, 2000, 9000)).toBe(true);
  });
});
