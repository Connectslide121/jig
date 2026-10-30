import {
  ChevronDown,
  ChevronUp,
  ListTodo,
  Search,
  Sparkles,
  Square,
  SquareTerminal,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatItem, SessionMeta } from "../../../shared/engine";
import { call, errorMessage } from "../../lib/host";
import { cn, IconButton, Kbd, Spinner } from "../../ui";
import { notify } from "../../workbench/toasts";
import { TodoList, toolSummary } from "./ToolCard";

type Todo = { content?: string; activeForm?: string; status?: "pending" | "in_progress" | "completed" };

/** Claude's latest todo list, while it has open items (Claude Code keeps it under the prompt). */
export function TodoPanel({ items }: { items: ChatItem[] }) {
  const [open, setOpen] = useState(true);
  const todos = useMemo(() => {
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i]!;
      if (
        item.kind === "tool" &&
        item.name === "TodoWrite" &&
        !item.parentId &&
        Array.isArray(item.input.todos)
      )
        return item.input.todos as Todo[];
      // A new message of yours starts a new task: an older list no longer counts.
      if (item.kind === "user") return undefined;
    }
    return undefined;
  }, [items]);
  if (!todos?.length || todos.every((t) => t.status === "completed")) return null;
  const done = todos.filter((t) => t.status === "completed").length;
  return (
    <div className="mx-auto w-full max-w-[var(--jig-chat-width)] px-6" data-testid="todo-panel">
      <div className="rounded-md border border-line bg-surface">
        <button
          type="button"
          className="flex w-full items-center gap-2 px-2 py-1 text-xs text-muted hover:text-fg"
          onClick={() => setOpen(!open)}
        >
          <ListTodo className="size-3.5" />
          <span className="font-medium">
            Todos · {done} of {todos.length} done
          </span>
          <span className="flex-1" />
          {open ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
        </button>
        {open && <TodoList todos={todos} className="max-h-40 overflow-y-auto px-2 pb-2" />}
      </div>
    </div>
  );
}

/** Commands and subagents running in the background, with Stop (Claude Code's /bashes and tasks). */
export function BackgroundTasks({ meta }: { meta: SessionMeta }) {
  const tasks = meta.backgroundTasks ?? [];
  if (!tasks.length) return null;
  return (
    <div className="mx-auto w-full max-w-[var(--jig-chat-width)] px-6" data-testid="background-tasks">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <Spinner size="sm" className="text-accent" />
        <span className="text-2xs font-medium text-accent uppercase">Working in the background</span>
        {tasks.map((t) => (
          <span
            key={t.id}
            className="jig-working flex h-6 items-center gap-1 rounded-full border border-line bg-surface pr-0.5 pl-2"
            title={`${t.type} ${t.id}`}
          >
            {t.type.includes("agent") ? (
              <Users className="size-3 text-muted" />
            ) : (
              <SquareTerminal className="size-3 text-muted" />
            )}
            <span className="max-w-60 truncate">{t.description || t.id}</span>
            <IconButton
              icon={Square}
              size="sm"
              label="Stop it"
              data-testid="background-stop"
              onClick={() =>
                void call("sessions.stopTask", { id: meta.id, taskId: t.id }).catch((e) =>
                  notify({ title: "Couldn't stop it", message: errorMessage(e), tone: "danger" }),
                )
              }
            />
          </span>
        ))}
      </div>
    </div>
  );
}

/** The searchable text of a transcript item. */
export function itemText(item: ChatItem): string {
  switch (item.kind) {
    case "user":
    case "assistant":
    case "notice":
      return item.text;
    case "tool":
      return `${item.name} ${toolSummary(item.name, item.input)} ${item.output ?? ""}`;
    case "shell":
      return `${item.command} ${item.output}`;
    case "permission":
      return `${item.request.title ?? ""} ${typeof item.request.input.plan === "string" ? item.request.input.plan : ""}`;
    default:
      return "";
  }
}

/** Find in chat (Ctrl+F): matches step with Enter / Shift+Enter; the transcript scrolls to each. */
export function FindBar({
  items,
  onMatch,
  onClose,
}: {
  items: ChatItem[];
  onMatch: (id: string | undefined) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return items
      .filter((i) => !("parentId" in i && i.parentId) && itemText(i).toLowerCase().includes(q))
      .map((i) => i.id);
  }, [items, query]);
  useEffect(() => input.current?.focus(), []);
  // Newest match first, like scrolling up from the bottom.
  const current = matches.length ? matches[matches.length - 1 - (index % matches.length)] : undefined;
  useEffect(() => onMatch(current), [current, onMatch]);
  const step = (by: number) => setIndex((i) => (i + by + matches.length) % Math.max(matches.length, 1));
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-4" data-testid="find-bar">
      <Search className="size-3.5 text-muted" />
      <input
        ref={input}
        value={query}
        placeholder="Find in this chat"
        className="h-6 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-hint"
        data-testid="find-input"
        onChange={(e) => {
          setQuery(e.target.value);
          setIndex(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            step(e.shiftKey ? -1 : 1);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <span
        className={cn("text-xs tabular-nums", query && !matches.length ? "text-danger" : "text-hint")}
        data-testid="find-count"
      >
        {query
          ? matches.length
            ? `${(index % matches.length) + 1} of ${matches.length}`
            : "No matches"
          : ""}
      </span>
      <IconButton
        icon={ChevronUp}
        size="sm"
        label="Earlier match (Enter)"
        onClick={() => step(1)}
        disabled={!matches.length}
      />
      <IconButton
        icon={ChevronDown}
        size="sm"
        label="Later match (Shift+Enter)"
        onClick={() => step(-1)}
        disabled={!matches.length}
      />
      <IconButton icon={X} size="sm" label="Close (Esc)" onClick={onClose} />
    </div>
  );
}

const STARTERS = [
  "Explain how this project is organised",
  "Review my uncommitted changes for bugs",
  "Write tests for the code I changed",
  "Make a plan before changing anything: ",
];

const TIPS: Array<[string, string]> = [
  ["/", "commands and skills"],
  ["@", "mention a file"],
  ["!", "run a shell command"],
  ["#", "remember in CLAUDE.md"],
  ["Shift+Tab", "plan or accept edits"],
];

/** An empty chat: where it runs, things to ask, and the message box's shortcuts. */
export function ChatWelcome({
  title,
  cwd,
  onPick,
}: {
  title: string;
  cwd: string;
  onPick: (text: string) => void;
}) {
  return (
    <div
      className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-8"
      data-testid="chat-welcome"
    >
      <div className="flex max-w-xl flex-col items-center gap-4 text-center">
        <div>
          <div className="text-base font-medium text-fg">{title}</div>
          <div className="mt-1 text-sm text-muted">
            Claude Code runs in <span className="font-mono text-xs">{cwd}</span> with your CLAUDE.md files,
            skills and MCP servers.
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-1.5">
          {STARTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onPick(s)}
              className="flex h-7 items-center gap-1.5 rounded-full border border-line px-3 text-xs text-muted hover:border-accent hover:text-fg"
            >
              <Sparkles className="size-3 text-accent" />
              {s.replace(/: $/, "…")}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-2xs text-hint">
          {TIPS.map(([key, what]) => (
            <span key={key} className="flex items-center gap-1">
              <Kbd>{key}</Kbd> {what}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
