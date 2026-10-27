import { logger } from "../log";
import type { FromHost, ToHost } from "./hostRuntime";

const log = logger("addons");

/** A channel to an add-on's host code: a utilityProcess in the app, in-process in tests. */
export interface HostChannel {
  send(message: ToHost): void;
  onMessage(listener: (message: FromHost) => void): void;
  onExit(listener: (code: number) => void): void;
  kill(): void;
}

export type HostChannelFactory = (addonId: string) => HostChannel;

export type RpcHandler = (
  op: Extract<FromHost, { t: "rpc" }>["op"],
  args: unknown,
) => Promise<unknown> | unknown;

/**
 * Talks to one add-on's host process: starts it with the bundle, forwards calls, answers its RPCs and
 * restarts it after a crash (at most 3 times a minute).
 */
export class AddonHostProcess {
  private channel: HostChannel | undefined;
  private ready: Promise<string[]> | undefined;
  private callId = 0;
  private calls = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
  >();
  private crashes: number[] = [];
  private stopped = false;

  constructor(
    private readonly factory: HostChannelFactory,
    private readonly init: Omit<Extract<ToHost, { t: "init" }>, "t">,
    private readonly rpc: RpcHandler,
  ) {}

  start(): Promise<string[]> {
    if (this.ready) return this.ready;
    this.stopped = false;
    const channel = this.factory(this.init.addonId);
    this.channel = channel;
    this.ready = new Promise<string[]>((resolve, reject) => {
      channel.onMessage((message) => {
        if (message.t === "ready") resolve(message.exports);
        else if (message.t === "initError") reject(new Error(message.error));
        else if (message.t === "result") {
          const call = this.calls.get(message.id);
          if (!call) return;
          this.calls.delete(message.id);
          clearTimeout(call.timer);
          if (message.ok) call.resolve(message.value);
          else call.reject(new Error(message.error));
        } else if (message.t === "rpc") {
          void Promise.resolve()
            .then(() => this.rpc(message.op, message.args))
            .then(
              (value) => channel.send({ t: "rpcResult", id: message.id, ok: true, value }),
              (error: Error) =>
                channel.send({ t: "rpcResult", id: message.id, ok: false, error: error.message }),
            );
        }
      });
      channel.onExit((code) => {
        if (this.channel !== channel) return;
        this.channel = undefined;
        this.ready = undefined;
        for (const [id, call] of this.calls) {
          clearTimeout(call.timer);
          call.reject(new Error(`The add-on's host process stopped (code ${code})`));
          this.calls.delete(id);
        }
        reject(new Error(`The add-on's host process stopped (code ${code})`));
        if (!this.stopped) {
          log.warn(`Host process of ${this.init.addonId} exited with ${code}`);
          this.crashes = [...this.crashes.filter((t) => Date.now() - t < 60_000), Date.now()];
        }
      });
      channel.send({ t: "init", ...this.init });
    });
    this.ready.catch(() => {
      this.ready = undefined;
    });
    return this.ready;
  }

  async call(method: string, args: unknown, timeoutMs = 120_000): Promise<unknown> {
    if (this.crashes.length >= 3)
      throw new Error("The add-on's host code keeps crashing; fix it and save to reload");
    await this.start();
    const channel = this.channel;
    if (!channel) throw new Error("The add-on's host process is not running");
    const id = ++this.callId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.calls.delete(id);
        reject(new Error(`${method} took longer than ${Math.round(timeoutMs / 1000)} s`));
      }, timeoutMs);
      this.calls.set(id, { resolve, reject, timer });
      channel.send({ t: "call", id, method, args });
    });
  }

  stop(): void {
    this.stopped = true;
    this.channel?.kill();
    this.channel = undefined;
    this.ready = undefined;
  }
}
