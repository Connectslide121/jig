import { describe, expect, it } from "vitest";
import {
  changesNote,
  demoVersions,
  directionsOf,
  parseScorecard,
  pinAt,
  pinsNote,
  reviewSet,
  scoreOutOf5,
  storiesOf,
} from "./review";
import type { Output } from "./run";

const out = (
  id: string,
  kind: string,
  path: string,
  version = 1,
  status: Output["status"] = "draft",
): Output => ({
  id,
  kind,
  path,
  version,
  status,
  history: [],
});

describe("parseScorecard", () => {
  it("reads the axes in rubric order, forgiving about names, and the fixes", () => {
    const card = parseScorecard(
      JSON.stringify({
        pass: false,
        axes: { story: 3, "spacing rhythm": 4, Hierarchy: 5, color: 4 },
        fixes: [
          { screen: "My shifts", element: "Offer", change: "Make it the primary action" },
          "Add a next step",
          { x: 1 },
        ],
      }),
    );
    expect(card?.pass).toBe(false);
    expect(card?.axes).toEqual([
      { axis: "hierarchy", value: 5 },
      { axis: "spacing", value: 4 },
      { axis: "colour", value: 4 },
      { axis: "story", value: 3 },
    ]);
    expect(card?.score).toBe(80);
    expect(card?.fixes).toEqual([
      { screen: "My shifts", element: "Offer", change: "Make it the primary action" },
      { change: "Add a next step" },
    ]);
  });
  it("keeps a given score, and gives up on what isn't JSON", () => {
    expect(parseScorecard('{"pass":true,"score":86}')).toMatchObject({ pass: true, score: 86, axes: [] });
    expect(parseScorecard("nope")).toBeUndefined();
    expect(scoreOutOf5(86)).toBe("4.3");
  });
});

describe("demoVersions", () => {
  it("lists each demo version once, with its change log and the scorecard that judged it", () => {
    const versions = demoVersions({
      outputs: [
        out("demo-v2", "demo", "demo/v2/index.html", 2),
        out("demo-v1", "demo", "demo/v1/index.html", 1, "superseded"),
        out("demo-v1-changes", "demo-file", "demo/v1/CHANGES.md", 1),
        out("quality-v1", "quality", "quality/v1.json", 1),
        out("quality-v2", "quality", "quality/v2.json", 2),
        out("brief-v1", "brief", "brief.md"),
      ],
    });
    expect(versions).toEqual([
      {
        version: 1,
        path: "demo/v1/index.html",
        changes: "demo/v1/CHANGES.md",
        quality: "quality/v1.json",
        status: "superseded",
      },
      {
        version: 2,
        path: "demo/v2/index.html",
        changes: "demo/v2/CHANGES.md",
        quality: "quality/v2.json",
        status: "draft",
      },
    ]);
  });
});

describe("pins", () => {
  it("places a pin in percentages of its frame, inside it", () => {
    expect(pinAt(144, 450, 1440, 900)).toEqual({ x: 10, y: 50 });
    expect(pinAt(-5, 2000, 390, 844)).toEqual({ x: 0, y: 100 });
  });
  it("turns pins and a note into the next version's feedback", () => {
    const pins = [
      { device: "phone" as const, screen: "My shifts", x: 10, y: 50, text: "Bigger offer button" },
      { device: "desktop" as const, screen: "", x: 80, y: 5, text: "Logo too small" },
    ];
    expect(pinsNote(pins)).toBe(
      "1. phone, My shifts (10% across, 50% down): Bigger offer button\n2. desktop (80% across, 5% down): Logo too small",
    );
    expect(changesNote("  Calmer colours ", pins)).toMatch(/^Calmer colours\n\nPins on the demo:\n1\. phone/);
    expect(changesNote("", [])).toBe("");
  });
});

describe("directionsOf", () => {
  it("lists a new brand's boards in order, named from their files", () => {
    expect(
      directionsOf({
        outputs: [
          out("d", "directions", "directions/README.md"),
          out("d3", "directions-file", "directions/3-warm.svg"),
          out("d1", "directions-file", "directions/1-calm.svg"),
          out("d2", "directions-file", "directions/2-bold_type.png"),
          out("old", "directions-file", "directions/1-calm.svg", 1, "superseded"),
        ],
      }),
    ).toEqual([
      { id: "1-calm", name: "Calm", path: "directions/1-calm.svg" },
      { id: "2-bold_type", name: "Bold type", path: "directions/2-bold_type.png" },
      { id: "3-warm", name: "Warm", path: "directions/3-warm.svg" },
    ]);
  });
});

describe("reviewSet", () => {
  const pairs = { deck: "deck-images", "deck-images": "deck" };
  it("shows the other form's newest version beside the output", () => {
    const run = {
      outputs: [
        out("deck-v1", "deck", "sales/deck.md"),
        out("deck-images-v1", "deck-images", "sales/deck-images.md", 1, "superseded"),
        out("deck-images-v2", "deck-images", "sales/deck-images.md", 2),
        out("spec-v1", "spec", "spec.md"),
      ],
    };
    expect(reviewSet(run, "deck-v1", pairs).map((o) => o.id)).toEqual(["deck-v1", "deck-images-v2"]);
    expect(reviewSet(run, "deck-images-v2", pairs).map((o) => o.id)).toEqual(["deck-images-v2", "deck-v1"]);
    expect(reviewSet(run, "spec-v1", pairs).map((o) => o.id)).toEqual(["spec-v1"]);
    expect(reviewSet(run, "nope", pairs)).toEqual([]);
  });
});

describe("storiesOf", () => {
  it("makes a story of each second-level heading, with its text", () => {
    const md = `---
status: draft
---
# User stories

Intro that isn't a story.

## 1. Offer a shift
As staff I want to offer a shift so that I can swap it.

- Given my shifts, the offer button shows

## Take a shift ##
As a colleague I want to take an open shift.
`;
    expect(storiesOf(md)).toEqual([
      {
        title: "Offer a shift",
        description:
          "As staff I want to offer a shift so that I can swap it.\n\n- Given my shifts, the offer button shows",
      },
      { title: "Take a shift", description: "As a colleague I want to take an open shift." },
    ]);
    expect(storiesOf("# Nothing\n\nNo stories.")).toEqual([]);
  });
});
