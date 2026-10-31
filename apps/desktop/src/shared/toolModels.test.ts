import { expect, it } from "vitest";
import { agentModels, reportedModelName } from "./toolModels";

it("formats reported ids without discarding the version or changing custom ids", () => {
  expect(reportedModelName("claude-sonnet-4-5-20250929")).toBe("sonnet-4-5");
  expect(reportedModelName("opus")).toBe("Opus");
  expect(reportedModelName("custom-model")).toBe("custom-model");
});

it("collects direct child reported models, including text-only agents, without inferring missing data", () => {
  expect(
    agentModels([
      { kind: "assistant", id: "a", at: "", text: "Done", model: "sonnet" },
      { kind: "tool", id: "b", at: "", name: "Read", input: {}, status: "done", model: "sonnet" },
      { kind: "tool", id: "c", at: "", name: "Read", input: {}, status: "done" },
    ]),
  ).toEqual(["sonnet"]);
  expect(agentModels([])).toEqual([]);
});
