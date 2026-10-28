import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  bracketMatching,
  foldGutter,
  HighlightStyle,
  indentOnInput,
  LanguageDescription,
  syntaxHighlighting,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { useEffect, useRef } from "react";

/**
 * Colours from Jig's tokens, so the editor follows the theme (Jig Dark, Jig Light or an imported VS
 * Code theme) without colours of its own.
 */
const theme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "var(--color-canvas)", color: "var(--color-fg)" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", fontSize: "0.923rem", lineHeight: "1.55" },
  ".cm-content": { caretColor: "var(--color-accent)", padding: "8px 0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--color-accent)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--color-selection)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--color-surface)",
    color: "var(--color-hint)",
    borderRight: "1px solid var(--color-line)",
  },
  ".cm-activeLine": { backgroundColor: "var(--color-hover)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--color-hover)", color: "var(--color-muted)" },
  ".cm-selectionMatch": { backgroundColor: "var(--color-accent-soft)" },
  ".cm-matchingBracket": { outline: "1px solid var(--color-line-strong)" },
  ".cm-searchMatch": { backgroundColor: "var(--color-warning-soft)" },
  ".cm-searchMatch-selected": { backgroundColor: "var(--color-accent-soft)" },
  ".cm-panels": { backgroundColor: "var(--color-surface)", color: "var(--color-fg)" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--color-line)" },
  ".cm-panel input, .cm-panel button": {
    backgroundColor: "var(--color-raised)",
    color: "var(--color-fg)",
    border: "1px solid var(--color-line-strong)",
    borderRadius: "var(--radius-sm)",
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--color-raised)",
    border: "none",
    color: "var(--color-muted)",
  },
});

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword], color: "var(--color-accent)" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "var(--color-success)" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "var(--color-warning)" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--color-info)" },
  { tag: [t.typeName, t.className, t.namespace], color: "var(--color-info)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--color-hint)", fontStyle: "italic" },
  { tag: [t.tagName, t.heading], color: "var(--color-accent)", fontWeight: "600" },
  { tag: [t.attributeName, t.propertyName], color: "var(--color-muted)" },
  { tag: t.invalid, color: "var(--color-danger)" },
  { tag: t.link, textDecoration: "underline" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "700" },
]);

/**
 * The Preview tab's editor for code and text files (D-101: always editable). Ctrl+S saves (the tab
 * owns saving); Ctrl+F searches. `value` replaces the content when it changes from outside (a reload),
 * never while you type.
 */
export function CodeEditor({
  path,
  value,
  onChange,
  onSave,
}: {
  path: string;
  value: string;
  onChange: (text: string) => void;
  onSave: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(undefined);
  const language = useRef(new Compartment());
  const handlers = useRef({ onChange, onSave });
  handlers.current = { onChange, onSave };

  // biome-ignore lint/correctness/useExhaustiveDependencies: the editor is made once per file; `value` updates below.
  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          foldGutter(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          search({ top: true }),
          syntaxHighlighting(highlight),
          language.current.of([]),
          theme,
          keymap.of([
            {
              key: "Mod-s",
              preventDefault: true,
              run: () => {
                handlers.current.onSave();
                return true;
              },
            },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) handlers.current.onChange(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    // The language loads on demand (only the one this file needs).
    const name = path.split(/[\\/]/).pop() ?? path;
    const lang = LanguageDescription.matchFilename(languages, name);
    if (lang)
      void lang.load().then((support) => {
        if (view.current === v) v.dispatch({ effects: language.current.reconfigure(support) });
      });
    return () => {
      v.destroy();
      view.current = undefined;
    };
  }, [path]);

  // A new version from disk (Load theirs, or a reload while nothing was changed): replace the text.
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value)
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  return <div ref={host} className="h-full min-h-0 overflow-hidden" data-testid="code-editor" />;
}
