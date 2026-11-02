import type { BranchHeader } from "./parse";

/** What the sync button does for a branch: publish, pull, push, both, or nothing. */
export type SyncKind = "publish" | "pull" | "push" | "sync" | "none";

export interface SyncAction {
  kind: SyncKind;
  /** The full-width button's text ("Push ↑2", "Sync ↓1 ↑2", "Publish Branch"). */
  label: string;
  /** The compact header button's text ("↑2", "↓1 ↑2", "Publish", "Up to date"). */
  short: string;
  /** Says exactly what a click does, naming the remote branch. */
  title: string;
}

const commits = (n: number) => `${n} commit${n === 1 ? "" : "s"}`;

/** Names the button by what it will do, so it doesn't always say "Sync". */
export function syncAction(b: BranchHeader): SyncAction {
  const counts = [b.behind > 0 ? `↓${b.behind}` : "", b.ahead > 0 ? `↑${b.ahead}` : ""]
    .filter(Boolean)
    .join(" ");
  if (!b.upstream)
    return {
      kind: "publish",
      label: "Publish Branch",
      short: "Publish",
      title: b.head ? `Push ${b.head} to the remote and track it` : "Publish this branch",
    };
  if (b.behind > 0 && b.ahead > 0)
    return {
      kind: "sync",
      label: `Sync ${counts}`,
      short: counts,
      title: `Pull ${commits(b.behind)} from ${b.upstream}, then push ${commits(b.ahead)}`,
    };
  if (b.behind > 0)
    return {
      kind: "pull",
      label: `Pull ${counts}`,
      short: counts,
      title: `Pull ${commits(b.behind)} from ${b.upstream}`,
    };
  if (b.ahead > 0)
    return {
      kind: "push",
      label: `Push ${counts}`,
      short: counts,
      title: `Push ${commits(b.ahead)} to ${b.upstream}`,
    };
  return {
    kind: "none",
    label: "Up to date",
    short: "Up to date",
    title: `Up to date with ${b.upstream} (as of the last fetch)`,
  };
}

/** The toast after a sync: what was actually pulled and pushed. */
export function syncResult(head: string, upstream: string, pulled: number, pushed: number): string {
  if (pulled && pushed) return `Synced ${head}: pulled ${commits(pulled)}, pushed ${commits(pushed)}`;
  if (pulled) return `Pulled ${commits(pulled)} from ${upstream}`;
  if (pushed) return `Pushed ${commits(pushed)} to ${upstream}`;
  return `${head} is up to date`;
}
