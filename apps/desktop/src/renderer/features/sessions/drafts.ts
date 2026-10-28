/** Text a new chat's composer starts with (e.g. "Try in a chat" on the What Jig can do page). */
const drafts = new Map<string, string>();

export function setDraft(sessionId: string, text: string): void {
  drafts.set(sessionId, text);
}

/** The draft for a session, once: the composer takes it when it mounts. */
export function takeDraft(sessionId: string): string {
  const text = drafts.get(sessionId) ?? "";
  drafts.delete(sessionId);
  return text;
}
