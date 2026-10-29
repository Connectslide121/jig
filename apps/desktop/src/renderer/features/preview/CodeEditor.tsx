import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab, toggleComment } from "@codemirror/commands";
import {
  bracketMatching,
  foldAll,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
  LanguageDescription,
  syntaxHighlighting,
  unfoldAll,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import {
  gotoLine,
  highlightSelectionMatches,
  openSearchPanel,
  search,
  searchKeymap,
} from "@codemirror/search";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  highlightTrailingWhitespace,
  highlightWhitespace,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";
import { ChevronDown, MoreHorizontal, Pilcrow, WrapText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { JigConfig } from "../../../shared/config";
import { detectIndent, type Indent } from "../../../shared/indent";
import { useAppearance } from "../../stores/appearance";
import { updateConfig, useConfig } from "../../stores/config";
import { cn, IconButton, openMenuAt } from "../../ui";
import { formatShortcut } from "../../workbench/shortcuts";
import { themeHighlight } from "./editorSyntax";

/**
 * Colours from Jig's tokens, so the editor's frame follows the theme (Jig Dark, Jig Light or an
 * imported VS Code theme); the code itself takes the theme's syntax colours (editorSyntax.ts).
 */
const frame = EditorView.theme({
  "&": { height: "100%", backgroundColor: "var(--color-canvas)", color: "var(--color-fg)" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", fontSize: "0.923rem", lineHeight: "1.55" },
  ".cm-content": { caretColor: "var(--color-accent)", padding: "8px 0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--color-accent)", borderLeftWidth: "2px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--color-selection)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--color-canvas)",
    color: "var(--color-hint)",
    borderRight: "1px solid var(--color-line)",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 8px 0 12px" },
  ".cm-activeLine": { backgroundColor: "var(--color-hover)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--color-hover)", color: "var(--color-fg)" },
  ".cm-selectionMatch": { backgroundColor: "var(--color-accent-soft)" },
  "&.cm-focused .cm-matchingBracket": {
    backgroundColor: "var(--color-accent-soft)",
    outline: "1px solid var(--color-line-strong)",
  },
  "&.cm-focused .cm-nonmatchingBracket": { backgroundColor: "var(--color-danger-soft)" },
  ".cm-searchMatch": {
    backgroundColor: "var(--color-warning-soft)",
    outline: "1px solid var(--color-warning)",
  },
  ".cm-searchMatch-selected": { backgroundColor: "var(--color-accent-soft)" },
  ".cm-trailingSpace": { backgroundColor: "var(--color-danger-soft)" },
  ".cm-panels": { backgroundColor: "var(--color-surface)", color: "var(--color-fg)" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--color-line)" },
  ".cm-panel input, .cm-panel button": {
    backgroundColor: "var(--color-raised)",
    color: "var(--color-fg)",
    border: "1px solid var(--color-line-strong)",
    borderRadius: "var(--radius-sm)",
  },
  ".cm-panel label": { color: "var(--color-muted)" },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--color-raised)",
    border: "1px solid var(--color-line)",
    color: "var(--color-muted)",
  },
  ".cm-foldGutter .cm-gutterElement": { color: "var(--color-hint)", cursor: "pointer" },
  ".cm-tooltip": {
    backgroundColor: "var(--color-elevated)",
    color: "var(--color-fg)",
    border: "1px solid var(--color-line-strong)",
  },
});

/** Indentation guides in the theme's line colours (the active block a little stronger). */
const guides = indentationMarkers({
  thickness: 1,
  colors: {
    light: "var(--color-line)",
    dark: "var(--color-line)",
    activeLight: "var(--color-line-strong)",
    activeDark: "var(--color-line-strong)",
  },
});

/** A file's language: by its name, else by a `#!` line (`#!/usr/bin/env python3`). */
function findLanguage(path: string, text: string): LanguageDescription | undefined {
  const name = path.split(/[\\/]/).pop() ?? path;
  const byName = LanguageDescription.matchFilename(languages, name);
  if (byName) return byName;
  const shebang = /^#!\S*?(?:\/env\s+)?\/?(?:\S*\/)?([a-z]+)/i.exec(text)?.[1]?.toLowerCase();
  if (!shebang) return undefined;
  const alias: Record<string, string> = {
    node: "javascript",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    pwsh: "powershell",
  };
  return (
    LanguageDescription.matchLanguageName(languages, alias[shebang] ?? shebang.replace(/\d+$/, ""), false) ??
    undefined
  );
}

const indentExtension = (indent: Indent): Extension => [
  indentUnit.of(indent.kind === "tabs" ? "\t" : " ".repeat(indent.size)),
  EditorState.tabSize.of(indent.size),
];

const indentLabel = (indent: Indent) => (indent.kind === "tabs" ? "Tabs" : `Spaces: ${indent.size}`);

interface Cursor {
  line: number;
  col: number;
  selections: number;
  selected: number;
}

const cursorOf = (state: EditorState): Cursor => {
  const main = state.selection.main;
  const line = state.doc.lineAt(main.head);
  return {
    line: line.number,
    col: main.head - line.from + 1,
    selections: state.selection.ranges.length,
    selected: state.selection.ranges.reduce((n, r) => n + (r.to - r.from), 0),
  };
};

/**
 * The Preview tab's editor for code and text files (D-101: always editable, D-118: a full editor).
 * Highlighting in the theme's colours, indentation guides, the file's own indentation, closing
 * brackets, several cursors (Alt+click, Alt+drag for a column, Ctrl+D for the next match), folding,
 * find and replace, go to line, word wrap and whitespace, and a status line. Ctrl+S saves (the tab
 * owns saving). `value` replaces the content when it changes from outside (a reload), never while
 * you type.
 */
export function CodeEditor({
  path,
  value,
  onChange,
  onSave,
  eol,
}: {
  path: string;
  value: string;
  onChange: (text: string) => void;
  onSave: () => void;
  /** The file's line endings (kept when it's saved). */
  eol?: "CRLF" | "LF";
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(undefined);
  const parts = useRef({
    language: new Compartment(),
    syntax: new Compartment(),
    wrap: new Compartment(),
    whitespace: new Compartment(),
    brackets: new Compartment(),
    indent: new Compartment(),
  });
  const handlers = useRef({ onChange, onSave });
  handlers.current = { onChange, onSave };
  const theme = useAppearance((s) => s.theme);
  const settings = useConfig((s) => s.config?.editor);
  const [language, setLanguage] = useState<string>();
  const [cursor, setCursor] = useState<Cursor>({ line: 1, col: 1, selections: 1, selected: 0 });
  // The file's own indentation; you can change it for this file from the status line.
  const [indent, setIndent] = useState<Indent>(() => detectIndent(value) ?? { kind: "spaces", size: 4 });
  const detected = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the editor is made once per file; the rest updates below.
  useEffect(() => {
    if (!host.current) return;
    const p = parts.current;
    const found = detectIndent(value);
    detected.current = Boolean(found);
    const first: Indent = found ?? { kind: "spaces", size: settings?.tabSize ?? 4 };
    setIndent(first);
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          foldGutter(),
          history(),
          drawSelection(),
          dropCursor(),
          EditorState.allowMultipleSelections.of(true),
          indentOnInput(),
          bracketMatching(),
          rectangularSelection(),
          crosshairCursor(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          search({ top: true }),
          guides,
          p.syntax.of(syntaxHighlighting(themeHighlight(theme))),
          p.language.of([]),
          p.wrap.of(settings?.wordWrap ? EditorView.lineWrapping : []),
          p.whitespace.of(
            settings?.showWhitespace ? [highlightWhitespace(), highlightTrailingWhitespace()] : [],
          ),
          p.brackets.of(settings?.closeBrackets === false ? [] : closeBrackets()),
          p.indent.of(indentExtension(first)),
          frame,
          keymap.of([
            {
              key: "Mod-s",
              preventDefault: true,
              run: () => {
                handlers.current.onSave();
                return true;
              },
            },
            // As in VS Code (Ctrl+G on macOS too).
            { key: "Ctrl-g", preventDefault: true, run: gotoLine },
            ...closeBracketsKeymap,
            ...foldKeymap,
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) handlers.current.onChange(u.state.doc.toString());
            if (u.docChanged || u.selectionSet) setCursor(cursorOf(u.state));
          }),
        ],
      }),
    });
    view.current = v;
    setCursor(cursorOf(v.state));
    // The language loads on demand (only the one this file needs).
    const lang = findLanguage(path, value);
    setLanguage(lang?.name);
    if (lang)
      void lang.load().then((support) => {
        if (view.current === v) v.dispatch({ effects: p.language.reconfigure(support) });
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

  // The theme and the editor settings apply to open editors right away.
  useEffect(() => {
    view.current?.dispatch({
      effects: parts.current.syntax.reconfigure(syntaxHighlighting(themeHighlight(theme))),
    });
  }, [theme]);
  useEffect(() => {
    const p = parts.current;
    view.current?.dispatch({
      effects: [
        p.wrap.reconfigure(settings?.wordWrap ? EditorView.lineWrapping : []),
        p.whitespace.reconfigure(
          settings?.showWhitespace ? [highlightWhitespace(), highlightTrailingWhitespace()] : [],
        ),
        p.brackets.reconfigure(settings?.closeBrackets === false ? [] : closeBrackets()),
      ],
    });
  }, [settings?.wordWrap, settings?.showWhitespace, settings?.closeBrackets]);
  // A file without indentation of its own follows the setting.
  useEffect(() => {
    if (!detected.current && settings?.tabSize) setIndent({ kind: "spaces", size: settings.tabSize });
  }, [settings?.tabSize]);
  useEffect(() => {
    view.current?.dispatch({ effects: parts.current.indent.reconfigure(indentExtension(indent)) });
  }, [indent]);

  const run = (command: (v: EditorView) => boolean) => {
    const v = view.current;
    if (!v) return;
    command(v);
    v.focus();
  };
  const set = (patch: Partial<JigConfig["editor"]>) => void updateConfig({ editor: patch });
  const indentMenu = (anchor: HTMLElement) =>
    openMenuAt(anchor, [
      ...[2, 4, 8].map((size) => ({
        label: `Spaces: ${size}`,
        checked: indent.kind === "spaces" && indent.size === size,
        onSelect: () => setIndent({ kind: "spaces", size }),
      })),
      {
        label: "Tabs",
        checked: indent.kind === "tabs",
        onSelect: () => setIndent({ kind: "tabs", size: indent.size }),
      },
    ]);
  const moreMenu = (anchor: HTMLElement) =>
    openMenuAt(
      anchor,
      [
        { label: `Find and replace (${formatShortcut("Mod+F")})`, onSelect: () => run(openSearchPanel) },
        { label: "Go to line… (Ctrl+G)", onSelect: () => run(gotoLine) },
        { label: `Toggle comment (${formatShortcut("Mod+/")})`, onSelect: () => run(toggleComment) },
        { label: "Fold all", onSelect: () => run(foldAll) },
        { label: "Unfold all", onSelect: () => run(unfoldAll) },
        {
          label: "Close brackets and quotes",
          checked: settings?.closeBrackets !== false,
          onSelect: () => set({ closeBrackets: settings?.closeBrackets === false }),
        },
      ],
      true,
    );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={host} className="min-h-0 flex-1 overflow-hidden" data-testid="code-editor" />
      <div
        className="flex h-6 shrink-0 items-center gap-3 border-t border-line bg-surface px-2 text-xs text-muted"
        data-testid="editor-status"
      >
        <button
          type="button"
          className="hover:text-fg"
          title="Go to line (Ctrl+G)"
          onClick={() => run(gotoLine)}
          data-testid="editor-position"
        >
          Ln {cursor.line}, Col {cursor.col}
          {cursor.selections > 1
            ? ` (${cursor.selections} cursors)`
            : cursor.selected > 0
              ? ` (${cursor.selected} selected)`
              : ""}
        </button>
        <span className="flex-1" />
        <button
          type="button"
          className="flex items-center gap-0.5 hover:text-fg"
          onClick={(e) => indentMenu(e.currentTarget)}
          data-testid="editor-indent"
        >
          {indentLabel(indent)}
          <ChevronDown className="size-3" />
        </button>
        {eol && <span title="Line endings (kept when you save)">{eol}</span>}
        <span data-testid="editor-language">{language ?? "Plain text"}</span>
        <IconButton
          icon={WrapText}
          size="sm"
          label={settings?.wordWrap ? "Don't wrap long lines" : "Wrap long lines"}
          className={cn(settings?.wordWrap && "text-accent")}
          onClick={() => set({ wordWrap: !settings?.wordWrap })}
          data-testid="editor-wrap"
        />
        <IconButton
          icon={Pilcrow}
          size="sm"
          label={settings?.showWhitespace ? "Hide spaces and tabs" : "Show spaces and tabs"}
          className={cn(settings?.showWhitespace && "text-accent")}
          onClick={() => set({ showWhitespace: !settings?.showWhitespace })}
          data-testid="editor-whitespace"
        />
        <IconButton
          icon={MoreHorizontal}
          size="sm"
          label="More"
          onClick={(e) => moreMenu(e.currentTarget)}
          data-testid="editor-more"
        />
      </div>
    </div>
  );
}
