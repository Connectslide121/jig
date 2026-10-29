/**
 * Lines by Claude vs lines by hand (pure, tested; Learning 2e). Claude's Edit/Write calls record a
 * hash per line they wrote; each commit's added lines are matched against them. Lines removed again
 * within two weeks count as churn for their origin, and "fix" commits that remove recent lines count
 * against that origin. Signals, not proof: a line Claude wrote and you changed counts as yours.
 */

/** A short, stable hash of a line's content (whitespace at the ends ignored). Empty lines: none. */
export function lineHash(line: string): string | undefined {
  const t = line.trim();
  if (t.length < 3) return undefined;
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** The line hashes of what Claude wrote with Write/Edit/MultiEdit (from the tool input). */
export function aiLineHashes(tool: string, input: Record<string, unknown>): string[] {
  const texts: string[] = [];
  if (tool === "Write" && typeof input.content === "string") texts.push(input.content);
  if (tool === "Edit" && typeof input.new_string === "string") texts.push(input.new_string);
  if (tool === "MultiEdit" && Array.isArray(input.edits))
    for (const e of input.edits as Array<{ new_string?: unknown }>)
      if (typeof e?.new_string === "string") texts.push(e.new_string);
  const hashes = new Set<string>();
  for (const t of texts)
    for (const line of t.split("\n")) {
      const h = lineHash(line);
      if (h) hashes.add(h);
    }
  return [...hashes];
}

export interface CommitPatch {
  hash: string;
  at: string;
  subject: string;
  /** Paths relative to the repository. */
  files: Array<{ path: string; added: string[]; removed: string[] }>;
}

/**
 * Parses `git log -p --unified=0 --no-merges --format=%x1e%H%x1f%cI%x1f%s` (newest first) into
 * commits, oldest first.
 */
export function parseLogPatch(out: string): CommitPatch[] {
  const commits: CommitPatch[] = [];
  for (const chunk of out.split("\x1e")) {
    if (!chunk.trim()) continue;
    const nl = chunk.indexOf("\n");
    const header = nl < 0 ? chunk : chunk.slice(0, nl);
    const [hash = "", at = "", subject = ""] = header.split("\x1f");
    const commit: CommitPatch = { hash, at, subject, files: [] };
    let file: CommitPatch["files"][number] | undefined;
    for (const line of (nl < 0 ? "" : chunk.slice(nl + 1)).split("\n")) {
      if (line.startsWith("+++ ")) {
        const path = line.slice(4).replace(/^b\//, "");
        file = path === "/dev/null" ? undefined : { path, added: [], removed: [] };
        if (file) commit.files.push(file);
      } else if (line.startsWith("--- ") || line.startsWith("diff --git") || line.startsWith("@@")) {
        // headers
      } else if (file && line.startsWith("+")) file.added.push(line.slice(1));
      else if (file && line.startsWith("-")) file.removed.push(line.slice(1));
    }
    commits.push(commit);
  }
  return commits.reverse();
}

export interface WorkedSummary {
  /** Commits in the window. */
  commits: number;
  ai: number;
  hand: number;
  /** Lines of each origin removed again within `churnDays` (lines from the whole history read). */
  churn: { ai: number; hand: number };
  /** "fix" commits that removed recent lines, with the origin of most of them. */
  fixes: Array<{ commit: string; subject: string; origin: "ai" | "hand" }>;
}

const FIX = /\b(fix|bug|hotfix|revert)/i;

/**
 * The summary for commits on or after `since`: lines by Claude (hash recorded for that file) vs by
 * hand, churn per origin, and fix commits. `aiLines`: absolute or repository paths → line hashes.
 */
export function summarizeWork(
  commits: CommitPatch[],
  aiLines: (path: string) => Set<string> | undefined,
  since: string,
  churnDays = 14,
): WorkedSummary {
  const summary: WorkedSummary = { commits: 0, ai: 0, hand: 0, churn: { ai: 0, hand: 0 }, fixes: [] };
  // Recently added lines per file: hash → origin and when.
  const recent = new Map<string, Map<string, { origin: "ai" | "hand"; at: number }>>();
  for (const c of commits) {
    const t = new Date(c.at).getTime();
    const inWindow = c.at >= since;
    if (inWindow) summary.commits++;
    const removedOrigins: Array<"ai" | "hand"> = [];
    for (const f of c.files) {
      const lines: Map<string, { origin: "ai" | "hand"; at: number }> = recent.get(f.path) ?? new Map();
      recent.set(f.path, lines);
      for (const r of f.removed) {
        const h = lineHash(r);
        const hit = h ? lines.get(h) : undefined;
        if (hit && t - hit.at <= churnDays * 86_400_000) {
          if (inWindow) summary.churn[hit.origin]++;
          removedOrigins.push(hit.origin);
          lines.delete(h!);
        }
      }
      const ai = aiLines(f.path);
      for (const a of f.added) {
        const h = lineHash(a);
        if (!h) continue;
        const origin = ai?.has(h) ? "ai" : "hand";
        if (inWindow) summary[origin]++;
        lines.set(h, { origin, at: t });
      }
    }
    if (inWindow && FIX.test(c.subject) && removedOrigins.length) {
      const ai = removedOrigins.filter((o) => o === "ai").length;
      summary.fixes.push({
        commit: c.hash.slice(0, 7),
        subject: c.subject,
        origin: ai * 2 > removedOrigins.length ? "ai" : "hand",
      });
    }
  }
  return summary;
}

/** One paragraph: "This week: 1,240 lines by Claude, 310 by hand…". Empty when nothing was committed. */
export function workedText(s: WorkedSummary, chatMinutes?: number): string {
  if (!s.commits) return "";
  const n = (x: number) => x.toLocaleString("en-US");
  const parts = [
    `${s.commits} commit${s.commits === 1 ? "" : "s"}: ${n(s.ai)} lines by Claude, ${n(s.hand)} by hand.`,
  ];
  const rate = (churn: number, total: number) => (total ? churn / total : 0);
  const ai = rate(s.churn.ai, s.ai);
  const hand = rate(s.churn.hand, s.hand);
  if (s.churn.ai + s.churn.hand > 0) {
    if (ai > 0 && hand > 0 && Math.max(ai, hand) / Math.min(ai, hand) >= 1.5)
      parts.push(
        `${hand > ai ? "Hand-written" : "Claude's"} lines were changed again ${(Math.max(ai, hand) / Math.min(ai, hand)).toFixed(1)}× as often.`,
      );
    else
      parts.push(
        `${n(s.churn.ai + s.churn.hand)} recent lines were changed again (${n(s.churn.ai)} by Claude, ${n(s.churn.hand)} by hand).`,
      );
  }
  for (const f of s.fixes.slice(0, 2))
    parts.push(
      `The fix in ${f.commit} changed ${f.origin === "ai" ? "lines Claude wrote" : "hand-written lines"} from the days before.`,
    );
  if (chatMinutes) parts.push(`About ${Math.round(chatMinutes / 6) / 10} h in chats (an estimate).`);
  return parts.join(" ");
}

/** Minutes of chat work from event times: gaps under 10 minutes count, longer ones are breaks. */
export function activeMinutes(times: string[], gapMinutes = 10): number {
  const sorted = times.map((t) => new Date(t).getTime()).sort((a, b) => a - b);
  let total = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i]! - sorted[i - 1]!;
    if (gap <= gapMinutes * 60_000) total += gap;
  }
  return Math.round(total / 60_000);
}
