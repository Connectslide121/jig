import { z } from "zod";
import type { TourStep } from "../../shared/tour";

/** Most diff text sent to Claude for a tour. */
export const TOUR_DIFF_LIMIT = 80_000;

export function tourPrompt(diff: string, focus?: string): string {
  return [
    "Give a guided tour of the code changes below for a developer who has to review and understand them.",
    focus ? `Context: ${focus}` : "",
    "Order the steps for understanding, not by file name: start where the change begins (the entry point, the data model or the key decision), follow the flow, end with tests and small leftovers. Group trivial edits into one step. 3 to 12 steps.",
    'Reply with only JSON: {"title": "<what these changes do, max 8 words>", "overview": "<2-4 sentences: the purpose and the approach>", "steps": [{"title": "<short>", "file": "<path exactly as in the diff>", "line": <a line number in the new file this step is about, or null>, "explanation": "<2-5 sentences: what changed, why it matters, anything risky>"}]}',
    `Changes:\n${diff}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const TourSchema = z.object({
  title: z.string().default("Changes"),
  overview: z.string().default(""),
  steps: z.array(
    z.object({
      title: z.string(),
      file: z.string(),
      line: z.number().int().positive().nullable().optional(),
      explanation: z.string(),
    }),
  ),
});

/** Claude's tour, keeping only steps about files that are in the diff. */
export function parseTour(
  answer: string,
  files: string[],
): { title: string; overview: string; steps: TourStep[] } {
  const json = /\{[\s\S]*\}/.exec(answer)?.[0];
  const parsed = TourSchema.parse(JSON.parse(json ?? "{}"));
  const known = new Set(files);
  const steps = parsed.steps
    .map((s) => ({ ...s, file: s.file.replace(/^[ab]\//, "") }))
    .filter((s) => known.has(s.file))
    .map((s) => ({ title: s.title, file: s.file, line: s.line ?? undefined, explanation: s.explanation }));
  if (steps.length === 0) throw new Error("Claude's tour didn't refer to any changed file");
  return { title: parsed.title, overview: parsed.overview, steps };
}

/** Splits `git diff` output into one diff per file (by the `b/` path). */
export function splitDiff(diff: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of diff.split(/^(?=diff --git )/m)) {
    const m = /^diff --git a\/(.+?) b\/(.+)$/m.exec(part);
    if (m) out[m[2]!] = part.trimEnd();
  }
  return out;
}

/** The hunk (index) of a file diff whose new-file range contains `line`. */
export function hunkFor(fileDiff: string, line: number | undefined): number | undefined {
  if (!line) return undefined;
  let index = -1;
  for (const m of fileDiff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    index++;
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    if (line >= start && line < start + Math.max(count, 1)) return index;
  }
  return undefined;
}
