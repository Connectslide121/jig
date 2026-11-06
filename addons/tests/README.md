# Tests

The test suites in the active project's repositories, run with one click (D-244).

- **Finds** npm scripts that run tests (named `test`, `e2e`, `check`… or running Vitest, Jest,
  Playwright, Karma/`ng test`, Cypress, Mocha) at a repository's root and one folder down, and .NET
  test projects (`*.Tests.csproj` or referencing `Microsoft.NET.Test.Sdk`) up to three folders deep.
  Watch scripts are left out (they never finish). Rows are grouped: what a change needs
  (`*changed*`/`*affected*` scripts) first, then unit, full check and end-to-end.
- **A row** is the suite: kind icon, name, last result, duration, Run/Stop, and the status mark at the
  far right (the same columns in every row). Clicking the row opens its details in a modal: the last
  run's failing tests and output (live while it runs), its history (who ran it, counts, duration),
  Run again, and **Ask Jig to fix** after a failure (a chat in the repository with the failures).
- **Runs** start the script without a shell (`CI=1`, no colours) in the repository; Stop ends the
  whole process tree. The result comes from the runner's summary (Vitest, Jest, Playwright, Karma,
  `dotnet test`), or the exit code when there is none. A toast says when a run finishes.
- **Jig's tools:** `list` (suites and their last results, read-only), `run` and `wait` (D-359). `run`
  starts one suite (or joins its run already going) and waits at most 100 s (90 unless it says
  `wait`): a finished run answers with counts, failing tests and the output's last lines; one still
  going answers with its run id and the output so far. `wait` (read-only) waits for that id the same
  way and is called again until the run is done, so suites of several minutes (an e2e run) work
  without hitting the add-on host's 120 s call limit. You see Jig's runs in the view like your own.
- **Waiting for another e2e run (D-420):** Jig's own e2e scripts run one at a time on the computer.
  A run that prints "Waiting for another e2e run to finish" shows as waiting until it starts: an
  hourglass instead of the spinner, "Waiting" in the counts column, the same in its details and in
  `run`/`wait`'s answer. Other suites never wait.
- **History:** the last 30 runs per repository in this add-on's storage (`runs:<repo path>`). Output
  (and `wait` by run id) is kept only while Jig runs, for the newest 20 finished runs.
- Never on a schedule: you or Jig start runs.
