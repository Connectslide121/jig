import {
  Brain,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Copy,
  History,
  Info,
  MoreHorizontal,
  Pencil,
  Square,
  SquareTerminal,
  TriangleAlert,
  Undo2,
  Volume2,
  VolumeOff,
} from "lucide-react";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChatItem } from "../../../shared/engine";
import { agentModels } from "../../../shared/toolModels";
import { Icon } from "../../addons/icons";
import { copyText } from "../../lib/clipboard";
import { clockTime, eventTime, sameDay, shortDay } from "../../lib/time";
import { useConfig } from "../../stores/config";
import { cn, IconButton, JumpToLatest, Markdown, type MenuEntry, openMenuAt, Spinner } from "../../ui";
import { contributedEntries } from "../../workbench/contextMenus";
import { BuildCard } from "../builder/BuildCard";
import { toggleReadAloud, useReading } from "../speech/speak";
import { ChangeCard } from "./ChangeCard";
import { ChatAttachments } from "./ChatAttachments";
import {
  BATCH,
  compactRows,
  type Entry,
  type Row,
  rowIndexOf,
  stepsSummary,
  WINDOW,
  windowStart,
} from "./compact";
import { chatInlineCode } from "./FileLink";
import { HandoffDivider, LimitCard } from "./LimitCard";
import { PermissionCard } from "./PermissionCard";
import { providerName, useChatCapabilities } from "./provider";
import { restoreFiles, rewindChat } from "./restore";
import { useSessions } from "./store";
import { ToolCard } from "./ToolCard";

/** A message's menu: Copy, plus entries add-ons contribute (`context.message`). */
function messageMenu(sessionId: string, text: string, own: MenuEntry[] = []): MenuEntry[] {
  const extra = contributedEntries({ slot: "context.message", sessionId, text });
  return [
    { label: "Copy", icon: Copy, onSelect: () => void copyText(text) },
    ...own,
    ...(extra.length ? [{ separator: true } as const, ...extra] : []),
  ];
}

/** Reads Claude's message aloud with a system voice; again stops it. */
function ReadAloudButton({ id, text }: { id: string; text: string }) {
  const reading = useReading((s) => s.reading === id);
  return (
    <IconButton
      icon={reading ? VolumeOff : Volume2}
      size="sm"
      label={reading ? "Stop reading aloud" : "Read aloud"}
      active={reading}
      aria-pressed={reading}
      data-testid="assistant-read-aloud"
      onClick={() => toggleReadAloud(id, text)}
    />
  );
}

/**
 * Your message's menu: Edit and resend (rewind to before it), Rewind the chat (and the files) to
 * before it, or only Restore files (Claude Code's rewind and file checkpoints).
 */
function userMessageMenu(
  sessionId: string,
  item: Extract<ChatItem, { kind: "user" }>,
  rewind: boolean,
): MenuEntry[] {
  // A provider without rewind (Codex, D-309) keeps only Copy and add-ons' entries.
  if (!rewind) return messageMenu(sessionId, item.text);
  return messageMenu(sessionId, item.text, [
    {
      label: "Edit and send again…",
      icon: Pencil,
      onSelect: () => void rewindChat(sessionId, item.id, false),
      testId: "rewind-edit",
    },
    {
      label: "Rewind to before this message",
      icon: Undo2,
      testId: "rewind-menu",
      submenu: [
        {
          label: "The chat (Claude forgets what came after)",
          onSelect: () => void rewindChat(sessionId, item.id, false),
          testId: "rewind-chat",
        },
        {
          label: "The chat and the files",
          disabled: !item.messageId,
          onSelect: () => void rewindChat(sessionId, item.id, true),
          testId: "rewind-both",
        },
        {
          label: "Only the files (keep the chat)",
          icon: History,
          disabled: !item.messageId,
          onSelect: () => void restoreFiles(sessionId, item.id),
          testId: "restore-files",
        },
      ],
    },
  ]);
}

/** A `!` command you ran: its output, and whether Claude has seen it yet. */
function ShellCard({ item }: { item: Extract<ChatItem, { kind: "shell" }> }) {
  const failed = item.status === "done" && item.exitCode !== 0;
  return (
    <div className="flex flex-col self-end rounded-md border border-line bg-raised" data-testid="shell-card">
      <div className="flex items-center gap-2 px-2 py-1 text-xs">
        <SquareTerminal className="size-3.5 shrink-0 text-warning" />
        <span className="font-mono text-fg">! {item.command}</span>
        {item.status === "running" ? (
          <Spinner size="sm" />
        ) : failed ? (
          <span className="text-2xs text-danger">exit code {item.exitCode}</span>
        ) : null}
      </div>
      {item.output && (
        <pre className="selectable max-h-60 overflow-auto border-t border-line px-2 py-1 font-mono text-2xs leading-4 whitespace-pre-wrap text-muted">
          {item.output}
        </pre>
      )}
      {item.status === "done" && (
        <div className="border-t border-line px-2 py-0.5 text-2xs text-hint">
          {item.sent ? "Claude saw this with your message" : "Claude sees this with your next message"}
        </div>
      )}
    </div>
  );
}

function Thinking({ item }: { item: Extract<ChatItem, { kind: "thinking" }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-xs text-muted">
      <button type="button" className="flex items-center gap-1 hover:text-fg" onClick={() => setOpen(!open)}>
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        <Brain className="size-3.5" />
        {item.streaming ? "Thinking…" : "Thought"}
      </button>
      {open && (
        <div className="selectable mt-1 border-l-2 border-line pl-3 whitespace-pre-wrap">{item.text}</div>
      )}
    </div>
  );
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

export function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}

/** A message's time in its hover toolbar: the clock, and in full (with the gap before it) on hover. */
function ToolbarTime({ at, prevAt }: { at: string; prevAt?: string }) {
  return (
    <span
      className="px-1.5 text-2xs text-hint tabular-nums"
      title={eventTime(at, prevAt)}
      data-testid="message-time"
    >
      {clockTime(at)}
    </span>
  );
}

const Item = memo(function Item({
  item,
  sessionId,
  nested,
  waiting,
  prevAt,
  beforeHandoff,
}: {
  item: ChatItem;
  sessionId: string;
  nested?: ChatItem[];
  /** A tool call waiting for your permission. */
  waiting?: boolean;
  /** When the event before it happened (its time's tooltip says how long after). */
  prevAt?: string;
  /** From before the chat continued with another provider: no rewind to it (D-338). */
  beforeHandoff?: boolean;
}) {
  // Paths Claude writes in inline code are links to the files, from the chat's folder (D-261).
  const cwd = useSessions((s) => s.metas[sessionId]?.cwd);
  const told = useSessions((s) => providerName(s.metas[sessionId] ?? {}));
  const rewind = useChatCapabilities(sessionId).rewind && !beforeHandoff;
  const inlineCode = useMemo(() => chatInlineCode(cwd), [cwd]);
  switch (item.kind) {
    case "user":
      // Sent by Jig, not typed by you (a terminal Claude started has finished; an add-on such as the task
      // queue asking for a report, with its icon): one line, what Claude got in its tooltip, no edit or
      // rewind.
      if (item.from)
        return (
          <div
            className="flex items-center gap-2 rounded-md bg-surface px-3 py-2 text-xs text-muted"
            title={item.text}
            data-testid="jig-message"
          >
            {item.fromIcon ? (
              <Icon name={item.fromIcon} className="size-3.5 shrink-0" />
            ) : (
              <SquareTerminal className="size-3.5 shrink-0" />
            )}
            <span className="selectable min-w-0 flex-1 truncate">{item.from}</span>
            <span className="shrink-0 text-hint">Jig told {told}</span>
          </div>
        );
      return (
        <div className="group/message relative flex flex-col items-end gap-1.5" data-testid="user-message">
          <ChatAttachments files={item.attachments ?? item.images ?? []} className="justify-end" />
          {item.text && (
            <div
              className="selectable max-w-[var(--jig-chat-bubble)] min-w-0 rounded-lg bg-active px-3 py-2 text-sm wrap-anywhere whitespace-pre-wrap text-fg"
              data-testid="user-message-text"
            >
              {item.text}
            </div>
          )}
          <div className="absolute -top-3 right-0 hidden items-center rounded-md border border-line bg-elevated shadow-card group-focus-within/message:flex group-hover/message:flex">
            <ToolbarTime at={item.at} prevAt={prevAt} />
            {rewind && (
              <IconButton
                icon={Pencil}
                size="sm"
                label="Edit and send again (Claude forgets what came after)"
                data-testid="user-message-edit"
                onClick={() => void rewindChat(sessionId, item.id, false)}
              />
            )}
            <IconButton icon={Copy} size="sm" label="Copy" onClick={() => void copyText(item.text)} />
            <IconButton
              icon={MoreHorizontal}
              size="sm"
              label="Message options"
              data-testid="user-message-menu"
              onClick={(e) => openMenuAt(e.currentTarget, userMessageMenu(sessionId, item, rewind), true)}
            />
          </div>
        </div>
      );
    case "assistant":
      return (
        <div data-testid="assistant-message" className="group/message relative">
          <Markdown text={item.text} inlineCode={inlineCode} />
          {item.streaming && !item.text && <Spinner size="sm" />}
          {!item.streaming && item.text && (
            <div className="absolute -top-3 right-0 hidden items-center rounded-md border border-line bg-elevated shadow-card group-hover/message:flex has-aria-pressed:flex">
              <ToolbarTime at={item.at} prevAt={prevAt} />
              <IconButton
                icon={Copy}
                size="sm"
                label="Copy"
                data-testid="assistant-copy"
                onClick={() => void copyText(item.text)}
              />
              <ReadAloudButton id={item.id} text={item.text} />
              <IconButton
                icon={MoreHorizontal}
                size="sm"
                label="Message options"
                onClick={(e) => openMenuAt(e.currentTarget, messageMenu(sessionId, item.text), true)}
              />
            </div>
          )}
        </div>
      );
    case "thinking":
      return <Thinking item={item} />;
    case "tool":
      return (
        <ToolCard item={item} sessionId={sessionId} waiting={waiting} agentModels={agentModels(nested ?? [])}>
          {nested && nested.length > 0
            ? nested.map((child) => <Item key={child.id} item={child} sessionId={sessionId} />)
            : null}
        </ToolCard>
      );
    case "permission":
      return <PermissionCard item={item} sessionId={sessionId} />;
    case "result":
      return (
        <div
          className={cn(
            "flex items-center gap-2 text-2xs",
            item.ok || item.stopped ? "text-hint" : "text-danger",
          )}
          data-testid="turn-result"
        >
          {item.stopped ? <Square className="size-3" /> : !item.ok && <CircleAlert className="size-3" />}
          <span>{item.ok ? "Done" : item.stopped ? "Stopped" : (item.error ?? "Failed")}</span>
          <span>· {formatDuration(item.durationMs)}</span>
          {item.usage && (
            <span>
              ·{" "}
              {formatTokens(
                item.usage.inputTokens + item.usage.cacheReadTokens + item.usage.cacheWriteTokens,
              )}{" "}
              in / {formatTokens(item.usage.outputTokens)} out
            </span>
          )}
          {item.costUsd !== undefined && item.costUsd > 0 && <span>· ≈ ${item.costUsd.toFixed(3)}</span>}
        </div>
      );
    case "build":
      return <BuildCard buildId={item.buildId} />;
    case "shell":
      return <ShellCard item={item} />;
    case "change":
      return <ChangeCard item={item} sessionId={sessionId} />;
    case "limit":
      return <LimitCard item={item} sessionId={sessionId} />;
    case "handoff":
      return <HandoffDivider item={item} />;
    case "notice": {
      const Icon = item.tone === "danger" ? CircleAlert : item.tone === "warning" ? TriangleAlert : Info;
      return (
        <div
          className={cn(
            "flex items-start gap-2 rounded-md px-3 py-2 text-xs",
            item.tone === "danger"
              ? "bg-danger-soft text-danger"
              : item.tone === "warning"
                ? "bg-warning-soft text-warning"
                : "bg-info-soft text-info",
          )}
        >
          <Icon className="mt-px size-3.5 shrink-0" />
          <span className="selectable">{item.text}</span>
        </div>
      );
    }
  }
});

/**
 * A run of steps in the compact view (D-159): one line saying what they did (and what runs now),
 * which opens to the steps' own cards.
 */
function StepsRow({
  row,
  sessionId,
  open,
  onToggle,
  pending,
  live,
  prevAt,
}: {
  row: Extract<Row, { kind: "steps" }>;
  /** When the event before these steps happened (for the line's time tooltip). */
  prevAt?: string;
  sessionId: string;
  open: boolean;
  onToggle: () => void;
  pending: Set<string>;
  /**
   * The chat is working and these are its latest steps: the line shows it's the one in progress even
   * between tools, while Claude writes its next step.
   */
  live?: boolean;
}) {
  const summary = stepsSummary(row.entries);
  const working = summary.running ?? (live ? "Working" : undefined);
  return (
    <div className="flex flex-col" data-testid="steps-row">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        title={row.entries[0] ? eventTime(row.entries[0].item.at, prevAt) : undefined}
        className="-ml-1 flex h-6 max-w-full min-w-0 items-center gap-1.5 self-start rounded-md px-1 text-xs text-muted hover:bg-hover hover:text-fg"
        data-testid="steps-toggle"
        data-working={working ? "true" : undefined}
      >
        {/* One slot for the spinner and the chevron, so the text never moves. */}
        <span className="flex size-4 shrink-0 items-center justify-center">
          {working ? (
            <Spinner size="sm" />
          ) : open ? (
            <ChevronDown className="block size-3.5" />
          ) : (
            <ChevronRight className="block size-3.5" />
          )}
        </span>
        {/* While a step runs the whole line glows, the running tool's name included. */}
        <span className={cn("flex min-w-0 items-center gap-1.5", working && "jig-working-text")}>
          <span className="truncate">{summary.text}</span>
          {working && <span className="shrink-0">· {working}</span>}
        </span>
        {(summary.added > 0 || summary.removed > 0) && (
          <span className="shrink-0 font-mono text-2xs">
            {summary.added > 0 && <span className="text-success">+{summary.added}</span>}
            {summary.removed > 0 && <span className="ml-1 text-danger">−{summary.removed}</span>}
          </span>
        )}
        {summary.detail && !working && <span className="min-w-0 truncate text-hint">· {summary.detail}</span>}
        {summary.failed > 0 && <span className="shrink-0 text-danger">· {summary.failed} failed</span>}
      </button>
      {open && (
        <div className="mt-2 ml-2 flex flex-col gap-3 border-l border-line pl-3">
          {row.entries.map(({ item, children }) => (
            <div key={item.id} data-item-id={item.id} className="flex flex-col">
              <Item
                item={item}
                sessionId={sessionId}
                nested={children}
                waiting={item.kind === "tool" && pending.has(item.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Subagent items (with a parent tool) are shown inside their parent's tool card. */
export function groupItems(items: ChatItem[]): Array<{ item: ChatItem; children: ChatItem[] }> {
  const children = new Map<string, ChatItem[]>();
  const tools = new Set(items.filter((i) => i.kind === "tool").map((i) => i.id));
  const asked = new Set(items.flatMap((i) => (i.kind === "permission" ? [i.request.requestId] : [])));
  const top: ChatItem[] = [];
  for (const item of items) {
    // A question is shown by its own card; its tool call adds nothing.
    if (item.kind === "tool" && item.name === "AskUserQuestion") continue;
    // So is a plan Claude asked you to approve.
    if (item.kind === "tool" && item.name === "ExitPlanMode" && asked.has(item.id)) continue;
    const parentId = "parentId" in item ? item.parentId : undefined;
    if (parentId && tools.has(parentId)) children.set(parentId, [...(children.get(parentId) ?? []), item]);
    else top.push(item);
  }
  return top.map((item) => ({ item, children: children.get(item.id) ?? [] }));
}

/** When a row happened: its item's time, or its first step's. */
const rowAt = (row: Row): string | undefined =>
  row.kind === "steps" ? row.entries[0]?.item.at : row.entry.item.at;
/** A turn's "Done · 2 s" line is a summary, not an event: its time slot stays empty. */
const isResult = (row: Row) => row.kind === "item" && row.entry.item.kind === "result";

/**
 * The time column (Show times, D-306): the row's clock time in a fixed slot at its left, with the
 * day above it when the day changes, so nothing moves as events arrive.
 */
function TimeColumn({ at, prevAt }: { at?: string; prevAt?: string }) {
  const newDay = at && (!prevAt || !sameDay(at, prevAt));
  return (
    <div
      className="w-16 shrink-0 pt-0.5 pr-3 text-right text-2xs leading-5 text-hint tabular-nums select-none"
      title={at ? eventTime(at, prevAt) : undefined}
      data-testid="event-time"
    >
      {at && newDay && <div className="truncate">{shortDay(at)}</div>}
      {at && <div>{clockTime(at)}</div>}
    </div>
  );
}

/** The transcript's rows: every item (detailed), or steps folded per run (compact, D-159). */
function rowsOf(entries: Entry[], compact: boolean, pending: Set<string>): Row[] {
  return compact ? compactRows(entries, pending) : entries.map((entry) => ({ kind: "item", entry }));
}

export function Transcript({
  items,
  sessionId,
  active,
  highlight,
  working = false,
}: {
  items: ChatItem[];
  sessionId: string;
  active: boolean;
  /** Claude is working on this chat now: its latest steps line shows it. */
  working?: boolean;
  /** An item to show and mark (a match of Find in chat). */
  highlight?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const compact = useConfig((s) => s.config?.chat.view ?? "compact") === "compact";
  const times = useConfig((s) => s.config?.chat.times ?? false);
  // Steps rows opened by hand (compact view).
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  const [away, setAway] = useState(false);
  const pending = useMemo(
    () =>
      new Set(
        items.flatMap((i) =>
          i.kind === "permission" && i.status === "pending" ? [i.request.requestId] : [],
        ),
      ),
    [items],
  );
  // The limit card says why the turn stopped: its "Failed" line would only repeat it (D-338).
  const shown = useMemo(
    () => items.filter((item, i) => !(item.kind === "result" && !item.ok && items[i - 1]?.kind === "limit")),
    [items],
  );
  // Messages before the chat's last handoff belong to the provider before it: no rewind to them.
  const handoffAt = useMemo(() => {
    for (let i = items.length - 1; i >= 0; i--) if (items[i]!.kind === "handoff") return items[i]!.id;
    return undefined;
  }, [items]);
  const earlier = useMemo(() => {
    if (!handoffAt) return undefined;
    const ids = new Set<string>();
    for (const item of items) {
      if (item.id === handoffAt) break;
      ids.add(item.id);
    }
    return ids;
  }, [items, handoffAt]);
  const rows = useMemo(() => rowsOf(groupItems(shown), compact, pending), [shown, compact, pending]);
  const [start, setStart] = useState(() => Math.max(0, rows.length - WINDOW));
  const first = windowStart(rows.length, start);
  // A row on screen and where it was, while rows are added above it: it stays where it was.
  const anchor = useRef<{ el: Element; top: number }>(undefined);
  const scrolledTo = useRef<string>(undefined);
  /** Renders `BATCH` more rows above, keeping what's on screen where it is. */
  const revealEarlier = () => {
    const el = ref.current;
    if (!el || first === 0) return;
    const top = el.getBoundingClientRect().top;
    const seen = [...(list.current?.children ?? [])].find((c) => c.getBoundingClientRect().bottom > top);
    if (seen) anchor.current = { el: seen, top: seen.getBoundingClientRect().top };
    setStart(Math.max(0, first - BATCH));
  };
  /** At the bottom again: back to the latest rows only. */
  const trimToLatest = () => {
    if (rows.length - first > WINDOW + BATCH) setStart(rows.length - WINDOW);
  };
  useLayoutEffect(() => {
    const el = ref.current;
    const held = anchor.current;
    if (el && held) {
      anchor.current = undefined;
      // Chromium's scroll anchoring may have done it already; then this moves nothing.
      el.scrollTop += held.el.getBoundingClientRect().top - held.top;
    }
    if (el && stick.current) el.scrollTop = el.scrollHeight;
    // Too few rows to scroll: there's nothing to scroll up with, so show more right away.
    if (el && first > 0 && el.clientHeight > 0 && el.scrollHeight <= el.clientHeight * 2) revealEarlier();
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: on switching tabs and new rows, with the latest rows.
  useEffect(() => {
    const el = ref.current;
    if (active && el && stick.current) el.scrollTop = el.scrollHeight;
    if (stick.current) trimToLatest();
  }, [active, rows.length]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: on a new match, and once its row is rendered.
  useEffect(() => {
    if (!highlight) {
      scrolledTo.current = undefined;
      // Find closed: follow new messages again if you're at the bottom.
      const el = ref.current;
      if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      return;
    }
    stick.current = false;
    if (scrolledTo.current === highlight) return;
    const index = rowIndexOf(rows, highlight);
    // A match above the rendered rows: render down from a little before it, then show it.
    if (index >= 0 && index < first) {
      setStart(Math.max(0, index - 5));
      return;
    }
    scrolledTo.current = highlight;
    ref.current
      ?.querySelector(`[data-item-id="${CSS.escape(highlight)}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlight, first]);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={ref}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
        style={{ scrollbarGutter: "stable" }}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          setAway(el.scrollHeight - el.scrollTop - el.clientHeight > 400);
          if (el.scrollTop < el.clientHeight) revealEarlier();
          else if (stick.current) trimToLatest();
        }}
        data-testid="transcript"
      >
        <div
          ref={list}
          className={cn(
            "mx-auto flex max-w-[var(--jig-chat-width)] min-w-0 flex-col gap-3 py-4 wrap-anywhere",
            times ? "pr-6 pl-2" : "px-6",
          )}
          data-first-row={first}
        >
          {rows.slice(first).map((row, shownIndex) => {
            const index = first + shownIndex;
            const prevAt = index > 0 ? rowAt(rows[index - 1]!) : undefined;
            const content =
              row.kind === "steps" ? (
                <StepsRow
                  key={row.id}
                  row={row}
                  sessionId={sessionId}
                  live={working && index === rows.length - 1}
                  // A match of Find in chat inside opens its row.
                  open={opened.has(row.id) || row.entries.some((e) => e.item.id === highlight)}
                  onToggle={() =>
                    setOpened((current) => {
                      const next = new Set(current);
                      if (next.has(row.id)) next.delete(row.id);
                      else next.add(row.id);
                      return next;
                    })
                  }
                  pending={pending}
                  prevAt={prevAt}
                />
              ) : (
                <div
                  key={row.entry.item.id}
                  data-item-id={row.entry.item.id}
                  className={cn(
                    "flex flex-col rounded-md",
                    highlight === row.entry.item.id && "outline-2 outline-offset-4 outline-accent",
                  )}
                >
                  <Item
                    item={row.entry.item}
                    sessionId={sessionId}
                    nested={row.entry.children}
                    waiting={row.entry.item.kind === "tool" && pending.has(row.entry.item.id)}
                    prevAt={prevAt}
                    beforeHandoff={earlier?.has(row.entry.item.id)}
                  />
                </div>
              );
            if (!times) return content;
            const key = row.kind === "steps" ? row.id : row.entry.item.id;
            return (
              <div key={key} className="flex min-w-0" data-testid="timed-row">
                <TimeColumn at={isResult(row) ? undefined : rowAt(row)} prevAt={prevAt} />
                <div className="flex min-w-0 flex-1 flex-col">{content}</div>
              </div>
            );
          })}
        </div>
      </div>
      {away && (
        <JumpToLatest
          testId="jump-latest"
          onClick={() => {
            const el = ref.current;
            if (!el) return;
            stick.current = true;
            el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
          }}
        />
      )}
    </div>
  );
}
