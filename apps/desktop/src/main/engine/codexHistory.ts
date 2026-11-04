import type { SavedClaudeMessage, SavedClaudeSession } from "../../shared/engine";
import { changeDiff, displayCommand } from "./codexNormalize";
import { codexToolCardName, JIG_ADDED_TEXT } from "./codexTools";

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

function mcpText(result: Msg): string {
  const content = result?.content;
  if (!Array.isArray(content)) return "";
  return content
    .map((b: Msg) => (b?.type === "text" ? String(b.text ?? "") : b?.type === "image" ? "[image]" : ""))
    .filter(Boolean)
    .join("\n");
}

/** A read thread's turns as Claude Code transcript messages, in order. */
export function threadMessages(thread: Msg): SavedClaudeMessage[] {
  const out: SavedClaudeMessage[] = [];
  const assistant = (uuid: string, content: unknown[]) =>
    out.push({ type: "assistant", uuid, parent_tool_use_id: null, message: { role: "assistant", content } });
  const result = (uuid: string, toolUseId: string, output: string, isError: boolean, patch?: unknown) =>
    out.push({
      type: "user",
      uuid: `${uuid}:result`,
      parent_tool_use_id: null,
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: toolUseId, content: output, is_error: isError }],
      },
      ...(patch ? { tool_use_result: patch } : {}),
    });
  const tool = (id: string, name: string, input: Record<string, unknown>) =>
    assistant(id, [{ type: "tool_use", id, name, input }]);

  for (const turn of Array.isArray(thread?.turns) ? thread.turns : []) {
    for (const item of Array.isArray(turn?.items) ? turn.items : []) {
      const id = str(item?.id);
      if (!id) continue;
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
        case "commandExecution": {
          tool(id, "Bash", { command: displayCommand(str(item.command) ?? "") });
          const exit = typeof item.exitCode === "number" ? item.exitCode : 0;
          const output = str(item.aggregatedOutput) ?? "";
          result(id, id, exit ? `${output}${output ? "\n" : ""}Exit code ${exit}` : output, Boolean(exit));
          break;
        }
        case "fileChange": {
          const changes: Msg[] = Array.isArray(item.changes) ? item.changes : [];
          const failed = item.status === "failed" || item.status === "declined";
          changes.forEach((change, i) => {
            const toolId = changes.length === 1 ? id : `${id}:${i}`;
            const kind = str(change?.kind?.type) ?? "update";
            const diff = changeDiff(kind, str(change?.diff) ?? "");
            tool(toolId, kind === "add" ? "Write" : "Edit", { file_path: str(change?.path) ?? "" });
            result(
              toolId,
              toolId,
              item.status === "declined" ? "You declined this change." : "",
              failed,
              diff && !failed ? { structuredPatch: structuredPatch(diff) } : undefined,
            );
          });
          break;
        }
        case "mcpToolCall": {
          const args = item.arguments && typeof item.arguments === "object" ? item.arguments : {};
          tool(id, codexToolCardName(String(item.server ?? "mcp"), String(item.tool ?? "tool")), args);
          if (item.error) result(id, id, str(item.error?.message) ?? "The tool call failed.", true);
          else result(id, id, mcpText(item.result), false);
          break;
        }
        case "webSearch":
          tool(id, "WebSearch", { query: str(item.query) ?? "" });
          result(id, id, "", false);
          break;
        default:
          break;
      }
    }
  }
  return out;
}
