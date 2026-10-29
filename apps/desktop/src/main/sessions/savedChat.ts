import { applyUpdate, type ChatState, reduceEvent } from "../../shared/chat";
import type { ChatItem, SavedClaudeMessage, SessionMeta } from "../../shared/engine";
import { Normalizer } from "../engine/normalize";

/**
 * Text Claude Code puts in user messages that you didn't type: reminders, slash-command wrappers and
 * their output, interruptions. Left out of an opened chat's history.
 */
const NOT_TYPED =
  /^\s*<(system-reminder|command-name|command-message|command-args|local-command-stdout|local-command-caveat|bash-input|bash-stdout|bash-stderr|user-prompt-submit-hook)>|^\[Request interrupted/;

/** What you typed in a user message: its text, or its text blocks; '' for tool results and what Claude Code added. */
export function typedText(message: unknown): string {
  const content = (message as { content?: unknown } | null)?.content;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .filter((b) => b?.type === "text" && typeof b.text === "string" && !NOT_TYPED.test(b.text))
            .map((b) => b.text as string)
            .join("\n\n")
        : "";
  return NOT_TYPED.test(text) ? "" : text.trim();
}

/**
 * A saved Claude Code conversation as a Jig chat's items (D-150): your messages, Claude's text and
 * thinking, and its tool calls with their results, through the same normalizer and reducer as a live
 * chat. Subagents' messages are left out, like their inner steps in Claude Code's own view.
 */
export function savedChatItems(messages: SavedClaudeMessage[], meta: SessionMeta, at: string): ChatItem[] {
  const state: ChatState = { meta, items: [] };
  const normalizer = new Normalizer();
  for (const m of messages) {
    if (m.parent_tool_use_id) continue;
    if (m.type === "user") {
      const text = typedText(m.message);
      if (text)
        applyUpdate(state.items, { op: "upsert", item: { kind: "user", id: `user-${m.uuid}`, text, at } });
    }
    if (m.type !== "user" && m.type !== "assistant") continue;
    for (const event of normalizer.handle({ type: m.type, uuid: m.uuid, message: m.message }))
      reduceEvent(state, event);
  }
  // Every item gets the conversation's time; a tool cut off without a result reads as done.
  return state.items.map((item) =>
    item.kind === "tool" && item.status === "running" ? { ...item, status: "done", at } : { ...item, at },
  );
}
