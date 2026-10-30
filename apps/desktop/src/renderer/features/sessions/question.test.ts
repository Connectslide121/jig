import { describe, expect, it } from "vitest";
import {
  answerFor,
  answersOf,
  type Choice,
  EMPTY_CHOICE,
  isAnswered,
  pick,
  type Question,
  splitRecommended,
  toggleOther,
} from "./question";

const single: Question = {
  question: "Which step first?",
  options: [{ label: "Capture Jenkins (Recommended)" }, { label: "Update docs" }],
};
const several: Question = { ...single, question: "Which steps?", multiSelect: true };

describe("Claude's questions, step by step", () => {
  it("splits the Recommended mark off an option's label", () => {
    expect(splitRecommended("Capture Jenkins (Recommended)")).toEqual({
      label: "Capture Jenkins",
      recommended: true,
    });
    expect(splitRecommended("Update docs")).toEqual({ label: "Update docs", recommended: false });
  });

  it("picks one option, or toggles several; Other replaces a single pick", () => {
    let one: Choice = pick(single, undefined, "Update docs");
    one = pick(single, one, "Capture Jenkins (Recommended)");
    expect(answerFor(single, one)).toBe("Capture Jenkins (Recommended)");
    one = toggleOther(single, one);
    expect(one).toMatchObject({ picked: [], otherOn: true });
    expect(isAnswered(single, one)).toBe(false);
    expect(answerFor(single, { ...one, other: " I removed the accounts " })).toBe("I removed the accounts");
    // Picking an option again leaves Other.
    expect(pick(single, { ...one, other: "x" }, "Update docs")).toMatchObject({
      picked: ["Update docs"],
      otherOn: false,
    });

    let many: Choice = pick(several, undefined, "Update docs");
    many = pick(several, many, "Capture Jenkins (Recommended)");
    many = pick(several, many, "Update docs");
    expect(answerFor(several, many)).toBe("Capture Jenkins (Recommended)");
    many = toggleOther(several, many);
    expect(answerFor(several, { ...many, other: "and the logs" })).toBe(
      "Capture Jenkins (Recommended), and the logs",
    );
  });

  it("answers every question by its text; an unanswered one is empty", () => {
    expect(answersOf([single, several], [pick(single, undefined, "Update docs"), EMPTY_CHOICE])).toEqual({
      "Which step first?": "Update docs",
      "Which steps?": "",
    });
  });
});
