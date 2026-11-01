import { create } from "zustand";
import type { ChatItem, PermissionMode } from "../../../shared/engine";
import { call, errorMessage } from "../../lib/host";
import { notify } from "../../workbench/toasts";
import { ensureTranscript, useSessions } from "../sessions/store";
import { cancelDictation, type DictationText, useDictation } from "./dictation";
import { Capture, LiveText, prepareSpeech, speechSettings } from "./engine";
import { level, SAMPLE_RATE } from "./protocol";
import { isEnd, isNo, isYes, permissionPrompt } from "./replies";
import { speakableText, speakableUntil, voiceUtterance } from "./speak";

/**
 * Talking with Claude (D-209): Jig listens; when you pause, what you said is sent; Claude's reply is
 * read aloud sentence by sentence as it is written; speaking over it stops it. When Claude asks to
 * start its plan (or to use a tool), "yes" approves it and anything else goes back as feedback.
 */
export type VoicePhase = "off" | "starting" | "listening" | "hearing" | "thinking" | "speaking";

export const useVoice = create<{ phase: VoicePhase; target?: string; said?: string }>(() => ({
  phase: "off",
}));

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

let active: Conversation | undefined;

/** Starts talking with Claude in a chat. */
export async function startVoice(target: string, hooks: VoiceHooks): Promise<void> {
  if (active || useVoice.getState().phase !== "off") return;
  useVoice.setState({ phase: "starting", target, said: undefined });
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

/** Stops talking: the microphone closes and Claude stops speaking. */
export function stopVoice(): void {
  if (active) active.stop();
  else off();
}

export function toggleVoice(target: string, hooks: VoiceHooks): void {
  const { phase, target: current } = useVoice.getState();
  if (phase === "off") void startVoice(target, hooks);
  else if (current === target && phase !== "starting") stopVoice();
}

function off(): void {
  active = undefined;
  useVoice.setState({ phase: "off", target: undefined });
}

const BUSY = new Set(["working", "starting"]);

class Conversation {
  private phase: VoicePhase = "listening";
  private stopped = false;
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
  /** The permission mode before talking put the chat in plan mode. */
  private workMode: PermissionMode = "acceptEdits";

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
      if (meta.permissionMode === "bypassPermissions") this.workMode = meta.permissionMode;
      await call("sessions.setPermissionMode", { id: this.target, mode: "plan" }).catch(() => undefined);
    }
    if (this.capture) this.capture.onFrame = (frame) => this.frame(frame);
    if (this.fake) window.addEventListener("jig-fake-speech", this.fakeSpeech);
    this.unsubscribe = useSessions.subscribe(() => this.scan());
    this.set("listening");
    this.scan();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.unsubscribe?.();
    window.removeEventListener("jig-fake-speech", this.fakeSpeech);
    if (this.live) {
      this.live.cancel();
      this.hooks.onText("", true);
    }
    this.capture?.close();
    this.queue.length = 0;
    window.speechSynthesis?.cancel();
    void call("sessions.setVoice", { id: this.target, voice: false }).catch(() => undefined);
    off();
  }

  private set(phase: VoicePhase): void {
    this.phase = phase;
    if (!this.stopped) useVoice.setState({ phase });
  }

  /** Back to listening or waiting for Claude, once nothing else is going on. */
  private settle(): void {
    if (this.stopped || this.phase === "hearing" || this.speaking) return;
    const meta = useSessions.getState().metas[this.target];
    if (!meta) {
      this.stop();
      return;
    }
    this.set(BUSY.has(meta.status) ? "thinking" : "listening");
  }

  // ── Hearing you ──────────────────────────────────────────────────────────

  private frame(frame: Float32Array): void {
    if (this.stopped || !this.capture) return;
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
      if (this.live) this.hooks.onText(text, false);
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

  private readonly fakeSpeech = (event: Event) => {
    const text = String((event as CustomEvent<string>).detail ?? "");
    this.hush();
    this.set("hearing");
    this.hooks.onText(text, false);
    setTimeout(() => void this.heard(text), 200);
  };

  /** You said something: an answer to what Claude asked, or a message. */
  private async heard(spoken: string): Promise<void> {
    const text = spoken.trim();
    if (!text) {
      this.hooks.onText("", true);
      this.set("listening");
      this.settle();
      return;
    }
    if (isEnd(text)) {
      this.hooks.onText("", true);
      this.stop();
      return;
    }
    const pending = this.pendingPermission();
    const meta = useSessions.getState().metas[this.target];
    this.set("thinking");
    try {
      if (pending) {
        this.hooks.onText("", true);
        await this.answer(pending, text);
      } else if (meta && BUSY.has(meta.status) && isNo(text)) {
        this.hooks.onText("", true);
        await call("sessions.interrupt", { id: this.target });
      } else {
        this.hooks.onText(text, true);
        this.hooks.send();
      }
    } catch (error) {
      notify({ title: "Couldn't send that", message: errorMessage(error), tone: "danger" });
    }
    this.settle();
  }

  private pendingPermission(): Extract<ChatItem, { kind: "permission" }> | undefined {
    const items = useSessions.getState().transcripts[this.target]?.items ?? [];
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i]!;
      if (item.kind === "permission" && item.status === "pending") return item;
    }
    return undefined;
  }

  private async answer(item: Extract<ChatItem, { kind: "permission" }>, text: string): Promise<void> {
    const id = this.target;
    const { requestId, toolName } = item.request;
    const respond = (decision: { behavior: "allow" } | { behavior: "deny"; message?: string }) =>
      call("sessions.answerPermission", { id, requestId, decision });
    if (toolName === "ExitPlanMode") {
      if (isYes(text)) {
        await call("sessions.setPermissionMode", { id, mode: this.workMode }).catch(() => undefined);
        await respond({ behavior: "allow" });
      } else
        await respond({
          behavior: "deny",
          message: isNo(text)
            ? "The user doesn't want to start yet; ask what to change."
            : `The user wants changes to the plan: ${text}`,
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
    if (!metas[this.target]) {
      this.stop();
      return;
    }
    for (const item of transcripts[this.target]?.items ?? []) {
      if (this.before.has(item.id)) continue;
      if (item.kind === "assistant" && !item.parentId && !this.skipped.has(item.id)) {
        const from = this.spoken.get(item.id) ?? 0;
        const end = speakableUntil(item.text, from, !item.streaming);
        if (end > from) {
          this.spoken.set(item.id, end);
          this.say(speakableText(item.text.slice(from, end)));
        }
      } else if (item.kind === "permission" && item.status === "pending" && !this.prompted.has(item.id)) {
        this.prompted.add(item.id);
        this.say(permissionPrompt(item.request));
      }
    }
    this.settle();
  }

  private say(text: string): void {
    if (!text.trim()) return;
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
    const done = () => {
      if (this.speaking !== done) return;
      clearTimeout(timer);
      this.speaking = undefined;
      this.quietUntil = Date.now() + ECHO_TAIL_MS;
      this.pump();
    };
    this.speaking = done;
    const synth = window.speechSynthesis;
    if (this.fake || !synth) {
      timer = setTimeout(done, 300);
      return;
    }
    const utterance = voiceUtterance(text);
    utterance.onend = done;
    utterance.onerror = done;
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
    if (wasSpeaking) window.speechSynthesis?.cancel();
  }
}
