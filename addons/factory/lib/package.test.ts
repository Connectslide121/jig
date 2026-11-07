import { describe, expect, it } from "vitest";
import { candidates, dayOf, packageFiles, packageNotes } from "./package";
import type { GateState, Run } from "./run";

function cr(id: string, over: Partial<Run> = {}, gates: Array<Pick<GateState, "id" | "status">> = []): Run {
  return {
    id,
    slug: id.replace("fx-", ""),
    title: `Change ${id}`,
    projectId: "p",
    track: "change-request",
    languages: {},
    state: "running",
    owners: {},
    stages: [{ id: "S3", recipe: "plan", status: "done", attempt: 0 }],
    outputs: [],
    gates: gates.map((g) => ({ ...g, revisions: 0 })),
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    source: { kind: "ticket" },
    plan: { outputs: [], build: false, permissionMode: "acceptEdits", productExists: true },
    ...over,
  };
}

describe("candidates", () => {
  it("lists planned, non-critical change requests not yet packaged, ready ones first", () => {
    const plan = { outputs: [], build: true, permissionMode: "acceptEdits" as const, productExists: true };
    const list = candidates([
      cr("fx-a", {}, [{ id: "G2", status: "waiting" }]),
      cr("fx-b", {}, [{ id: "G2", status: "approved" }]),
      cr("fx-c", { plan }, [{ id: "G2", status: "approved" }]),
      cr("fx-d", { plan: { ...plan, critical: true } }, [{ id: "G2", status: "approved" }]),
      cr("fx-e", { packaged: { day: "2026-01-02", path: "x", at: "" } }),
      cr("fx-f", { state: "stopped" }),
      cr("fx-g", { track: "new-idea" }),
      cr("fx-h", { stages: [] }),
      cr("fx-sample-i", {}, [{ id: "G2", status: "approved" }]),
    ]);
    expect(list.map((c) => [c.runId, c.why])).toEqual([
      ["fx-b", "Ready"],
      ["fx-a", "Waiting for Docs review"],
      ["fx-c", "Waiting for Build merged"],
    ]);
  });
});

describe("dayOf", () => {
  it("takes a YYYY-MM-DD day only", () => {
    expect(dayOf("2026-05-04")).toBe("2026-05-04");
    expect(dayOf("2026-5-4")).toBeUndefined();
    expect(dayOf("../x")).toBeUndefined();
    expect(dayOf(3)).toBeUndefined();
  });
});

describe("the package's files", () => {
  const items = [
    {
      slug: "export-pdf",
      title: "Export to PDF",
      customer: "Contoso",
      ticket: "SUP-12",
      releaseNotes: "---\nstatus: approved\n---\n# Notes\n\nYou can export to PDF.\n",
      tests: "---\nstatus: approved\n---\n# Tests\n\nT1\n",
      letter: "Dear customer",
    },
    { slug: "dark-mode", title: "Dark mode" },
  ];
  it("combines the release notes under one heading per change", () => {
    expect(packageNotes("2026-05-04", items)).toBe(
      "# Release package 2026-05-04\n\n## Export to PDF\n\n## Notes\n\nYou can export to PDF.\n\n## Dark mode\n\n_No release notes._\n",
    );
  });
  it("writes the overview, the notes, and a tests and letter file per change that has them", () => {
    const files = packageFiles("2026-05-04", items);
    expect(files.map((f) => f.path)).toEqual([
      "docs/factory/releases/2026-05-04/README.md",
      "docs/factory/releases/2026-05-04/release-notes.md",
      "docs/factory/releases/2026-05-04/tests/export-pdf.md",
      "docs/factory/releases/2026-05-04/letters/export-pdf.md",
    ]);
    expect(files[0]?.text).toContain(
      "| Export to PDF | Contoso | SUP-12 | [tests](tests/export-pdf.md) | [letter](letters/export-pdf.md) |",
    );
    expect(files[0]?.text).toContain("| Dark mode |  |  | – | – |");
    expect(files[2]?.text).toBe("# Tests\n\nT1\n");
  });
});
