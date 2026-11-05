import type { AddonUiContext } from "@jig/sdk";
import {
  Badge,
  Button,
  cn,
  Empty,
  IconButton,
  ProjectSwatch,
  ProviderMark,
  Spinner,
  useAddonEvent,
  useHostCall,
  useProjectList,
} from "@jig/sdk/ui";
import { LayoutDashboard, MessageSquare, MoreHorizontal, Pause, Play, Plus } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { progressText, sizeText } from "./lib/counts";
import {
  cardTime,
  type Dashboard,
  type DashboardSummary,
  type QueueCard,
  type QueueState,
  STATE_LABEL,
  WAITING_LABEL,
} from "./lib/dashboard";
import { formatMs, STATUS_LABEL } from "./lib/tasks";
import { money, ProgressParts, requestQueue, StatusIcon, type Tone } from "./parts";

/**
 * Every project's task queue at a glance (D-326): a summary strip, then one card per project that has a
 * queue, needing you first. It follows the host's `changed` event like the Tasks view; only the running
 * tasks' times tick here. Each card has the same fixed rows, so nothing moves as the queues change.
 */

const STATE_TONE: Record<QueueState, Tone> = {
  needs_you: "warning",
  running: "info",
  paused: "neutral",
  finished: "success",
  idle: "neutral",
};

/** Opens the Tasks view on a project's queue. */
export function openQueue(ctx: AddonUiContext, projectId: string) {
  requestQueue(projectId);
  ctx.showView("tasks");
}

export function DashboardView({ ctx, onAdd }: { ctx: AddonUiContext; onAdd: () => void }) {
  const { data, error, reload } = useHostCall<Dashboard>("dashboard");
  useAddonEvent("changed", () => void reload());
  const projects = useProjectList();
  // A project added or removed changes the cards and the count of projects without a queue.
  useEffect(() => void reload(), [projects.length]);
  // The running tasks' times tick.
  const [now, setNow] = useState(Date.now());
  const ticking = data?.cards.some((c) => c.current);
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [ticking]);

  if (!data) return error ? <div className="p-3 text-xs text-danger">{error}</div> : <Spinner center />;
  if (!data.cards.length)
    return (
      <Empty icon={LayoutDashboard} title="No task queues yet" className="h-full">
        <div className="max-w-sm text-xs text-muted">
          Each project has its own task queue. Add prompts and press Start: Claude does them one after
          another, and every queue shows here.
        </div>
        <Button size="sm" icon={Plus} onClick={onAdd} data-testid="tasks-dashboard-add">
          Add tasks
        </Button>
      </Empty>
    );

  const project = (id: string) => projects.find((p) => p.id === id);
  return (
    <div className="@container h-full min-h-0 overflow-auto" data-testid="tasks-dashboard">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4">
        <Summary summary={data.summary} />
        <div className="@max-2xl:grid-cols-1 @2xl:@max-5xl:grid-cols-2 @5xl:grid-cols-3 grid gap-3">
          {data.cards.map((card) => {
            const p = project(card.projectId);
            return p ? (
              <QueueCardView
                key={card.projectId}
                ctx={ctx}
                card={card}
                name={p.name}
                color={p.color}
                now={now}
              />
            ) : null;
          })}
        </div>
        <div className="h-5 text-center text-xs text-hint" data-testid="tasks-dashboard-empty-count">
          {data.empty > 0 && `${data.empty} ${data.empty === 1 ? "project has" : "projects have"} no queue`}
        </div>
      </div>
    </div>
  );
}

/** Six fixed slots: three per row in a narrow place, all six in one row when there's room. */
function Summary({ summary: s }: { summary: DashboardSummary }) {
  const tiles: Array<{ label: string; value: string; tone?: string }> = [
    { label: "Queues running", value: String(s.queuesRunning), tone: s.queuesRunning ? "text-info" : "" },
    { label: "Tasks running", value: String(s.tasksRunning) },
    { label: "Needs you", value: String(s.needsYou), tone: s.needsYou ? "text-warning" : "" },
    { label: "Queued", value: String(s.queued) },
    { label: "Finished today", value: String(s.finishedToday) },
    { label: "Cost today", value: money(s.costToday) },
  ];
  return (
    <div className="@max-4xl:grid-cols-3 @4xl:grid-cols-6 grid gap-2" data-testid="tasks-dashboard-summary">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="flex h-16 min-w-0 flex-col justify-center gap-1 rounded-lg border border-line bg-raised px-3"
        >
          <span className="truncate text-2xs font-medium tracking-wide text-hint uppercase">{t.label}</span>
          <span className={cn("text-lg font-semibold tabular-nums text-fg", t.tone)}>{t.value}</span>
        </div>
      ))}
    </div>
  );
}

/** A row of the card: a label, an icon slot, the text, and a right-aligned value, each in its place. */
function Row({
  label,
  icon,
  children,
  value,
  testId,
}: {
  label?: string;
  icon?: ReactNode;
  children?: ReactNode;
  value?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="flex h-5 min-w-0 items-center gap-2 text-xs" data-testid={testId}>
      <span className="w-14 shrink-0 text-2xs font-medium tracking-wide text-hint uppercase">{label}</span>
      <span className="flex w-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="flex min-w-0 flex-1 items-center gap-1 truncate">{children}</span>
      <span className="w-20 shrink-0 truncate text-right tabular-nums text-muted">{value}</span>
    </div>
  );
}

const nothing = (text: string) => <span className="truncate text-hint">{text}</span>;

function QueueCardView({
  ctx,
  card,
  name,
  color,
  now,
}: {
  ctx: AddonUiContext;
  card: QueueCard;
  name: string;
  color?: string;
  now: number;
}) {
  const call = (method: "start" | "pause") =>
    void ctx.host
      .call(method, { projectId: card.projectId })
      .catch((e: Error) => ctx.notify({ title: e.message, tone: "danger" }));
  const toggle = card.running
    ? { label: "Pause", icon: Pause, run: () => call("pause") }
    : { label: "Start", icon: Play, run: () => call("start") };
  const canToggle = card.running || card.ready > 0;
  const current = card.current;
  const openChat = () => current?.sessionId && void ctx.openChat({ sessionId: current.sessionId });
  const menu = (at: MouseEvent | HTMLElement) =>
    ctx.menu(
      [
        { label: "Open queue", icon: "list-todo", onSelect: () => openQueue(ctx, card.projectId) },
        {
          label: "Open current chat",
          icon: "message-square",
          disabled: !current?.sessionId,
          onSelect: openChat,
        },
        { separator: true as const },
        {
          label: toggle.label,
          icon: card.running ? "pause" : "play",
          disabled: !canToggle,
          onSelect: toggle.run,
        },
      ],
      at,
    );
  const time = formatMs(cardTime(card, now));
  return (
    <div
      role="button"
      tabIndex={0}
      title={`Open ${name}'s queue`}
      data-testid={`tasks-dashboard-card-${name}`}
      onClick={() => openQueue(ctx, card.projectId)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) openQueue(ctx, card.projectId);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        menu(e.nativeEvent);
      }}
      className="group flex min-w-0 cursor-default flex-col gap-2 rounded-lg border border-line bg-raised p-3 hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent"
    >
      <div className="flex h-6 min-w-0 items-center gap-2">
        <ProjectSwatch color={color} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{name}</span>
        <span className="flex shrink-0 items-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
          <IconButton
            size="sm"
            icon={toggle.icon}
            label={toggle.label}
            disabled={!canToggle}
            data-testid={`tasks-dashboard-toggle-${name}`}
            onClick={(e) => {
              e.stopPropagation();
              toggle.run();
            }}
          />
          <IconButton
            size="sm"
            icon={MoreHorizontal}
            label="More"
            onClick={(e) => {
              e.stopPropagation();
              menu(e.currentTarget);
            }}
          />
        </span>
        {/* Who runs its new chats: the queue's "Runs on", else the project's default (D-330). */}
        <span className="flex w-4 shrink-0 justify-center" data-testid={`tasks-dashboard-provider-${name}`}>
          <ProviderMark provider={card.provider} iconOnly />
        </span>
        <span className="flex w-20 shrink-0 justify-end">
          <Badge tone={STATE_TONE[card.state]}>
            <span data-testid={`tasks-dashboard-state-${name}`}>{STATE_LABEL[card.state]}</span>
          </Badge>
        </span>
      </div>
      <ProgressParts
        counts={card.counts}
        className="h-1.5 rounded-full bg-active"
        testId={`tasks-dashboard-bar-${name}`}
      />
      <div
        className="h-5 truncate text-xs tabular-nums text-muted"
        data-testid={`tasks-dashboard-counts-${name}`}
      >
        {[
          progressText(card.counts),
          sizeText(card.counts),
          time,
          card.costUsd !== undefined && money(card.costUsd),
        ]
          .filter(Boolean)
          .join(" · ")}
      </div>
      <div className="flex flex-col border-t border-line pt-2">
        <Row
          label="Now"
          icon={current ? <StatusIcon status={current.status} /> : null}
          value={current?.sentAt ? formatMs(now - Date.parse(current.sentAt)) || "0s" : ""}
          testId={`tasks-dashboard-now-${name}`}
        >
          {current ? <span className="truncate text-fg">{current.title}</span> : nothing("Nothing running")}
        </Row>
        <Row>
          {current && (
            <>
              {current.status === "needs_you" && (
                <span className="shrink-0 text-warning">
                  {current.waitingFor ? WAITING_LABEL[current.waitingFor] : "Needs you"} ·
                </span>
              )}
              {current.sessionId ? (
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-1 text-accent hover:underline"
                  title="Open the chat"
                  data-testid={`tasks-dashboard-chat-${name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    openChat();
                  }}
                >
                  <MessageSquare className="size-3.5 shrink-0" />
                  <span className="truncate">{current.chatTitle}</span>
                </button>
              ) : (
                nothing("Starting its chat…")
              )}
            </>
          )}
        </Row>
      </div>
      <div className="flex flex-col">
        <Row label="Up next" icon={card.next[0] ? <StatusIcon status="queued" /> : null}>
          {card.next[0] ? (
            <span className="truncate text-fg">{card.next[0]}</span>
          ) : (
            nothing("Nothing queued")
          )}
        </Row>
        <Row
          icon={card.next[1] ? <StatusIcon status="queued" /> : null}
          value={card.more > 0 ? `+${card.more} more` : ""}
        >
          {card.next[1] && <span className="truncate text-fg">{card.next[1]}</span>}
        </Row>
      </div>
      <Row
        label="Last"
        icon={card.last ? <StatusIcon status={card.last.status} /> : null}
        value={card.last ? STATUS_LABEL[card.last.status] : ""}
        testId={`tasks-dashboard-last-${name}`}
      >
        {card.last ? <span className="truncate text-fg">{card.last.title}</span> : nothing("None yet")}
      </Row>
    </div>
  );
}
