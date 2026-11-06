import {
  BellOff,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Columns2,
  Hammer,
  Lightbulb,
  ListChecks,
  MessageSquare,
  MousePointerClick,
  Power,
  Search,
  Send,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  BUILD_KINDS,
  type EvidenceNote,
  type Suggestion,
  type SuggestionAnswer,
  TIP_KINDS,
  type WorkedState,
} from "../../../shared/learning";
import { useAddons } from "../../addons/loader";
import { call, errorMessage, useHostEvent } from "../../lib/host";
import { Badge, Button, Card, Dialog, Empty, Spinner } from "../../ui";
import { runAction, useRegistry } from "../../workbench/registry";
import { workbench } from "../../workbench/store";
import { notify } from "../../workbench/toasts";
import { newSession } from "../sessions/actions";
import { lookForPatterns, useLearning } from "./store";

const KIND_LABEL: Record<Suggestion["kind"], string> = {
  layout: "layout change",
  settings: "settings change",
  "change-addon": "change an add-on",
  "new-addon": "new add-on",
  app: "change to Jig",
  workflow: "workflow",
  "claude-setup": "Claude Code setup",
  "project-memory": "project memory",
  "prompting-tip": "prompting tip",
  "habit-tip": "habit tip",
  automation: "automation",
  profile: "your profile",
  "use-addon": "an add-on you have",
  "use-feature": "a Jig feature",
  practice: "better practice",
};

async function answer(s: Suggestion, a: SuggestionAnswer) {
  try {
    await call("learning.answer", { id: s.id, answer: a });
    if (a === "build") notify({ title: "Building it", message: s.title, tone: "success" });
  } catch (error) {
    notify({ title: "Couldn't do that", message: errorMessage(error), tone: "danger" });
  }
}

/** Notes from chats, for the evidence of suggestions (refreshed when they change). */
function useNotes(): EvidenceNote[] {
  const [notes, setNotes] = useState<EvidenceNote[]>([]);
  const load = () => void call("learning.knowledge").then((k) => setNotes(k.notes));
  useEffect(load, []);
  useHostEvent("learning.knowledgeChanged", load);
  return notes;
}

/** Each kind's own action (the builder, a chat with a draft, a workflow draft, the profile). */
function useAction(
  s: Suggestion,
  compare?: () => void,
): { label: string; icon: typeof Hammer; run: () => Promise<void> } {
  const workflows = useAddons((a) => a.addons.some((x) => x.id === "workflows" && x.enabled));
  const addon = useAddons((a) => a.addons.find((x) => x.id === s.addonId));
  const hasAction = useRegistry((r) => Boolean(s.actionId && r.actions[s.actionId]));
  const showMe = async () => {
    runAction(s.actionId!);
    await answer(s, "act");
  };
  const chat = (draft: string) => async () => {
    await newSession(undefined, undefined, draft);
    await answer(s, "act");
  };
  if (BUILD_KINDS.includes(s.kind)) return { label: "Build it", icon: Hammer, run: () => answer(s, "build") };
  switch (s.kind) {
    case "workflow":
      return {
        label: "Draft a workflow",
        icon: ListChecks,
        run: async () => {
          if (workflows)
            workbench.openTab("addon.workflows.workflow", {
              draft: { name: s.title, goal: s.goal, steps: s.steps ?? [] },
              title: s.title,
            });
          else
            await newSession(
              undefined,
              undefined,
              `Help me make this a repeatable workflow (a script or an Azure DevOps pipeline): ${s.goal}\nSteps:\n${(s.steps ?? []).map((x) => `- ${x}`).join("\n")}`,
            );
          await answer(s, "act");
        },
      };
    case "claude-setup":
      return {
        label: "Set it up with Jig",
        icon: Bot,
        run: chat(`Set this up for Claude Code here: ${s.goal}`),
      };
    case "project-memory":
      return {
        label: "Add to CLAUDE.md",
        icon: MessageSquare,
        run: chat(`Add this to the project's CLAUDE.md (keep it short, in the right section):\n\n${s.goal}`),
      };
    case "automation":
      return {
        label: "Make a routine",
        icon: Bot,
        run: chat(`Make a Claude Code routine (RemoteTrigger) for this: ${s.goal}`),
      };
    case "profile":
      return { label: "Add to my profile", icon: UserRound, run: () => answer(s, "act") };
    case "practice":
      return {
        label: "Fix it with Jig",
        icon: ShieldCheck,
        run: chat(
          `Help me change this practice (explain the risk briefly, then help me fix it here; never print secrets): ${s.goal}`,
        ),
      };
    case "use-addon":
      if (addon && !addon.enabled)
        return {
          label: "Switch it on",
          icon: Power,
          run: async () => {
            await call("addons.setEnabled", { id: addon.id, enabled: true });
            await answer(s, "act");
          },
        };
      if (hasAction) return { label: "Show me", icon: MousePointerClick, run: showMe };
      return { label: "Got it", icon: Check, run: () => answer(s, "act") };
    case "prompting-tip":
      if (s.example) return { label: "Compare prompts", icon: Columns2, run: async () => compare?.() };
      return { label: "Got it", icon: Check, run: () => answer(s, "act") };
    case "habit-tip":
    case "use-feature":
      if (hasAction) return { label: "Show me", icon: MousePointerClick, run: showMe };
      return { label: "Got it", icon: Check, run: () => answer(s, "act") };
    default:
      return { label: "Got it", icon: Check, run: () => answer(s, "act") };
  }
}

function SuggestionCard({ s, notes }: { s: Suggestion; notes: EvidenceNote[] }) {
  const [open, setOpen] = useState(false);
  const [comparing, setComparing] = useState(false);
  const action = useAction(s, () => setComparing(true));
  const quoted = notes.filter((n) => s.noteIds?.includes(n.id));
  const tip = TIP_KINDS.includes(s.kind);
  const done = s.status === "built" || s.status === "adopted";
  return (
    <Card className="flex flex-col gap-2 p-3" data-testid="suggestion">
      <div className="flex items-start gap-2">
        {s.kind === "practice" ? (
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-warning" />
        ) : (
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-accent" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{s.title}</div>
          <div className="mt-0.5 text-xs text-muted">{s.why}</div>
        </div>
      </div>
      {s.kind === "profile" ? (
        <ul className="ml-6 list-disc text-xs text-fg" data-testid="suggestion-profile">
          {s.goal.split("\n").map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : s.steps?.length ? (
        <ol className="ml-6 list-decimal text-xs text-fg">
          {s.steps.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ol>
      ) : null}
      <div className="flex flex-wrap gap-1">
        <Badge>{KIND_LABEL[s.kind]}</Badge>
        {s.addonId && <Badge tone="info">{s.addonId}</Badge>}
        {s.minutesPerWeek ? <Badge tone="success">≈ {s.minutesPerWeek} min/week</Badge> : null}
      </div>
      {s.outcome && (
        <div
          className={`rounded-md px-2 py-1 text-xs ${s.outcome.helped ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}
          data-testid="suggestion-outcome"
        >
          {s.outcome.text}
        </div>
      )}
      {(s.evidence.length > 0 || quoted.length > 0) && (
        <button
          type="button"
          className="flex items-center gap-1 text-left text-xs text-muted hover:text-fg"
          onClick={() => setOpen(!open)}
        >
          {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />} Evidence
        </button>
      )}
      {open &&
        quoted.map((n) => (
          <div key={n.id} className="rounded-md bg-surface p-2 text-xs" data-testid="suggestion-note">
            <div className="text-fg">“{n.text}”</div>
            <div className="text-hint">From a chat · {new Date(n.at).toLocaleDateString()}</div>
          </div>
        ))}
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
      ) : done ? null : (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="primary"
            icon={action.icon}
            onClick={() => void action.run()}
            data-testid="suggestion-build"
          >
            {action.label}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={BellOff}
            onClick={() => void answer(s, "snooze")}
            data-testid="suggestion-snooze"
          >
            {tip ? "Remind me" : "Not now"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={X}
            onClick={() => void answer(s, tip || s.kind === "profile" ? "dismiss" : "never")}
            data-testid="suggestion-never"
          >
            {tip || s.kind === "profile" ? "Dismiss" : "Never"}
          </Button>
        </div>
      )}
      {comparing && <PromptCompare s={s} onClose={() => setComparing(false)} />}
    </Card>
  );
}

/** A prompting tip: your prompt and the better one side by side, why yours fell short and what changed. */
function PromptCompare({ s, onClose }: { s: Suggestion; onClose: () => void }) {
  const tryIt = async () => {
    onClose();
    await newSession(undefined, undefined, s.example);
    await answer(s, "act");
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={s.title}
      width="xl"
      testId="prompt-compare"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" icon={Send} onClick={() => void tryIt()} data-testid="prompt-try">
            Try this prompt
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-medium text-muted">Your prompt</span>
            <div
              className="whitespace-pre-wrap rounded-md border border-border bg-surface p-2 text-xs text-fg"
              data-testid="prompt-before"
            >
              {s.before ?? "(not quoted)"}
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-medium text-muted">Better prompt</span>
            <div
              className="whitespace-pre-wrap rounded-md border border-accent bg-surface p-2 text-xs text-fg"
              data-testid="prompt-after"
            >
              {s.example}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Why yours fell short</span>
          <p className="text-xs text-fg">{s.why}</p>
        </div>
        {s.changes?.length ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">What's better</span>
            <ul className="flex flex-col gap-1 text-xs text-fg" data-testid="prompt-changes">
              {s.changes.map((c) => (
                <li key={c} className="flex gap-2">
                  <Check className="mt-0.5 size-3 shrink-0 text-success" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

async function runCheckIn(action: "enable" | "decline" | "start" | "skip") {
  try {
    const { prompt } = await call("learning.checkIn", { action });
    if (prompt) await newSession(undefined, undefined, prompt);
    if (action === "enable")
      notify({ title: "Weekly check-ins are on", message: "Settings → Learning changes it." });
  } catch (error) {
    notify({ title: "Couldn't do that", message: errorMessage(error), tone: "danger" });
  }
}

/** The check-in: offered once after two weeks, then due weekly or every two weeks when on. */
function CheckInCard() {
  const checkIn = useLearning((s) => s.state?.checkIn);
  if (!checkIn?.offer && !checkIn?.due) return null;
  return (
    <Card className="flex flex-col gap-2 p-3" data-testid="checkin-card">
      <div className="flex items-start gap-2">
        <MessageSquare className="mt-0.5 size-4 shrink-0 text-accent" />
        <div className="min-w-0 flex-1 text-xs text-muted">
          <div className="text-sm font-medium text-fg">
            {checkIn.due ? "Time for your check-in" : "A weekly check-in?"}
          </div>
          {checkIn.due
            ? "3–5 short questions about how you work. Skip it any time."
            : "A short chat each week (3–5 questions) helps Jig suggest things that fit how you work. It uses a little of your plan."}
        </div>
      </div>
      <div className="flex gap-2">
        {checkIn.due ? (
          <>
            <Button
              size="sm"
              variant="primary"
              onClick={() => void runCheckIn("start")}
              data-testid="checkin-start"
            >
              Start
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void runCheckIn("skip")}
              data-testid="checkin-skip"
            >
              Skip this one
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="primary"
              onClick={() => void runCheckIn("enable")}
              data-testid="checkin-enable"
            >
              Turn on
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void runCheckIn("decline")}
              data-testid="checkin-decline"
            >
              No thanks
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

/** "How you worked" this week: lines by Claude vs by hand (an estimate). */
function WorkedCard() {
  const [worked, setWorked] = useState<WorkedState>();
  useEffect(() => {
    void call("learning.worked", {})
      .then(setWorked)
      .catch(() => {});
  }, []);
  if (!worked?.text) return null;
  return (
    <Card className="p-3 text-xs text-muted" data-testid="worked-card">
      <div className="mb-1 text-sm font-medium text-fg">How you worked (last 7 days)</div>
      {worked.text}
      <div className="mt-1.5 text-2xs text-hint">
        Jig's lines are counted from the chat history on this computer; work done elsewhere counts as by hand.
        Lock files and generated code are left out.
      </div>
    </Card>
  );
}

export function SuggestionsView() {
  const state = useLearning((s) => s.state);
  const notes = useNotes();
  if (!state) return <Spinner center />;
  const fresh = state.suggestions.filter((s) => s.status === "new");
  const done = state.suggestions.filter((s) => s.status === "built" || s.status === "adopted").slice(0, 5);
  const last = state.runs[0];
  return (
    <div className="mx-auto flex h-full w-full min-w-0 max-w-3xl flex-col" data-testid="suggestions-view">
      <div className="flex shrink-0 flex-col gap-1 border-b border-line p-2">
        <div className="flex gap-1">
          <Button
            size="sm"
            icon={Search}
            busy={state.running}
            className="flex-1"
            onClick={() => void lookForPatterns()}
            data-testid="look-for-patterns"
          >
            Look for patterns now
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={UserRound}
            title="What Jig knows about me"
            aria-label="What Jig knows about me"
            onClick={() => void workbench.openTab("jig.knowledge")}
            data-testid="open-knowledge"
          />
        </div>
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
        <CheckInCard />
        {fresh.length === 0 && (
          <Empty icon={Lightbulb} title="No suggestions">
            Jig looks at how you ask for things, what you repeat, what slows you down, risky practices and
            what you mention in chats (locally), and suggests better prompts, add-ons and features you already
            have, safer practices, workflows or new tools here. It looks when you press the button and every
            week.
          </Empty>
        )}
        {fresh.map((s) => (
          <SuggestionCard key={s.id} s={s} notes={notes} />
        ))}
        <WorkedCard />
        {done.length > 0 && (
          <div className="px-1 pt-2 text-2xs font-semibold tracking-wide text-hint uppercase">Done</div>
        )}
        {done.map((s) => (
          <SuggestionCard key={s.id} s={s} notes={notes} />
        ))}
      </div>
    </div>
  );
}
