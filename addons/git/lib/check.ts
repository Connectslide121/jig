/** "Check before committing": Claude looks over the diff for things that shouldn't be committed. */
export interface Finding {
  severity: "high" | "medium" | "low";
  file: string;
  line?: number;
  message: string;
}

export function checkPrompt(c: { staged: boolean; diff: string; truncated: boolean }): string {
  return [
    "Check these changes before they are committed. Look for: secrets or credentials, debug output and leftover logging, commented-out code, TODO/FIXME added now, unfinished code, obvious bugs, and files that look committed by accident (build output, local config, large binaries).",
    "Only report real problems you can point to in the diff; no style opinions. If nothing is wrong, return an empty list.",
    'Reply with only JSON: {"findings": [{"severity": "high|medium|low", "file": "<path>", "line": <line in the new file or null>, "message": "<one sentence>"}]}',
    `${c.staged ? "Staged changes" : "All changes"}${c.truncated ? " (cut short)" : ""}:\n${c.diff}`,
  ].join("\n\n");
}

const ORDER = { high: 0, medium: 1, low: 2 } as const;

/** Claude's findings, most severe first; unreadable answers become one low finding with the text. */
export function parseFindings(answer: string): Finding[] {
  const json = /\{[\s\S]*\}/.exec(answer)?.[0];
  try {
    const raw = (JSON.parse(json ?? "") as { findings?: unknown[] }).findings ?? [];
    return raw
      .flatMap((f) => {
        const x = f as Record<string, unknown>;
        if (typeof x.message !== "string" || typeof x.file !== "string") return [];
        const severity = x.severity === "high" || x.severity === "medium" ? x.severity : "low";
        return [
          {
            severity,
            file: x.file.replace(/^[ab]\//, ""),
            line: typeof x.line === "number" && x.line > 0 ? x.line : undefined,
            message: x.message,
          } satisfies Finding,
        ];
      })
      .sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  } catch {
    return answer.trim() ? [{ severity: "low", file: "", message: answer.trim().slice(0, 500) }] : [];
  }
}
