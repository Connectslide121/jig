import { errorMessage } from "../../../lib/host";
import { updateConfig, useConfig } from "../../../stores/config";
import { notify } from "../../../workbench/toasts";
import { useSessions } from "../../sessions/store";
import { playCue } from "../cues";
import { useDictation } from "../dictation";
import { Capture, FRAME, prepareSpeech, speechSettings, transcribe } from "../engine";
import { warmNaturalVoice } from "../naturalVoice";
import { cleanSpeech, level, SAMPLE_RATE } from "../protocol";
import { isNo, isYes } from "../replies";
import { speak, stopSpeaking } from "../speak";
import { useVoice } from "../voice";
import { cleanWords, isGreeting, matchWake, parseCommand } from "./match";
import { runCommand, type VoiceReply } from "./run";
import { recordWakeCheck, useWake, useWakeVoice } from "./state";
import { wakeThresholds } from "./tuning";

/**
 * "Hey Jig" (D-278): while Jig runs, the microphone is open and the voice detector (D-275) notices
 * speech. Whisper reads the first moments of each thing said; only when they start with "Hey Jig"
 * is the rest read, matched against the command list and run here, without Claude. Paused while
 * you talk with Claude or dictate (they have the microphone), and while Jig itself speaks.
 */

/** Frames (128 ms) of voice that start something said. */
const START_FRAMES = 2;
/** Audio kept from before the voice was noticed: a soft "hey" starts before the detector is sure (D-389). */
const PREROLL = 0.5 * SAMPLE_RATE;
/** How much of each thing said is read to look for "Hey Jig". */
const WAKE_WINDOW = 2 * SAMPLE_RATE;
/** The longest command. */
const MAX_COMMAND = 12 * SAMPLE_RATE;
/** A pause this long ends a command. */
const END_PAUSE = 0.8 * SAMPLE_RATE;
/** After "Hey Jig" alone, or a question Jig asked, how long it waits for you. */
const AWAKE_MS = 8000;
/**
 * What Whisper is told came just before when it reads the first moments (D-389), so it writes "Jig"
 * rather than "you", "big" or "geek": with it every "Hey Jig" of the test clips was heard. Milder
 * prompts ("Jig", "Jig.") made it drop a real "Hey Jig" as already said; two "Hey Jig" sentences made
 * it write "Hey Jig" for "Hey Jake". It bends the words after it too, so commands are read without it.
 */
export const WAKE_PROMPT = " Hey Jig, run the tests.";

/** Reads the first moments of something said, leaning towards "Jig" (D-389): only to find the wake words. */
export function transcribeWake(audio: Float32Array): Promise<string> {
  return transcribe(audio, speechSettings(), WAKE_PROMPT);
}

/** The trained profile, if any (D-389). */
function wakeProfile() {
  return useConfig.getState().config?.speech.wakeProfile ?? null;
}

let listener: WakeListener | undefined;

class WakeListener {
  private capture?: Capture;
  private stopped = false;
  private floor = 0.004;
  private loud = 0;
  /** Something is being said: from this index, last voice at `lastVoice`. */
  private from?: number;
  private lastVoice = 0;
  private voicedFrames = 0;
  /** The loudest frame and the highest voice score of what is being said, for the readout. */
  private peak = 0;
  private voiceMax?: number;
  /** The start didn't say "Hey Jig": the rest of it is ignored until the next pause. */
  private ignoring = false;
  private checking = false;
  /** Whether the start of what is being said had the wake words ("" = only them). */
  private woke?: string;
  private busy = false;
  /** "Hey Jig" alone, or Jig asked something: the next thing said is for Jig, until this time. */
  private awakeUntil = 0;
  private confirm?: NonNullable<VoiceReply["confirm"]>;
  private lastSaid = "";
  private readonly fake: boolean;

  constructor() {
    this.fake = speechSettings().fake;
  }

  async start(): Promise<void> {
    useWake.setState({ phase: "starting" });
    if (this.fake) {
      window.addEventListener("jig-fake-wake", this.fakeHeard);
      this.idle();
      return;
    }
    if (!(await prepareSpeech("wake", "continue"))) {
      // Declined the download: listening stays off until it is turned on again.
      void updateConfig({ speech: { wake: false } });
      return;
    }
    const capture = await Capture.open({ detectVoice: true });
    if (!capture || this.stopped) {
      capture?.close();
      if (!this.stopped) useWake.setState({ phase: "off" });
      return;
    }
    this.capture = capture;
    capture.onFrame = (frame, end, voice) => this.frame(frame, end, voice);
    this.idle();
  }

  stop(): void {
    this.stopped = true;
    window.removeEventListener("jig-fake-wake", this.fakeHeard);
    this.capture?.close();
    this.capture = undefined;
    useWake.setState({ phase: "off", heard: undefined });
  }

  /** Talking with Claude or dictation has the microphone; Jig is speaking or running something. */
  private paused(): boolean {
    return (
      this.busy ||
      useWake.getState().training ||
      useVoice.getState().phase !== "off" ||
      useDictation.getState().phase !== "idle"
    );
  }

  private idle(): void {
    if (this.stopped) return;
    const awake = Date.now() < this.awakeUntil;
    useWake.setState({ phase: awake ? "awake" : "listening" });
  }

  private reset(): void {
    this.from = undefined;
    this.loud = 0;
    this.ignoring = false;
    this.checking = false;
    this.woke = undefined;
    this.peak = 0;
    this.voiceMax = undefined;
  }

  private frame(frame: Float32Array, now: number, voice: number | undefined): void {
    const capture = this.capture;
    if (this.stopped || !capture) return;
    if (this.paused()) {
      this.reset();
      capture.forget(now);
      return;
    }
    const l = level(frame, 0, frame.length);
    this.floor = l < this.floor ? this.floor * 0.7 + l * 0.3 : this.floor * 0.998 + l * 0.002;
    this.floor = Math.max(this.floor, 0.002);
    const t = wakeThresholds(wakeProfile());
    const loud = l > Math.max(t.gate, this.floor * 3);
    const voiced = loud && (voice === undefined || voice >= t.start);
    if (voiced || this.from !== undefined) {
      this.peak = Math.max(this.peak, l);
      if (voice !== undefined) this.voiceMax = Math.max(this.voiceMax ?? 0, voice);
    }
    if (this.from === undefined) {
      this.loud = voiced ? this.loud + 1 : 0;
      if (!voiced) {
        this.peak = 0;
        this.voiceMax = undefined;
      }
      if (this.loud >= START_FRAMES) {
        this.from = Math.max(0, now - (this.loud + 1) * FRAME - PREROLL);
        this.lastVoice = now;
        this.voicedFrames = this.loud;
        this.loud = 0;
      } else capture.forget(now - SAMPLE_RATE);
      return;
    }
    const going = voice === undefined ? loud : voice >= t.keep && l > Math.max(t.keepGate, this.floor * 2);
    if (going) this.lastVoice = now;
    if (voiced) this.voicedFrames++;
    const ended = now - this.lastVoice > END_PAUSE;
    const awake = Date.now() < this.awakeUntil;
    // Not awake: read the first two seconds once, to see whether they start with "Hey Jig".
    if (
      !awake &&
      !ended &&
      !this.ignoring &&
      this.woke === undefined &&
      !this.checking &&
      now - this.from >= WAKE_WINDOW
    )
      void this.checkWake(this.from, Math.min(now, this.from + WAKE_WINDOW));
    if (ended || now - this.from > MAX_COMMAND) {
      const from = this.from;
      const ignored = this.ignoring;
      const woke = this.woke !== undefined;
      const voiced = (this.voicedFrames * FRAME) / SAMPLE_RATE;
      const stats = { level: this.peak, voice: this.voiceMax };
      this.reset();
      if (!ignored) void this.finish(from, now, voiced, woke, stats);
      capture.forget(now);
    }
  }

  private async checkWake(from: number, to: number): Promise<void> {
    if (!this.capture) return;
    this.checking = true;
    try {
      const text = cleanSpeech(await transcribeWake(this.capture.samples(from, to)), 2);
      const match = matchWake(text, wakeProfile()?.variants);
      const rest = match.rest;
      recordWakeCheck({
        at: Date.now(),
        text,
        woke: rest !== undefined,
        reason: match.reason,
        level: this.peak,
        voice: this.voiceMax,
      });
      if (this.from !== from) return;
      if (rest === undefined) this.ignoring = true;
      else {
        // The answer is spoken in a moment: the voice loads while you say the command (D-411).
        warmNaturalVoice();
        this.woke = rest;
        useWake.setState({ phase: "awake" });
      }
    } catch {
      if (this.from === from) this.ignoring = true;
    } finally {
      this.checking = false;
    }
  }

  /** Something said ended: read it all when it was for Jig. */
  private async finish(
    from: number,
    to: number,
    voiced: number,
    woke: boolean,
    stats: { level: number; voice?: number },
  ): Promise<void> {
    const capture = this.capture;
    if (!capture) return;
    const awake = Date.now() < this.awakeUntil;
    this.busy = true;
    try {
      // The command is read without the prompt, which would bend it ("open a new" → "… test").
      const audio = capture.samples(from, to);
      const text = cleanSpeech(await transcribe(audio), voiced);
      const learned = wakeProfile()?.variants;
      if (woke || awake || matchWake(text, learned).rest !== undefined) {
        await this.heard(text, awake, woke ? "woke" : stats);
        return;
      }
      // Short, and plainly not "Hey Jig": its first moments again, leaning towards "Jig", decide.
      const leaning = cleanSpeech(await transcribeWake(audio.subarray(0, WAKE_WINDOW)), voiced);
      const match = matchWake(leaning, learned);
      recordWakeCheck({
        at: Date.now(),
        text: leaning,
        woke: match.rest !== undefined,
        reason: match.reason,
        ...stats,
      });
      if (match.rest !== undefined) await this.heard(text, awake, "woke");
    } catch (error) {
      notify({ title: "Couldn't understand that", message: errorMessage(error), tone: "danger" });
    } finally {
      this.busy = false;
      this.idle();
    }
  }

  /**
   * What was said: `awake` = Jig was waiting for you, so "Hey Jig" isn't needed. `check`: "woke" when
   * its first moments were "Hey Jig" (already recorded), else how loud it was, for the readout.
   */
  private async heard(
    text: string,
    awake: boolean,
    check: "woke" | { level: number; voice?: number },
  ): Promise<void> {
    if (this.stopped) return;
    const match = matchWake(text, wakeProfile()?.variants);
    if (check !== "woke" && !awake)
      recordWakeCheck({
        at: Date.now(),
        text,
        woke: match.rest !== undefined,
        reason: match.reason,
        ...check,
      });
    // Woken by the first moments but the whole reads differently: the command is what follows them.
    const rest = match.rest ?? (awake ? text : check === "woke" ? afterGreeting(text) : undefined);
    if (rest === undefined) return;
    warmNaturalVoice();
    useWake.setState({ heard: rest || undefined });
    if (this.confirm && awake) {
      const confirm = this.confirm;
      this.confirm = undefined;
      if (isYes(rest)) return this.answer(await this.run(confirm.run));
      if (isNo(rest) || !rest) return this.say("Okay, I won't.");
    }
    this.confirm = undefined;
    if (!rest) {
      // "Hey Jig" alone: Jig is listening for the command.
      playCue("start");
      this.awakeUntil = Date.now() + AWAKE_MS;
      return;
    }
    this.awakeUntil = 0;
    const parsed = parseCommand(rest);
    if (!parsed) return this.say(`I didn't get that. Say "Hey Jig, what can I say" to hear the commands.`);
    if (parsed.command.id === "voice.repeat")
      return this.say(this.lastSaid || "I haven't said anything yet.");
    if (parsed.command.id === "voice.sleep") {
      await this.say("Okay, I've stopped listening. Click Hey Jig in the status bar to turn me on again.");
      void updateConfig({ speech: { wake: false } });
      return;
    }
    playCue("start");
    await this.answer(await this.run(() => runCommand(parsed)));
  }

  private async run(action: () => Promise<VoiceReply>): Promise<VoiceReply> {
    useWake.setState({ phase: "working" });
    try {
      return await action();
    } catch (error) {
      return { say: `That didn't work: ${errorMessage(error)}` };
    }
  }

  private async answer(reply: VoiceReply): Promise<void> {
    if (reply.confirm) {
      this.confirm = reply.confirm;
      await this.say(reply.confirm.question);
      this.awakeUntil = Date.now() + AWAKE_MS;
      return;
    }
    if (reply.say) await this.say(reply.say);
    if (reply.listen) this.awakeUntil = Date.now() + AWAKE_MS;
    reply.after?.();
  }

  /** Jig answers out loud (and on screen); the microphone doesn't listen meanwhile. */
  say(text: string): Promise<void> {
    this.lastSaid = text;
    useWake.setState({ said: text });
    if (this.fake || useWakeVoice.getState().muted) return Promise.resolve();
    useWake.setState({ phase: "speaking" });
    this.busy = true;
    return new Promise((resolve) => {
      const done = () => {
        this.busy = false;
        this.capture?.forget(this.capture.length);
        this.idle();
        resolve();
      };
      speak(text, { onEnd: done });
      // Never stuck: a voice that doesn't end in time is cut.
      setTimeout(() => {
        if (this.busy && useWake.getState().phase === "speaking") {
          stopSpeaking();
          done();
        }
      }, 30_000);
    });
  }

  /** Tests: the fake engine "hears" `jig-fake-wake` events (the whole thing said). */
  private readonly fakeHeard = (event: Event) => {
    // The training hears these as takes.
    if (useWake.getState().training) return;
    const text = String((event as CustomEvent<string>).detail ?? "");
    void this.heard(text, Date.now() < this.awakeUntil, { level: 0 }).finally(() => this.idle());
  };
}

/** `text` as words, without its first `n`. */
function wordsAfter(text: string, n: number): string {
  return cleanWords(text).split(" ").slice(n).join(" ");
}

/** What follows the misheard wake words: "Hey, you open a new chat" → "open a new chat". */
function afterGreeting(text: string): string {
  return wordsAfter(text, isGreeting(cleanWords(text).split(" ")[0]) ? 2 : 1);
}

/** Says something as Jig, while listening is on (announcements); nothing otherwise. */
export function sayAsJig(text: string): void {
  if (!listener || useWakeVoice.getState().muted || useVoice.getState().phase !== "off") return;
  void listener.say(text);
}

/** Says when a chat finishes or needs you (`speech.announce`), except the one you're talking to. */
function followAnnouncements(): () => void {
  let before = useSessions.getState().metas;
  return useSessions.subscribe((s) => {
    const previous = before;
    before = s.metas;
    if (!listener || !useConfig.getState().config?.speech.announce) return;
    for (const meta of Object.values(s.metas)) {
      const was = previous[meta.id]?.status;
      if (!was || was === meta.status || meta.kind === "builder") continue;
      if (useVoice.getState().target === meta.id) continue;
      // A chat started working: its "done" will be said, so the voice is loaded by then (D-411).
      if (meta.status === "working" || meta.status === "starting") {
        if (!useWakeVoice.getState().muted) warmNaturalVoice();
        continue;
      }
      const name = meta.title || "A chat";
      if (meta.status === "needs_you") sayAsJig(`${name} needs you.`);
      else if (meta.status === "idle" && (was === "working" || was === "starting"))
        sayAsJig(`${name} is done.`);
      else if (meta.status === "error") sayAsJig(`${name} stopped with an error.`);
    }
  });
}

/** Starts or stops listening to follow `speech.wake`, and speaks announcements. Call once at startup. */
export function followWakeSetting(): () => void {
  const unannounce = followAnnouncements();
  const apply = (on: boolean) => {
    if (on && !listener) {
      listener = new WakeListener();
      void listener.start().catch((error: unknown) => {
        notify({ title: "Couldn't listen for Hey Jig", message: errorMessage(error), tone: "danger" });
        listener?.stop();
        listener = undefined;
      });
    } else if (!on && listener) {
      listener.stop();
      listener = undefined;
    }
  };
  apply(Boolean(useConfig.getState().config?.speech.wake));
  const unfollow = useConfig.subscribe((s) => apply(Boolean(s.config?.speech.wake)));
  return () => {
    unfollow();
    unannounce();
    apply(false);
  };
}
