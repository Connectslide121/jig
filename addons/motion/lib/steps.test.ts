import { describe, expect, it } from "vitest";
import { toSteps } from "./steps";

describe("toSteps", () => {
  it("turns rows into capture steps", () => {
    expect(
      toSteps([
        { do: "click", target: "#buy", text: "Buy" },
        { do: "type", target: "input", text: "Contoso" },
        { do: "wait", target: "800", text: "" },
        { do: "scroll", target: "400", text: "" },
        { do: "scroll", target: ".total", text: "" },
        { do: "go", target: "https://example.com", text: "" },
      ]),
    ).toEqual({
      steps: [
        { do: "click", selector: "#buy", name: "Buy" },
        { do: "type", selector: "input", text: "Contoso" },
        { do: "wait", ms: 800 },
        { do: "scroll", y: 400 },
        { do: "scroll", selector: ".total" },
        { do: "go", url: "https://example.com" },
      ],
    });
  });

  it("names the wrong row", () => {
    expect(
      toSteps([
        { do: "click", target: "a", text: "" },
        { do: "type", target: "", text: "x" },
      ]),
    ).toEqual({
      error: "Step 2: which field to type into",
    });
    expect(toSteps([{ do: "wait", target: "abc", text: "" }])).toMatchObject({ error: /Step 1/ });
    expect(toSteps([{ do: "go", target: "javascript:x", text: "" }])).toMatchObject({ error: /address/ });
  });
});
