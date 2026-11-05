/**
 * The meeting transcript's pure logic (D-321): why Teams captions didn't start and whether to try
 * again, and the fallback that transcribes on this computer while they don't run: cutting audio
 * into pieces at silences, saying who spoke a piece, and switching between Teams captions and
 * the local transcript without writing a line twice.
 */

/** Teams' caption error codes (the calling SDK's `subCode`s) that mean something here. */
export const CAPTION_CODES = {
  disabled: 45201,
  languageUnsupported: 45202,
  meetingPolicy: 45203,
  callingPolicy: 45204,
  alreadyActive: 45217,
  alreadyStarting: 45219,
} as const;

/** A capability as the calling SDK reports it (`startLiveMeetingCaptions`…). */
export interface CaptionCapability {
  isPresent: boolean;
  reason: string;
}

/**
 * Reasons that name a policy: the organiser, your organisation, your role or your licence turned
 * captions off. Only these stop the tries, and only once the meeting's capabilities have arrived
 * (`early`). Any other reason (`FeatureNotSupported`, `NotCapable`…) isn't proof of a policy: right
 * after Connected the SDK reports them before the meeting's capabilities arrive (D-382).
 */
const RESTRICTED = new Set([
  "MeetingRestricted",
  "UserPolicyRestricted",
  "RoleRestricted",
  "TeamsPremiumLicenseRestricted",
]);

/** Reasons that mean the capability isn't known yet: wait for `capabilitiesChanged` before trying. */
const NOT_KNOWN_YET = new Set(["NotInitialized", "FeatureNotSupported"]);

/** Seconds to wait before each new try (after Connected the meeting's capabilities come late). */
export const CAPTION_RETRY_DELAYS = [2, 4, 8, 15, 30];

/** A restriction read this soon after Connected, before any `capabilitiesChanged`, gets one more try (D-382). */
export const CAPABILITY_GRACE_MS = 10_000;

/** The capability for the logs, e.g. "startLiveMeetingCaptions: not present (FeatureNotSupported)". */
export function capabilityText(name: string, capability?: CaptionCapability): string {
  if (!capability) return `${name}: unknown`;
  return `${name}: ${capability.isPresent ? "present" : "not present"} (${capability.reason || "no reason"})`;
}

/** The error's message with Teams' codes, e.g. "Captions feature is disabled in meeting policy. (403/45203)". */
export function captionErrorText(error: unknown): string {
  if (!error) return "Unknown error";
  const e = error as { message?: unknown; code?: unknown; subCode?: unknown };
  const message = typeof e.message === "string" && e.message ? e.message : String(error);
  const codes = [e.code, e.subCode].filter((c) => typeof c === "number" && c > 0);
  return codes.length ? `${message.replace(/\s+$/, "")} (${codes.join("/")})` : message;
}

export type CaptionStartDecision =
  | { kind: "active" }
  | { kind: "retry"; delayMs: number; reason: string }
  | { kind: "giveUp"; reason: string };

/**
 * What to do after captions failed to start: they are already on (someone else started them), try
 * again later (the meeting's capabilities hadn't arrived; Teams was still starting them), or stop
 * and say why. `attempt` counts the tries so far (0 = the first failed). `early`: the capability
 * was read before the meeting's capabilities arrived (within `CAPABILITY_GRACE_MS` of Connected and
 * no `capabilitiesChanged` yet), so even a policy reason gets one more try (D-382).
 */
export function captionStartDecision(input: {
  error: unknown;
  attempt: number;
  capability?: CaptionCapability;
  early?: boolean;
}): CaptionStartDecision {
  const { error, attempt, capability, early } = input;
  const subCode = (error as { subCode?: number } | undefined)?.subCode;
  if (subCode === CAPTION_CODES.alreadyActive) return { kind: "active" };
  const text = captionErrorText(error);
  const restricted = capability && !capability.isPresent && RESTRICTED.has(capability.reason);
  if (restricted && !(early && attempt === 0))
    return {
      kind: "giveUp",
      reason: `${text}. Teams says captions aren't allowed for you here (${capability.reason}): the organiser or your organisation's policy turned them off`,
    };
  if (subCode === CAPTION_CODES.disabled || subCode === CAPTION_CODES.languageUnsupported)
    return { kind: "giveUp", reason: text };
  const delay = CAPTION_RETRY_DELAYS[attempt];
  // Out of tries: say what Teams reported, without blaming a policy it didn't name.
  if (delay === undefined)
    return {
      kind: "giveUp",
      reason: capability && !capability.isPresent ? `${text}. Teams reported ${capability.reason}` : text,
    };
  return { kind: "retry", delayMs: delay * 1000, reason: text };
}

/** Whether the capability isn't known yet, so starting captions now would fail for nothing. */
export function capabilityPending(capability?: CaptionCapability): boolean {
  return Boolean(capability && !capability.isPresent && NOT_KNOWN_YET.has(capability.reason));
}

// ── Local transcription: pieces of audio ───────────────────────────────────────────────────────

export interface ChunkerOptions {
  /** Loudness (RMS) above which a frame counts as voice. */
  threshold: number;
  /** Silence (ms) that ends a piece once it is long enough. */
  silenceMs: number;
  /** A piece shorter than this waits for a longer silence or the maximum (ms). */
  minMs: number;
  /** A piece is cut here at the latest (ms). */
  maxMs: number;
  /** Pieces with less voice than this (ms) are dropped as noise. */
  minVoiceMs: number;
}

export const DEFAULT_CHUNKER: ChunkerOptions = {
  threshold: 0.012,
  silenceMs: 700,
  minMs: 4000,
  maxMs: 10_000,
  minVoiceMs: 400,
};

/** A piece to transcribe: start and end in ms on the stream's clock, and how much of it was voice. */
export interface SpeechPiece {
  from: number;
  to: number;
  voiceMs: number;
}

/**
 * Cuts a stream of audio frames into pieces of about 5–10 seconds, at a silence: a piece starts at
 * the first voiced frame, ends after `silenceMs` of quiet once it is `minMs` long (or at `maxMs`),
 * and pieces with almost no voice are dropped. Frames come in order with their loudness.
 */
export class SpeechChunker {
  private start?: number;
  private lastVoice = 0;
  private voiceMs = 0;
  private end = 0;
  constructor(private readonly options: ChunkerOptions = DEFAULT_CHUNKER) {}

  /** One frame (`at` its start, `ms` its length); returns a finished piece when this frame ends one. */
  push(at: number, ms: number, loudness: number): SpeechPiece | undefined {
    const voiced = loudness >= this.options.threshold;
    this.end = at + ms;
    if (this.start === undefined) {
      if (!voiced) return undefined;
      this.start = at;
      this.voiceMs = 0;
    }
    if (voiced) {
      this.lastVoice = at + ms;
      this.voiceMs += ms;
    }
    const length = this.end - this.start;
    const quiet = this.end - this.lastVoice;
    if (length >= this.options.maxMs || (length >= this.options.minMs && quiet >= this.options.silenceMs))
      return this.cut();
    // A short remark followed by a long silence is a piece of its own.
    if (quiet >= this.options.silenceMs * 2) return this.cut();
    return undefined;
  }

  /** What is left when the stream stops. */
  flush(): SpeechPiece | undefined {
    return this.start === undefined ? undefined : this.cut();
  }

  private cut(): SpeechPiece | undefined {
    const piece = { from: this.start!, to: this.end, voiceMs: this.voiceMs };
    this.start = undefined;
    this.voiceMs = 0;
    return piece.voiceMs >= this.options.minVoiceMs ? piece : undefined;
  }
}

// ── Local transcription: who spoke ─────────────────────────────────────────────────────────────

/** When someone in the call was speaking (ms; `to` missing while they still are). */
export interface SpeakingSpan {
  id: string;
  name: string;
  from: number;
  to?: number;
}

export const UNKNOWN_SPEAKER = { id: "unknown", name: "Unknown speaker" } as const;

/**
 * Who spoke a piece of the call's audio: the person whose speaking overlaps it most, when they
 * spoke for at least a third of it and at least twice as long as anyone else; otherwise "Unknown
 * speaker" (two people at once, or nobody marked as speaking).
 */
export function attributePiece(
  spans: SpeakingSpan[],
  from: number,
  to: number,
  now = to,
): { id: string; name: string } {
  const length = Math.max(1, to - from);
  const overlap = new Map<string, { name: string; ms: number }>();
  for (const s of spans) {
    const ms = Math.min(to, s.to ?? now) - Math.max(from, s.from);
    if (ms <= 0) continue;
    const entry = overlap.get(s.id) ?? { name: s.name, ms: 0 };
    entry.ms += ms;
    entry.name = s.name || entry.name;
    overlap.set(s.id, entry);
  }
  const ranked = [...overlap.entries()].sort((a, b) => b[1].ms - a[1].ms);
  const [best, second] = ranked;
  if (!best || best[1].ms < length / 3) return { ...UNKNOWN_SPEAKER };
  if (second && second[1].ms * 2 > best[1].ms) return { ...UNKNOWN_SPEAKER };
  return { id: best[0], name: best[1].name || UNKNOWN_SPEAKER.name };
}

/** Keeps only spans that may still overlap a piece (older than `keepMs` before `now` go). */
export function pruneSpans(spans: SpeakingSpan[], now: number, keepMs = 60_000): SpeakingSpan[] {
  return spans.filter((s) => s.to === undefined || s.to > now - keepMs);
}

// ── Teams captions ↔ local transcript ─────────────────────────────────────────────────────────

export type TranscriptSource = "teams" | "local" | "none";

/**
 * Which source writes the transcript: Teams captions whenever they run; the local transcript only
 * while they don't and it is switched on. `since` is when the current source took over (ms).
 */
export interface TranscriptSwitch {
  source: TranscriptSource;
  since: number;
}

export function nextSource(
  current: TranscriptSwitch,
  state: { teamsActive: boolean; teamsFailed: boolean; localAllowed: boolean },
  now: number,
): TranscriptSwitch {
  const source: TranscriptSource = state.teamsActive
    ? "teams"
    : state.teamsFailed && state.localAllowed
      ? "local"
      : "none";
  return source === current.source ? current : { source, since: now };
}

/**
 * Whether a locally transcribed piece (`from`–`to`) still goes into the transcript: only when it was
 * said while the local transcript was the source. A piece mostly said after Teams captions took
 * over is dropped, since Teams' captions have those words.
 */
export function keepLocalPiece(switchState: TranscriptSwitch, from: number, to: number): boolean {
  if (switchState.source === "local") return to > switchState.since;
  // Teams (or nothing) took over during or after the piece: keep it if most of it came before.
  const before = Math.min(to, switchState.since) - from;
  return before > (to - from) / 2;
}
