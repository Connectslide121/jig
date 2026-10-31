import { type ActivityEvent, hashKey, type Pattern, summarizeGroup } from "./mine";

/**
 * Signals beyond repetition (pure, tested; Learning 2): friction (interrupts, rewinds, denied
 * permissions, corrections, tool errors, failing scripts), what you paste into chats, and Jig tools
 * that would have fit but were never used. No AI; they become patterns like the others, so the
 * reflection sees them with their evidence.
 */

/** A message that corrects Claude ("no, I meant…", "that's wrong", "undo that"). */
export function correctionSignal(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(no[,.!]|nope\b|not that\b|wrong\b|that'?s (not|wrong)|that is (not|wrong)|i meant\b|actually,? i (meant|want)|undo (that|this|it)\b|revert (that|this|it)\b|don'?t do that\b|stop doing\b)/.test(
    t,
  );
}

const FRICTION_LABEL: Record<string, string> = {
  interrupt: "You stopped Claude mid-turn",
  rewind: "You rewound a chat to an earlier message",
  denied: "You denied Claude a permission",
  correction: "You corrected Claude",
  "tool-errors": "Claude's tools failed several times in one turn",
  "script-failed": "A script failed",
  "long-chat": "A long chat ended without a commit",
  hopping: "You switched between projects many times in a short while",
};

const COMMIT = /\bgit commit\b/;

/**
 * Friction found from the log itself (no recorder needed): a chat with 15+ messages over an hour or
 * more and no commit anywhere in that time (`detail.chat` of messages), and hopping between projects
 * (6+ switches within 30 minutes). Returned as `friction` events, so they mine like the others.
 */
export function derivedFriction(events: ActivityEvent[]): ActivityEvent[] {
  const out: ActivityEvent[] = [];
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
  const commits = sorted
    .filter(
      (e) =>
        (e.kind === "git" && /commit/.test(e.text)) ||
        ((e.kind === "terminal.command" || e.kind === "session.tool") && COMMIT.test(e.text)),
    )
    .map((e) => e.at);
  const chats = new Map<string, ActivityEvent[]>();
  for (const e of sorted)
    if (e.kind === "prompt" && e.detail?.chat)
      chats.set(e.detail.chat, [...(chats.get(e.detail.chat) ?? []), e]);
  for (const list of chats.values()) {
    if (list.length < 15) continue;
    const first = list[0]!.at;
    const last = list[list.length - 1]!.at;
    if (new Date(last).getTime() - new Date(first).getTime() < 3_600_000) continue;
    if (commits.some((c) => c >= first && c <= new Date(new Date(last).getTime() + 3_600_000).toISOString()))
      continue;
    out.push({
      at: last,
      kind: "friction",
      text: `${list.length} messages without a commit`,
      projectId: list[0]!.projectId,
      detail: { signal: "long-chat" },
    });
  }
  const switches = sorted.filter((e) => e.kind === "project.switch");
  let lastHop = "";
  for (let i = 5; i < switches.length; i++) {
    const start = switches[i - 5]!.at;
    const end = switches[i]!.at;
    if (new Date(end).getTime() - new Date(start).getTime() > 30 * 60_000) continue;
    if (lastHop && new Date(start).getTime() - new Date(lastHop).getTime() < 30 * 60_000) continue;
    lastHop = end;
    out.push({
      at: end,
      kind: "friction",
      text: "6 project switches in 30 minutes",
      detail: { signal: "hopping" },
    });
  }
  return out;
}

/** Friction that keeps happening: one pattern per signal (3+ times on 2+ days). */
export function frictionPatterns(events: ActivityEvent[], min = { count: 3, days: 2 }): Pattern[] {
  const groups = new Map<string, ActivityEvent[]>();
  for (const e of [...events, ...derivedFriction(events)]) {
    if (e.kind !== "friction") continue;
    const signal = e.detail?.signal ?? "other";
    // A failing script is its own pattern per script.
    const key = signal === "script-failed" ? `${signal}:${e.text}` : signal;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const s = summarizeGroup(list);
      const [signal, script] = key.split(/:(.*)/s);
      const label = FRICTION_LABEL[signal!] ?? signal!;
      return {
        key: `f-${hashKey(key)}`,
        kind: "friction" as const,
        summary: script ? `${label}: ${script}` : label,
        ...s,
        score: s.count * Math.sqrt(s.days),
      };
    })
    .filter((p) => p.count >= min.count && p.days >= min.days);
}

/** Pastes per kind (`detail.pasted` of messages, e.g. `http:2,json:1`): 5+ on 2+ days. */
export function pastePatterns(events: ActivityEvent[], min = { count: 5, days: 2 }): Pattern[] {
  const groups = new Map<string, ActivityEvent[]>();
  const counts = new Map<string, number>();
  for (const e of events) {
    if (e.kind !== "prompt" || !e.detail?.pasted) continue;
    for (const part of e.detail.pasted.split(",")) {
      const [kind, n] = part.split(":");
      if (!kind) continue;
      groups.set(kind, [...(groups.get(kind) ?? []), e]);
      counts.set(kind, (counts.get(kind) ?? 0) + (Number(n) || 1));
    }
  }
  return [...groups.entries()]
    .map(([kind, list]) => {
      const s = summarizeGroup(list);
      const count = counts.get(kind) ?? list.length;
      return {
        key: `v-${hashKey(kind)}`,
        kind: "paste" as const,
        summary: `You pasted ${kind === "http" ? "HTTP requests/responses" : kind === "stack trace" ? "stack traces" : `${kind}`} into chats`,
        ...s,
        count,
        score: count * Math.sqrt(s.days),
      };
    })
    .filter((p) => p.count >= min.count && p.days >= min.days);
}

const UI_WORDS =
  /\b(css|styles?|layout|button|page|ui|ux|screen|component|render(s|ed|ing)?|looks?|display(s|ed)?|modal|form|responsive|mobile|click(s|ed)?)\b/i;

/**
 * Jig tools that fit the work but were never used: in a project where 5+ messages on 2+ days were
 * about the UI, Claude's browser (`jig_browser_*`) was never used.
 */
export function unusedToolPatterns(events: ActivityEvent[], min = { count: 5, days: 2 }): Pattern[] {
  const byProject = new Map<string, ActivityEvent[]>();
  const usedBrowser = new Set<string>();
  for (const e of events) {
    const project = e.projectId ?? "";
    if (e.kind === "session.tool" && /jig_browser/.test(e.detail?.tool ?? e.text)) usedBrowser.add(project);
    if (e.kind === "prompt" && UI_WORDS.test(e.text))
      byProject.set(project, [...(byProject.get(project) ?? []), e]);
  }
  return [...byProject.entries()]
    .filter(([project]) => !usedBrowser.has(project))
    .map(([project, list]) => {
      const s = summarizeGroup(list);
      return {
        key: `u-${hashKey(`browser:${project}`)}`,
        kind: "unused-tool" as const,
        summary: "Claude's browser was never used, though these messages were about the UI",
        ...s,
        score: s.count * 0.8 * Math.sqrt(s.days),
      };
    })
    .filter((p) => p.count >= min.count && p.days >= min.days);
}

/**
 * A view you keep opening as a main tab (4+ times on 3+ days) and never moved to a sidebar or the
 * bottom panel since: it may belong in one. The reflection can suggest a layout change for it.
 */
export function viewHabitPatterns(events: ActivityEvent[], min = { count: 4, days: 3 }): Pattern[] {
  const opened = new Map<string, ActivityEvent[]>();
  const movedAt = new Map<string, string>();
  for (const e of events) {
    const view = e.kind === "ui" ? e.detail?.view : undefined;
    if (!view) continue;
    if (e.detail?.op === "open-tab") opened.set(view, [...(opened.get(view) ?? []), e]);
    if (e.detail?.op === "move" && e.at > (movedAt.get(view) ?? "")) movedAt.set(view, e.at);
  }
  return [...opened.entries()]
    .map(([view, all]) => {
      const list = all.filter((e) => e.at > (movedAt.get(view) ?? ""));
      const s = summarizeGroup(list);
      const title = list[list.length - 1]?.detail?.title ?? view;
      return {
        key: `v-${hashKey(view)}`,
        kind: "view-habit" as const,
        summary: `You opened ${title} (${view}) as a tab again and again; it isn't in a sidebar`,
        ...s,
        score: s.count * 0.7 * Math.sqrt(s.days),
      };
    })
    .filter((p) => p.count >= min.count && p.days >= min.days);
}
