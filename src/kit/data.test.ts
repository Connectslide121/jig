import { describe, expect, it } from "vitest";
import { fmt, people, scenarioTime, seeded } from "./data.ts";

describe("sample data", () => {
  it("gives the same data for the same seed", () => {
    expect(people(seeded(7), 5)).toEqual(people(seeded(7), 5));
    expect(people(seeded(7), 5)).not.toEqual(people(seeded(8), 5));
  });

  it("uses .example e-mail domains", () => {
    for (const p of people(seeded(1), 20)) expect(p.email).toMatch(/\.example$/);
  });

  it("formats a scenario time on a 24-hour clock", () => {
    expect(fmt.clock(scenarioTime(7, 5))).toBe("07:05");
    expect(fmt.clock(scenarioTime(19, 40))).toBe("19:40");
  });
});
