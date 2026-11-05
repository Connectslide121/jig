import { describe, expect, it } from "vitest";
import { ACCEPTANCE, createArgs, DESCRIPTION, parseStates, teamPaths, typeForm, updateArgs } from "./boards";

const STATES = { value: [{ name: "New" }, { name: "Active" }, {}, { name: "Closed" }] };

describe("a type's form (D-372)", () => {
  it("has the rich fields and number fields the type has", () => {
    const bug = typeForm(
      {
        [DESCRIPTION]: "Description",
        "Microsoft.VSTS.TCM.ReproSteps": "Repro Steps",
        "Microsoft.VSTS.Common.Priority": "Priority",
      },
      STATES,
    );
    expect(bug.states).toEqual(["New", "Active", "Closed"]);
    expect(bug.rich.map((r) => r.label)).toEqual(["Description", "Repro steps"]);
    expect(bug).toMatchObject({ priority: true, storyPoints: false });
    const story = typeForm(
      { [ACCEPTANCE]: "Acceptance Criteria", "Microsoft.VSTS.Scheduling.StoryPoints": "Story Points" },
      undefined,
    );
    expect(story.rich.map((r) => r.ref)).toEqual([DESCRIPTION, ACCEPTANCE]);
    expect(story).toMatchObject({ states: [], priority: false, storyPoints: true });
  });

  it("shows every field when the type's fields couldn't be read", () => {
    expect(typeForm({}, STATES)).toMatchObject({
      rich: [{ ref: DESCRIPTION }, { ref: ACCEPTANCE }],
      priority: true,
      storyPoints: true,
    });
    expect(parseStates(null)).toEqual([]);
  });
});

describe("the team's paths", () => {
  const areas = { defaultValue: "Shop\\Web", values: [{ value: "Shop\\Web" }, { value: "Shop\\Mobile" }] };
  const iterations = {
    value: [
      { name: "Sprint 1", path: "Shop\\Sprint 1", attributes: { timeFrame: "past" } },
      { name: "Sprint 2", path: "Shop\\Sprint 2", attributes: { timeFrame: "current" } },
    ],
  };

  it("lists the areas and iterations, backlog iteration first, and picks the current one", () => {
    const p = teamPaths(
      areas,
      { backlogIteration: { name: "Shop", path: "" }, defaultIterationMacro: "@currentIteration" },
      iterations,
    );
    expect(p).toEqual({
      areas: ["Shop\\Web", "Shop\\Mobile"],
      iterations: ["Shop", "Shop\\Sprint 1", "Shop\\Sprint 2"],
      defaultIteration: "Shop\\Sprint 2",
    });
  });

  it("uses the team's default iteration, else the backlog iteration", () => {
    expect(
      teamPaths(
        areas,
        { defaultIteration: { path: "Shop\\Sprint 1" }, backlogIteration: { name: "Shop" } },
        iterations,
      ).defaultIteration,
    ).toBe("Shop\\Sprint 1");
    expect(
      teamPaths(
        areas,
        { backlogIteration: { name: "Shop", path: "" }, defaultIterationMacro: "@currentIteration" },
        {
          value: [],
        },
      ),
    ).toEqual({ areas: ["Shop\\Web", "Shop\\Mobile"], iterations: ["Shop"], defaultIteration: "Shop" });
    expect(teamPaths(undefined, undefined, undefined)).toEqual({ areas: [], iterations: [] });
  });
});

describe("creating a card", () => {
  it("sends every field in one create, in the team's area unless another is picked", () => {
    const args = createArgs(
      {
        type: "User Story",
        title: "  Gift cards ",
        column: "Doing",
        state: "Active",
        parentId: 7,
        descriptionHtml: "<div>Why</div>",
        acceptanceHtml: "<ul><li>ok</li></ul>",
        assignedTo: " ann@contoso.com ",
        tags: ["web", "shop"],
        priority: 2,
        storyPoints: 3,
        iteration: "Shop\\Sprint 2",
      },
      "Shop\\Web",
    );
    expect(args).toEqual([
      "--type",
      "User Story",
      "--title",
      "Gift cards",
      "--assigned-to",
      "ann@contoso.com",
      "--iteration",
      "Shop\\Sprint 2",
      "--description",
      "<div>Why</div>",
      "--fields",
      `${ACCEPTANCE}=<ul><li>ok</li></ul>`,
      "System.Tags=web; shop",
      "Microsoft.VSTS.Common.Priority=2",
      "Microsoft.VSTS.Scheduling.StoryPoints=3",
      "--area",
      "Shop\\Web",
    ]);
    // State and column follow in an update; nothing about them is in the create.
    expect(args.join(" ")).not.toMatch(/--state|Kanban/);
  });

  it("leaves out empty fields", () => {
    expect(
      createArgs(
        { type: "Task", title: "x", assignedTo: " ", tags: [" "], area: "Shop\\Mobile" },
        "Shop\\Web",
      ),
    ).toEqual(["--type", "Task", "--title", "x", "--area", "Shop\\Mobile"]);
  });

  it("moves a card to another area and iteration", () => {
    expect(updateArgs({ area: "Shop\\Mobile", iteration: "Shop\\Sprint 3" })).toEqual([
      "--area",
      "Shop\\Mobile",
      "--iteration",
      "Shop\\Sprint 3",
    ]);
  });
});
