/**
 * Activity sources (sessions, terminals, scripts, git, add-ons, project switches) publish here; the
 * activity log (phase 9) subscribes and records — locally, and only when recording is on.
 */
export type ActivityKind =
  | "prompt"
  | "session.tool"
  | "terminal.command"
  | "script.run"
  | "addon.action"
  | "git"
  | "project.switch";

export interface ActivityInput {
  kind: ActivityKind;
  /** The text mined for patterns: a prompt, a command line, an action id. */
  text: string;
  projectId?: string;
  /** Extra facts, e.g. the tool name or the add-on id. */
  detail?: Record<string, string>;
}

type Listener = (event: ActivityInput) => void;
const listeners = new Set<Listener>();

export function publishActivity(event: ActivityInput): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // A failing recorder must never break the feature that published.
    }
  }
}

export function onActivity(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
