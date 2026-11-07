/**
 * Things that happen in Jig that add-ons can react to (D-215): host code through
 * `contributes.events` (slot `jig.event`), UI code through `ctx.onJigEvent` / `useJigEvent`.
 * Documented in docs/reference/addon-api.md — keep both in sync.
 */
export const JIG_EVENTS = {
  "chat.finished": "A chat finished its turn (Jig stopped working and is waiting for you).",
  "chat.needsYou": "A chat needs you: Jig asks a question or for permission.",
  "chat.failed": "A chat stopped with an error.",
  "git.commit": "A commit was made in a repository of a project (in Jig, a terminal or another app).",
  "git.branch": "A repository of a project switched branch.",
  "project.active": "You switched the active project.",
  "azure.tenant":
    "You switched the Azure tenant: every az Jig runs now uses it; drop Azure/DevOps caches and reload.",
  "app.updating":
    "Jig is about to close to install an update and starts again by itself: hold work that shouldn't start now.",
  "phone.action":
    "You tapped a button on this add-on's phone card (or wrote the answer a reply button asked for). Only the add-on that sent the card hears it.",
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
  /**
   * The tenant now in use (D-282): its key (`default` = your own az login), label, the signed-in
   * user and the Entra tenant, as far as they are known, and the initials Jig shows as its avatar.
   */
  "azure.tenant": {
    key: string;
    label: string;
    isDefault: boolean;
    user?: string;
    tenantId?: string;
    displayName?: string;
    domain?: string;
    initials?: string;
  };
  /**
   * Jig closes in a moment to install an update (Install and restart, D-395), and starts again by
   * itself. Host code has about a second and a half before the update goes on: Jig waits for it until
   * then. `version` is the update's, when known.
   */
  "app.updating": { version?: string };
  /**
   * A tap on a card this add-on sent with `api.phone.send` (D-468): the card's `messageId`, the
   * button's own `id`, and for a `reply: true` button the text you wrote after it.
   */
  "phone.action": { messageId: string; buttonId: string; text?: string };
}

export const JIG_EVENT_NAMES = Object.keys(JIG_EVENTS) as JigEventName[];

export function isJigEvent(name: string): name is JigEventName {
  return Object.hasOwn(JIG_EVENTS, name);
}
