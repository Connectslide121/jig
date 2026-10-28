import { Brain, ChevronRight, CircleAlert, Copy, Info, MoreHorizontal, TriangleAlert } from "lucide-react";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChatItem } from "../../../shared/engine";
import { cn, IconButton, Markdown, type MenuEntry, openMenuAt, Spinner } from "../../ui";
import { contributedEntries } from "../../workbench/contextMenus";
import { BuildCard } from "../builder/BuildCard";
import { ChatImages } from "./ChatImages";
import { PermissionCard } from "./PermissionCard";
import { ToolCard } from "./ToolCard";

/** A message's menu: Copy, plus entries add-ons contribute (`context.message`). */
function messageMenu(sessionId: string, text: string): MenuEntry[] {
  const extra = contributedEntries({ slot: "context.message", sessionId, text });
  return [
    { label: "Copy", icon: Copy, onSelect: () => void navigator.clipboard.writeText(text) },
    ...(extra.length ? [{ separator: true } as const, ...extra] : []),
  ];
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
}: {
  item: ChatItem;
  sessionId: string;
  nested?: ChatItem[];
}) {
  switch (item.kind) {
    case "user":
      return (
        <div className="flex flex-col items-end gap-1.5" data-testid="user-message">
          {item.images?.length ? <ChatImages images={item.images} className="justify-end" /> : null}
          {item.text && (
            <div className="selectable max-w-[var(--jig-chat-bubble)] rounded-lg bg-active px-3 py-2 text-sm whitespace-pre-wrap text-fg">
              {item.text}
            </div>
          )}
        </div>
      );
    case "assistant":
      return (
        <div data-testid="assistant-message" className="group/message relative">
          <Markdown text={item.text} />
          {item.streaming && !item.text && <Spinner size="sm" />}
          {!item.streaming && item.text && (
            <div className="absolute -top-2 right-0 hidden group-hover/message:block">
              <IconButton
                icon={MoreHorizontal}
                size="sm"
                label="Message options"
                className="bg-elevated shadow-card"
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
        <ToolCard item={item}>
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

/** Subagent items (with a parent tool) are shown inside their parent's tool card. */
export function groupItems(items: ChatItem[]): Array<{ item: ChatItem; children: ChatItem[] }> {
  const children = new Map<string, ChatItem[]>();
  const tools = new Set(items.filter((i) => i.kind === "tool").map((i) => i.id));
  const top: ChatItem[] = [];
  for (const item of items) {
    // A question is shown by its own card; its tool call adds nothing.
    if (item.kind === "tool" && item.name === "AskUserQuestion") continue;
    const parentId = "parentId" in item ? item.parentId : undefined;
    if (parentId && tools.has(parentId)) children.set(parentId, [...(children.get(parentId) ?? []), item]);
    else top.push(item);
  }
  return top.map((item) => ({ item, children: children.get(item.id) ?? [] }));
}

export function Transcript({
  items,
  sessionId,
  active,
}: {
  items: ChatItem[];
  sessionId: string;
  active: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  });
  useEffect(() => {
    const el = ref.current;
    if (active && el && stick.current) el.scrollTop = el.scrollHeight;
  }, [active]);
  return (
    <div
      ref={ref}
      className="min-h-0 flex-1 overflow-y-auto"
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
      data-testid="transcript"
    >
      <div className="mx-auto flex max-w-[var(--jig-chat-width)] flex-col gap-3 px-6 py-4">
        {groupItems(items).map(({ item, children }) => (
          <Item key={item.id} item={item} sessionId={sessionId} nested={children} />
        ))}
      </div>
    </div>
  );
}
