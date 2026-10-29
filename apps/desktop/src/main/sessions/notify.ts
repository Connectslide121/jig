import type { SessionMeta, SessionStatus } from "../../shared/engine";

/**
 * The system notification for a chat whose status changed, if any: it needs you (a permission or a
 * question), it finished, or it failed. Only for chats (not the builder's sessions), and only for
 * changes away from working, so loading or restarting Jig never notifies.
 */
export function notificationFor(
  previous: SessionStatus | undefined,
  meta: SessionMeta,
): { title: string; body: string } | undefined {
  if (meta.kind === "builder" || previous === meta.status) return undefined;
  if (previous !== "working" && previous !== "starting") return undefined;
  const title = meta.title.length > 60 ? `${meta.title.slice(0, 59)}…` : meta.title;
  if (meta.status === "needs_you")
    return { title: `Claude needs you: ${title}`, body: "A permission or question is waiting." };
  if (meta.status === "idle") return { title: `Claude finished: ${title}`, body: "Your turn." };
  if (meta.status === "error")
    return {
      title: `Claude stopped: ${title}`,
      body: meta.lastError?.split("\n")[0] ?? "The turn ended with an error.",
    };
  return undefined;
}

/**
 * Whether Jig shows system notifications at all: when they're on, and never from a hidden Jig
 * (`JIG_HIDDEN`, as tests run it), whose windows always look like they're in the background.
 */
export function notificationsAllowed(enabled: boolean, env: Record<string, string | undefined>): boolean {
  return enabled && !env.JIG_HIDDEN;
}
