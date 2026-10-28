import { BellOff, ChevronDown, ChevronRight, Hammer, Lightbulb, Search, X } from "lucide-react";
import { useState } from "react";
import type { Suggestion } from "../../../shared/learning";
import { call, errorMessage } from "../../lib/host";
import { Badge, Button, Card, Empty, Spinner } from "../../ui";
import { workbench } from "../../workbench/store";
import { notify } from "../../workbench/toasts";
import { lookForPatterns, useLearning } from "./store";

const LEVEL: Record<Suggestion["kind"], string> = {
  layout: "layout change",
  settings: "settings change",
  "change-addon": "change an add-on",
  "new-addon": "new add-on",
  app: "change to Jig",
};

async function answer(s: Suggestion, a: "build" | "snooze" | "never") {
  try {
    await call("learning.answer", { id: s.id, answer: a });
    if (a === "build") notify({ title: "Building it", message: s.title, tone: "success" });
  } catch (error) {
    notify({ title: "Couldn't do that", message: errorMessage(error), tone: "danger" });
  }
}

function SuggestionCard({ s }: { s: Suggestion }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="flex flex-col gap-2 p-3" data-testid="suggestion">
      <div className="flex items-start gap-2">
        <Lightbulb className="mt-0.5 size-4 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{s.title}</div>
          <div className="mt-0.5 text-xs text-muted">{s.why}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        <Badge>{LEVEL[s.kind]}</Badge>
        {s.addonId && <Badge tone="info">{s.addonId}</Badge>}
        {s.minutesPerWeek ? <Badge tone="success">≈ {s.minutesPerWeek} min/week</Badge> : null}
      </div>
      {s.evidence.length > 0 && (
        <button
          type="button"
          className="flex items-center gap-1 text-left text-xs text-muted hover:text-fg"
          onClick={() => setOpen(!open)}
        >
          {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />} Evidence
        </button>
      )}
      {open &&
        s.evidence.map((p) => (
          <div key={p.key} className="rounded-md bg-surface p-2 text-xs">
            <div className="font-mono text-fg">{p.summary}</div>
            <div className="text-muted">
              {p.count} times on {p.days} day(s){p.projects > 1 ? ` in ${p.projects} projects` : ""}
            </div>
            {p.examples.slice(0, 3).map((e) => (
              <div key={e.at} className="truncate font-mono text-hint" title={e.text}>
                {new Date(e.at).toLocaleDateString()} · {e.text}
              </div>
            ))}
          </div>
        ))}
      {s.status === "built" ? (
        <Button
          size="sm"
          icon={Hammer}
          onClick={() => s.buildId && workbench.openTab("jig.build", { buildId: s.buildId })}
        >
          Show the build
        </Button>
      ) : (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="primary"
            icon={Hammer}
            onClick={() => void answer(s, "build")}
            data-testid="suggestion-build"
          >
            Build it
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={BellOff}
            onClick={() => void answer(s, "snooze")}
            data-testid="suggestion-snooze"
          >
            Not now
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={X}
            onClick={() => void answer(s, "never")}
            data-testid="suggestion-never"
          >
            Never
          </Button>
        </div>
      )}
    </Card>
  );
}

export function SuggestionsView() {
  const state = useLearning((s) => s.state);
  if (!state) return <Spinner className="m-3" />;
  const fresh = state.suggestions.filter((s) => s.status === "new");
  const built = state.suggestions.filter((s) => s.status === "built").slice(0, 5);
  const last = state.runs[0];
  return (
    <div className="flex h-full flex-col" data-testid="suggestions-view">
      <div className="flex shrink-0 flex-col gap-1 border-b border-line p-2">
        <Button
          size="sm"
          icon={Search}
          busy={state.running}
          onClick={() => void lookForPatterns()}
          data-testid="look-for-patterns"
        >
          Look for patterns now
        </Button>
        <div className="text-2xs text-hint">
          {state.recording ? `${state.stats.events} events recorded locally` : "Recording is paused"}
          {state.nextRun
            ? ` · next run ${new Date(state.nextRun).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}`
            : ""}
        </div>
        {last && !last.ok && <div className="text-xs text-danger">Last run failed: {last.error}</div>}
        {last?.note && <div className="text-xs text-muted">{last.note}</div>}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
        {fresh.length === 0 && (
          <Empty icon={Lightbulb} title="No suggestions">
            Jig notices what you repeat (locally) and suggests tools here. Patterns are checked when you press
            the button and every week.
          </Empty>
        )}
        {fresh.map((s) => (
          <SuggestionCard key={s.id} s={s} />
        ))}
        {built.length > 0 && (
          <div className="px-1 pt-2 text-2xs font-semibold tracking-wide text-hint uppercase">Built</div>
        )}
        {built.map((s) => (
          <SuggestionCard key={s.id} s={s} />
        ))}
      </div>
    </div>
  );
}
