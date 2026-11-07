import { describe, expect, it } from "vitest";
import { captureScene, marksFromEvents } from "./marks";
import { validate } from "./storyboard";

const box = { x: 0.6, y: 0.1, w: 0.2, h: 0.05 };

describe("marks from a capture", () => {
  it("zooms on clicks, highlights highlights and points at hovers", () => {
    const marks = marksFromEvents(
      [
        { step: 0, do: "go", at: 0 },
        { step: 1, do: "click", at: 1.2, box },
        { step: 2, do: "click", at: 2, box },
        { step: 3, do: "highlight", at: 4.5, box },
        { step: 4, do: "hover", at: 6, box },
      ],
      [undefined, "Open", "Again", "The total", ""],
    );
    expect(marks.map((m) => m.kind)).toEqual(["zoom", "highlight", "arrow"]);
    expect(marks[0]).toMatchObject({ at: 0.8, x: 0.6, w: 0.2 });
    expect(marks[1]!.label).toBe("The total");
    expect(marks[2]!.label).toBeUndefined();
  });

  it("makes a valid capture scene as long as the take", () => {
    const scene = captureScene(
      { path: "media/capture-1.mp4", seconds: 12.34, events: [{ step: 0, do: "click", at: 1, box }] },
      "Checkout",
      ["checkout"],
    );
    expect(scene).toMatchObject({
      id: "checkout-2",
      type: "capture",
      duration: 12.3,
      media: { kind: "video" },
    });
    expect(
      validate({ version: 1, kind: "walkthrough", title: "T", language: "en", scenes: [scene] }),
    ).toEqual([]);
  });
});
