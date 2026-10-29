import { describe, expect, it } from "vitest";
import {
  cloudPrompt,
  describeWorkflow,
  draftWorkflow,
  effectiveMode,
  isDue,
  lastDue,
  markStep,
  newRun,
  nextStep,
  runsUnattended,
  stepFromText,
  toSkill,
  triggerLabel,
  type Workflow,
  workflowFromInput,
} from "./workflow";

const wf = (): Workflow => {
  const w = draftWorkflow(
    {
      name: "Release webshop",
      goal: "Deploy the webshop",
      steps: ["git pull", "Build and publish", "`dotnet test`"],
    },
    "p1",
    new Date("2026-10-01T10:00:00Z"),
  );
  w.steps[0]!.mode = "auto";
  return w;
};

describe("workflows", () => {
  it("drafts steps from text: commands or checks", () => {
    expect(stepFromText("git pull")).toMatchObject({ kind: "command", command: "git pull", mode: "ask" });
    expect(stepFromText("- Upload to the VM")).toMatchObject({
      kind: "check",
      title: "Upload to the VM",
      mode: "manual",
    });
    expect(stepFromText("`dotnet test`")).toMatchObject({ kind: "command", command: "dotnet test" });
    expect(wf().steps.map((s) => s.kind)).toEqual(["command", "check", "command"]);
  });

  it("runs step by step: auto, manual, ask", () => {
    const w = wf();
    let run = newRun(w);
    expect(nextStep(w, run)).toMatchObject({ mode: "auto", step: { command: "git pull" } });
    run = markStep(run, w.steps[0]!.id, "done", "Already up to date.");
    expect(nextStep(w, run)?.mode).toBe("manual");
    run = markStep(run, w.steps[1]!.id, "skipped");
    expect(nextStep(w, run)?.mode).toBe("ask");
    run = markStep(run, w.steps[2]!.id, "done");
    expect(run.status).toBe("done");
    expect(nextStep(w, run)).toBeUndefined();
    expect(markStep(newRun(w), w.steps[0]!.id, "failed").status).toBe("failed");
    expect(effectiveMode({ ...w.steps[1]!, mode: "auto" })).toBe("manual");
  });

  it("knows when a schedule is due", () => {
    const daily = { kind: "schedule" as const, every: "day" as const, time: "08:00" };
    const now = new Date(2026, 9, 29, 9, 0); // a Thursday
    expect(lastDue(daily, now)).toEqual(new Date(2026, 9, 29, 8, 0));
    expect(isDue(daily, new Date(2026, 9, 28, 8, 0).toISOString(), now)).toBe(true);
    expect(isDue(daily, new Date(2026, 9, 29, 8, 0, 30).toISOString(), now)).toBe(false);
    const weekly = { kind: "schedule" as const, every: "week" as const, time: "16:00", day: 5 };
    expect(lastDue(weekly, now)).toEqual(new Date(2026, 9, 23, 16, 0));
    expect(isDue({ kind: "none" }, undefined, now)).toBe(false);
    expect(triggerLabel(weekly)).toBe("Fridays at 16:00");
    expect(triggerLabel({ kind: "schedule", every: "weekday", time: "07:30" })).toBe("Weekdays at 07:30");
  });

  it("runs unattended only when every step is an automatic command or pipeline", () => {
    const w = wf();
    expect(runsUnattended(w)).toBe(false);
    expect(runsUnattended({ ...w, steps: [w.steps[0]!] })).toBe(true);
  });

  it("exports a skill and a cloud prompt", () => {
    const skill = toSkill(wf());
    expect(skill).toContain("name: release-webshop");
    expect(skill).toContain("1. git pull: run `git pull`.");
    expect(skill).toContain("2. Build and publish: ask me to do this and wait until I confirm.");
    expect(skill).toContain("3. dotnet test: run `dotnet test` (ask me before doing it).");
    expect(cloudPrompt(wf())).toContain("Claude Code routine");
  });
});

describe("workflows from Claude", () => {
  it("builds a workflow from a description, keeping step ids on update", () => {
    const wf = workflowFromInput(
      {
        name: "Review a PR",
        goal: "Check a pull request before merging",
        steps: [
          "git fetch",
          { title: "Read the diff and list risks", kind: "claude" },
          { title: "Run the tests", kind: "command", command: "npm test", mode: "auto" },
          "Approve in Azure DevOps",
        ],
      },
      "p1",
    );
    expect(wf.steps.map((s) => [s.kind, effectiveMode(s)])).toEqual([
      ["command", "ask"],
      ["claude", "ask"],
      ["command", "auto"],
      ["check", "manual"],
    ]);
    expect(wf.steps[1]!.prompt).toBe("Read the diff and list risks");
    const again = workflowFromInput({ name: "Review a PR", steps: ["git fetch", "Merge"] }, "p1", wf);
    expect(again.id).toBe(wf.id);
    expect(again.steps[0]!.id).toBe(wf.steps[0]!.id);
    expect(again.goal).toBe("Check a pull request before merging");
    expect(describeWorkflow(wf)).toContain("3. [command, Jig does it] Run the tests `npm test`");
  });
});
