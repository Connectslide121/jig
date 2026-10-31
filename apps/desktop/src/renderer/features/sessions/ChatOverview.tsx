import {
  Brain,
  ChartColumn,
  Clock,
  FilePen,
  Globe,
  Maximize2,
  MessageSquare,
  Minimize2,
  Plug,
  ShieldCheck,
  ShieldX,
  Sparkles,
  SquareTerminal,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  type ChatStats,
  chatStats,
  formatDuration,
  relativeTo,
  toolLabel,
  totalTokens,
} from "../../../shared/chatStats";
import type { ChatItem, SessionMeta } from "../../../shared/engine";
import { updateConfig } from "../../stores/config";
import { Badge, type BadgeTone, Button, cn, Dialog, FileIcon, IconButton } from "../../ui";
import { openPreview } from "../preview/actions";
import { formatTokens } from "./Transcript";

/** The card's width (w-56, in rem) and the room it keeps from the chat's text (its column's padding helps). */
const CARD_REM = 14;
const GAP_PX = 4;

const num = (n: number) => (n > 0 ? n.toLocaleString() : "—");

/**
 * Whether the chat's right margin (beside its centred column) has room for the card, so the card
 * never covers what Claude says. Measured on the box the card floats in.
 */
function useRoomForCard(box: React.RefObject<HTMLDivElement | null>) {
  const [room, setRoom] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const root = getComputedStyle(document.documentElement);
      const rem = Number.parseFloat(root.fontSize) || 16;
      const column = (Number.parseFloat(root.getPropertyValue("--jig-chat-width")) || 52) * rem;
      const margin = (el.clientWidth - Math.min(el.clientWidth, column)) / 2;
      setRoom(margin >= CARD_REM * rem + GAP_PX);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [box]);
  return room;
}

function Row({
  icon: Icon,
  label,
  value,
  testId,
}: {
  icon: typeof Wrench;
  label: string;
  value: ReactNode;
  testId?: string;
}) {
  return (
    <div className="flex h-6 items-center gap-2 text-xs" data-testid={testId}>
      <Icon className="size-3.5 shrink-0 text-hint" />
      <span className="min-w-0 flex-1 truncate text-muted">{label}</span>
      <span className="shrink-0 text-right tabular-nums text-fg">{value}</span>
    </div>
  );
}

/**
 * The chat overview (D-184): a small card floating at the chat's right with what happened so far
 * (turns, tool calls, files, skills, subagents, MCP, tokens), and Details for everything. Where the
 * chat has no room beside its column it shrinks to a pill, so it never covers the transcript unless you
 * open it.
 */
export function ChatOverview({
  meta,
  items,
  onDetails,
}: {
  meta: SessionMeta;
  items: ChatItem[];
  onDetails: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const room = useRoomForCard(box);
  // Without room the pill opens the card over the chat on purpose; it folds back with Minimize.
  const [expanded, setExpanded] = useState(false);
  const stats = useMemo(() => chatStats(items), [items]);
  return (
    <div ref={box} className="pointer-events-none absolute inset-0 z-10">
      {room || expanded ? (
        <div
          className="pointer-events-auto absolute top-3 right-5 w-56 rounded-lg border border-line bg-elevated p-2 shadow-popover"
          data-testid="chat-overview"
        >
          <div className="flex h-6 items-center gap-1.5 pb-1">
            <ChartColumn className="size-3.5 shrink-0 text-muted" />
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-fg">This chat</span>
            {!room && (
              <IconButton
                icon={Minimize2}
                size="sm"
                label="Fold into a small pill"
                onClick={() => setExpanded(false)}
                data-testid="chat-overview-fold"
              />
            )}
            <IconButton
              icon={X}
              size="sm"
              label="Hide the overview (the chart button in the chat's top bar brings it back)"
              onClick={() => void updateConfig({ chat: { overview: false } })}
              data-testid="chat-overview-hide"
            />
          </div>
          <Row
            icon={Clock}
            label={`${stats.turns} turn${stats.turns === 1 ? "" : "s"}`}
            value={stats.workingMs ? formatDuration(stats.workingMs) : "—"}
          />
          <Row icon={Wrench} label="Tool calls" value={num(stats.toolCalls)} testId="chat-overview-tools" />
          <Row
            icon={FilePen}
            label={`Files changed${stats.files.length ? ` · ${stats.files.length}` : ""}`}
            value={
              stats.files.length ? (
                <>
                  <span className="text-success">+{stats.linesAdded}</span>{" "}
                  <span className="text-danger">−{stats.linesRemoved}</span>
                </>
              ) : (
                "—"
              )
            }
          />
          <Row icon={SquareTerminal} label="Commands" value={num(stats.bash)} />
          <Row
            icon={Sparkles}
            label="Skills"
            value={num(stats.skills.reduce((n, s) => n + s.count, 0))}
            testId="chat-overview-skills"
          />
          <Row icon={Users} label="Subagents" value={num(stats.subagents.length)} />
          <Row icon={Plug} label="MCP calls" value={num(stats.mcp.reduce((n, s) => n + s.calls, 0))} />
          <Row
            icon={MessageSquare}
            label="Tokens"
            value={
              meta.turns > 0
                ? `${formatTokens(totalTokens(meta))}${meta.costUsd > 0 ? ` · $${meta.costUsd.toFixed(2)}` : ""}`
                : "—"
            }
          />
          <Button
            size="sm"
            variant="ghost"
            icon={Maximize2}
            className="mt-1 w-full justify-center"
            onClick={onDetails}
            data-testid="chat-overview-details"
          >
            Show details
          </Button>
        </div>
      ) : (
        <button
          type="button"
          className="pointer-events-auto absolute top-2 right-5 flex h-6 items-center gap-1.5 rounded-full border border-line bg-elevated px-2 text-2xs text-muted shadow-popover hover:text-fg"
          onClick={() => setExpanded(true)}
          title="This chat's overview: tools, skills, subagents, files, tokens"
          data-testid="chat-overview-pill"
        >
          <ChartColumn className="size-3" />
          <span className="tabular-nums">{`${stats.toolCalls} tool${stats.toolCalls === 1 ? "" : "s"}`}</span>
        </button>
      )}
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-line bg-surface px-3 py-2">
      <span className="truncate text-2xs text-hint uppercase">{label}</span>
      <span className="truncate text-base font-semibold text-fg tabular-nums">{value}</span>
      <span className="h-4 truncate text-2xs text-muted">{sub}</span>
    </div>
  );
}

function Section({
  title,
  count,
  children,
  testId,
}: {
  title: string;
  count?: number;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section className="flex flex-col gap-1" data-testid={testId}>
      <h3 className="flex items-center gap-2 text-xs font-semibold text-muted uppercase">
        <span className="flex-1">{title}</span>
        {count !== undefined && <span className="tabular-nums text-hint">{count}</span>}
      </h3>
      <div className="flex flex-col rounded-md border border-line">{children}</div>
    </section>
  );
}

/** A row of a details table: the name, then fixed right-aligned columns. */
function Line({
  leading,
  name,
  cells,
  onClick,
}: {
  leading?: ReactNode;
  name: ReactNode;
  cells: ReactNode[];
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="flex size-4 shrink-0 items-center justify-center">{leading}</span>
      <span className="min-w-0 flex-1 truncate text-left">{name}</span>
      {cells.map((c, i) => (
        <span key={i} className="w-16 shrink-0 truncate text-right tabular-nums">
          {c}
        </span>
      ))}
    </>
  );
  const className = "flex h-7 items-center gap-2 border-line px-2 text-xs not-last:border-b";
  return onClick ? (
    <button type="button" className={cn(className, "hover:bg-hover")} onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}

function Head({ cells }: { cells: string[] }) {
  return (
    <div className="flex h-6 items-center gap-2 border-b border-line bg-surface px-2 text-2xs text-hint">
      <span className="size-4 shrink-0" />
      <span className="flex-1" />
      {cells.map((c) => (
        <span key={c} className="w-16 shrink-0 text-right">
          {c}
        </span>
      ))}
    </div>
  );
}

const SUBAGENT_TONE: Record<string, BadgeTone> = {
  running: "info",
  completed: "success",
  failed: "danger",
  stopped: "neutral",
};

function Details({ meta, stats }: { meta: SessionMeta; stats: ChatStats }) {
  const u = meta.usage;
  const skillUses = stats.skills.reduce((n, s) => n + s.count, 0);
  return (
    <div className="flex flex-col gap-4" data-testid="chat-details">
      <div className="grid grid-cols-4 gap-2">
        <Tile
          label="Turns"
          value={stats.turns}
          sub={
            stats.failedTurns ? (
              <span className="text-danger">{stats.failedTurns} failed</span>
            ) : (
              `${stats.messages} messages from you`
            )
          }
        />
        <Tile
          label="Claude worked"
          value={stats.workingMs ? formatDuration(stats.workingMs) : "—"}
          sub={`${stats.replies} answers`}
        />
        <Tile
          label="Tool calls"
          value={stats.toolCalls}
          sub={
            stats.toolErrors ? (
              <span className="text-danger">{stats.toolErrors} failed</span>
            ) : stats.subagentToolCalls ? (
              `${stats.subagentToolCalls} by subagents`
            ) : undefined
          }
        />
        <Tile
          label="Files changed"
          value={stats.files.length}
          sub={
            stats.files.length ? (
              <>
                <span className="text-success">+{stats.linesAdded}</span>{" "}
                <span className="text-danger">−{stats.linesRemoved}</span> · {stats.filesRead} read
              </>
            ) : (
              `${stats.filesRead} read`
            )
          }
        />
        <Tile
          label="Tokens"
          value={formatTokens(totalTokens(meta))}
          sub={meta.costUsd > 0 ? `≈ $${meta.costUsd.toFixed(2)}` : undefined}
        />
        <Tile
          label="Context"
          value={meta.context ? `${Math.round(meta.context.percent)}%` : "—"}
          sub={
            meta.context
              ? `${formatTokens(meta.context.usedTokens)} of ${formatTokens(meta.context.maxTokens)}`
              : undefined
          }
        />
        <Tile
          label="Skills"
          value={skillUses}
          sub={stats.skills.length ? `${stats.skills.length} different` : undefined}
        />
        <Tile
          label="Subagents"
          value={stats.subagents.length}
          sub={meta.activeModel || meta.model || undefined}
        />
      </div>

      <Section title="Tools" count={stats.tools.length} testId="chat-details-tools">
        <Head cells={["Calls", "Failed"]} />
        {stats.tools.length ? (
          stats.tools.map((t) => (
            <Line
              key={t.name}
              leading={<Wrench className="size-3.5 text-hint" />}
              name={toolLabel(t.name)}
              cells={[
                t.calls,
                t.errors ? (
                  <span key="e" className="text-danger">
                    {t.errors}
                  </span>
                ) : (
                  "—"
                ),
              ]}
            />
          ))
        ) : (
          <Line name={<span className="text-hint">No tools used yet</span>} cells={[]} />
        )}
      </Section>

      {(stats.skills.length > 0 || stats.commands.length > 0) && (
        <Section
          title="Skills and commands"
          count={stats.skills.length + stats.commands.length}
          testId="chat-details-skills"
        >
          <Head cells={["Times"]} />
          {stats.skills.map((s) => (
            <Line
              key={`s:${s.name}`}
              leading={<Sparkles className="size-3.5 text-hint" />}
              name={`${s.name} (Claude used it)`}
              cells={[s.count]}
            />
          ))}
          {stats.commands.map((c) => (
            <Line
              key={`c:${c.name}`}
              leading={<SquareTerminal className="size-3.5 text-hint" />}
              name={`/${c.name} (you ran it)`}
              cells={[c.count]}
            />
          ))}
        </Section>
      )}

      {stats.subagents.length > 0 && (
        <Section title="Subagents" count={stats.subagents.length} testId="chat-details-subagents">
          <Head cells={["Tools", "Tokens", "Time", ""]} />
          {stats.subagents.map((a) => (
            <Line
              key={a.id}
              leading={<Users className="size-3.5 text-hint" />}
              name={
                <>
                  {a.description || a.type} <span className="text-hint">{a.type}</span>
                </>
              }
              cells={[
                a.toolUses || "—",
                a.tokens ? formatTokens(a.tokens) : "—",
                a.durationMs ? formatDuration(a.durationMs) : "—",
                <Badge key="s" tone={SUBAGENT_TONE[a.status] ?? "neutral"}>
                  {a.status === "completed" ? "done" : a.status}
                </Badge>,
              ]}
            />
          ))}
        </Section>
      )}

      {stats.mcp.length > 0 && (
        <Section title="MCP servers" count={stats.mcp.length} testId="chat-details-mcp">
          <Head cells={["Tools", "Calls"]} />
          {stats.mcp.map((s) => (
            <Line
              key={s.server}
              leading={<Plug className="size-3.5 text-hint" />}
              name={s.server}
              cells={[s.tools, s.calls]}
            />
          ))}
        </Section>
      )}

      {stats.files.length > 0 && (
        <Section title="Files changed" count={stats.files.length} testId="chat-details-files">
          <Head cells={["Edits", "Added", "Removed"]} />
          {stats.files.map((f) => (
            <Line
              key={f.path}
              leading={<FileIcon path={f.path} className="size-3.5" />}
              name={relativeTo(meta.cwd, f.path)}
              cells={[
                f.edits,
                <span key="a" className="text-success">
                  +{f.added}
                </span>,
                <span key="r" className="text-danger">
                  −{f.removed}
                </span>,
              ]}
              onClick={() => openPreview(f.path)}
            />
          ))}
        </Section>
      )}

      <Section title="Activity">
        <Line
          leading={<SquareTerminal className="size-3.5 text-hint" />}
          name="Commands Claude ran"
          cells={[num(stats.bash)]}
        />
        <Line
          leading={<SquareTerminal className="size-3.5 text-hint" />}
          name="Commands you ran (!)"
          cells={[num(stats.shell)]}
        />
        <Line
          leading={<Globe className="size-3.5 text-hint" />}
          name="Web searches and pages"
          cells={[num(stats.web)]}
        />
        <Line
          leading={<Brain className="size-3.5 text-hint" />}
          name="Thinking blocks"
          cells={[num(stats.thinking)]}
        />
        <Line
          leading={<ShieldCheck className="size-3.5 text-hint" />}
          name="Permissions asked"
          cells={[num(stats.permissions.asked)]}
        />
        <Line
          leading={<ShieldCheck className="size-3.5 text-hint" />}
          name="Permissions allowed"
          cells={[num(stats.permissions.allowed)]}
        />
        <Line
          leading={<ShieldX className="size-3.5 text-hint" />}
          name="Permissions denied"
          cells={[num(stats.permissions.denied)]}
        />
      </Section>

      <Section title="Tokens">
        <Line name="Input" cells={[formatTokens(u.inputTokens)]} />
        <Line name="Output" cells={[formatTokens(u.outputTokens)]} />
        <Line name="Cache read" cells={[formatTokens(u.cacheReadTokens)]} />
        <Line name="Cache write" cells={[formatTokens(u.cacheWriteTokens)]} />
      </Section>
    </div>
  );
}

/** The chat overview's details, in a modal. */
export function ChatDetailsDialog({
  meta,
  items,
  open,
  onClose,
}: {
  meta: SessionMeta;
  items: ChatItem[];
  open: boolean;
  onClose: () => void;
}) {
  const stats = useMemo(() => (open ? chatStats(items) : undefined), [open, items]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      width="lg"
      title={`Overview · ${meta.title}`}
      testId="chat-details-dialog"
    >
      {stats && <Details meta={meta} stats={stats} />}
    </Dialog>
  );
}
