import {
  ChevronRight,
  CircleAlert,
  CircleCheck,
  FilePen,
  FileSearch,
  FileText,
  Globe,
  ListTodo,
  type LucideIcon,
  Plug,
  Search,
  SquareTerminal,
  Users,
  Wrench,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import type { ChatItem } from "../../../shared/engine";
import { isImagePath } from "../../../shared/files";
import { CodeBlock, cn, ImagePreview, Spinner } from "../../ui";
import { openImage, useImageFile } from "../files";
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
      return str(input.description) ?? "";
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
  if (name === "Bash" && str(input.command))
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

const IMAGE_TOOLS = new Set(["Read", "Write"]);

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

export function ToolCard({ item, children }: { item: ToolItem; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const custom = useToolRenderers()[item.name];
  const Icon = ICONS[item.name] ?? (item.name.startsWith("mcp__") ? Plug : Wrench);
  const summary = toolSummary(item.name, item.input);
  const filePath = str(item.input.file_path);
  const imagePath = IMAGE_TOOLS.has(item.name) && filePath && isImagePath(filePath) ? filePath : undefined;
  return (
    <div className="rounded-md border border-line bg-raised" data-testid="tool-card">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-7 w-full min-w-0 items-center gap-2 px-2 text-left text-xs"
      >
        <ChevronRight
          className={cn("size-3.5 shrink-0 text-hint transition-transform", open && "rotate-90")}
        />
        <Icon className="size-3.5 shrink-0 text-muted" />
        <span className="shrink-0 font-medium text-fg">{toolLabel(item.name)}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-muted">{summary}</span>
        {item.status === "running" && <Spinner size="sm" />}
        {item.status === "done" && <CircleCheck className="size-3.5 shrink-0 text-success" />}
        {item.status === "error" && <CircleAlert className="size-3.5 shrink-0 text-danger" />}
      </button>
      {custom && !open ? <div className="px-2 pb-2">{custom.render(item)}</div> : null}
      {!custom && imagePath && item.status === "done" && <ImageThumb path={imagePath} />}
      {open && <Detail item={item} />}
      {children && <div className="flex flex-col gap-1 border-t border-line p-2">{children}</div>}
    </div>
  );
}
