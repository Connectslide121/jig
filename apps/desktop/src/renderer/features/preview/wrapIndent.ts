import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

/** The deepest indentation wrapped lines follow, so very indented lines still have room for text. */
const MAX_COLUMNS = 60;

/** The width of a line's leading whitespace in columns (a tab goes to the next tab stop). */
export function indentColumns(text: string, tabSize: number): number {
  let cols = 0;
  for (const ch of text) {
    if (ch === " ") cols++;
    else if (ch === "\t") cols += tabSize - (cols % tabSize);
    else break;
  }
  return Math.min(cols, MAX_COLUMNS);
}

const marks = new Map<number, Decoration>();
function mark(cols: number): Decoration {
  let d = marks.get(cols);
  if (!d) {
    d = Decoration.line({ class: "cm-wrapIndent", attributes: { style: `--wrap-indent: ${cols}ch` } });
    marks.set(cols, d);
  }
  return d;
}

function decorate(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const tabSize = view.state.tabSize;
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = view.state.doc.lineAt(pos);
      const cols = indentColumns(line.text, tabSize);
      if (cols > 0) builder.add(line.from, line.from, mark(cols));
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

/**
 * Wrapped lines keep their indentation (VS Code's wrapping indent "same"): the continuation of an
 * indented line starts under its first character, not at the left edge. Use with lineWrapping.
 */
export const wrapIndent = [
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = decorate(view);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged || u.startState.tabSize !== u.state.tabSize)
          this.decorations = decorate(u.view);
      }
    },
    { decorations: (p) => p.decorations },
  ),
  // The first row starts as usual; the rows it wraps onto start the indentation further in.
  EditorView.theme({
    ".cm-line.cm-wrapIndent": {
      paddingLeft: "calc(var(--wrap-indent) + 6px)",
      textIndent: "calc(-1 * var(--wrap-indent))",
    },
  }),
];
