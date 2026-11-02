import { afterEach, describe, expect, it, vi } from "vitest";
import { NaturalVoiceHost, type VoiceChannel } from "./naturalVoice";
import type { FromVoiceHost, ToVoiceHost } from "./voiceProtocol";
import { pieces } from "./voiceProtocol";

/** A background process that answers every request with audio as long as the text. */
function fakeChannel() {
  let listener: ((m: FromVoiceHost) => void) | undefined;
  let exit: (() => void) | undefined;
  const sent: ToVoiceHost[] = [];
  const channel: VoiceChannel & { sent: ToVoiceHost[]; crash(): void; killed: boolean } = {
    sent,
    killed: false,
    send(message) {
      sent.push(message);
      if (message.t === "say" && message.text === "boom")
        queueMicrotask(() => listener?.({ id: message.id, error: "no" }));
      else if (message.t === "say" && message.text === "hang") return;
      else
        queueMicrotask(() =>
          listener?.({
            id: message.id,
            audio: message.t === "say" ? new Float32Array(message.text.length) : undefined,
          }),
        );
    },
    onMessage: (l) => {
      listener = l;
    },
    onExit: (l) => {
      exit = l;
    },
    kill() {
      channel.killed = true;
    },
    crash: () => exit?.(),
  };
  return channel;
}

describe("NaturalVoiceHost", () => {
  afterEach(() => vi.useRealTimers());

  it("starts the process once and answers each request", async () => {
    const channel = fakeChannel();
    const start = vi.fn(() => channel);
    const host = new NaturalVoiceHost(start);
    await host.load();
    expect((await host.say("hello", "af_heart", 1)).length).toBe(5);
    expect(start).toHaveBeenCalledTimes(1);
    expect(channel.sent[1]).toMatchObject({ t: "say", text: "hello", voice: "af_heart", speed: 1 });
    await expect(host.say("boom", "af_heart", 1)).rejects.toThrow("no");
    host.stop();
  });

  it("fails what is waiting when the process stops, and starts a new one next time", async () => {
    const channels = [fakeChannel(), fakeChannel()];
    const host = new NaturalVoiceHost(() => channels.shift()!);
    const first = channels[0]!;
    const waiting = host.say("hang", "af_heart", 1);
    first.crash();
    await expect(waiting).rejects.toThrow("stopped");
    expect((await host.say("hi", "af_heart", 1)).length).toBe(2);
    host.stop();
  });

  it("stops the process after a while unused", async () => {
    vi.useFakeTimers();
    const channel = fakeChannel();
    const host = new NaturalVoiceHost(() => channel, 1000);
    await host.say("hi", "af_heart", 1);
    vi.advanceTimersByTime(999);
    expect(channel.killed).toBe(false);
    vi.advanceTimersByTime(1);
    expect(channel.killed).toBe(true);
  });
});

describe("pieces", () => {
  it("keeps short text whole and splits long text after punctuation", () => {
    expect(pieces("Hello there.")).toEqual(["Hello there."]);
    expect(pieces("One two, three four. Five six.", 12)).toEqual(["One two,", "three four.", "Five six."]);
    expect(pieces("aaaa bbbb cccc", 9)).toEqual(["aaaa bbbb", "cccc"]);
  });
});
