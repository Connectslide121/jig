import { afterEach, describe, expect, it, vi } from "vitest";
import { endCue, TICK_MS, useCues, WorkCue } from "./cues";

describe("endCue", () => {
  it("chimes done when idle, asks for you otherwise, nothing while working", () => {
    expect(endCue("idle")).toBe("done");
    expect(endCue("needs_you")).toBe("attention");
    expect(endCue("error")).toBe("attention");
    expect(endCue("working")).toBeUndefined();
    expect(endCue("starting")).toBeUndefined();
  });
});

describe("WorkCue", () => {
  afterEach(() => vi.useRealTimers());

  it("waits, then ticks every TICK_MS until stopped", () => {
    vi.useFakeTimers();
    useCues.setState({ played: [] });
    const cue = new WorkCue();
    cue.start(1000);
    expect(cue.running).toBe(true);
    vi.advanceTimersByTime(999);
    expect(useCues.getState().played).toEqual([]);
    vi.advanceTimersByTime(1 + TICK_MS * 2);
    expect(useCues.getState().played).toEqual(["tick", "tick", "tick"]);
    cue.stop();
    expect(cue.running).toBe(false);
    vi.advanceTimersByTime(TICK_MS * 3);
    expect(useCues.getState().played).toHaveLength(3);
  });

  it("starting twice keeps one rhythm", () => {
    vi.useFakeTimers();
    useCues.setState({ played: [] });
    const cue = new WorkCue();
    cue.start();
    cue.start();
    vi.advanceTimersByTime(TICK_MS);
    expect(useCues.getState().played).toEqual(["tick", "tick"]);
    cue.stop();
  });
});
