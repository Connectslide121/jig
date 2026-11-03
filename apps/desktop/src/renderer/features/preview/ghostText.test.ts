import { describe, expect, it } from "vitest";
import { ghostFor } from "./ghostText";

describe("ghostFor", () => {
  it("shows what the editor doesn't have yet, at the caret", () => {
    const doc = "  return to";
    expect(ghostFor(doc, 11, { text: "total;", from: 11, to: 11, provider: "claude" })).toEqual({
      at: 11,
      to: 11,
      text: "total;",
    });
    // Copilot often replaces from the line start: the part already typed is left out.
    expect(
      ghostFor(doc, 11, { text: "  return total;", from: 0, to: 11, provider: "copilot", id: "x" }),
    ).toEqual({ at: 11, to: 11, text: "tal;", id: "x" });
    expect(ghostFor(doc, 11, { text: "something else", from: 0, to: 11, provider: "copilot" })).toBeNull();
    expect(ghostFor(doc, 5, { text: "x", from: 6, to: 6, provider: "claude" })).toBeNull();
  });
});
