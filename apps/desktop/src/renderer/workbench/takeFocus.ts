import { useEffect } from "react";

/**
 * Nothing takes the keyboard focus from where you type (D-374). Code that moves the focus by itself
 * (a terminal or chat that became active, text put in a message box) asks `mayTakeFocus` first: while
 * the caret is in a text field (a message box, an input, a terminal), only a direct action of yours
 * may move it: a click or tap outside a text field, or a shortcut, in the last moment. A chat, a tool,
 * the task queue, a host event or an add-on still opens and shows things, but leaves the caret alone.
 * Modals keep their own focus (they are the one exception, and only ones you or a real confirmation
 * open).
 */

/** How long after your click or shortcut its result may still take the focus (opening is async). */
const INTENT_MS = 1500;
let intentAt = 0;

/** Text fields: typing there must never be redirected. */
export function isTyping(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el instanceof HTMLTextAreaElement) return true;
  return (
    el instanceof HTMLInputElement &&
    !["button", "checkbox", "radio", "range", "color", "file", "submit", "reset", "image"].includes(el.type)
  );
}

/** Keys that edit text: pressing them in a text field is typing, not asking for something to open. */
const EDITING = /^(Backspace|Delete|Enter|Tab|Arrow\w+|Home|End|PageUp|PageDown)$/;
const EDITING_CHORDS = new Set(["a", "c", "v", "x", "y", "z"]);

function isIntent(e: Event): boolean {
  if (e.type === "pointerdown") return !isTyping(e.target as Element | null);
  const k = e as KeyboardEvent;
  if (!isTyping(k.target as Element | null)) return true;
  // In a text field only a shortcut counts (Ctrl/Alt/Cmd), never typing or editing keys.
  if (!(k.ctrlKey || k.metaKey || k.altKey)) return false;
  return !EDITING.test(k.key) && !EDITING_CHORDS.has(k.key.toLowerCase());
}

/**
 * May code move the focus to `target` now? Yes unless you are typing somewhere else and didn't just
 * ask for it. `target` may be the element itself or the area it is in.
 */
export function mayTakeFocus(target?: Element | null): boolean {
  const active = document.activeElement;
  if (!isTyping(active)) return true;
  if (target && active && target.contains(active)) return true;
  return Date.now() - intentAt < INTENT_MS;
}

/** Mounted once by the workbench: notes your clicks and shortcuts. */
export function useTrackUserIntent(): void {
  useEffect(() => {
    // Typing (or clicking into a text field) after a shortcut means you moved on: its result no longer
    // takes the focus.
    const onEvent = (e: Event) => {
      intentAt = isIntent(e) ? Date.now() : 0;
    };
    document.addEventListener("pointerdown", onEvent, true);
    document.addEventListener("keydown", onEvent, true);
    return () => {
      document.removeEventListener("pointerdown", onEvent, true);
      document.removeEventListener("keydown", onEvent, true);
    };
  }, []);
}
