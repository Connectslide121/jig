/**
 * What a test run's output says: passed / failed / skipped counts and the failing tests' names, read
 * from the summary lines Vitest, Jest, Playwright, Karma and `dotnet test` print. Pure.
 */

export interface RunResult {
  passed: number;
  failed: number;
  skipped: number;
  /** Failing tests by name (file › title), at most 50. */
  failures: string[];
  /** The runner's summary was found; otherwise only the exit code tells. */
  parsed: boolean;
}

/** Colour codes and carriage-return redraws out, so the summary lines read as text. */
export function plainText(output: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences.
  return output.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "").replace(/\r(?!\n)/g, "\n");
}

const num = (m: RegExpMatchArray | null, i = 1) => (m ? Number(m[i]) : 0);

export function parseResults(raw: string): RunResult {
  const text = plainText(raw);
  const failures = new Set<string>();
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let parsed = false;

  // Vitest: "Tests  12 failed | 700 passed | 8 skipped (720)"; Jest: "Tests: 2 failed, 40 passed, 42 total".
  for (const line of text.split("\n")) {
    const vitest = /^\s*Tests\s+(.*\(\d+\))\s*$/.exec(line);
    const jest = /^\s*Tests:\s+(.*total)\s*$/.exec(line);
    const summary = vitest?.[1] ?? jest?.[1];
    if (summary) {
      parsed = true;
      passed += num(summary.match(/(\d+) passed/));
      failed += num(summary.match(/(\d+) failed/));
      skipped += num(summary.match(/(\d+) (?:skipped|todo|pending)/));
    }
    // dotnet: "Passed!  - Failed:     0, Passed:    12, Skipped:     0, Total:    12"
    const dotnet = /(?:Passed|Failed)!\s+-\s+Failed:\s+(\d+),\s+Passed:\s+(\d+),\s+Skipped:\s+(\d+)/.exec(
      line,
    );
    if (dotnet) {
      parsed = true;
      failed += num(dotnet, 1);
      passed += num(dotnet, 2);
      skipped += num(dotnet, 3);
    }
    // Karma: "Executed 42 of 42 (2 FAILED) (skipped 1)" — the last one counts.
    const karma =
      /Executed (\d+) of \d+(?: \((\d+) FAILED\))?(?: \(skipped (\d+)\))?.*(SUCCESS|\(.*secs)/.exec(line);
    if (karma) {
      parsed = true;
      failed = num(karma, 2);
      skipped = num(karma, 3);
      passed = num(karma, 1) - failed;
    }
    // Failing test names.
    const vitestFail =
      /^\s*(?:×|✗|FAIL)\s+(\S+\.(?:test|spec)\.[cm]?[jt]sx?)\s+>\s+(.+?)(?:\s+\d+ms)?\s*$/.exec(line);
    if (vitestFail) failures.add(`${vitestFail[1]} › ${vitestFail[2]}`);
    const pwFail =
      /^\s*(?:x|✘)\s+\d+\s+(?:\[[^\]]+\]\s+›\s+)?(\S+\.spec\.[cm]?[jt]s):\d+:\d+\s+›\s+(.+?)(?:\s+\(\d[\d.]*m?s\))?\s*$/.exec(
        line,
      );
    if (pwFail) failures.add(`${pwFail[1]!.replaceAll("\\", "/")} › ${pwFail[2]}`);
    const dotnetFail = /^\s*Failed\s+([\w.]+(?:\(.*\))?)\s+\[/.exec(line);
    if (dotnetFail) failures.add(dotnetFail[1]!);
  }

  // Playwright: "  3 failed", "  140 passed (4.1m)", "  2 skipped", "  1 flaky" on their own lines.
  const pw = /^\s+\d+ passed \(\d/m.test(text) || /^\s+\d+ failed\s*$/m.test(text);
  if (pw && !parsed) {
    parsed = true;
    passed = num(text.match(/^\s+(\d+) passed/m));
    failed = num(text.match(/^\s+(\d+) failed/m));
    skipped = num(text.match(/^\s+(\d+) skipped/m)) + num(text.match(/^\s+(\d+) did not run/m));
    passed += num(text.match(/^\s+(\d+) flaky/m));
  }
  return { passed, failed, skipped, failures: [...failures].slice(0, 50), parsed };
}

/** What Jig's e2e scripts print while they wait for the computer's e2e lock, and once they have it (D-420). */
export const WAITING_LINE = "Waiting for another e2e run to finish";
export const GOT_LINE = "The other e2e run finished: starting.";

/** Whether the run is still waiting for another e2e run: it said it waits and hasn't started since. */
export function waitingForOtherRun(output: string): boolean {
  const waits = output.lastIndexOf(WAITING_LINE);
  return waits >= 0 && output.indexOf(GOT_LINE, waits) < 0;
}

/** The run's status from its exit code and what the output said. */
export function runStatus(exitCode: number | null, result: RunResult): "passed" | "failed" {
  return exitCode === 0 && result.failed === 0 ? "passed" : "failed";
}
