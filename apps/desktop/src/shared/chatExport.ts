import type { ChatItem, SessionMeta } from "./engine";

const fence = (text: string, lang = "") => {
  const ticks = text.includes("```") ? "````" : "```";
  return `${ticks}${lang}\n${text}\n${ticks}`;
};

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** One tool call as a line (and its command or diff when that helps reading). */
function toolText(item: Extract<ChatItem, { kind: "tool" }>): string {
  const input = item.input;
  const what =
    str(input.command) ??
    str(input.file_path) ??
    str(input.notebook_path) ??
    str(input.pattern) ??
    str(input.url) ??
    str(input.query) ??
    str(input.description) ??
    "";
  const head = `> **${item.name}**${what ? ` \`${what.split("\n")[0]!.slice(0, 200)}\`` : ""}${item.status === "error" ? " — failed" : ""}`;
  if (item.diff) return `${head}\n\n${fence(item.diff, "diff")}`;
  if (item.name === "TodoWrite" && Array.isArray(input.todos))
    return `${head}\n\n${(input.todos as Array<{ content?: string; status?: string }>)
      .map((t) => `- [${t.status === "completed" ? "x" : " "}] ${t.content ?? ""}`)
      .join("\n")}`;
  return head;
}

/**
 * A chat as Markdown, for sharing or keeping: your messages, Claude's answers, tool calls as one
 * line each (with diffs), shell commands and notices. Thinking and permission prompts are left out.
 */
export function chatToMarkdown(meta: SessionMeta, items: ChatItem[]): string {
  const out = [`# ${meta.title}`, "", `_${meta.cwd} · ${new Date(meta.createdAt).toLocaleString()}_`, ""];
  for (const item of items) {
    if ("parentId" in item && item.parentId) continue;
    switch (item.kind) {
      case "user":
        out.push("## You", "", item.text || "_(attachments)_", "");
        break;
      case "assistant":
        if (item.text.trim()) out.push("## Claude", "", item.text, "");
        break;
      case "tool":
        if (item.name !== "AskUserQuestion") out.push(toolText(item), "");
        break;
      case "shell":
        out.push(`> **!** \`${item.command}\``, "", fence(item.output.slice(0, 5000)), "");
        break;
      case "notice":
        out.push(`> ${item.text}`, "");
        break;
      case "permission":
        if (item.request.toolName === "ExitPlanMode" && str(item.request.input.plan))
          out.push("## Plan", "", str(item.request.input.plan)!, "");
        break;
      default:
        break;
    }
  }
  return `${out.join("\n").trimEnd()}\n`;
}
