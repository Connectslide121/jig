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

type Fill = (text: string) => void;
const fillers = new Map<string, Fill>();

/** Puts text in an open chat's message box (e.g. your message after rewinding to before it). */
export function fillComposer(sessionId: string, text: string): void {
  const fill = fillers.get(sessionId);
  if (fill) fill(text);
  else setDraft(sessionId, text);
}

/** The composer of a session registers how to fill it. */
export function registerComposer(sessionId: string, fill: Fill): () => void {
  fillers.set(sessionId, fill);
  return () => {
    if (fillers.get(sessionId) === fill) fillers.delete(sessionId);
  };
}
