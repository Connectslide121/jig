import { parseScopedKey } from "@jig/sdk";

interface StoredTask {
  status?: string;
  sessionId?: string;
  newChat?: boolean;
  leftOut?: boolean;
}

/**
 * Whether the Tasks add-on's queues still count on a chat (D-367): a task running in it or waiting
 * for you there, or, while a queue runs, the next task that will continue it. `data` is the Tasks
 * add-on's whole storage (`@project(<id>) queue` keys). Such a chat keeps its process when idle.
 */
export function taskUsesChat(data: Record<string, unknown>, sessionId: string): boolean {
  for (const [key, value] of Object.entries(data)) {
    if (parseScopedKey(key).key !== "queue" || !value || typeof value !== "object") continue;
    const queue = value as { running?: boolean; tasks?: StoredTask[] };
    const tasks = Array.isArray(queue.tasks) ? queue.tasks : [];
    if (tasks.some((t) => t.sessionId === sessionId && (t.status === "running" || t.status === "needs_you")))
      return true;
    if (!queue.running) continue;
    const next = tasks.findIndex((t) => t.status === "queued" && !t.leftOut);
    if (next < 0 || tasks[next]?.newChat !== false) continue;
    const before = tasks
      .slice(0, next)
      .reverse()
      .find((t) => t.sessionId);
    if (before?.sessionId === sessionId) return true;
  }
  return false;
}
