/**
 * The release-package day (D-471, pipeline.md → Change requests): accepted change requests are
 * bundled on a planned day, each with its release notes, test cases and customer letter, and released
 * through the Releases add-on. A critical one skips the batch (it was fixed at once). Pure: which runs
 * can go in, and the package's files.
 */
import { parseFrontMatter } from "./frontmatter";
import { GATES } from "./gates";
import type { GateId, Run } from "./run";
import { isSample } from "./samples";

export interface Candidate {
  runId: string;
  title: string;
  slug: string;
  /** The gates it still waits for; empty when it can go in. */
  waiting: GateId[];
  /** "Waiting for Docs review", "Ready". */
  why: string;
}

/**
 * Change requests that can go into a package: not critical, not stopped, not packaged yet. One is
 * ready once its docs (G2) are approved, and its build (G3) when the plan builds it.
 */
export function candidates(runs: Run[]): Candidate[] {
  return runs
    .filter(
      (r) =>
        r.track === "change-request" &&
        !isSample(r.id) &&
        !r.plan?.critical &&
        !r.packaged &&
        r.state !== "stopped" &&
        r.stages.some((s) => s.id === "S3" && s.status === "done"),
    )
    .map((r) => {
      const need: GateId[] = ["G2", ...(r.plan?.build ? (["G3"] as GateId[]) : [])];
      const waiting = need.filter((g) => r.gates.find((x) => x.id === g)?.status !== "approved");
      return {
        runId: r.id,
        title: r.title,
        slug: r.slug,
        waiting,
        why: waiting.length ? `Waiting for ${waiting.map((g) => GATES[g].label).join(", ")}` : "Ready",
      };
    })
    .sort((a, b) => a.waiting.length - b.waiting.length || a.title.localeCompare(b.title));
}

/** One change request's part of the package: its files' text, as they are in its run folder. */
export interface PackageItem {
  slug: string;
  title: string;
  customer?: string;
  ticket?: string;
  releaseNotes?: string;
  tests?: string;
  letter?: string;
}

/** A day as `YYYY-MM-DD`, or undefined when it isn't one. */
export function dayOf(v: unknown): string | undefined {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  return Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? undefined : v;
}

/** The package's folder in the product repository. */
export const packageFolder = (day: string) => `docs/factory/releases/${day}`;

const body = (text?: string) => (text ? parseFrontMatter(text).body.trim() : "");

/** A part's own headings one level down, so they sit under the change request's `##`. */
const nested = (text: string) => text.replace(/^(#{1,5}) /gm, "#$1 ");

/** The combined release notes: one section per change request (the Releases add-on's notes too). */
export function packageNotes(day: string, items: PackageItem[]): string {
  return [
    `# Release package ${day}`,
    "",
    ...items.flatMap((i) => [`## ${i.title}`, "", nested(body(i.releaseNotes)) || "_No release notes._", ""]),
  ]
    .join("\n")
    .trimEnd()
    .concat("\n");
}

/** The package's files, relative to the repository: the overview, the notes, a test and letter file each. */
export function packageFiles(day: string, items: PackageItem[]): Array<{ path: string; text: string }> {
  const dir = packageFolder(day);
  const rows = items.map(
    (i) =>
      `| ${i.title} | ${i.customer ?? ""} | ${i.ticket ?? ""} | ${i.tests ? `[tests](tests/${i.slug}.md)` : "–"} | ${i.letter ? `[letter](letters/${i.slug}.md)` : "–"} |`,
  );
  const files = [
    {
      path: `${dir}/README.md`,
      text: [
        "---",
        "status: draft",
        `day: ${day}`,
        `changes: ${items.length}`,
        "---",
        `# Release package ${day}`,
        "",
        `${items.length} change request${items.length === 1 ? "" : "s"}, made by Factory from their approved runs. Check each part before the release; send the letters yourself.`,
        "",
        "| Change | Customer | Ticket | Test cases | Letter |",
        "|---|---|---|---|---|",
        ...rows,
        "",
        "Release notes: [release-notes.md](release-notes.md).",
        "",
      ].join("\n"),
    },
    { path: `${dir}/release-notes.md`, text: packageNotes(day, items) },
  ];
  for (const i of items) {
    if (i.tests) files.push({ path: `${dir}/tests/${i.slug}.md`, text: `${body(i.tests)}\n` });
    if (i.letter) files.push({ path: `${dir}/letters/${i.slug}.md`, text: `${body(i.letter)}\n` });
  }
  return files;
}
