import { addonToolName } from "@jig/sdk";
import {
  Brain,
  ChartColumn,
  Clock,
  FilePen,
  Globe,
  Maximize2,
  MessageSquare,
  Plug,
  Puzzle,
  ShieldCheck,
  ShieldX,
  Sparkles,
  SquareTerminal,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { type ReactNode, useMemo } from "react";
import {
  type ChatStats,
  chatStats,
  formatDuration,
  relativeTo,
  toolLabel,
  totalTokens,
} from "../../../shared/chatStats";
import type { ChatItem, SessionMeta } from "../../../shared/engine";
import { useAddons } from "../../addons/loader";
import { updateConfig } from "../../stores/config";
import { Badge, type BadgeTone, Button, cn, Dialog, FileIcon, IconButton } from "../../ui";
import { openPreview } from "../preview/actions";
import { formatTokens } from "./Transcript";

const num = (n: number) => (n > 0 ? n.toLocaleString() : "—");

/** Installed add-ons' tools, so a chat's tool calls can be put to the add-on they came from. */
export function useAddonNames(): {
  addonOf: (tool: string) => string | undefined;
  name: (id: string) => string;
} {
  const addons = useAddons((s) => s.addons);
  return useMemo(() => {
    const byTool = new Map<string, string>();
    const names = new Map<string, string>();
    for (const a of addons) {
      names.set(a.id, a.name);
      for (const t of a.manifest?.contributes?.tools ?? [])
        byTool.set(`mcp__jig__${addonToolName(a.id, t.id)}`, a.id);
    }
    return { addonOf: (tool) => byTool.get(tool), name: (id) => names.get(id) ?? id };
  }, [addons]);
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
    <div className="flex h-6 items-center gap-2 px-3 text-xs" data-testid={testId}>
      <Icon className="size-3.5 shrink-0 text-hint" />
      <span className="min-w-0 flex-1 truncate text-muted">{label}</span>
      <span className="shrink-0 text-right tabular-nums text-fg">{value}</span>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col border-t border-line py-2">
      <h3 className="flex h-6 items-center px-3 text-2xs font-semibold text-hint uppercase">{title}</h3>
      {children}
    </div>
  );
}

/** The most-used few of a list, then "+N more" for the rest (all of them are in the details). */
function Top<T>({
  list,
  limit = 5,
  render,
  empty,
}: {
  list: T[];
  limit?: number;
  render: (item: T) => ReactNode;
  empty: string;
}) {
  if (!list.length) return <div className="flex h-6 items-center px-3 text-xs text-hint">{empty}</div>;
  return (
    <>
      {list.slice(0, limit).map(render)}
      {list.length > limit && (
        <div className="flex h-6 items-center px-3 text-xs text-hint">+{list.length - limit} more</div>
      )}
    </>
  );
}

/**
 * The chat overview (D-184): a panel on the chat's right, part of its window, with what happened so
 * far (turns, tool calls, files, skills, subagents, add-ons, MCP, tokens) and the most-used tools,
 * add-ons and skills; Show details opens everything in a modal.
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
  const { addonOf, name } = useAddonNames();
  const stats = useMemo(() => chatStats(items, addonOf), [items, addonOf]);
  return (
    <aside className="flex h-full flex-col border-l border-line bg-surface" data-testid="chat-overview">
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-line pr-1 pl-3">
        <ChartColumn className="size-3.5 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-fg">Overview</span>
        <IconButton
          icon={Maximize2}
          size="sm"
          label="Show details"
          onClick={onDetails}
          data-testid="chat-overview-expand"
        />
        <IconButton
          icon={X}
          size="sm"
          label="Hide the overview (the chart button in the chat's top bar brings it back)"
          onClick={() => void updateConfig({ chat: { overview: false } })}
          data-testid="chat-overview-hide"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col py-2">
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
          <Row icon={Puzzle} label="Add-ons" value={num(stats.addons.length)} testId="chat-overview-addons" />
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
        </div>
        <Group title="Most used tools">
          <Top
            list={stats.tools}
            empty="None yet"
            render={(t) => <Row key={t.name} icon={Wrench} label={toolLabel(t.name)} value={t.calls} />}
          />
        </Group>
        <Group title="Add-ons">
          <Top
            list={stats.addons}
            empty="None used"
            render={(a) => <Row key={a.id} icon={Puzzle} label={name(a.id)} value={a.calls} />}
          />
        </Group>
        <Group title="Skills">
          <Top
            list={stats.skills}
            empty="None used"
            render={(sk) => <Row key={sk.name} icon={Sparkles} label={sk.name} value={sk.count} />}
          />
        </Group>
      </div>
      <div className="shrink-0 border-t border-line p-2">
        <Button
          size="sm"
          variant="ghost"
          icon={Maximize2}
          className="w-full justify-center"
          onClick={onDetails}
          data-testid="chat-overview-details"
        >
          Show details
        </Button>
      </div>
    </aside>
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

function Details({
  meta,
  stats,
  addonName,
}: {
  meta: SessionMeta;
  stats: ChatStats;
  addonName: (id: string) => string;
}) {
  const u = meta.usage;
  const skillUses = stats.skills.reduce((n, s) => n + s.count, 0);
  return (
    <div className="flex flex-col gap-4" data-testid="chat-details">
      <div className="grid grid-cols-5 gap-2">
        <Tile
          label="Turns"
          value={stats.turns}
          sub={
            stats.failedTurns ? (
              <span className="text-danger">{stats.failedTurns} failed</span>
            ) : (
              `${stats.messages} from you`
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
        <Tile
          label="Add-ons"
          value={stats.addons.length}
          sub={(() => {
            const calls = stats.addons.reduce((n, a) => n + a.calls, 0);
            return calls ? `${calls} call${calls === 1 ? "" : "s"}` : undefined;
          })()}
        />
        <Tile
          label="MCP calls"
          value={stats.mcp.reduce((n, m) => n + m.calls, 0)}
          sub={
            stats.mcp.length ? `${stats.mcp.length} server${stats.mcp.length === 1 ? "" : "s"}` : undefined
          }
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

      {stats.addons.length > 0 && (
        <Section title="Add-ons" count={stats.addons.length} testId="chat-details-addons">
          <Head cells={["Tools", "Calls"]} />
          {stats.addons.map((a) => (
            <Line
              key={a.id}
              leading={<Puzzle className="size-3.5 text-hint" />}
              name={addonName(a.id)}
              cells={[a.tools, a.calls]}
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
  const { addonOf, name } = useAddonNames();
  const stats = useMemo(() => (open ? chatStats(items, addonOf) : undefined), [open, items, addonOf]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      width="lg"
      title={`Overview · ${meta.title}`}
      testId="chat-details-dialog"
    >
      {stats && <Details meta={meta} stats={stats} addonName={name} />}
    </Dialog>
  );
}
