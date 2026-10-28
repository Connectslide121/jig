import type { ChatItem } from "../../../shared/engine";

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * The goal for the builder when a chat becomes a tool: what was asked, the commands Claude ran and the
 * files it touched, in order, and what to make of it.
 */
export function chatRecipe(title: string, items: ChatItem[]): string {
  const steps: string[] = [];
  for (const item of items) {
    if (item.kind === "user" && item.text.trim())
      steps.push(`- I asked: ${short(item.text.trim().replace(/\s+/g, " "), 300)}`);
    else if (item.kind === "tool" && !item.parentId) {
      const command = typeof item.input.command === "string" ? item.input.command : undefined;
      const file =
        typeof item.input.file_path === "string"
          ? item.input.file_path
          : typeof item.input.path === "string"
            ? item.input.path
            : undefined;
      if (command) steps.push(`- Claude ran: ${short(command, 200)}`);
      else if (file && /^(Write|Edit|MultiEdit)$/.test(item.name)) steps.push(`- Claude changed ${file}`);
    }
    if (steps.length >= 40) break;
  }
  return [
    `Turn what I did in the chat "${title}" into a tool I can run again with one click, so I don't have to ask Claude every time.`,
    "What happened in the chat:",
    ...steps,
    "Pick the right shape (a Tools-menu action with a shortcut, a button, a view, a prompt button, or a watcher if it should run on its own). Steps that need judgement can ask Claude through ctx.ai.ask or open a chat with a draft; fixed commands should run directly.",
  ].join("\n");
}
