/** How a file indents: tabs, or a number of spaces. */
export type Indent = { kind: "tabs"; size: number } | { kind: "spaces"; size: number };

/**
 * The indentation a file already uses, from its lines (as editors guess it): mostly tabs → tabs;
 * otherwise the most common step between the indentation of consecutive lines. Undefined when the
 * file has too little indentation to tell.
 */
export function detectIndent(text: string, maxLines = 2000): Indent | undefined {
  let tabs = 0;
  let spaced = 0;
  const steps = new Map<number, number>();
  let previous = 0;
  const lines = text.split("\n", maxLines);
  for (const line of lines) {
    if (!line.trim()) continue;
    if (line.startsWith("\t")) {
      tabs++;
      previous = 0;
      continue;
    }
    const width = /^ */.exec(line)![0].length;
    if (width > 0) spaced++;
    const step = Math.abs(width - previous);
    // A step of 1 is usually alignment (a JSDoc ` *`), not indentation.
    if (step > 1 && step <= 8) steps.set(step, (steps.get(step) ?? 0) + 1);
    previous = width;
  }
  if (tabs > spaced && tabs >= 2) return { kind: "tabs", size: 4 };
  let best: [number, number] | undefined;
  for (const entry of steps) if (!best || entry[1] > best[1]) best = entry;
  if (!best || best[1] < 2) return undefined;
  return { kind: "spaces", size: best[0] };
}

/** "CRLF" when most line breaks are Windows ones, else "LF". */
export function lineEnding(text: string): "CRLF" | "LF" {
  const crlf = text.split("\r\n").length - 1;
  const lf = text.split("\n").length - 1 - crlf;
  return crlf > lf ? "CRLF" : "LF";
}
