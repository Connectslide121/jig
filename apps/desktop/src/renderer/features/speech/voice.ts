import { create } from "zustand";
import type { ChatItem, PermissionMode } from "../../../shared/engine";
import { call, errorMessage } from "../../lib/host";
import { notify } from "../../workbench/toasts";
import { ensureTranscript, useSessions } from "../sessions/store";
import { followWork, playCue, unfollowWork, WorkCue } from "./cues";
import { cancelDictation, type DictationText, useDictation } from "./dictation";
import { Capture, LiveText, prepareSpeech, speechSettings } from "./engine";
import { amplitude, meters, sliceLevels } from "./meter";
import { level, SAMPLE_RATE } from "./protocol";
import {
  isEnd,
  isGoAhead,
  isNo,
  isQueueTool,
  isYes,
  permissionPrompt,
  planOf,
  toolActivity,
  type VoicePlan,
} from "./replies";
import { speakableText, speakableUntil, voiceUtterance } from "./speak";

/**
 * Talking with Claude (D-209, D-210): Jig listens; when you pause, what you said is sent; Claude's
 * reply is read aloud sentence by sentence as it is written; speaking over it stops it. Claude looks
 * at the code to help you plan (plan mode: it reads, never changes). When you give the go-ahead,
 * the plan is approved, talking ends and Claude works as in any chat, with a soft sound while it
 * works. For bigger work Claude may propose a task queue instead (D-218): approving it queues the
 * tasks and starts the queue. "Bye" only ends talking, never the chat or Claude's work.
 */
export type VoicePhase = "off" | "starting" | "listening" | "hearing" | "thinking" | "speaking";

/** A line of the conversation, as shown in the talking window. */
export interface VoiceLine {
  id: number;
  who: "you" | "claude";
  text: string;
}

export interface VoiceState {
  phase: VoicePhase;
  /** The chat being talked to (kept after talking ends, so the window can close smoothly). */
  target?: string;
  /** What Claude is saying now. */
  said?: string;
  /** Your words while you speak. */
  hearing?: string;
  /** The conversation so far. */
  lines: VoiceLine[];
  /** What Claude is doing while it thinks ("Searching the code"). */
  activity?: string;
  /** The plan Claude asks to start (ExitPlanMode, or a task queue), while it waits for your answer. */
  plan?: VoicePlan;
  /** The microphone is muted (Jig doesn't hear you). */
  muted: boolean;
  /** You gave the go-ahead before the plan was written: it is approved as soon as it comes. */
  handing: boolean;
}

export const useVoice = create<VoiceState>(() => ({ phase: "off", lines: [], muted: false, handing: false }));

/** What the conversation needs from the chat's message box. */
export interface VoiceHooks {
  /** Shows what you are saying in the message box (as dictation does). */
  onText: DictationText;
  /** Sends what is in the message box. */
  send: () => void;
}

/** Frames (128 ms) of speech that start your turn, or interrupt Claude while it speaks. */
const START_FRAMES = 2;
const BARGE_IN_FRAMES = 3;
/** The longest turn; it is sent after this even if you keep talking. */
const MAX_TURN = 120 * SAMPLE_RATE;
/** Audio kept from before your voice was noticed. */
const PREROLL = 0.3 * SAMPLE_RATE;
/** Claude's voice lingers in the room a moment after it stops. */
const ECHO_TAIL_MS = 350;
/** Lines kept in the talking window. */
const MAX_LINES = 200;
/** What the Go ahead button says when Claude hasn't shown a plan yet. */
export const GO_AHEAD_MESSAGE = "Go ahead, start working.";

let active: Conversation | undefined;
let lineId = 0;

/** Starts talking with Claude in a chat. */
export async function startVoice(target: string, hooks: VoiceHooks): Promise<void> {
  if (active || useVoice.getState().phase !== "off") return;
  unfollowWork(target);
  useVoice.setState({
    phase: "starting",
    target,
    said: undefined,
    hearing: undefined,
    lines: [],
    activity: undefined,
    plan: undefined,
    muted: false,
    handing: false,
  });
  const s = speechSettings();
  try {
    if (useDictation.getState().phase === "recording") cancelDictation();
    let capture: Capture | undefined;
    if (!s.fake) {
      if (!(await prepareSpeech(target, "continue"))) {
        off();
        return;
      }
      capture = await Capture.open();
      if (!capture) {
        off();
        return;
      }
    }
    await ensureTranscript(target);
    await call("sessions.setVoice", { id: target, voice: true });
    active = new Conversation(target, hooks, capture, s.fake, s.pause);
    await active.begin();
  } catch (error) {
    active?.stop();
    off();
    notify({ title: "Couldn't start talking", message: errorMessage(error), tone: "danger" });
  }
}

/** Stops talking: the microphone closes and Claude stops speaking. The chat and its work go on. */
export function stopVoice(): void {
  if (active) active.stop();
  else off();
}

export function toggleVoice(target: string, hooks: VoiceHooks): void {
  const { phase, target: current } = useVoice.getState();
  if (phase === "off") void startVoice(target, hooks);
  else if (current === target && phase !== "starting") stopVoice();
}

/** The Go ahead button: approves the plan (or asks Claude for it) and hands the work over. */
export function goAhead(): void {
  void active?.goAhead();
}

/** Mutes or unmutes the microphone while talking. */
export function setVoiceMuted(muted: boolean): void {
  active?.mute(muted);
}

/** Stops Claude's voice (the rest of what it was saying is skipped). */
export function hushVoice(): void {
  active?.quiet();
}

function off(): void {
  active = undefined;
  meters.you.clear();
  meters.claude.clear();
  useVoice.setState({ phase: "off", hearing: undefined, activity: undefined, handing: false });
}

function addLine(who: VoiceLine["who"], text: string): void {
  useVoice.setState((s) => ({ lines: [...s.lines.slice(1 - MAX_LINES), { id: ++lineId, who, text }] }));
}

const BUSY = new Set(["working", "starting"]);

const samePlan = (a: VoicePlan | undefined, b: VoicePlan) => JSON.stringify(a) === JSON.stringify(b);

type PermissionItem = Extract<ChatItem, { kind: "permission" }>;

class Conversation {
  private phase: VoicePhase = "listening";
  private stopped = false;
  private muted = false;
  /** Noise floor of the room, learnt as you go. */
  private floor = 0.004;
  private loud = 0;
  private live?: LiveText;
  private lastVoice = 0;
  private turnStart = 0;
  private quietUntil = 0;
  /** Chat items there before you started talking: not read aloud. */
  private readonly before = new Set<string>();
  /** How much of each of Claude's messages has been read. */
  private readonly spoken = new Map<string, number>();
  /** Messages you interrupted: the rest isn't read. */
  private readonly skipped = new Set<string>();
  private readonly prompted = new Set<string>();
  private readonly queue: string[] = [];
  private speaking?: () => void;
  private unsubscribe?: () => void;
  /** The permission mode before talking put the chat in plan mode (put back when you say bye). */
  private originalMode?: PermissionMode;
  /** The mode Claude works in once you approve the plan. */
  private workMode: PermissionMode = "acceptEdits";
  /** You gave the go-ahead: approve the plan as soon as Claude shows it. */
  private approveNext = false;
  /** The soft working sound while Claude thinks or looks at the code. */
  private readonly cue = new WorkCue();
  private fakeVoice?: ReturnType<typeof setInterval>;
  /** The plan on screen (kept as the same object while it doesn't change). */
  private shown?: VoicePlan;

  constructor(
    private readonly target: string,
    private readonly hooks: VoiceHooks,
    private readonly capture: Capture | undefined,
    private readonly fake: boolean,
    private readonly pause: number,
  ) {}

  async begin(): Promise<void> {
    const { metas, transcripts } = useSessions.getState();
    for (const item of transcripts[this.target]?.items ?? []) {
      if (item.kind !== "permission" || item.status !== "pending") this.before.add(item.id);
    }
    const meta = metas[this.target];
    // Work it out together first: plan mode, and Claude starts when you approve the plan.
    if (meta && !BUSY.has(meta.status) && meta.permissionMode !== "plan") {
      this.originalMode = meta.permissionMode;
      if (meta.permissionMode === "bypassPermissions") this.workMode = meta.permissionMode;
      await call("sessions.setPermissionMode", { id: this.target, mode: "plan" }).catch(() => undefined);
    }
    if (this.capture) this.capture.onFrame = (frame) => this.frame(frame);
    if (this.fake) window.addEventListener("jig-fake-speech", this.fakeSpeech);
    this.unsubscribe = useSessions.subscribe(() => this.scan());
    this.set("listening");
    this.scan();
  }

  /**
   * Ends talking. `handOff`: you gave the go-ahead and Claude is starting; otherwise ("bye", the
   * close button) the chat goes back to how it was when it is idle. Claude's work is never stopped.
   */
  stop(handOff = false): void {
    if (this.stopped) return;
    this.stopped = true;
    this.unsubscribe?.();
    this.cue.stop();
    clearInterval(this.fakeVoice);
    window.removeEventListener("jig-fake-speech", this.fakeSpeech);
    if (this.live) {
      this.live.cancel();
      this.hooks.onText("", true);
    }
    this.capture?.close();
    this.queue.length = 0;
    window.speechSynthesis?.cancel();
    const id = this.target;
    void call("sessions.setVoice", { id, voice: false }).catch(() => undefined);
    const meta = useSessions.getState().metas[id];
    // Talking put the chat in plan mode: once it is idle again, it goes back to how it was.
    const original = this.originalMode;
    const restore = () => {
      const now = useSessions.getState().metas[id];
      if (original && now?.permissionMode === "plan" && now.status === "idle" && !this.pendingPermission())
        void call("sessions.setPermissionMode", { id, mode: original }).catch(() => undefined);
    };
    if (handOff) followWork(id);
    else if (meta && BUSY.has(meta.status)) followWork(id, restore);
    else restore();
    off();
  }

  mute(muted: boolean): void {
    if (this.stopped || !this.capture) {
      useVoice.setState({ muted });
      this.muted = muted;
      return;
    }
    this.muted = muted;
    useVoice.setState({ muted });
    meters.you.clear();
    if (muted && this.live) {
      this.live.cancel();
      this.live = undefined;
      this.text("", true);
      this.settle(true);
    }
  }

  /** Stops Claude's voice now. */
  quiet(): void {
    this.hush();
    this.settle();
  }

  private set(phase: VoicePhase): void {
    this.phase = phase;
    if (this.stopped) return;
    useVoice.setState({ phase });
    // A soft sound while Claude thinks or looks at the code, so you know it is still there.
    if (phase === "thinking") this.cue.start(1500);
    else this.cue.stop();
    if (phase !== "speaking") meters.claude.clear();
  }

  /** Your words while you speak, in the message box and the talking window. */
  private text(words: string, final: boolean): void {
    this.hooks.onText(words, final);
    useVoice.setState({ hearing: final ? undefined : words });
  }

  /** Back to listening or waiting for Claude, once nothing else is going on. */
  private settle(force = false): void {
    if (this.stopped || (!force && this.phase === "hearing") || this.speaking) return;
    const meta = useSessions.getState().metas[this.target];
    if (!meta) {
      this.stop();
      return;
    }
    this.set(BUSY.has(meta.status) ? "thinking" : "listening");
  }

  // ── Hearing you ──────────────────────────────────────────────────────────

  private frame(frame: Float32Array): void {
    if (this.stopped || !this.capture || this.muted) return;
    meters.you.push(sliceLevels(frame, 8).map(amplitude), performance.now());
    const now = this.capture.length;
    const l = level(frame, 0, frame.length);
    this.floor = l < this.floor ? this.floor * 0.7 + l * 0.3 : this.floor * 0.998 + l * 0.002;
    this.floor = Math.max(this.floor, 0.002);
    const speaking = Boolean(this.speaking) || Date.now() < this.quietUntil;
    const voiced = l > (speaking ? Math.max(0.04, this.floor * 6) : Math.max(0.012, this.floor * 3));
    if (this.phase === "hearing") {
      if (voiced) this.lastVoice = now;
      if ((now - this.lastVoice) / SAMPLE_RATE > this.pause / 1000 || now - this.turnStart > MAX_TURN)
        void this.endTurn();
      return;
    }
    this.loud = voiced ? this.loud + 1 : 0;
    if (this.loud >= (speaking ? BARGE_IN_FRAMES : START_FRAMES)) {
      if (speaking) this.hush();
      this.beginTurn(Math.max(0, now - (this.loud + 1) * frame.length - PREROLL));
    } else if (!this.live) this.capture.forget(now - 2 * SAMPLE_RATE);
  }

  private beginTurn(from: number): void {
    if (!this.capture) return;
    this.loud = 0;
    this.turnStart = from;
    this.lastVoice = this.capture.length;
    this.set("hearing");
    this.live = new LiveText(this.capture, from, (text) => {
      if (this.live) this.text(text, false);
    });
  }

  private async endTurn(): Promise<void> {
    const live = this.live;
    if (!live) return;
    this.set("thinking");
    let text = "";
    try {
      text = await live.finish();
    } catch (error) {
      notify({ title: "Couldn't understand that", message: errorMessage(error), tone: "danger" });
    }
    if (this.live === live) this.live = undefined;
    if (this.stopped) return;
    await this.heard(text);
  }

  /** Tests: the fake engine "hears" `jig-fake-speech` events, and the waves move a little. */
  private readonly fakeSpeech = (event: Event) => {
    if (this.muted) return;
    const text = String((event as CustomEvent<string>).detail ?? "");
    this.hush();
    this.set("hearing");
    this.text(text, false);
    clearInterval(this.fakeVoice);
    this.fakeVoice = setInterval(() => meters.you.pulse(0.4 + Math.random() * 0.5), 60);
    setTimeout(() => {
      clearInterval(this.fakeVoice);
      void this.heard(text);
    }, 500);
  };

  /** You said something: an answer to what Claude asked, the go-ahead, or a message. */
  private async heard(spoken: string): Promise<void> {
    const text = spoken.trim();
    if (!text) {
      this.text("", true);
      this.settle(true);
      return;
    }
    addLine("you", text);
    if (isEnd(text)) {
      this.text("", true);
      this.stop();
      return;
    }
    const pending = this.pendingPermission();
    const meta = useSessions.getState().metas[this.target];
    this.set("thinking");
    try {
      if (pending) {
        this.text("", true);
        await this.answer(pending, text);
      } else if (meta && BUSY.has(meta.status) && isNo(text)) {
        this.text("", true);
        await call("sessions.interrupt", { id: this.target });
      } else if (isGoAhead(text)) {
        this.text("", true);
        await this.goAhead(text);
      } else {
        this.text(text, true);
        this.hooks.send();
      }
    } catch (error) {
      notify({ title: "Couldn't send that", message: errorMessage(error), tone: "danger" });
    }
    this.settle(true);
  }

  /**
   * The go-ahead: approves the plan Claude showed; before that, tells Claude to go ahead (it shows
   * its plan, which is approved as it comes). Either way talking ends once Claude starts.
   */
  async goAhead(spoken?: string): Promise<void> {
    if (this.stopped) return;
    const pending = this.pendingPermission();
    if (pending && planOf(pending.request)) {
      await this.approvePlan(pending);
      return;
    }
    if (!spoken) addLine("you", GO_AHEAD_MESSAGE);
    const text = spoken ?? GO_AHEAD_MESSAGE;
    const meta = useSessions.getState().metas[this.target];
    this.hush();
    await call("sessions.send", { id: this.target, text });
    if (meta?.permissionMode === "plan") {
      this.approveNext = true;
      useVoice.setState({ handing: true });
      this.settle(true);
    } else this.handOff();
  }

  private async approvePlan(item: PermissionItem): Promise<void> {
    const id = this.target;
    const { toolName, input } = item.request;
    if (isQueueTool(toolName)) {
      // The tasks run in their own chats; this one stays as it was and only says it queued them.
      await call("sessions.answerPermission", {
        id,
        requestId: item.request.requestId,
        decision: { behavior: "allow", updatedInput: { ...input, start: true } },
      });
      this.handOff(true);
      return;
    }
    await call("sessions.setPermissionMode", { id, mode: this.workMode }).catch(() => undefined);
    await call("sessions.answerPermission", {
      id,
      requestId: item.request.requestId,
      decision: { behavior: "allow" },
    });
    this.handOff();
  }

  /**
   * Claude starts working: talking ends, and a sound plays while it works. `queued`: the work went
   * to the task queue, so this chat goes back to how it was.
   */
  private handOff(queued = false): void {
    if (this.stopped) return;
    const line = queued ? "Queued. Starting the tasks now." : "Starting now.";
    addLine("claude", line);
    this.stop(!queued);
    playCue("start");
    const synth = window.speechSynthesis;
    if (!this.fake && synth) synth.speak(voiceUtterance(line));
  }

  private pendingPermission(): PermissionItem | undefined {
    const items = useSessions.getState().transcripts[this.target]?.items ?? [];
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i]!;
      if (item.kind === "permission" && item.status === "pending") return item;
    }
    return undefined;
  }

  private async answer(item: PermissionItem, text: string): Promise<void> {
    const id = this.target;
    const { requestId, toolName } = item.request;
    const respond = (decision: { behavior: "allow" } | { behavior: "deny"; message?: string }) =>
      call("sessions.answerPermission", { id, requestId, decision });
    if (planOf(item.request)) {
      if (isYes(text) || isGoAhead(text)) await this.approvePlan(item);
      else
        await respond({
          behavior: "deny",
          message: isNo(text)
            ? "The user doesn't want to start yet; ask what to change."
            : `The user wants changes to the ${isQueueTool(toolName) ? "tasks" : "plan"}: ${text}`,
        });
    } else if (toolName === "AskUserQuestion")
      await respond({ behavior: "deny", message: `The user answered by voice: ${text}` });
    else if (isYes(text)) await respond({ behavior: "allow" });
    else await respond({ behavior: "deny", message: isNo(text) ? undefined : `The user said: ${text}` });
  }

  // ── Speaking Claude's replies ────────────────────────────────────────────

  /** Reads what Claude wrote since last time, sentence by sentence. */
  private scan(): void {
    if (this.stopped) return;
    const { transcripts, metas } = useSessions.getState();
    const meta = metas[this.target];
    if (!meta) {
      this.stop();
      return;
    }
    let activity: string | undefined;
    let plan: VoicePlan | undefined;
    for (const item of transcripts[this.target]?.items ?? []) {
      if (this.before.has(item.id)) continue;
      if (item.kind === "assistant" && !item.parentId && !this.skipped.has(item.id)) {
        const from = this.spoken.get(item.id) ?? 0;
        const end = speakableUntil(item.text, from, !item.streaming);
        if (end > from) {
          this.spoken.set(item.id, end);
          this.say(speakableText(item.text.slice(from, end)));
        }
      } else if (item.kind === "tool") {
        activity = item.status === "running" ? toolActivity(item.name, item.input) : undefined;
      } else if (item.kind === "permission" && item.status === "pending") {
        const asked = planOf(item.request);
        if (asked) plan = samePlan(this.shown, asked) ? this.shown : asked;
        if (this.prompted.has(item.id)) continue;
        this.prompted.add(item.id);
        if (asked && this.approveNext) {
          this.approveNext = false;
          void this.approvePlan(item).catch((error: unknown) =>
            notify({ title: "Couldn't start the plan", message: errorMessage(error), tone: "danger" }),
          );
          return;
        }
        this.say(permissionPrompt(item.request));
      }
    }
    if (!BUSY.has(meta.status)) activity = undefined;
    const state = useVoice.getState();
    this.shown = plan;
    if (state.activity !== activity || state.plan !== plan) useVoice.setState({ activity, plan });
    this.settle();
  }

  private say(text: string): void {
    if (!text.trim()) return;
    addLine("claude", text);
    this.queue.push(text);
    this.pump();
  }

  private pump(): void {
    if (this.speaking || this.stopped) return;
    const text = this.queue.shift();
    if (text === undefined) {
      this.settle();
      return;
    }
    useVoice.setState({ said: text });
    if (this.phase !== "hearing") this.set("speaking");
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wobble: ReturnType<typeof setInterval> | undefined;
    const done = () => {
      clearTimeout(timer);
      clearInterval(wobble);
      if (this.speaking !== done) return;
      this.speaking = undefined;
      this.quietUntil = Date.now() + ECHO_TAIL_MS;
      this.pump();
    };
    this.speaking = done;
    const synth = window.speechSynthesis;
    if (this.fake || !synth) {
      wobble = setInterval(() => meters.claude.pulse(0.4 + Math.random() * 0.5), 70);
      timer = setTimeout(done, 300);
      return;
    }
    const utterance = voiceUtterance(text);
    utterance.onend = done;
    utterance.onerror = done;
    // The system's voice gives no sound to measure: each word is a pulse in the waves.
    utterance.onstart = () => meters.claude.pulse(0.7);
    utterance.onboundary = () => meters.claude.pulse(0.5 + Math.random() * 0.5);
    // Some systems never say the voice ended.
    timer = setTimeout(done, 3000 + (text.length * 120) / utterance.rate);
    synth.speak(utterance);
  }

  /** You started talking: Claude stops speaking, and the rest of what it was saying is skipped. */
  private hush(): void {
    this.queue.length = 0;
    const items = useSessions.getState().transcripts[this.target]?.items ?? [];
    for (const item of items)
      if (item.kind === "assistant" && this.spoken.has(item.id)) this.skipped.add(item.id);
    const wasSpeaking = this.speaking;
    this.speaking = undefined;
    meters.claude.clear();
    if (wasSpeaking) window.speechSynthesis?.cancel();
  }
}
