import {
  ArrowDownToLine,
  CalendarClock,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  ExternalLink,
  Eye,
  FilePen,
  FileSearch,
  FileText,
  Globe,
  LayoutTemplate,
  ListTodo,
  LoaderCircle,
  type LucideIcon,
  Plug,
  Search,
  SquareCheck,
  Square as SquareIcon,
  SquareTerminal,
  Users,
  Wrench,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { artifactFromTool } from "../../../shared/artifacts";
import type { ChatItem } from "../../../shared/engine";
import { isImagePath } from "../../../shared/files";
import { call } from "../../lib/host";
import { Button, CodeBlock, cn, FileIcon, IconButton, ImagePreview, Spinner } from "../../ui";
import { workbench } from "../../workbench/store";
import { notify } from "../../workbench/toasts";
import { openArtifactOnline, openLocalArtifact, openRemoteArtifact } from "../artifacts/actions";
import { openImage, useImageFile } from "../files";
import { openPreview } from "../preview/actions";
import { DiffLines } from "../preview/viewers";
import { useToolRenderers } from "./toolRenderers";

type ToolItem = Extract<ChatItem, { kind: "tool" }>;

const ICONS: Record<string, LucideIcon> = {
  Bash: SquareTerminal,
  Read: FileText,
  Write: FilePen,
  Edit: FilePen,
  MultiEdit: FilePen,
  NotebookEdit: FilePen,
  Glob: FileSearch,
  Grep: Search,
  WebFetch: Globe,
  WebSearch: Globe,
  TodoWrite: ListTodo,
  RemoteTrigger: CalendarClock,
  Artifact: LayoutTemplate,
  Task: Users,
  Agent: Users,
};

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** One-line summary of what a tool call does. */
export function toolSummary(name: string, input: Record<string, unknown>): string {
  const path = str(input.file_path) ?? str(input.path) ?? str(input.notebook_path);
  switch (name) {
    case "Bash":
      return str(input.description) ?? str(input.command) ?? "";
    case "Read":
    case "Write":
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return path ?? "";
    case "Glob":
    case "Grep":
      return [str(input.pattern), path].filter(Boolean).join(" in ");
    case "WebFetch":
      return str(input.url) ?? "";
    case "WebSearch":
      return str(input.query) ?? "";
    case "Task":
    case "Agent":
      return [str(input.subagent_type), str(input.description)].filter(Boolean).join(": ");
    case "RemoteTrigger": {
      const body = (input.body ?? {}) as Record<string, unknown>;
      return [str(input.action), str(body.name), str(input.trigger_id)].filter(Boolean).join(" · ");
    }
    case "Artifact":
      return [str(input.action) ?? "publish", str(input.title) ?? path ?? str(input.url)]
        .filter(Boolean)
        .join(" · ");
    case "TodoWrite": {
      const todos = Array.isArray(input.todos) ? (input.todos as Array<{ status?: string }>) : [];
      return `${todos.filter((t) => t.status === "completed").length} of ${todos.length} done`;
    }
    default:
      return "";
  }
}

export function toolLabel(name: string): string {
  const mcp = /^mcp__(.+?)__(.+)$/.exec(name);
  if (mcp) return `${mcp[2]} (${mcp[1]})`;
  return name;
}

function Detail({ item }: { item: ToolItem }) {
  const { input, output, name } = item;
  const blocks: ReactNode[] = [];
  if (item.diff) blocks.push(<DiffLines key="diff" text={item.diff} className="p-1 text-2xs leading-4" />);
  else if (name === "Bash" && str(input.command))
    blocks.push(<CodeBlock key="cmd" code={str(input.command)!} lang="bash" />);
  else if ((name === "Edit" || name === "MultiEdit") && str(input.old_string) !== undefined)
    blocks.push(
      <CodeBlock
        key="diff"
        lang="diff"
        code={[
          ...String(input.old_string)
            .split("\n")
            .map((l) => `- ${l}`),
          ...String(input.new_string ?? "")
            .split("\n")
            .map((l) => `+ ${l}`),
        ].join("\n")}
      />,
    );
  else if (name === "Write" && str(input.content))
    blocks.push(
      <CodeBlock
        key="content"
        code={str(input.content)!.slice(0, 20000)}
        lang={str(input.file_path)?.split(".").pop()}
      />,
    );
  else blocks.push(<CodeBlock key="input" code={JSON.stringify(input, null, 2)} lang="json" />);
  if (output)
    blocks.push(
      <CodeBlock
        key="out"
        code={output.length > 20000 ? `${output.slice(0, 20000)}\n…` : output}
        lang="text"
      />,
    );
  return <div className="px-2 pb-1">{blocks}</div>;
}

function DiffCount({ diff }: { diff: string }) {
  const { added, removed } = diffCounts(diff);
  return (
    <span className="shrink-0 font-mono text-2xs">
      <span className="text-success">+{added}</span> <span className="text-danger">−{removed}</span>
    </span>
  );
}

/** The first lines of a command's output, under its card (click the card for all of it). */
function OutputPeek({ text, error }: { text: string; error: boolean }) {
  const lines = text.trimEnd().split("\n");
  const shown = lines.slice(0, 4);
  return (
    <pre
      className={cn(
        "selectable mx-2 mb-2 overflow-hidden border-l-2 pl-2 font-mono text-2xs leading-4 whitespace-pre-wrap",
        error ? "border-danger text-danger" : "border-line text-muted",
      )}
      data-testid="tool-output-peek"
    >
      {shown.join("\n")}
      {lines.length > shown.length && (
        <div className="text-hint">… {lines.length - shown.length} more lines</div>
      )}
    </pre>
  );
}

/** Routines and artifacts Claude made with Claude Code's own tools: open them in Jig. */
function CloudToolActions({ item }: { item: ToolItem }) {
  if (item.status !== "done") return null;
  if (item.name === "RemoteTrigger")
    return (
      <div className="flex gap-1.5 px-2 pb-2">
        <Button
          size="sm"
          variant="secondary"
          icon={CalendarClock}
          onClick={() => workbench.openTab("jig.routines")}
        >
          Open Routines
        </Button>
      </div>
    );
  const artifact = artifactFromTool(item);
  if (!artifact) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2" data-testid="artifact-actions">
      <Button
        size="sm"
        variant="secondary"
        icon={Eye}
        data-testid="artifact-open-jig"
        onClick={() =>
          artifact.path
            ? openLocalArtifact(artifact.path)
            : void openRemoteArtifact(artifact.url, artifact.title)
        }
      >
        Open in Jig
      </Button>
      <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => openArtifactOnline(artifact.url)}>
        Open on claude.ai
      </Button>
      <span className="truncate font-mono text-2xs text-hint">{artifact.url}</span>
    </div>
  );
}

const IMAGE_TOOLS = new Set(["Read", "Write"]);
const FILE_TOOLS = new Set(["Read", "Write", "Edit", "MultiEdit"]);

/** The image a Read/Write tool call touched, as a thumbnail; click opens it in a tab. */
function ImageThumb({ path }: { path: string }) {
  const { data, error } = useImageFile(path);
  if (error) return null;
  return (
    <div className="px-2 pb-2">
      {data ? (
        <ImagePreview src={data.dataUrl} alt={path} compact onClick={() => openImage(path)} />
      ) : (
        <Spinner size="sm" />
      )}
    </div>
  );
}

/** Seconds since a tool started, while it runs (shown after a few seconds). */
function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.floor((now - new Date(since).getTime()) / 1000);
  if (seconds < 3) return null;
  return (
    <span className="shrink-0 text-2xs text-hint tabular-nums">
      {seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`}
    </span>
  );
}

/** How many lines an edit added and removed. */
export function diffCounts(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+")) added++;
    else if (line.startsWith("-")) removed++;
  }
  return { added, removed };
}

interface Todo {
  content?: string;
  activeForm?: string;
  status?: "pending" | "in_progress" | "completed";
}

/** Claude's todo list (TodoWrite) as a checklist. */
export function TodoList({ todos, className }: { todos: Todo[]; className?: string }) {
  return (
    <ul className={cn("flex flex-col gap-0.5 text-xs", className)} data-testid="todo-list">
      {todos.map((t, i) => (
        <li
          key={i}
          className={cn(
            "flex items-start gap-1.5",
            t.status === "completed"
              ? "text-hint line-through"
              : t.status === "in_progress"
                ? "text-fg"
                : "text-muted",
          )}
          data-status={t.status}
        >
          {t.status === "completed" ? (
            <SquareCheck className="mt-px size-3.5 shrink-0 text-success" />
          ) : t.status === "in_progress" ? (
            <LoaderCircle className="mt-px size-3.5 shrink-0 animate-spin text-accent" />
          ) : (
            <SquareIcon className="mt-px size-3.5 shrink-0" />
          )}
          <span className={cn(t.status === "in_progress" && "font-medium")}>
            {t.status === "in_progress" ? (t.activeForm ?? t.content) : t.content}
          </span>
        </li>
      ))}
    </ul>
  );
}

const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/** A subagent's progress: tool uses, tokens, time, what it's doing, and its summary. */
function TaskLine({ task }: { task: NonNullable<ToolItem["task"]> }) {
  const parts = [
    task.toolUses !== undefined ? `${task.toolUses} tool use${task.toolUses === 1 ? "" : "s"}` : undefined,
    task.tokens !== undefined ? `${k(task.tokens)} tokens` : undefined,
    task.durationMs !== undefined ? `${(task.durationMs / 1000).toFixed(1)} s` : undefined,
    task.status === "running" && task.lastTool ? `now: ${task.lastTool}` : undefined,
    task.background ? "in the background" : undefined,
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-0.5 px-2 pb-1.5 text-2xs text-muted" data-testid="task-progress">
      {parts.length > 0 && <div>{parts.join(" · ")}</div>}
      {task.summary && <div className="text-xs text-fg">{task.summary}</div>}
    </div>
  );
}

const DIFF_PREVIEW_LINES = 14;
const BACKGROUNDABLE = new Set(["Bash", "Task", "Agent"]);

export function ToolCard({
  item,
  sessionId,
  waiting,
  children,
}: {
  item: ToolItem;
  sessionId?: string;
  /** Waiting for your permission: it hasn't started, so it can't go to the background. */
  waiting?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [allDiff, setAllDiff] = useState(false);
  const custom = useToolRenderers()[item.name];
  const Icon = ICONS[item.name] ?? (item.name.startsWith("mcp__") ? Plug : Wrench);
  const summary = toolSummary(item.name, item.input);
  const filePath = str(item.input.file_path);
  const imagePath = IMAGE_TOOLS.has(item.name) && filePath && isImagePath(filePath) ? filePath : undefined;
  const notebookPath = str(item.input.notebook_path);
  // Files Claude read or wrote open in the Preview tab (rendered Markdown, tables, notebooks…).
  const previewPath =
    item.status === "done"
      ? FILE_TOOLS.has(item.name)
        ? filePath
        : item.name === "NotebookEdit"
          ? notebookPath
          : undefined
      : undefined;
  return (
    <div className="rounded-md border border-line bg-raised" data-testid="tool-card">
      <div className="flex min-w-0 items-center pr-1">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex h-7 min-w-0 flex-1 items-center gap-2 px-2 text-left text-xs"
        >
          <ChevronRight
            className={cn("size-3.5 shrink-0 text-hint transition-transform", open && "rotate-90")}
          />
          <Icon className="size-3.5 shrink-0 text-muted" />
          <span className="shrink-0 font-medium text-fg">{toolLabel(item.name)}</span>
          {filePath && FILE_TOOLS.has(item.name) && <FileIcon path={filePath} className="size-3.5" />}
          <span className="min-w-0 flex-1 truncate font-mono text-muted">{summary}</span>
          {item.diff && <DiffCount diff={item.diff} />}
          {item.status === "running" && !waiting && <Elapsed since={item.at} />}
          {item.status === "running" &&
            (waiting ? (
              <span className="text-2xs text-warning">waiting for you</span>
            ) : (
              <Spinner size="sm" />
            ))}
          {item.status === "done" && <CircleCheck className="size-3.5 shrink-0 text-success" />}
          {item.status === "error" && <CircleAlert className="size-3.5 shrink-0 text-danger" />}
        </button>
        {item.status === "running" && !waiting && sessionId && BACKGROUNDABLE.has(item.name) && (
          <IconButton
            icon={ArrowDownToLine}
            size="sm"
            label="Move to the background: Claude goes on while this keeps running (Ctrl+B in Claude Code)"
            data-testid="tool-background"
            onClick={() =>
              void call("sessions.background", { id: sessionId, toolUseId: item.id }).then((moved) => {
                if (!moved)
                  notify({
                    title: "It can't move to the background",
                    message: "It may have finished already.",
                  });
              })
            }
          />
        )}
        {previewPath && (
          <IconButton
            icon={Eye}
            size="sm"
            label="Preview the file"
            data-testid="tool-preview"
            onClick={() => openPreview(previewPath)}
          />
        )}
      </div>
      {custom && !open ? <div className="px-2 pb-2">{custom.render(item)}</div> : null}
      {!custom && !open && item.name === "TodoWrite" && Array.isArray(item.input.todos) && (
        <TodoList todos={item.input.todos as Todo[]} className="px-3 pb-2" />
      )}
      {!custom && !open && item.task && <TaskLine task={item.task} />}
      <CloudToolActions item={item} />
      {!custom && !open && item.diff && (
        <div className="mx-2 mb-2 overflow-hidden rounded-sm border border-line" data-testid="tool-diff">
          <DiffLines
            text={allDiff ? item.diff : item.diff.split("\n").slice(0, DIFF_PREVIEW_LINES).join("\n")}
            className="max-h-96 overflow-auto p-1 text-2xs leading-4"
          />
          {!allDiff && item.diff.split("\n").length > DIFF_PREVIEW_LINES && (
            <button
              type="button"
              className="w-full border-t border-line py-0.5 text-2xs text-muted hover:bg-hover hover:text-fg"
              onClick={() => setAllDiff(true)}
            >
              Show all {item.diff.split("\n").length} lines
            </button>
          )}
        </div>
      )}
      {!custom && !open && item.name === "Bash" && item.status !== "running" && item.output && (
        <OutputPeek text={item.output} error={item.status === "error"} />
      )}
      {!custom && imagePath && item.status === "done" && <ImageThumb path={imagePath} />}
      {item.images && item.images.length > 0 && (
        <div className="flex flex-wrap gap-1" data-testid="tool-images">
          {item.images.map((image) => (
            <ImageThumb key={image.path} path={image.path} />
          ))}
        </div>
      )}
      {open && <Detail item={item} />}
      {children && <div className="flex flex-col gap-1 border-t border-line p-2">{children}</div>}
    </div>
  );
}
