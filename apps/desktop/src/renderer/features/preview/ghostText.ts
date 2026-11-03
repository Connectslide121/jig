import { Prec, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, keymap, ViewPlugin, WidgetType } from "@codemirror/view";
import type { CompletionRequest, CompletionSuggestion } from "../../../shared/completion";

/** A suggestion shown at the caret: `text` goes in at `at`, replacing up to `to`. */
interface Ghost {
  at: number;
  to: number;
  text: string;
  id?: string;
}

const setGhost = StateEffect.define<Ghost | null>();

class GhostWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  override eq(other: GhostWidget): boolean {
    return other.text === this.text;
  }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-ghostText";
    span.textContent = this.text;
    span.setAttribute("aria-hidden", "true");
    span.dataset.testid = "ghost-text";
    return span;
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

const ghostField = StateField.define<Ghost | null>({
  create: () => null,
  update(ghost, tr) {
    for (const e of tr.effects) if (e.is(setGhost)) return e.value;
    if (!ghost) return null;
    if (tr.docChanged) {
      // Typing what the suggestion says keeps the rest of it; anything else drops it.
      let typed = "";
      let at = -1;
      tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
        if (fromA === ghost.at && toA === fromA) {
          typed = inserted.toString();
          at = fromA;
        } else at = -2;
      });
      if (at === ghost.at && typed && ghost.text.startsWith(typed) && typed.length < ghost.text.length)
        return {
          ...ghost,
          at: ghost.at + typed.length,
          to: tr.changes.mapPos(ghost.to, 1),
          text: ghost.text.slice(typed.length),
        };
      return null;
    }
    if (tr.selection && tr.state.selection.main.head !== ghost.at) return null;
    return ghost;
  },
  provide: (field) =>
    EditorView.decorations.from(
      field,
      (ghost): DecorationSet =>
        ghost
          ? Decoration.set([
              Decoration.widget({ widget: new GhostWidget(ghost.text), side: 1 }).range(ghost.at),
            ])
          : Decoration.none,
    ),
});

/** The suggestion as ghost text at the caret: what the editor already has before it is left out. */
export function ghostFor(doc: string, caret: number, s: CompletionSuggestion): Ghost | null {
  if (s.from > caret || s.to < caret) return null;
  const before = doc.slice(s.from, caret);
  if (!s.text.startsWith(before)) return null;
  const text = s.text.slice(before.length);
  if (!text) return null;
  return { at: caret, to: s.to, text, ...(s.id ? { id: s.id } : {}) };
}

export interface GhostOptions {
  /** Whether anyone completes now, and how long a typing pause is before asking (ms). */
  pause(): number | undefined;
  request(request: CompletionRequest): Promise<CompletionSuggestion | null>;
  accepted(id: string): void;
  /** A request is out (for the status line). */
  busy(on: boolean): void;
  path: string;
  indent(): { tabSize: number; insertSpaces: boolean };
}

function accept(view: EditorView): boolean {
  const ghost = view.state.field(ghostField, false);
  if (!ghost) return false;
  view.dispatch({
    changes: { from: ghost.at, to: ghost.to, insert: ghost.text },
    selection: { anchor: ghost.at + ghost.text.length },
    effects: setGhost.of(null),
    userEvent: "input.complete",
  });
  return true;
}

/**
 * Inline completions in the editor (D-255): after a typing pause the host is asked for a suggestion,
 * which shows as faint text at the caret. Tab takes it, Esc or moving away drops it, typing what it
 * says keeps the rest.
 */
export function ghostText(options: GhostOptions) {
  const plugin = ViewPlugin.fromClass(
    class {
      timer?: ReturnType<typeof setTimeout>;
      asked = 0;
      constructor(readonly view: EditorView) {}
      update(update: { docChanged: boolean; transactions: readonly { isUserEvent(e: string): boolean }[] }) {
        if (!update.docChanged) return;
        const typed = update.transactions.some(
          (t) => t.isUserEvent("input") && !t.isUserEvent("input.complete"),
        );
        clearTimeout(this.timer);
        this.asked++;
        if (!typed) return;
        const pause = options.pause();
        if (pause === undefined) return;
        this.timer = setTimeout(() => void this.ask(), pause);
      }
      async ask() {
        const state = this.view.state;
        const main = state.selection.main;
        if (state.selection.ranges.length > 1 || !main.empty) return;
        const ticket = ++this.asked;
        const doc = state.doc.toString();
        const caret = main.head;
        options.busy(true);
        try {
          const suggestion = await options.request({
            path: options.path,
            text: doc,
            offset: caret,
            ...options.indent(),
          });
          // Only if nothing changed meanwhile.
          if (!suggestion || ticket !== this.asked || this.view.state.doc.toString() !== doc) return;
          if (this.view.state.selection.main.head !== caret) return;
          const ghost = ghostFor(doc, caret, suggestion);
          if (ghost) this.view.dispatch({ effects: setGhost.of(ghost) });
        } catch {
          // No suggestion this time.
        } finally {
          if (ticket === this.asked) options.busy(false);
        }
      }
      destroy() {
        clearTimeout(this.timer);
        options.busy(false);
      }
    },
  );
  return [
    ghostField,
    plugin,
    Prec.highest(
      keymap.of([
        {
          key: "Tab",
          run: (view) => {
            const ghost = view.state.field(ghostField, false);
            if (!ghost || !accept(view)) return false;
            if (ghost.id) options.accepted(ghost.id);
            return true;
          },
        },
        {
          key: "Escape",
          run: (view) => {
            if (!view.state.field(ghostField, false)) return false;
            view.dispatch({ effects: setGhost.of(null) });
            return true;
          },
        },
      ]),
    ),
    EditorView.theme({
      ".cm-ghostText": { color: "var(--color-hint)", fontStyle: "italic", whiteSpace: "pre" },
    }),
  ];
}
