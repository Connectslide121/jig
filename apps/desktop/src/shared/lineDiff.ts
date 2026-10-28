/**
 * A unified diff of two texts, line by line (LCS), for showing what changed between your unsaved
 * edits and the file on disk. Pure; large inputs fall back to "everything changed" past a size limit.
 */
export function unifiedDiff(before: string, after: string, context = 3, maxCells = 4_000_000): string {
  const a = before.split("\n");
  const b = after.split("\n");
  // Trim the common start and end so the table stays small.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const ops: Array<{ op: " " | "-" | "+"; line: string }> = [];
  for (let i = 0; i < start; i++) ops.push({ op: " ", line: a[i]! });
  if (midA.length * midB.length > maxCells) {
    for (const line of midA) ops.push({ op: "-", line });
    for (const line of midB) ops.push({ op: "+", line });
  } else {
    const n = midA.length;
    const m = midB.length;
    const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        lcs[i]![j] =
          midA[i] === midB[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && midA[i] === midB[j]) {
        ops.push({ op: " ", line: midA[i]! });
        i++;
        j++;
      } else if (i < n && (j >= m || lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) {
        // Removed lines before added ones, as diffs usually read.
        ops.push({ op: "-", line: midA[i]! });
        i++;
      } else {
        ops.push({ op: "+", line: midB[j]! });
        j++;
      }
    }
  }
  for (let i = endA; i < a.length; i++) ops.push({ op: " ", line: a[i]! });
  // Keep `context` unchanged lines around each change; elide the rest.
  const keep = ops.map(
    (o, idx) =>
      o.op !== " " || ops.slice(Math.max(0, idx - context), idx + context + 1).some((x) => x.op !== " "),
  );
  const out: string[] = [];
  let skipped = false;
  ops.forEach((o, idx) => {
    if (keep[idx]) {
      if (skipped) out.push("@@ …");
      skipped = false;
      out.push(`${o.op}${o.line}`);
    } else skipped = true;
  });
  return out.join("\n");
}
