import type { AddonComponentProps, AddonTabProps, AddonUiContext, MenuInput } from "@jig/sdk";
import {
  Button,
  Empty,
  IconButton,
  ProjectSwatch,
  SectionTitle,
  Spinner,
  useActiveProject,
  useHostCall,
  useJigEvent,
  useProjectList,
  useStorage,
} from "@jig/sdk/ui";
import { ChevronDown, Hourglass, Layers, MessageSquare, RefreshCw } from "lucide-react";
import type { Breakdown, ChatBreakdown, Summary } from "./host";
import {
  CATEGORIES,
  CATEGORY_HINT,
  CATEGORY_LABEL,
  type Category,
  crowd,
  type Overlap,
  shortName,
  type Totals,
} from "./lib/analyze";

/** One hue per category (D-419): model and tests used to be two oranges; tests are magenta now. */
export const COLOR: Record<Category, string> = {
  model: "bg-accent",
  tests: "bg-magenta",
  browser: "bg-info",
  subagents: "bg-success",
  shell: "bg-muted",
  tools: "bg-line-strong",
  waiting: "bg-danger",
};

const PERIODS = [
  { days: 1, label: "Today" },
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
];

/** Where the view looks: the active project, every project, or one picked project's id. */
type Scope = "active" | "all" | string;

/** Most chats listed in the view; the rest are summed in the totals. */
const MAX_CHATS = 50;

export function showChatTime(ctx: AddonUiContext) {
  ctx.showView("chat-time");
}

export function openForChat(ctx: AddonUiContext, target: { sessionId: string }) {
  openChatTime(ctx, target.sessionId);
}

function openChatTime(ctx: AddonUiContext, sessionId: string, title?: string) {
  ctx.openTab("chat", { sessionId, title: title ? `Chat time: ${title}` : "Chat time" });
}

export function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (ms < 1000) return `${(ms / 1000).toFixed(1)}s`;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

function percent(part: number, whole: number): string {
  return whole ? `${Math.round((100 * part) / whole)}%` : "–";
}

function crowdLabel(o: Overlap): string {
  return o.ownMs ? crowd(o).toFixed(1) : "–";
}

/* ---------- The view: a project's or every project's chats over a period ---------- */

export function ChatTimeView({ ctx }: AddonComponentProps) {
  const active = useActiveProject();
  const projects = useProjectList();
  const [scope, setScope] = useStorage<Scope>("scope", "active");
  const [days, setDays] = useStorage<number>("days", 7);
  const projectId = scope === "all" ? undefined : scope === "active" ? active?.id : scope;
  const project = projects.find((p) => p.id === projectId);
  const needsProject = scope !== "all" && !project;
  const summary = useHostCall<Summary>(
    "summary",
    { projectId: projectId ?? null, days },
    { skip: needsProject },
  );
  useJigEvent("chat.finished", () => summary.reload());

  const scopeMenu = (at: HTMLElement) => {
    const items: MenuInput[] = [
      {
        label: active ? `Active project (${active.name})` : "Active project",
        icon: "crosshair",
        checked: scope === "active",
        testId: "chat-time-scope-active",
        onSelect: () => void setScope("active"),
      },
      {
        label: "All projects",
        icon: "layers",
        checked: scope === "all",
        testId: "chat-time-scope-all",
        onSelect: () => void setScope("all"),
      },
    ];
    if (projects.length) items.push({ heading: "Projects" });
    for (const p of projects) {
      items.push({
        label: p.name,
        project: p.id,
        checked: scope === p.id,
        onSelect: () => void setScope(p.id),
      });
    }
    ctx.menu(items, at);
  };
  const periodMenu = (at: HTMLElement) =>
    ctx.menu(
      PERIODS.map((p) => ({
        label: p.label,
        checked: p.days === days,
        onSelect: () => void setDays(p.days),
      })),
      at,
    );

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface text-fg @container" data-testid="chat-time">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-2">
        <button
          type="button"
          className="flex h-7 min-w-0 items-center gap-2 rounded-md px-2 text-sm hover:bg-hover"
          onClick={(e) => scopeMenu(e.currentTarget)}
          data-testid="chat-time-scope"
          title="Which chats: the active project, another project or all projects"
        >
          {scope === "all" ? (
            <Layers className="size-3.5 shrink-0 text-muted" aria-hidden />
          ) : (
            <ProjectSwatch color={project?.color} />
          )}
          <span className="truncate">
            {scope === "all" ? "All projects" : (project?.name ?? "No project")}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-muted" aria-hidden />
        </button>
        <button
          type="button"
          className="flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-sm text-muted hover:bg-hover hover:text-fg"
          onClick={(e) => periodMenu(e.currentTarget)}
          data-testid="chat-time-period"
        >
          {PERIODS.find((p) => p.days === days)?.label ?? `Last ${days} days`}
          <ChevronDown className="size-3.5 shrink-0" aria-hidden />
        </button>
        <div className="flex-1" />
        <div className="flex size-7 shrink-0 items-center justify-center">
          {summary.loading && summary.data ? (
            <Spinner />
          ) : (
            <IconButton icon={RefreshCw} label="Refresh" onClick={() => summary.reload()} />
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {needsProject ? (
          <Empty icon={Hourglass} title="No project open" className="h-full">
            <p className="text-xs text-muted">Open a project, or pick one or All projects above.</p>
          </Empty>
        ) : summary.error ? (
          <Empty icon={Hourglass} title="Couldn't read the chats" className="h-full">
            <p className="text-xs text-muted">{String(summary.error)}</p>
          </Empty>
        ) : !summary.data ? (
          <Spinner center />
        ) : !summary.data.workingMs ? (
          <Empty icon={Hourglass} title="No chat time in this period" className="h-full">
            <p className="text-xs text-muted">Chats that worked in this period show here.</p>
          </Empty>
        ) : (
          <SummaryView ctx={ctx} data={summary.data} days={days} showProject={scope === "all"} />
        )}
      </div>
    </div>
  );
}

function SummaryView({
  ctx,
  data,
  days,
  showProject,
}: {
  ctx: AddonUiContext;
  data: Summary;
  days: number;
  showProject: boolean;
}) {
  const projects = useProjectList();
  const colorOf = (id?: string) => projects.find((p) => p.id === id)?.color;
  const nameOf = (id?: string) => projects.find((p) => p.id === id)?.name ?? "No project";
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-3 @xl:p-4">
      <Stats
        items={[
          {
            label: "Working",
            value: duration(data.workingMs),
            hint: "Summed over chats: two chats working for an hour count two hours",
          },
          {
            label: "Wall clock",
            value: duration(data.overlap.wallMs),
            hint: "Time when at least one of these chats worked",
          },
          { label: "Chats", value: String(data.chats.length), hint: "Chats that worked in this period" },
          {
            label: "Others at once",
            value: crowdLabel(data.overlap),
            hint: `On average this many other chats (any project) worked at the same time; at most ${data.overlap.peak}`,
          },
        ]}
      />
      <BreakdownBlock data={data} />
      {days > 1 && <DayChart days={data.days} />}
      <section>
        <SectionTitle>
          Chats{data.chats.length > MAX_CHATS ? ` (top ${MAX_CHATS} of ${data.chats.length})` : ""}
        </SectionTitle>
        <div className="flex items-center gap-3 px-2 pb-1 text-xs text-hint">
          <span className="min-w-0 flex-1">Chat</span>
          <span className="w-28 shrink-0 @max-lg:hidden @lg:block" />
          <span className="w-12 shrink-0 text-right" title="Other chats working at the same time, on average">
            Others
          </span>
          <span className="w-16 shrink-0 text-right">Time</span>
        </div>
        <div className="flex flex-col">
          {data.chats.slice(0, MAX_CHATS).map((c) => (
            <button
              key={c.sessionId}
              type="button"
              onClick={() => openChatTime(ctx, c.sessionId, c.title)}
              className="flex h-8 items-center gap-3 rounded-md px-2 text-left text-sm hover:bg-hover"
              title={`${c.title}${showProject ? `\n${nameOf(c.projectId)}` : ""}\nShow where this chat's time went`}
              data-testid="chat-time-chat"
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                {showProject && <ProjectSwatch color={colorOf(c.projectId)} />}
                <span className="truncate">{c.title}</span>
              </span>
              <span className="w-28 shrink-0 @max-lg:hidden @lg:block">
                <StackBar totals={c.totals} total={c.workingMs} thin />
              </span>
              <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-muted">
                {crowdLabel(c.overlap)}
              </span>
              <span className="w-16 shrink-0 whitespace-nowrap text-right font-mono text-xs tabular-nums">
                {duration(c.workingMs)}
              </span>
            </button>
          ))}
        </div>
      </section>
      <Slowest ctx={ctx} calls={data.slowest} showChat />
      <Footnote estimated={data.estimated} />
    </div>
  );
}

/* ---------- The tab: one chat ---------- */

export function ChatTimeTab({ ctx, params }: AddonTabProps) {
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : "";
  const chat = useHostCall<ChatBreakdown | null>("chat", { sessionId }, { skip: !sessionId });
  useJigEvent("chat.finished", (e) => {
    if ((e as { sessionId?: string } | undefined)?.sessionId === sessionId) chat.reload();
  });
  const data = chat.data;

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-surface text-fg @container"
      data-testid="chat-time-chat-tab"
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <Hourglass className="size-4 shrink-0 text-muted" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm" title={data?.title}>
          {data?.title ?? "Chat time"}
        </span>
        <Button
          size="sm"
          variant="ghost"
          icon={MessageSquare}
          disabled={!sessionId}
          onClick={() => void ctx.openChat({ sessionId })}
        >
          Open chat
        </Button>
        <div className="flex size-7 shrink-0 items-center justify-center">
          {chat.loading && data ? (
            <Spinner />
          ) : (
            <IconButton icon={RefreshCw} label="Refresh" onClick={() => chat.reload()} />
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {chat.error ? (
          <Empty icon={Hourglass} title="Couldn't read this chat" className="h-full">
            <p className="text-xs text-muted">{String(chat.error)}</p>
          </Empty>
        ) : data === undefined ? (
          <Spinner center />
        ) : data === null || !data.workingMs ? (
          <Empty icon={Hourglass} title="Nothing measured yet" className="h-full">
            <p className="text-xs text-muted">This chat has no finished turns to measure.</p>
          </Empty>
        ) : (
          <div className="mx-auto flex max-w-5xl flex-col gap-5 p-3 @xl:p-4">
            <Stats
              items={[
                {
                  label: "Working",
                  value: duration(data.workingMs),
                  hint: "From each message to its answer, summed",
                },
                {
                  label: "Turns",
                  value: String(data.turns),
                  hint: data.provider === "codex" ? "ChatGPT" : "Claude",
                },
                {
                  label: "Others at once",
                  value: crowdLabel(data.overlap),
                  hint: `On average this many other chats worked at the same time; at most ${data.overlap.peak}`,
                },
                {
                  label: "Shared time",
                  value: percent(data.overlap.sharedMs, data.overlap.ownMs),
                  hint: "Part of its working time while at least one other chat worked",
                },
              ]}
            />
            <BreakdownBlock data={data} />
            <Slowest ctx={ctx} calls={data.slowest} showChat={false} />
            <Footnote estimated={data.estimated} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Shared parts ---------- */

function Stats({ items }: { items: Array<{ label: string; value: string; hint: string }> }) {
  return (
    <div className="grid gap-2 @max-md:grid-cols-2 @md:grid-cols-4">
      {items.map((s) => (
        <div key={s.label} className="flex min-w-0 flex-col rounded-md bg-raised px-3 py-2" title={s.hint}>
          <span className="truncate text-xs text-muted">{s.label}</span>
          <span className="truncate text-base font-medium tabular-nums">{s.value}</span>
        </div>
      ))}
    </div>
  );
}

function StackBar({ totals, total, thin }: { totals: Totals; total: number; thin?: boolean }) {
  return (
    <div
      className={`flex w-full overflow-hidden rounded-sm bg-raised ${thin ? "h-1.5" : "h-3"}`}
      role="img"
      aria-label={CATEGORIES.filter((c) => totals[c])
        .map((c) => `${CATEGORY_LABEL[c]} ${percent(totals[c], total)}`)
        .join(", ")}
    >
      {CATEGORIES.map((c) =>
        totals[c] > 0 ? (
          <div
            key={c}
            className={`${COLOR[c]} h-full`}
            style={{ width: `${(100 * totals[c]) / total}%` }}
            title={`${CATEGORY_LABEL[c]}: ${duration(totals[c])} (${percent(totals[c], total)})`}
          />
        ) : null,
      )}
    </div>
  );
}

function BreakdownBlock({ data }: { data: Breakdown }) {
  return (
    <section className="flex flex-col gap-2">
      <StackBar totals={data.totals} total={data.workingMs} />
      <div className="flex items-center gap-3 px-2 pt-1 text-xs text-hint">
        <span className="min-w-0 flex-1 truncate">Where the time went</span>
        <span className="w-16 shrink-0 text-right">Time</span>
        <span className="w-10 shrink-0 text-right">Share</span>
        <span className="w-12 shrink-0 text-right">Calls</span>
        <span className="size-2.5 shrink-0" />
      </div>
      <div className="flex flex-col" data-testid="chat-time-categories">
        {CATEGORIES.map((c) => (
          <div
            key={c}
            className={`flex h-7 items-center gap-3 px-2 text-sm ${data.totals[c] ? "" : "text-hint"}`}
            title={CATEGORY_HINT[c]}
          >
            <span className="min-w-0 flex-1 truncate">{CATEGORY_LABEL[c]}</span>
            <span className="w-16 shrink-0 whitespace-nowrap text-right font-mono text-xs tabular-nums">
              {data.totals[c] ? duration(data.totals[c]) : "–"}
            </span>
            <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums">
              {percent(data.totals[c], data.workingMs)}
            </span>
            <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-muted">
              {c === "model" ? "" : data.counts[c]}
            </span>
            <span className={`size-2.5 shrink-0 rounded-xs ${COLOR[c]}`} aria-hidden />
          </div>
        ))}
      </div>
    </section>
  );
}

function DayChart({ days }: { days: Summary["days"] }) {
  const max = Math.max(1, ...days.map((d) => d.workingMs));
  const every = days.length > 14 ? Math.ceil(days.length / 7) : 1;
  return (
    <section>
      <SectionTitle>Per day</SectionTitle>
      <div className="flex h-32 items-end gap-1" role="img" aria-label="Working time per day, by category">
        {days.map((d) => (
          <div
            key={d.date}
            className="flex h-full min-w-0 flex-1 flex-col-reverse"
            title={`${d.date}: ${duration(d.workingMs)} working in ${duration(d.overlap.wallMs)} of wall clock · ${crowdLabel(d.overlap)} other chats at once on average (at most ${d.overlap.peak})\n${CATEGORIES.filter(
              (c) => d.totals[c],
            )
              .map((c) => `${CATEGORY_LABEL[c]} ${duration(d.totals[c])}`)
              .join("\n")}`}
          >
            {CATEGORIES.map((c) =>
              d.totals[c] > 0 ? (
                <div key={c} className={COLOR[c]} style={{ height: `${(100 * d.totals[c]) / max}%` }} />
              ) : null,
            )}
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1 text-xs text-hint">
        {days.map((d, i) => (
          <span key={d.date} className="min-w-0 flex-1 truncate text-center">
            {i % every === 0 ? d.date.slice(5) : ""}
          </span>
        ))}
      </div>
      <div
        className="mt-0.5 flex gap-1 font-mono text-xs tabular-nums text-hint"
        title="Other chats working at the same time, on average per day"
        data-testid="chat-time-day-crowd"
      >
        {days.map((d, i) => (
          <span key={d.date} className="min-w-0 flex-1 truncate text-center">
            {i % every === 0 && d.workingMs ? `×${crowdLabel(d.overlap)}` : ""}
          </span>
        ))}
      </div>
    </section>
  );
}

function Slowest({
  ctx,
  calls,
  showChat,
}: {
  ctx: AddonUiContext;
  calls: Breakdown["slowest"];
  showChat: boolean;
}) {
  if (!calls.length) return null;
  return (
    <section>
      <SectionTitle>Slowest calls</SectionTitle>
      <div className="flex flex-col">
        {calls.map((c) => (
          <button
            key={`${c.sessionId}:${c.id}`}
            type="button"
            onClick={() => void ctx.openChat({ sessionId: c.sessionId })}
            className="flex h-8 items-center gap-3 rounded-md px-2 text-left text-sm hover:bg-hover"
            title={`${CATEGORY_LABEL[c.category]} · ${c.name}${c.label ? `\n${c.label}` : ""}${showChat ? `\n${c.chat}` : ""}\nOpen the chat`}
            data-testid="chat-time-slow-call"
          >
            <span className="w-20 shrink-0 whitespace-nowrap text-right font-mono text-xs tabular-nums">
              {c.estimated ? "≈ " : ""}
              {duration(c.ms)}
            </span>
            <span className="w-28 shrink-0 truncate font-mono text-xs text-muted">{shortName(c.name)}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-muted">{c.label}</span>
            {showChat && (
              <span className="w-40 shrink-0 truncate text-right text-xs text-hint @max-xl:hidden @xl:block">
                {c.chat}
              </span>
            )}
            <span
              className="w-4 shrink-0 text-center text-xs text-danger"
              title={c.failed ? "Stopped or failed" : undefined}
            >
              {c.failed ? "!" : ""}
            </span>
            <span className={`size-2.5 shrink-0 rounded-xs ${COLOR[c.category]}`} aria-hidden />
          </button>
        ))}
      </div>
    </section>
  );
}

function Footnote({ estimated }: { estimated: boolean }) {
  return (
    <p className="text-xs text-hint">
      Working time is each turn from your message to the answer, in wall-clock time: chats that work at the
      same time each count it, so "Others at once" says how crowded that time was. Calls that ran in parallel
      within a chat count once.
      {estimated
        ? " ≈ marks an estimate: for ChatGPT chats (and Claude chats without a Claude Code transcript) a call's end is when the chat's next step began."
        : ""}
    </p>
  );
}
