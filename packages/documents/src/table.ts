/**
 * Parses CSV/TSV text (RFC 4180: quoted fields, doubled quotes, line breaks inside quotes) into rows.
 * Stops after `maxRows` rows.
 */
export function parseDelimited(
  text: string,
  delimiter = ",",
  maxRows = 10_000,
): { rows: string[][]; truncated: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      if (rows.length >= maxRows) return { rows, truncated: i + 1 < input.length };
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return { rows, truncated: false };
}

/** Comma, semicolon or tab: whichever splits the first line into the most fields. */
export function guessDelimiter(text: string): string {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  return [",", ";", "\t"].reduce(
    (best, d) => (first.split(d).length > first.split(best).length ? d : best),
    ",",
  );
}
