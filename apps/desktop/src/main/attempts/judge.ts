import { z } from "zod";
import type { AttemptChanges, AttemptRun, AttemptVerdict } from "../../shared/attempts";

/** Most diff text per attempt sent to the judge. */
const DIFF_LIMIT = 15_000;

/** The question for Claude: every attempt's angle, summary of files and diff. */
export function judgePrompt(run: AttemptRun, changes: AttemptChanges[], diffs: string[]): string {
  const parts = run.attempts.map((a, i) => {
    const c = changes[i];
    const diff = diffs[i] ?? "";
    const files =
      c?.files.map((f) => `${f.status} ${f.path} (+${f.insertions} -${f.deletions})`).join("\n") ||
      "(no changes)";
    return `## Attempt ${a.index}\nAngle: ${a.hint}\nFiles:\n${files}\n\nDiff${diff.length > DIFF_LIMIT ? " (cut short)" : ""}:\n${diff.slice(0, DIFF_LIMIT)}`;
  });
  return [
    `Several attempts were made at the same task, each in its own copy of the repository. Compare them and recommend the one to keep.`,
    `Task:\n${run.task}`,
    ...parts,
    `Judge correctness first, then clarity, size of the change and risk. An attempt with no changes can't win.`,
    `Reply with only JSON: {"winner": <attempt number or null>, "summary": "<two or three sentences: which one and why>", "notes": [{"attempt": <n>, "strengths": "<short>", "weaknesses": "<short>"}]}`,
  ].join("\n\n");
}

const VerdictSchema = z.object({
  winner: z.number().int().nullable().optional(),
  summary: z.string(),
  notes: z
    .array(
      z.object({
        attempt: z.number().int(),
        strengths: z.string().default(""),
        weaknesses: z.string().default(""),
      }),
    )
    .default([]),
});

/** Claude's answer as a verdict (the first JSON object in it); a plain-text answer becomes the summary. */
export function parseVerdict(answer: string, count: number, at = new Date().toISOString()): AttemptVerdict {
  const json = /\{[\s\S]*\}/.exec(answer)?.[0];
  try {
    const v = VerdictSchema.parse(JSON.parse(json ?? ""));
    const winner = v.winner && v.winner >= 1 && v.winner <= count ? v.winner : undefined;
    return {
      winner,
      summary: v.summary,
      notes: v.notes.filter((n) => n.attempt >= 1 && n.attempt <= count),
      at,
    };
  } catch {
    return { summary: answer.trim() || "Claude didn't give a verdict.", notes: [], at };
  }
}
