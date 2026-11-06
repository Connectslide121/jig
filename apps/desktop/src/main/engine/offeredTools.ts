/**
 * The tools the running Claude Code says it offers, from the `tools` list of its init message (never a
 * hard-coded guess). Claude Code only offers some of its tools to some clients (`Artifact` only inside the
 * Claude desktop app, D-404), so Jig mentions such a tool to Claude only when a chat really got it.
 * Unknown until a chat has started: then nothing is promised.
 */
let offered: ReadonlySet<string> | undefined;

/** Remembers the tools of the latest Claude Code init. */
export function recordOfferedTools(tools: readonly string[]): void {
  offered = new Set(tools);
}

/** Whether the latest Claude Code init listed this tool. */
export function claudeOffers(tool: string): boolean {
  return offered?.has(tool) ?? false;
}

/** For tests. */
export function resetOfferedTools(): void {
  offered = undefined;
}
