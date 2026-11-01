/**
 * Things that happen in Jig that add-ons can react to (D-215): host code through
 * `contributes.events` (slot `jig.event`), UI code through `ctx.onJigEvent` / `useJigEvent`.
 * Documented in docs/reference/addon-api.md — keep both in sync.
 */
export const JIG_EVENTS = {
  "chat.finished": "A chat finished its turn (Claude stopped working and is waiting for you).",
  "chat.needsYou": "A chat needs you: Claude asks a question or for permission.",
  "chat.failed": "A chat stopped with an error.",
  "git.commit": "A commit was made in a repository of a project (in Jig, a terminal or another app).",
  "git.branch": "A repository of a project switched branch.",
  "project.active": "You switched the active project.",
} as const;

export type JigEventName = keyof typeof JIG_EVENTS;

export interface JigChatEvent {
  sessionId: string;
  title: string;
  projectId?: string;
  cwd: string;
  /** For `chat.failed`. */
  error?: string;
}

export interface JigEventPayloads {
  "chat.finished": JigChatEvent;
  "chat.needsYou": JigChatEvent;
  "chat.failed": JigChatEvent;
  "git.commit": { repo: string; branch?: string; sha: string; message: string };
  "git.branch": { repo: string; from?: string; to?: string };
  "project.active": { projectId?: string; name?: string; path?: string };
}

export const JIG_EVENT_NAMES = Object.keys(JIG_EVENTS) as JigEventName[];

export function isJigEvent(name: string): name is JigEventName {
  return Object.hasOwn(JIG_EVENTS, name);
}
