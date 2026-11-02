import type { AddonComponentProps, AddonUiContext } from "@jig/sdk";
import {
  Button,
  cn,
  Dialog,
  Empty,
  IconButton,
  SectionTitle,
  Spinner,
  Tabs,
  useActiveProject,
  useAddonEvent,
} from "@jig/sdk/ui";
import {
  CircleCheck,
  CircleSlash,
  CircleX,
  FlaskConical,
  GitCompareArrows,
  ListChecks,
  MonitorPlay,
  Play,
  RefreshCw,
  Square,
  TestTube,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RepoSuites, TestRun } from "./host";
import { plainText } from "./lib/results";
import type { Suite, SuiteKind } from "./lib/suites";

const KIND_ICON: Record<SuiteKind, typeof TestTube> = {
  changed: GitCompareArrows,
  unit: TestTube,
  check: ListChecks,
  e2e: MonitorPlay,
};
const KIND_LABEL: Record<SuiteKind, string> = {
  changed: "What your change needs",
  unit: "Unit tests",
  check: "Full check",
  e2e: "End-to-end",
};

export function duration(run: Pick<TestRun, "startedAt" | "endedAt">, now = Date.now()): string {
  const ms = (run.endedAt ? Date.parse(run.endedAt) : now) - Date.parse(run.startedAt);
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

function counts(run: TestRun | undefined): string {
  if (!run || run.status === "running" || !run.parsed) return "";
  return run.failed ? `${run.failed} failed` : `${run.passed} passed`;
}

/** The status mark at a row's far right: the same slot in every row. */
function StatusMark({ run }: { run?: TestRun }) {
  if (!run) return <span className="size-4 shrink-0" />;
  if (run.status === "running") return <Spinner size="sm" />;
  const Icon = run.status === "passed" ? CircleCheck : run.status === "stopped" ? CircleSlash : CircleX;
  return (
    <Icon
      className={cn(
        "block size-4 shrink-0",
        run.status === "passed" ? "text-success" : run.status === "stopped" ? "text-muted" : "text-danger",
      )}
      aria-label={run.status}
    />
  );
}

/** Re-renders every second while something runs, for the elapsed time. */
function useTick(active: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [active]);
}

function SuiteRow({
  suite,
  last,
  onOpen,
  onRun,
  onStop,
}: {
  suite: Suite;
  last?: TestRun;
  onOpen: () => void;
  onRun: () => void;
  onStop: () => void;
}) {
  const running = last?.status === "running";
  const Kind = KIND_ICON[suite.kind];
  return (
    // The whole row opens the suite; the play/stop button is the only other target in it.
    <div
      role="button"
      tabIndex={0}
      className="group flex h-8 w-full min-w-0 cursor-default items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
      title={`${KIND_LABEL[suite.kind]} · ${suite.detail}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen();
        }
      }}
      data-testid={`tests-suite-${suite.id}`}
    >
      <Kind className="block size-4 shrink-0 text-muted" />
      <span className="min-w-0 flex-1 truncate">{suite.label}</span>
      <span
        className={cn(
          "w-20 shrink-0 truncate text-right text-xs tabular-nums",
          last?.failed ? "text-danger" : "text-muted",
        )}
      >
        {counts(last)}
      </span>
      <span className="w-14 shrink-0 text-right text-xs text-muted tabular-nums">
        {last ? duration(last) : ""}
      </span>
      <IconButton
        icon={running ? Square : Play}
        label={running ? `Stop ${suite.label}` : `Run ${suite.label}`}
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          running ? onStop() : onRun();
        }}
        data-testid={`tests-run-${suite.id}`}
      />
      <span className="flex w-4 shrink-0 justify-center">
        <StatusMark run={last} />
      </span>
    </div>
  );
}

function RunDetails({
  ctx,
  repo,
  suite,
  runs,
  onRun,
  onStop,
  close,
}: {
  ctx: AddonUiContext;
  repo: RepoSuites;
  suite: Suite;
  runs: TestRun[];
  onRun: () => void;
  onStop: () => void;
  close: () => void;
}) {
  const [tab, setTab] = useState<"run" | "history">("run");
  const mine = runs.filter((r) => r.suiteId === suite.id);
  const last = mine[0];
  const [output, setOutput] = useState("");
  const outputRef = useRef<HTMLPreElement>(null);
  const lastId = last?.id;
  const running = last?.status === "running";
  // The output of the run shown: live while it runs (events), the kept tail afterwards.
  useEffect(() => {
    setOutput("");
    if (!lastId) return;
    void ctx.host.call<string>("output", { id: lastId }).then((text) => text && setOutput(text));
  }, [ctx, lastId]);
  useAddonEvent("output", (p) => {
    const { id, text } = p as { id: string; text: string };
    if (id === lastId) setOutput((o) => (o + text).slice(-200_000));
  });
  useEffect(() => {
    const el = outputRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [output]);
  useTick(running);
  const askClaude = () => {
    const failing = last?.failures.length
      ? `\n\nFailing tests:\n${last.failures.map((f) => `- ${f}`).join("\n")}`
      : "";
    void ctx.openChat({
      cwd: repo.path,
      draft: `The ${suite.label} tests fail (${suite.detail}). Find out why and fix them; run the suite again with the Tests tool to check.${failing}`,
    });
    close();
  };
  return (
    <Dialog
      open
      width="lg"
      column
      title={`${suite.label} · ${repo.name}`}
      onClose={close}
      testId="tests-details"
      footer={
        <>
          {last?.status === "failed" && (
            <Button variant="ghost" onClick={askClaude} data-testid="tests-ask-claude">
              Ask Claude to fix
            </Button>
          )}
          <Button
            variant={running ? "secondary" : "primary"}
            icon={running ? Square : Play}
            onClick={running ? onStop : onRun}
          >
            {running ? "Stop" : last ? "Run again" : "Run"}
          </Button>
        </>
      }
    >
      <Tabs
        items={[
          { id: "run", label: "Last run" },
          { id: "history", label: `History (${mine.length})` },
        ]}
        value={tab}
        onChange={setTab}
        className="-mx-4 mb-3"
      />
      {/* One fixed-height body for both tabs: switching or new output never moves the dialog. */}
      <div className="flex h-96 min-h-0 flex-col gap-2">
        {tab === "run" ? (
          !last ? (
            <Empty icon={FlaskConical} title="Not run yet">
              {suite.detail}
            </Empty>
          ) : (
            <>
              <div className="flex h-6 shrink-0 items-center gap-3 text-sm">
                <StatusMark run={last} />
                <span className="font-medium">
                  {last.status === "running"
                    ? "Running…"
                    : last.status === "passed"
                      ? "Passed"
                      : last.status === "stopped"
                        ? "Stopped"
                        : "Failed"}
                </span>
                <span className="text-muted tabular-nums">
                  {last.parsed
                    ? `${last.passed} passed · ${last.failed} failed · ${last.skipped} skipped`
                    : last.exitCode !== undefined
                      ? `exit code ${last.exitCode}`
                      : ""}
                </span>
                <span className="ml-auto text-muted tabular-nums">{duration(last)}</span>
              </div>
              {last.failures.length > 0 && (
                <ul className="max-h-24 shrink-0 overflow-y-auto rounded-md border border-line p-1.5 text-xs">
                  {last.failures.map((f) => (
                    <li key={f} className="flex items-center gap-1.5 truncate py-0.5 text-danger" title={f}>
                      <CircleX className="block size-3.5 shrink-0" />
                      <span className="truncate text-fg">{f}</span>
                    </li>
                  ))}
                </ul>
              )}
              <pre
                ref={outputRef}
                className="min-h-0 flex-1 overflow-auto rounded-md border border-line bg-surface p-2 font-mono text-xs text-muted"
                data-testid="tests-output"
              >
                {output
                  ? plainText(output)
                  : last.status === "running"
                    ? ""
                    : "The output is kept only while Jig runs."}
              </pre>
            </>
          )
        ) : mine.length === 0 ? (
          <Empty icon={FlaskConical} title="No runs yet" />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {mine.map((r) => (
              <div
                key={r.id}
                className="flex h-7 items-center gap-3 px-1 text-sm"
                data-testid="tests-history-row"
              >
                <span className="w-36 shrink-0 text-muted tabular-nums">
                  {new Date(r.startedAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="w-14 shrink-0 text-xs text-muted">
                  {r.by === "claude" ? "Claude" : "You"}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate tabular-nums",
                    r.failed ? "text-danger" : "text-muted",
                  )}
                >
                  {r.parsed
                    ? `${r.passed} passed · ${r.failed} failed`
                    : r.exitCode !== undefined
                      ? `exit ${r.exitCode}`
                      : ""}
                </span>
                <span className="w-16 shrink-0 text-right text-muted tabular-nums">{duration(r)}</span>
                <span className="flex w-4 shrink-0 justify-center">
                  <StatusMark run={r} />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}

function ProjectTests({ ctx, projectId }: { ctx: AddonUiContext; projectId: string }) {
  const [repos, setRepos] = useState<RepoSuites[]>();
  const [runs, setRuns] = useState<Record<string, TestRun[]>>({});
  const [open, setOpen] = useState<{ repo: RepoSuites; suite: Suite }>();
  const [error, setError] = useState("");

  const loadRuns = useCallback(
    async (list: RepoSuites[]) => {
      const live = await ctx.host.call<TestRun[]>("running");
      const next: Record<string, TestRun[]> = {};
      for (const repo of list) {
        const kept = await ctx.host.call<TestRun[]>("history", { repo: repo.path });
        next[repo.path] = [...live.filter((r) => r.repo === repo.path), ...kept];
      }
      setRuns(next);
    },
    [ctx],
  );
  const load = useCallback(async () => {
    try {
      const list = await ctx.host.call<RepoSuites[]>("suites", { projectId });
      setRepos(list);
      await loadRuns(list);
    } catch (e) {
      setError(String(e));
      setRepos([]);
    }
  }, [ctx, projectId, loadRuns]);
  useEffect(() => {
    void load();
  }, [load]);
  useAddonEvent("runs", () => {
    if (repos) void loadRuns(repos);
  });
  const anyRunning = Object.values(runs).some((list) => list.some((r) => r.status === "running"));
  useTick(anyRunning);

  const run = (repo: RepoSuites, suite: Suite) =>
    void ctx.host
      .call("run", { repo: repo.path, suiteId: suite.id })
      .catch((e) => ctx.notify({ title: `Couldn't run ${suite.label}`, message: String(e), tone: "danger" }));
  const stop = (repo: RepoSuites, suite: Suite) => {
    const live = runs[repo.path]?.find((r) => r.suiteId === suite.id && r.status === "running");
    if (live) void ctx.host.call("stop", { id: live.id });
  };

  if (!repos) return <Spinner center />;
  const withSuites = repos.filter((r) => r.suites.length);
  return (
    <div className="flex h-full min-h-0 flex-col @container" data-testid="tests-view">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
        <span className="min-w-0 flex-1 truncate text-xs text-muted">
          {withSuites.length
            ? `${withSuites.reduce((n, r) => n + r.suites.length, 0)} suites in ${withSuites.length} ${withSuites.length === 1 ? "repository" : "repositories"}`
            : ""}
        </span>
        <IconButton
          icon={RefreshCw}
          label="Look for test suites again"
          size="sm"
          onClick={() => void load()}
        />
      </div>
      {error ? (
        <Empty icon={CircleX} title="Couldn't read the repositories">
          {error}
        </Empty>
      ) : withSuites.length === 0 ? (
        <Empty icon={FlaskConical} title="No test suites found">
          Jig looks for npm scripts that run tests (Vitest, Jest, Playwright, Karma…) and .NET test projects
          in this project's repositories.
        </Empty>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {withSuites.map((repo) => (
            <section key={repo.path} className="mb-2">
              {withSuites.length > 1 && (
                <div className="px-2">
                  <SectionTitle>{repo.name}</SectionTitle>
                </div>
              )}
              {repo.suites.map((suite) => (
                <SuiteRow
                  key={suite.id}
                  suite={suite}
                  last={runs[repo.path]?.find((r) => r.suiteId === suite.id)}
                  onOpen={() => setOpen({ repo, suite })}
                  onRun={() => run(repo, suite)}
                  onStop={() => stop(repo, suite)}
                />
              ))}
            </section>
          ))}
        </div>
      )}
      {open && (
        <RunDetails
          ctx={ctx}
          repo={open.repo}
          suite={open.suite}
          runs={runs[open.repo.path] ?? []}
          onRun={() => run(open.repo, open.suite)}
          onStop={() => stop(open.repo, open.suite)}
          close={() => setOpen(undefined)}
        />
      )}
    </div>
  );
}

export function TestsView({ ctx }: AddonComponentProps) {
  const project = useActiveProject();
  return project ? (
    <ProjectTests key={project.id} ctx={ctx} projectId={project.id} />
  ) : (
    <Empty icon={FlaskConical} title="No project selected">
      Choose a project to see its test suites.
    </Empty>
  );
}

export function showTests(ctx: AddonUiContext) {
  ctx.showView("tests");
}
