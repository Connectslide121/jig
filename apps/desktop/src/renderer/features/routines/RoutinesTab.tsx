import { CalendarClock, ExternalLink, MessageSquarePlus, Pencil, Play, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  describeSchedule,
  type Routine,
  type RoutineLogEntry,
  type RoutineRun,
} from "../../../shared/routines";
import { call, errorMessage, useHostEvent } from "../../lib/host";
import { Badge, type BadgeTone, Button, cn, Empty, IconButton, Markdown, Spinner, Switch } from "../../ui";
import { Pane } from "../../workbench/Pane";
import { useProjects } from "../../workbench/projects";
import type { TabProps } from "../../workbench/registry";
import { notify } from "../../workbench/toasts";
import { newSession } from "../sessions/actions";

const CLAUDE_CODE_WEB = "https://claude.ai/code";

function since(iso: string | undefined): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(ms);
  const words =
    abs < 60_000
      ? "less than a minute"
      : abs < 3_600_000
        ? `${Math.round(abs / 60_000)} min`
        : abs < 86_400_000
          ? `${Math.round(abs / 3_600_000)} h`
          : `${Math.round(abs / 86_400_000)} days`;
  return ms >= 0 ? `in ${words}` : `${words} ago`;
}

function statusTone(status: string): BadgeTone {
  const s = status.toLowerCase();
  if (/succeed|success|complete/.test(s)) return "success";
  if (/fail|error/.test(s)) return "danger";
  if (/run|pending|queue/.test(s)) return "info";
  return "neutral";
}

const schedule = (r: Routine) =>
  r.schedule
    ? describeSchedule(r.schedule)
    : r.runOnceAt
      ? `Once, ${new Date(r.runOnceAt).toLocaleString()}`
      : "Runs when started";

/** A chat with a request for Claude, who manages routines with Claude Code's RemoteTrigger tool. */
async function askClaude(draft: string) {
  const projectId = useProjects.getState().activeId;
  await newSession(projectId, undefined, draft);
}

function RunLog({ sessionId }: { sessionId: string }) {
  const [log, setLog] = useState<RoutineLogEntry[]>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    void call("routines.runLog", { sessionId })
      .then(setLog)
      .catch((e) => setError(errorMessage(e)));
  }, [sessionId]);
  if (error) return <div className="px-3 py-2 text-xs text-danger">{error}</div>;
  if (!log) return <Spinner size="sm" />;
  if (!log.length)
    return <div className="px-3 py-2 text-xs text-hint">This run has no messages to show.</div>;
  return (
    <div className="flex flex-col gap-2 px-3 py-2" data-testid="routine-log">
      {log.map((entry, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: log lines have no ids.
          key={i}
          className={cn("rounded-md px-2 py-1 text-xs", entry.role === "user" ? "bg-active" : "bg-surface")}
        >
          <div className="text-2xs font-semibold tracking-wide text-hint uppercase">{entry.role}</div>
          <Markdown text={entry.text} />
        </div>
      ))}
    </div>
  );
}

function Detail({ routine, onChanged }: { routine: Routine; onChanged: () => void }) {
  const [runs, setRuns] = useState<RoutineRun[]>();
  const [runsError, setRunsError] = useState<string>();
  const [open, setOpen] = useState<string>();
  const [busy, setBusy] = useState(false);
  const loadRuns = useCallback(() => {
    setRuns(undefined);
    setRunsError(undefined);
    void call("routines.runs", { id: routine.id })
      .then(setRuns)
      .catch((e) => setRunsError(errorMessage(e)));
  }, [routine.id]);
  useEffect(loadRuns, [loadRuns]);
  const runNow = async () => {
    setBusy(true);
    try {
      await call("routines.run", { id: routine.id });
      notify({
        title: `“${routine.name}” started`,
        message: "It runs in Claude Code on the web.",
        tone: "success",
      });
      onChanged();
      loadRuns();
    } catch (e) {
      notify({ title: "Couldn't start it", message: errorMessage(e), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-testid="routine-detail">
      <div className="flex flex-col gap-3 border-b border-line p-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="size-4 text-accent" />
          <span className="text-base font-semibold text-fg">{routine.name}</span>
          {!routine.enabled && <Badge>off</Badge>}
          <div className="flex-1" />
          <Button size="sm" icon={Play} busy={busy} onClick={() => void runNow()} data-testid="routine-run">
            Run now
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={Pencil}
            onClick={() =>
              void askClaude(`Change my Claude Code routine “${routine.name}” (id ${routine.id}): `)
            }
          >
            Change with Claude…
          </Button>
        </div>
        <div className="grid gap-x-4 gap-y-1 text-xs" style={{ gridTemplateColumns: "auto 1fr" }}>
          <span className="text-hint">When</span>
          <span className="text-fg">
            {schedule(routine)}
            {routine.schedule && <span className="ml-2 font-mono text-hint">{routine.schedule}</span>}
          </span>
          {routine.nextRunAt && routine.enabled && (
            <>
              <span className="text-hint">Next run</span>
              <span className="text-fg">
                {new Date(routine.nextRunAt).toLocaleString()} ({since(routine.nextRunAt)})
              </span>
            </>
          )}
          <span className="text-hint">Id</span>
          <span className="font-mono text-muted">{routine.id}</span>
        </div>
        {routine.prompt && (
          <div className="rounded-md border border-line bg-surface px-3 py-2 text-sm">
            <div className="mb-1 text-2xs font-semibold tracking-wide text-hint uppercase">What it does</div>
            <Markdown text={routine.prompt} />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 px-4 pt-3 text-2xs font-semibold tracking-wide text-hint uppercase">
        Runs
        <IconButton icon={RefreshCw} size="sm" label="Refresh runs" onClick={loadRuns} />
      </div>
      {runsError && <div className="px-4 py-2 text-xs text-danger">{runsError}</div>}
      {!runs && !runsError && (
        <div className="px-4 py-2">
          <Spinner size="sm" />
        </div>
      )}
      {runs?.length === 0 && <div className="px-4 py-2 text-xs text-hint">No runs yet.</div>}
      <div className="flex flex-col px-2 pb-4">
        {runs?.map((run) => (
          <div key={run.sessionId} className="rounded-md" data-testid="routine-run-row">
            <div className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-hover">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => setOpen(open === run.sessionId ? undefined : run.sessionId)}
              >
                <Badge tone={statusTone(run.status)}>{run.status.toLowerCase()}</Badge>
                <span className="text-fg">
                  {run.firedAt ? new Date(run.firedAt).toLocaleString() : run.sessionId}
                </span>
                <span className="text-hint">{since(run.firedAt)}</span>
              </button>
              {run.sessionId.startsWith("session_") && (
                <IconButton
                  icon={ExternalLink}
                  size="sm"
                  label="Open this run in Claude Code on the web"
                  onClick={() =>
                    void call("app.openExternal", { url: `${CLAUDE_CODE_WEB}/${run.sessionId}` })
                  }
                />
              )}
            </div>
            {open === run.sessionId && <RunLog sessionId={run.sessionId} />}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Claude Code routines: prompts that run on a schedule in Claude Code on the web. Jig asks Claude
 * Code's own RemoteTrigger tool for them (a small model call each time, D-092), so it loads when you
 * open the tab or press Refresh, never on a timer.
 */
export function RoutinesTab({ active }: TabProps) {
  const [data, setData] = useState<{ at: string; routines: Routine[] }>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string>();
  const load = useCallback((refresh = false) => {
    setLoading(true);
    setError(undefined);
    void call("routines.list", { refresh })
      .then((d) => {
        setData(d);
        setSelected((s) => s ?? d.routines[0]?.id);
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, []);
  // Load when the tab shows, and again when it shows after something changed the routines.
  const [stale, setStale] = useState(true);
  useEffect(() => {
    if (active && stale) {
      setStale(false);
      load();
    }
  }, [active, stale, load]);
  useHostEvent("routines.changed", () => setStale(true));
  const toggle = async (routine: Routine, enabled: boolean) => {
    try {
      await call("routines.setEnabled", { id: routine.id, enabled });
    } catch (e) {
      notify({ title: "Couldn't change it", message: errorMessage(e), tone: "danger" });
    }
  };
  const routine = data?.routines.find((r) => r.id === selected);
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="routines">
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2">
        <CalendarClock className="size-4 text-accent" />
        <span className="text-sm font-semibold text-fg">Routines</span>
        <span className="text-xs text-hint">
          {data
            ? `Claude Code runs these on a schedule · updated ${since(data.at)}`
            : "Claude Code on the web"}
        </span>
        <div className="flex-1" />
        <Button
          size="sm"
          icon={MessageSquarePlus}
          data-testid="routine-new"
          onClick={() =>
            void askClaude(
              "Create a Claude Code routine (RemoteTrigger) that runs on a schedule.\nWhen: \nWhat it should do: ",
            )
          }
        >
          New routine…
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={RefreshCw}
          busy={loading}
          onClick={() => load(true)}
          data-testid="routines-refresh"
        >
          Refresh
        </Button>
        <IconButton
          icon={ExternalLink}
          size="sm"
          label="Open Claude Code on the web"
          onClick={() => void call("app.openExternal", { url: CLAUDE_CODE_WEB })}
        />
      </header>
      {error ? (
        <Empty title="Couldn't load your routines" icon={CalendarClock}>
          <span className="block">{error}</span>
          <span className="mt-2 block">
            Routines need Claude Code signed in with your Claude subscription, and routines turned on for your
            account. Jig asks Claude Code for them; it never uses your login itself.
          </span>
        </Empty>
      ) : !data ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      ) : data.routines.length === 0 ? (
        <Empty title="No routines yet" icon={CalendarClock}>
          A routine is a prompt Claude Code runs on a schedule, like “every weekday at 8:30, review my open
          pull requests”. Click New routine… and tell Claude what and when, or ask in any chat.
        </Empty>
      ) : (
        <div className="flex min-h-0 flex-1">
          <Pane id="jig.routines.list" edge="right" defaultSize={320} min={220} max={600}>
            <div className="flex h-full flex-col gap-0.5 overflow-y-auto border-r border-line p-2">
              {data.routines.map((r) => (
                <div
                  key={r.id}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5",
                    r.id === selected ? "bg-active" : "hover:bg-hover",
                  )}
                  data-testid="routine-row"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 flex-col text-left"
                    onClick={() => setSelected(r.id)}
                  >
                    <span className={cn("truncate text-sm", r.enabled ? "text-fg" : "text-hint")}>
                      {r.name}
                    </span>
                    <span className="truncate text-2xs text-muted">
                      {schedule(r)}
                      {r.lastRun ? ` · last ${r.lastRun.status.toLowerCase()} ${since(r.lastRun.at)}` : ""}
                    </span>
                  </button>
                  <Switch label={`${r.name} on`} checked={r.enabled} onChange={(on) => void toggle(r, on)} />
                </div>
              ))}
            </div>
          </Pane>
          {routine ? (
            <Detail key={routine.id} routine={routine} onChanged={() => load(true)} />
          ) : (
            <Empty title="Choose a routine" />
          )}
        </div>
      )}
    </div>
  );
}
