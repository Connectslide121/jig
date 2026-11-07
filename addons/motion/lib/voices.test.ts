import { describe, expect, it } from "vitest";
import { NATURAL_VOICES } from "../../../apps/desktop/src/shared/speech";
import { VOICES } from "./voices";

describe("Motion's voices", () => {
  it("are Jig's natural voices", () => {
    expect(VOICES).toEqual(NATURAL_VOICES.map(({ id, name, language }) => ({ id, name, language })));
  });
});
