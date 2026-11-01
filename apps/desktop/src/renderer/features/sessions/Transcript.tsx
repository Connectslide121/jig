import {
  ArrowDown,
  Brain,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Copy,
  History,
  Info,
  MoreHorizontal,
  Pencil,
  SquareTerminal,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChatItem } from "../../../shared/engine";
import { agentModels } from "../../../shared/toolModels";
import { useConfig } from "../../stores/config";
import { cn, IconButton, Markdown, type MenuEntry, openMenuAt, Spinner } from "../../ui";
import { contributedEntries } from "../../workbench/contextMenus";
import { BuildCard } from "../builder/BuildCard";
import { ChangeCard } from "./ChangeCard";
import { ChatAttachments } from "./ChatAttachments";
import { compactRows, type Entry, type Row, stepsSummary } from "./compact";
import { PermissionCard } from "./PermissionCard";
import { restoreFiles, rewindChat } from "./restore";
import { ToolCard } from "./ToolCard";

/** A message's menu: Copy, plus entries add-ons contribute (`context.message`). */
function messageMenu(sessionId: string, text: string, own: MenuEntry[] = []): MenuEntry[] {
  const extra = contributedEntries({ slot: "context.message", sessionId, text });
  return [
    { label: "Copy", icon: Copy, onSelect: () => void navigator.clipboard.writeText(text) },
    ...own,
    ...(extra.length ? [{ separator: true } as const, ...extra] : []),
  ];
}

/**
 * Your message's menu: Edit and resend (rewind to before it), Rewind the chat (and the files) to
 * before it, or only Restore files (Claude Code's rewind and file checkpoints).
 */
function userMessageMenu(sessionId: string, item: Extract<ChatItem, { kind: "user" }>): MenuEntry[] {
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

const Item = memo(function Item({
  item,
  sessionId,
  nested,
  waiting,
}: {
  item: ChatItem;
  sessionId: string;
  nested?: ChatItem[];
  /** A tool call waiting for your permission. */
  waiting?: boolean;
}) {
  switch (item.kind) {
    case "user":
      return (
        <div className="group/message relative flex flex-col items-end gap-1.5" data-testid="user-message">
          <ChatAttachments files={item.attachments ?? item.images ?? []} className="justify-end" />
          {item.text && (
            <div className="selectable max-w-[var(--jig-chat-bubble)] min-w-0 rounded-lg bg-active px-3 py-2 text-sm wrap-anywhere whitespace-pre-wrap text-fg">
              {item.text}
            </div>
          )}
          <div className="absolute -top-3 right-0 hidden items-center rounded-md border border-line bg-elevated shadow-card group-focus-within/message:flex group-hover/message:flex">
            <IconButton
              icon={Pencil}
              size="sm"
              label="Edit and send again (Claude forgets what came after)"
              data-testid="user-message-edit"
              onClick={() => void rewindChat(sessionId, item.id, false)}
            />
            <IconButton
              icon={Copy}
              size="sm"
              label="Copy"
              onClick={() => void navigator.clipboard.writeText(item.text)}
            />
            <IconButton
              icon={MoreHorizontal}
              size="sm"
              label="Message options"
              data-testid="user-message-menu"
              onClick={(e) => openMenuAt(e.currentTarget, userMessageMenu(sessionId, item), true)}
            />
          </div>
        </div>
      );
    case "assistant":
      return (
        <div data-testid="assistant-message" className="group/message relative">
          <Markdown text={item.text} />
          {item.streaming && !item.text && <Spinner size="sm" />}
          {!item.streaming && item.text && (
            <div className="absolute -top-3 right-0 hidden items-center rounded-md border border-line bg-elevated shadow-card group-hover/message:flex">
              <IconButton
                icon={Copy}
                size="sm"
                label="Copy"
                data-testid="assistant-copy"
                onClick={() => void navigator.clipboard.writeText(item.text)}
              />
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
          className={cn("flex items-center gap-2 text-2xs", item.ok ? "text-hint" : "text-danger")}
          data-testid="turn-result"
        >
          {!item.ok && <CircleAlert className="size-3" />}
          <span>{item.ok ? "Done" : (item.error ?? "Failed")}</span>
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
}: {
  row: Extract<Row, { kind: "steps" }>;
  sessionId: string;
  open: boolean;
  onToggle: () => void;
  pending: Set<string>;
}) {
  const summary = stepsSummary(row.entries);
  return (
    <div className="flex flex-col" data-testid="steps-row">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex max-w-full min-w-0 items-center gap-1.5 self-start rounded-md px-1 py-0.5 text-xs text-muted hover:bg-hover hover:text-fg"
        data-testid="steps-toggle"
      >
        {summary.running ? (
          <Spinner size="sm" />
        ) : open ? (
          <ChevronDown className="size-3.5 shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" />
        )}
        <span className={cn("truncate", summary.running && "jig-working-text")}>{summary.text}</span>
        {(summary.added > 0 || summary.removed > 0) && (
          <span className="shrink-0 font-mono text-2xs">
            {summary.added > 0 && <span className="text-success">+{summary.added}</span>}
            {summary.removed > 0 && <span className="ml-1 text-danger">−{summary.removed}</span>}
          </span>
        )}
        {summary.detail && !summary.running && (
          <span className="min-w-0 truncate text-hint">· {summary.detail}</span>
        )}
        {summary.failed > 0 && <span className="shrink-0 text-danger">· {summary.failed} failed</span>}
        {summary.running && <span className="min-w-0 truncate text-hint">· {summary.running}</span>}
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

/** The transcript's rows: every item (detailed), or steps folded per run (compact, D-159). */
function rowsOf(entries: Entry[], compact: boolean, pending: Set<string>): Row[] {
  return compact ? compactRows(entries, pending) : entries.map((entry) => ({ kind: "item", entry }));
}

export function Transcript({
  items,
  sessionId,
  active,
  highlight,
}: {
  items: ChatItem[];
  sessionId: string;
  active: boolean;
  /** An item to show and mark (a match of Find in chat). */
  highlight?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const compact = useConfig((s) => s.config?.chat.view ?? "compact") === "compact";
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
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  });
  useEffect(() => {
    const el = ref.current;
    if (active && el && stick.current) el.scrollTop = el.scrollHeight;
  }, [active]);
  useEffect(() => {
    if (!highlight) {
      // Find closed: follow new messages again if you're at the bottom.
      const el = ref.current;
      if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      return;
    }
    stick.current = false;
    ref.current
      ?.querySelector(`[data-item-id="${CSS.escape(highlight)}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlight]);
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
        }}
        data-testid="transcript"
      >
        <div className="mx-auto flex max-w-[var(--jig-chat-width)] min-w-0 flex-col gap-3 px-6 py-4 wrap-anywhere">
          {rowsOf(groupItems(items), compact, pending).map((row) =>
            row.kind === "steps" ? (
              <StepsRow
                key={row.id}
                row={row}
                sessionId={sessionId}
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
                />
              </div>
            ),
          )}
        </div>
      </div>
      {away && (
        <button
          type="button"
          onClick={() => {
            const el = ref.current;
            if (!el) return;
            stick.current = true;
            el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
          }}
          className="absolute bottom-3 left-1/2 flex h-7 -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-elevated px-3 text-xs text-fg shadow-popover hover:bg-hover"
          data-testid="jump-latest"
        >
          <ArrowDown className="size-3.5" /> Latest
        </button>
      )}
    </div>
  );
}
