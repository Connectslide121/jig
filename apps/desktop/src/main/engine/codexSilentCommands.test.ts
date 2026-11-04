import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineEvent } from "../../shared/engine";
import { SILENT_COMMAND_MS, SilentCommandWatch } from "./codexSilentCommands";

const started = (id: string, command = "Get-Content notes.md") => ({
  item: { id, type: "commandExecution", command },
});

describe("Codex commands that run without output", () => {
  let events: EngineEvent[];
  let watch: SilentCommandWatch;

  beforeEach(() => {
    vi.useFakeTimers();
    events = [];
    watch = new SilentCommandWatch((e) => events.push(e));
  });
  afterEach(() => vi.useRealTimers());

  it("warns once a command has printed nothing for a while, and says when it finishes", () => {
    watch.handle("item/started", started("c1"));
    vi.advanceTimersByTime(SILENT_COMMAND_MS - 1);
    expect(events).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(events).toEqual([
      expect.objectContaining({ type: "notice", tone: "warning", key: "silent-command-c1" }),
    ]);
    expect((events[0] as { text: string }).text).toContain("3 minutes without any output");
    expect((events[0] as { text: string }).text).toContain("Get-Content notes.md");

    vi.advanceTimersByTime(2 * 60_000);
    watch.handle("item/completed", started("c1"));
    expect(events[1]).toEqual(
      expect.objectContaining({ type: "notice", tone: "info", key: "silent-command-c1" }),
    );
    expect((events[1] as { text: string }).text).toContain("finished after 5 minutes");
  });

  it("stays quiet while a command keeps printing", () => {
    watch.handle("item/started", started("c1"));
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(SILENT_COMMAND_MS - 1000);
      watch.handle("item/commandExecution/outputDelta", { itemId: "c1", delta: "line\n" });
    }
    watch.handle("item/completed", started("c1"));
    vi.advanceTimersByTime(SILENT_COMMAND_MS * 2);
    expect(events).toEqual([]);
  });

  it("forgets commands when the turn ends", () => {
    watch.handle("item/started", started("c1"));
    watch.handle("turn/completed", { turn: {} });
    vi.advanceTimersByTime(SILENT_COMMAND_MS * 2);
    expect(events).toEqual([]);
  });

  it("ignores items that aren't commands", () => {
    watch.handle("item/started", { item: { id: "m1", type: "agentMessage" } });
    vi.advanceTimersByTime(SILENT_COMMAND_MS * 2);
    expect(events).toEqual([]);
  });

  it("shortens a long command in the notice", () => {
    watch.handle("item/started", started("c1", "x".repeat(300)));
    vi.advanceTimersByTime(SILENT_COMMAND_MS);
    expect((events[0] as { text: string }).text).toContain(`${"x".repeat(117)}…`);
  });
});
