/**
 * Sample runs: what the Floor, a run's page and the inbox look like before runs can be started
 * (D-440). Neutral names, times relative to `now`, ids prefixed `fx-sample-` so they can be told
 * apart and removed. Also the unit tests' fixtures.
 */
import type { GateState, Output, OutputHistoryEntry, Run, StageRun } from "./run";

export const SAMPLE_PREFIX = "fx-sample-";

export function isSample(runId: string): boolean {
  return runId.startsWith(SAMPLE_PREFIX);
}

export function sampleRuns(projectId: string, now = Date.now()): Run[] {
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  const h = (status: Output["status"], by: string, minutes: number, edited = false): OutputHistoryEntry => ({
    status,
    by,
    at: ago(minutes),
    edited,
  });
  const out = (
    id: string,
    kind: string,
    path: string,
    version: number,
    history: OutputHistoryEntry[],
  ): Output => ({
    id,
    kind,
    path,
    version,
    status: history[history.length - 1]?.status ?? "draft",
    history,
  });
  const st = (
    id: string,
    recipe: string,
    status: StageRun["status"],
    start?: number,
    end?: number,
    extra: Partial<StageRun> = {},
  ): StageRun => ({
    id,
    recipe,
    status,
    attempt: start === undefined ? 0 : 1,
    startedAt: start === undefined ? undefined : ago(start),
    endedAt: end === undefined ? undefined : ago(end),
    ...extra,
  });
  const gate = (
    id: GateState["id"],
    status: GateState["status"],
    minutes?: number,
    by?: string,
  ): GateState => ({
    id,
    status,
    revisions: 0,
    at: minutes === undefined ? undefined : ago(minutes),
    decidedBy: by,
  });
  const base = (n: number, slug: string, title: string, created: number) => ({
    id: `${SAMPLE_PREFIX}${n}`,
    slug,
    title,
    projectId,
    track: "new-idea" as const,
    languages: { all: "en" },
    owners: {},
    createdAt: ago(created),
    updatedAt: ago(0),
    source: { kind: "typed" as const },
  });
  const early = (created: number, kit: "S4" | "S4b"): StageRun[] => [
    st("S1", "interview", "done", created, created - 20),
    st("S2", "scout", "done", created - 20, created - 30),
    st(
      "S4",
      "kit-extract",
      kit === "S4" ? "done" : "skipped",
      kit === "S4" ? created - 32 : undefined,
      kit === "S4" ? created - 50 : undefined,
    ),
    st(
      "S4b",
      "directions",
      kit === "S4b" ? "done" : "skipped",
      kit === "S4b" ? created - 32 : undefined,
      kit === "S4b" ? created - 55 : undefined,
    ),
  ];
  const brief = (created: number) =>
    out("o-brief", "brief", "brief.md", 1, [
      h("draft", "jig", created - 18),
      h("approved", "me", created - 31),
    ]);

  const guest: Run = {
    ...base(1, "guest-check-in", "Guest check-in", 25),
    level: "L2",
    state: "interview",
    brief: { status: "draft", level: "L2", product: "Booking suite", coverage: { covered: 7, total: 12 } },
    stages: [st("S1", "interview", "running", 25)],
    outputs: [out("o-brief", "brief", "brief.md", 1, [h("draft", "jig", 5)])],
    gates: [],
  };

  const shift: Run = {
    ...base(2, "shift-swap", "Shift swap", 125),
    level: "L2",
    state: "running",
    brief: {
      status: "approved",
      level: "L2",
      product: "Booking suite",
      coverage: { covered: 12, total: 12 },
    },
    stages: [
      ...early(125, "S4"),
      st("S5", "demo-l2", "running", 15, undefined, { version: 2, attempt: 1 }),
      st("S6", "critique", "blocked"),
    ],
    outputs: [
      brief(125),
      out("o-scout", "scout", "scout.md", 1, [h("draft", "jig", 95), h("approved", "me", 94)]),
      out("o-kit", "kit", "kit/README.md", 1, [h("draft", "jig", 75), h("approved", "me", 70)]),
      out("o-demo-1", "demo", "demo/v1/index.html", 1, [h("draft", "jig", 40), h("superseded", "jig", 15)]),
    ],
    gates: [
      { ...gate("G0", "approved", 94, "me") },
      { ...gate("G1", "changes", 20, "me"), revisions: 1, note: "The swap needs a manager's OK step" },
    ],
  };

  const route: Run = {
    ...base(3, "route-planner", "Route planner", 220),
    level: "L1",
    state: "waiting",
    brief: { status: "approved", level: "L1", coverage: { covered: 12, total: 12 } },
    stages: [
      ...early(220, "S4b"),
      st("S5", "demo-l1", "done", 160, 180, { version: 1 }),
      st("S6", "critique", "done", 180, 175),
    ],
    outputs: [
      brief(220),
      out("o-dir", "directions", "directions/README.md", 1, [
        h("draft", "jig", 165),
        h("approved", "me", 162),
      ]),
      out("o-demo-1", "demo", "demo/v1/index.html", 1, [h("draft", "jig", 180)]),
    ],
    gates: [gate("G0", "approved", 189, "me"), gate("GD", "approved", 162, "me"), gate("G1", "waiting", 175)],
  };

  const invoice: Run = {
    ...base(4, "invoice-reminders", "Invoice reminders", 1440),
    level: "L3",
    state: "waiting",
    track: "change-request",
    owners: { G1: { kind: "person", name: "Customer contact" } },
    brief: {
      status: "approved",
      level: "L3",
      product: "Booking suite",
      coverage: { covered: 10, total: 10 },
    },
    stages: [
      st("S1", "interview", "done", 1440, 1420),
      st("S5", "build", "done", 1400, 1300, { version: 2 }),
      st("S6", "critique", "done", 1300, 1290),
    ],
    outputs: [
      out("o-brief", "brief", "brief.md", 1, [h("draft", "jig", 1425), h("approved", "me", 1421, true)]),
      out("o-demo-1", "demo", "demo/v1/index.html", 1, [
        h("draft", "jig", 1350),
        h("superseded", "jig", 1300),
      ]),
      out("o-demo-2", "demo", "demo/v2/index.html", 2, [h("draft", "jig", 1290)]),
    ],
    gates: [gate("G0", "approved", 1420, "me"), { ...gate("G1", "waiting", 1290), revisions: 1 }],
  };

  const packKinds = [
    "spec",
    "stories",
    "tests",
    "release-notes",
    "pitch",
    "deck",
    "course-sales",
    "faq",
    "glossary",
    "help",
    "marketing",
  ];
  const packStages = packKinds.map((kind, i) =>
    st(
      `S7:${kind}`,
      kind,
      i < 9 ? "done" : kind === "marketing" ? "needs-you" : "running",
      60,
      i < 9 ? 40 - i : undefined,
    ),
  );
  const course: Run = {
    ...base(5, "sales-course-pack", "Sales course pack", 1560),
    level: "L1",
    state: "waiting",
    owners: { G4: { kind: "person", name: "Sales lead" } },
    brief: { status: "approved", level: "L1", coverage: { covered: 12, total: 12 } },
    stages: [
      ...early(1560, "S4"),
      st("S5", "demo-l1", "done", 1400, 1300, { version: 1 }),
      st("S6", "critique", "done", 1300, 1290),
      ...packStages,
    ],
    outputs: [
      brief(1560),
      out("o-demo-1", "demo", "demo/v1/index.html", 1, [h("draft", "jig", 1300), h("approved", "me", 80)]),
      out("o-spec", "spec", "spec.md", 1, [h("draft", "jig", 40), h("approved", "me", 30)]),
      out("o-stories", "stories", "stories.md", 1, [h("draft", "jig", 39), h("approved", "me", 29, true)]),
      out("o-tests", "tests", "tests.md", 1, [h("draft", "jig", 38), h("approved", "me", 28)]),
      out("o-pitch", "pitch", "sales/pitch.md", 1, [h("draft", "jig", 36)]),
      out("o-course", "course-sales", "learning/course-sales.md", 1, [h("draft", "jig", 34)]),
    ],
    gates: [
      gate("G0", "approved", 1530, "me"),
      gate("G1", "approved", 80, "me"),
      gate("G2", "approved", 28, "me"),
      gate("G4", "waiting", 34),
    ],
  };

  const waitlist: Run = {
    ...base(6, "waitlist", "Waitlist", 4320),
    level: "L2",
    state: "done",
    brief: { status: "approved", level: "L2", coverage: { covered: 12, total: 12 } },
    stages: [
      ...early(4320, "S4"),
      st("S5", "demo-l2", "done", 4200, 4000, { version: 1 }),
      st("S6", "critique", "done", 4000, 3990),
    ],
    outputs: [
      brief(4320),
      out("o-demo-1", "demo", "demo/v1/index.html", 1, [h("draft", "jig", 4000), h("approved", "me", 3900)]),
      out("o-spec", "spec", "spec.md", 1, [h("draft", "jig", 3000), h("approved", "me", 2900)]),
      out("o-pitch", "pitch", "sales/pitch.md", 1, [
        h("draft", "jig", 3000),
        h("approved", "me", 2800, true),
      ]),
    ],
    gates: [
      gate("G0", "approved", 4290, "me"),
      gate("G1", "approved", 3900, "me"),
      gate("G2", "approved", 2900, "me"),
      gate("G4", "approved", 2800, "me"),
    ],
  };

  return [guest, shift, route, invoice, course, waitlist];
}

/** The Markdown a sample output file holds: its front-matter (status, by) and a short body. */
export function sampleMarkdown(run: Run, output: Output): string {
  const title = `${run.title} · ${output.kind}`;
  return [
    "---",
    `status: ${output.status}`,
    `version: ${output.version}`,
    "by: jig",
    "---",
    "",
    `# ${title}`,
    "",
    "> Draft by Jig · check before you approve. This is a sample run: its content is placeholder text.",
    "",
    `This file shows where the ${output.kind} of a run lives and how it opens from the run's page.`,
    "",
  ].join("\n");
}
