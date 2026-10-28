/** "Write my standup": what happened since your last working day, from git and chats. */
export type DigestPeriod = "workday" | "week";

/**
 * The start of the period: the start of the previous working day (Friday on a Monday, also over a
 * weekend), or 7 days ago.
 */
export function periodStart(period: DigestPeriod, now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (period === "week") {
    d.setDate(d.getDate() - 7);
    return d;
  }
  const day = now.getDay(); // 0 Sunday … 6 Saturday
  d.setDate(d.getDate() - (day === 1 ? 3 : day === 0 ? 2 : day === 6 ? 1 : 1));
  return d;
}

export interface RepoFacts {
  name: string;
  branch: string;
  commits: string[];
  uncommitted: number;
}

export interface ChatFacts {
  project: string;
  title: string;
  turns: number;
  status: string;
}

export function standupPrompt(since: Date, repos: RepoFacts[], chats: ChatFacts[]): string {
  const repoText = repos
    .filter((r) => r.commits.length || r.uncommitted)
    .map(
      (r) =>
        `### ${r.name} (branch ${r.branch})\n${r.commits.map((c) => `- commit: ${c}`).join("\n") || "- no commits"}${r.uncommitted ? `\n- ${r.uncommitted} uncommitted file(s)` : ""}`,
    )
    .join("\n\n");
  const chatText = chats
    .map((c) => `- [${c.project}] "${c.title}" (${c.turns} turns, ${c.status})`)
    .join("\n");
  return [
    `Write my standup update for what I did since ${since.toDateString()}.`,
    "Use Markdown with three short sections: **Done**, **Next**, **Blockers**. Bullets in the first person, grouped by project where it helps, plain language a teammate understands (no commit hashes). Base it only on the facts below; infer Next from unfinished work (uncommitted changes, chats still in progress). If there's no sign of blockers, say none.",
    `## Repositories\n${repoText || "(no commits or changes)"}`,
    `## Chats with Claude\n${chatText || "(none)"}`,
  ].join("\n\n");
}
