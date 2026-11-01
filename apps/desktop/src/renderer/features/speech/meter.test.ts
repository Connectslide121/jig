import { describe, expect, it } from "vitest";
import { amplitude, Meter, sliceLevels } from "./meter";

describe("amplitude", () => {
  it("is 0 in a quiet room and 1 when loud", () => {
    expect(amplitude(0)).toBe(0);
    expect(amplitude(0.002)).toBe(0);
    expect(amplitude(0.5)).toBe(1);
    const speech = amplitude(0.05);
    expect(speech).toBeGreaterThan(0.3);
    expect(speech).toBeLessThan(1);
  });
});

describe("sliceLevels", () => {
  it("measures each slice", () => {
    const frame = new Float32Array(8);
    frame.fill(0.5, 4);
    expect(sliceLevels(frame, 2)).toEqual([0, 0.5]);
  });
});

describe("Meter", () => {
  it("plays a batch back slice by slice and settles", () => {
    const meter = new Meter(16);
    meter.push([1, 1, 1, 1], 0);
    let value = 0;
    for (let t = 0; t <= 64; t += 16) value = meter.sample(t);
    expect(value).toBeGreaterThan(0.5);
    for (let t = 80; t <= 2000; t += 16) value = meter.sample(t);
    expect(value).toBeLessThan(0.05);
  });

  it("jumps on a pulse and fades", () => {
    const meter = new Meter(16);
    meter.sample(0);
    meter.pulse(0.8);
    let peak = 0;
    for (let t = 16; t <= 160; t += 16) peak = Math.max(peak, meter.sample(t));
    expect(peak).toBeGreaterThan(0.4);
    let value = 1;
    for (let t = 176; t <= 3000; t += 16) value = meter.sample(t);
    expect(value).toBeLessThan(0.05);
  });

  it("clears", () => {
    const meter = new Meter(16);
    meter.push([1, 1, 1], 0);
    meter.clear();
    let value = 1;
    for (let t = 0; t <= 2000; t += 16) value = meter.sample(t);
    expect(value).toBeLessThan(0.05);
  });
});
