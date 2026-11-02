import type { FromVoiceHost, ToVoiceHost } from "./voiceProtocol";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A channel to the voice's background process: a utilityProcess in the app, a fake in tests. */
export interface VoiceChannel {
  send(message: ToVoiceHost): void;
  onMessage(listener: (message: FromVoiceHost) => void): void;
  onExit(listener: () => void): void;
  kill(): void;
}

/**
 * Starts the natural voice's background process when it is first needed and stops it after a
 * while unused, so the model's memory is given back when nobody is listening (D-243).
 */
export class NaturalVoiceHost {
  private channel: VoiceChannel | undefined;
  private nextId = 0;
  private readonly pending = new Map<
    number,
    { resolve: (m: FromVoiceHost) => void; reject: (e: Error) => void }
  >();
  private idle: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly start: () => VoiceChannel,
    private readonly idleMs = 10 * 60_000,
  ) {}

  /** Loads the model now (so the first sentence doesn't wait for it). */
  async load(): Promise<void> {
    await this.request({ t: "load" });
  }

  /** `text` in `voice` at `speed` (1 = normal), as 24 kHz audio. */
  async say(text: string, voice: string, speed: number): Promise<Float32Array> {
    const reply = await this.request({ t: "say", text, voice, speed });
    return reply.audio ?? new Float32Array(0);
  }

  /** Stops the process (the model is being removed, or Jig quits). */
  stop(): void {
    clearTimeout(this.idle);
    const channel = this.channel;
    this.channel = undefined;
    channel?.kill();
    this.failAll(new Error("The voice stopped"));
  }

  private request(message: DistributiveOmit<ToVoiceHost, "id">): Promise<FromVoiceHost> {
    clearTimeout(this.idle);
    const id = ++this.nextId;
    const channel = this.ensure();
    return new Promise<FromVoiceHost>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      channel.send({ ...message, id } as ToVoiceHost);
    }).finally(() => this.armIdle());
  }

  private ensure(): VoiceChannel {
    if (this.channel) return this.channel;
    const channel = this.start();
    this.channel = channel;
    channel.onMessage((message) => {
      const call = this.pending.get(message.id);
      if (!call) return;
      this.pending.delete(message.id);
      if (message.error) call.reject(new Error(message.error));
      else call.resolve(message);
    });
    channel.onExit(() => {
      if (this.channel !== channel) return;
      this.channel = undefined;
      this.failAll(new Error("The voice's background process stopped"));
    });
    return channel;
  }

  private armIdle(): void {
    clearTimeout(this.idle);
    if (this.pending.size) return;
    this.idle = setTimeout(() => {
      if (!this.pending.size) this.stop();
    }, this.idleMs);
    this.idle.unref?.();
  }

  private failAll(error: Error): void {
    for (const call of this.pending.values()) call.reject(error);
    this.pending.clear();
  }
}
