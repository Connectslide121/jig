import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Pattern } from "@jig/learning";
import { describe, expect, it } from "vitest";
import type { Suggestion } from "../../shared/learning";
import { appendToSection, KnowledgeStore, PROFILE_TEMPLATE, profileIsEmpty } from "./knowledge";
import { checkInPrompt, parseReflection, profileInterviewPrompt, reflectionPrompt } from "./reflect";
import { didItHelp } from "./service";

describe("profile", () => {
  it("adds bullets under a heading, or a new heading", () => {
    const text = "# How I work\n\n## Stack\n\n- .NET\n\n## Preferences\n";
    expect(appendToSection(text, ["Vue"], "Stack")).toBe(
      "# How I work\n\n## Stack\n\n- .NET\n- Vue\n\n## Preferences\n",
    );
    expect(appendToSection(text, ["Short answers"], "preferences")).toBe(
      "# How I work\n\n## Stack\n\n- .NET\n\n## Preferences\n\n- Short answers\n",
    );
    expect(appendToSection(text, ["Uploads to a VM"], "How I deploy")).toContain(
      "## How I deploy\n\n- Uploads to a VM\n",
    );
    expect(appendToSection(text, ["  "])).toBe(text);
  });

  it("stores notes and the profile", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jig-knowledge-"));
    let changes = 0;
    const store = new KnowledgeStore(
      { evidence: join(dir, "evidence.json"), profile: join(dir, "profile.md") },
      () => changes++,
    );
    expect(await store.profile()).toEqual({ text: PROFILE_TEMPLATE, exists: false });
    const note = await store.add({ text: "Uploads to the VM by hand", category: "manual-work" });
    expect((await store.recent(7)).map((n) => n.id)).toEqual([note.id]);
    await store.addToProfile(["Uploads to a VM"], "How I release and deploy");
    expect((await store.profile()).text).toContain("## How I release and deploy\n\n- Uploads to a VM");
    expect(await store.remove(note.id)).toBe(true);
    expect(
      await new KnowledgeStore({ evidence: join(dir, "evidence.json"), profile: join(dir, "x.md") }).list(),
    ).toEqual([]);
    expect(changes).toBe(3);
  });
});

const pattern: Pattern = {
  key: "c-1",
  kind: "command",
  summary: "dotnet publish",
  count: 12,
  days: 6,
  projects: 1,
  examples: [{ at: "2026-10-01T10:00:00Z", text: "dotnet publish" }],
  score: 1,
};

describe("reflection 2", () => {
  it("gives Claude the notes, profile, work summary and whether tips are allowed", () => {
    const prompt = reflectionPrompt(
      [pattern],
      "- git",
      [{ title: "X", status: "built", outcome: "It helped" }],
      {
        notes: [{ id: "n1", at: "2026-10-02T00:00:00Z", category: "manual-work", text: "uploads to the VM" }],
        profile: "# How I work",
        worked: "3 commits",
        tipsAllowed: false,
      },
    );
    expect(prompt).toContain("- id: n1 | 2026-10-02 | manual-work | uploads to the VM");
    expect(prompt).toContain("## Profile\n# How I work");
    expect(prompt).toContain("3 commits");
    expect(prompt).toContain("- X: built (It helped)");
    expect(prompt).toContain("Tips allowed: no");
  });

  it("reads new kinds, keeps one tip at most, and turns profile updates into a suggestion", () => {
    const reply = JSON.stringify({
      suggestions: [
        {
          title: "Release workflow",
          why: "said so",
          goal: "release",
          level: 2,
          kind: "workflow",
          steps: ["a", "b"],
          noteIds: ["n1", "zz"],
        },
        { title: "Tip one", why: "x x", goal: "g g", level: 1, kind: "prompting-tip" },
        { title: "Tip two", why: "x x", goal: "g g", level: 1, kind: "habit-tip" },
      ],
      profileUpdates: ["Deploys by hand"],
    });
    const notes = [{ id: "n1", at: "", category: "manual-work" as const, text: "t" }];
    const out = parseReflection(reply, [], new Date(), { notes });
    expect(out.map((s) => s.kind)).toEqual(["workflow", "prompting-tip", "profile"]);
    expect(out[0]).toMatchObject({ steps: ["a", "b"], noteIds: ["n1"] });
    expect(out[2]!.goal).toBe("Deploys by hand");
    expect(parseReflection(reply, [], new Date(), { tipsAllowed: false }).map((s) => s.kind)).toEqual([
      "workflow",
      "profile",
    ]);
  });

  it("asks check-in questions from the gaps and the notes", () => {
    const prompt = checkInPrompt(PROFILE_TEMPLATE.replace("## Stack\n", "## Stack\n\n- .NET\n"), [
      { id: "n", at: "", category: "manual-work", text: "uploads to the VM" },
    ]);
    expect(prompt).toContain("nothing yet under: How I release and deploy, Tools I use outside Jig");
    expect(prompt).not.toContain("under: Stack");
    expect(prompt).toContain("- uploads to the VM");
    expect(prompt).toContain("jig_update_profile");
  });
});

describe("did it help", () => {
  const s: Suggestion = {
    id: "s",
    createdAt: "2026-10-01T00:00:00Z",
    title: "Publish button",
    why: "",
    goal: "",
    level: 2,
    kind: "new-addon",
    patternKeys: [],
    evidence: [],
    status: "built",
    actedAt: "2026-10-01T00:00:00Z",
  };
  it("compares how often the pattern happens before and after", () => {
    const key = "c-x";
    const withKey = { ...s, patternKeys: [key], evidence: [{ ...pattern, key, count: 28 }] };
    // Find the real key of "dotnet publish" by mining once.
    const events = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        at: `2026-10-0${2 + (i % 7)}T10:00:00Z`,
        kind: "terminal.command" as const,
        text: "dotnet publish",
      }));
    expect(didItHelp(withKey, [], new Date("2026-10-05T00:00:00Z"))).toBeUndefined();
    const helped = didItHelp(withKey, [], new Date("2026-10-11T00:00:00Z"))!;
    expect(helped).toMatchObject({ helped: true });
    expect(helped.text).toContain("hasn't come back in 10 days");
    expect(didItHelp(s, events(3), new Date("2026-10-11T00:00:00Z"))).toBeUndefined();
  });
});

describe("the profile interview", () => {
  it("knows an empty profile: only title, headings and comments", () => {
    expect(profileIsEmpty(PROFILE_TEMPLATE)).toBe(true);
    expect(profileIsEmpty("")).toBe(true);
    expect(profileIsEmpty("# How I work\n\n<!-- a\nmulti-line comment -->\n\n## Stack\n")).toBe(true);
    expect(profileIsEmpty(PROFILE_TEMPLATE.replace("## Stack\n", "## Stack\n\n- .NET\n"))).toBe(false);
    expect(profileIsEmpty("I work on a webshop")).toBe(false);
  });

  it("asks one question at a time, with follow-ups, and writes as it goes", () => {
    const prompt = profileInterviewPrompt(PROFILE_TEMPLATE, [
      {
        id: "1",
        at: "2026-10-01T00:00:00Z",
        text: "Uploads the build to a VM by hand",
        category: "manual-work",
      },
    ]);
    expect(prompt).toContain("Profile interview (Jig)");
    expect(prompt).toContain("ONE question at a time");
    expect(prompt).toContain("jig_update_profile");
    expect(prompt).toContain("My profile is empty");
    expect(prompt).toContain("- Uploads the build to a VM by hand");
    expect(profileInterviewPrompt("# How I work\n\n## Stack\n\n- .NET\n", [])).toContain("- .NET");
  });
});
