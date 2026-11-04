import type { SavedClaudeMessage, SavedClaudeSession } from "../../shared/engine";
import { CodexNormalizer } from "./codexNormalize";
import { JIG_ADDED_TEXT } from "./codexTools";

/**
 * Codex's saved threads (`thread/list`, `thread/read`) in the shape Claude Code's saved conversations
 * have (D-315), so "Open a saved chat" lists both and an opened Codex thread becomes a chat through
 * the same code (`savedChatItems`): your messages, Codex's text and reasoning, and its commands, file
 * changes and MCP calls on the usual cards. Pure; messages are typed loosely like codexNormalize.ts.
 */
// biome-ignore lint/suspicious/noExplicitAny: app-server threads are a large, evolving union.
type Msg = any;

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** A thread in the saved-chats list. */
export function savedThread(thread: Msg): SavedClaudeSession | undefined {
  const id = str(thread?.id);
  if (!id) return undefined;
  const title = (str(thread.name) || str(thread.preview) || "Codex chat").replace(JIG_ADDED_TEXT, "").trim();
  const seconds = (v: unknown) => (typeof v === "number" ? v * 1000 : undefined);
  return {
    sessionId: id,
    provider: "codex",
    title: title.split("\n")[0]!.slice(0, 200) || "Codex chat",
    ...(str(thread.cwd) ? { cwd: thread.cwd } : {}),
    ...(str(thread.gitInfo?.branch) ? { gitBranch: thread.gitInfo.branch } : {}),
    lastModified: seconds(thread.updatedAt) ?? seconds(thread.createdAt) ?? 0,
    ...(seconds(thread.createdAt) ? { createdAt: seconds(thread.createdAt) } : {}),
  };
}

/** A unified diff's hunks as Claude Code's structured patch (what an Edit card's diff is drawn from). */
export function structuredPatch(diff: string): Array<{
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}> {
  const hunks: ReturnType<typeof structuredPatch> = [];
  for (const line of diff.split("\n")) {
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (header)
      hunks.push({
        oldStart: Number(header[1]),
        oldLines: Number(header[2] ?? 1),
        newStart: Number(header[3]),
        newLines: Number(header[4] ?? 1),
        lines: [],
      });
    else if (hunks.length && /^[-+ \\]/.test(line)) hunks[hunks.length - 1]!.lines.push(line);
  }
  return hunks;
}

/** What you typed: the text items, without what Jig added (its context, plan-mode instructions). */
function typed(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((c: Msg) => c?.type === "text" && typeof c.text === "string")
    .map((c: Msg) => (c.text as string).replace(JIG_ADDED_TEXT, ""))
    .join("\n\n")
    .trim();
}

/**
 * A tool result's output and images as Claude's content blocks, so the saved chat's normalizer reads
 * back the same text and images: each `[image]` line the live mapping wrote stands for the next image.
 */
function resultContent(output: string, images: Array<{ mime: string; data: string }> = []): unknown {
  if (!images.length) return output;
  const blocks: unknown[] = [];
  let text: string[] = [];
  let next = 0;
  const flush = () => {
    if (text.length) blocks.push({ type: "text", text: text.join("\n") });
    text = [];
  };
  for (const line of output.split("\n")) {
    const image = line === "[image]" ? images[next] : undefined;
    if (!image) {
      text.push(line);
      continue;
    }
    next++;
    flush();
    blocks.push({ type: "image", source: { type: "base64", media_type: image.mime, data: image.data } });
  }
  flush();
  return blocks;
}

/** Items that show as tool cards: replayed through the live mapping (`CodexNormalizer`). */
const TOOL_ITEMS = new Set([
  "commandExecution",
  "fileChange",
  "mcpToolCall",
  "dynamicToolCall",
  "webSearch",
  "imageView",
]);

/** A read thread's turns as Claude Code transcript messages, in order. */
export function threadMessages(thread: Msg): SavedClaudeMessage[] {
  const out: SavedClaudeMessage[] = [];
  const assistant = (uuid: string, content: unknown[]) =>
    out.push({ type: "assistant", uuid, parent_tool_use_id: null, message: { role: "assistant", content } });
  // Tool cards come from the live mapping, so a saved chat shows what the live one did.
  const live = new CodexNormalizer();
  const replay = (item: Msg) => {
    for (const event of [
      ...live.handle({ method: "item/started", params: { item } }),
      ...live.handle({ method: "item/completed", params: { item } }),
    ]) {
      if (event.type === "tool_use")
        assistant(event.id, [{ type: "tool_use", id: event.id, name: event.name, input: event.input }]);
      else if (event.type === "tool_result")
        out.push({
          type: "user",
          uuid: `${event.toolUseId}:result`,
          parent_tool_use_id: null,
          message: {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: event.toolUseId,
                content: resultContent(event.output, event.imageData),
                is_error: event.isError,
              },
            ],
          },
          ...(event.diff ? { tool_use_result: { structuredPatch: structuredPatch(event.diff) } } : {}),
        });
    }
  };

  for (const turn of Array.isArray(thread?.turns) ? thread.turns : []) {
    for (const item of Array.isArray(turn?.items) ? turn.items : []) {
      const id = str(item?.id);
      if (!id) continue;
      if (TOOL_ITEMS.has(item.type)) {
        replay(item);
        continue;
      }
      switch (item.type) {
        case "userMessage": {
          const text = typed(item.content);
          // A turn Jig started itself (carrying out an approved plan) has nothing you typed.
          if (text)
            out.push({
              type: "user",
              uuid: id,
              parent_tool_use_id: null,
              message: { role: "user", content: [{ type: "text", text }] },
            });
          break;
        }
        case "agentMessage":
          if (str(item.text)) assistant(id, [{ type: "text", text: item.text }]);
          break;
        case "reasoning": {
          const parts = (a: unknown) => (Array.isArray(a) ? a.filter((s) => typeof s === "string" && s) : []);
          const text = parts(item.summary).join("\n\n") || parts(item.content).join("\n\n");
          if (text) assistant(id, [{ type: "thinking", thinking: text }]);
          break;
        }
        default:
          break;
      }
    }
  }
  return out;
}
