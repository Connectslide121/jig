import { type ActivityEvent, hashKey, type Pattern, summarizeGroup } from "./mine";

/**
 * How you work with Claude (pure, tested; D-214). The coaching itself is Claude's: the reflection reads
 * your recent chats message by message (`chatSample`) and some numbers (`promptStats`) and looks for
 * whatever would help most. The few `habit` patterns here are only hints it can start from, found from
 * the messages and tools already recorded. No AI.
 */

/** A short message asking Claude to make one piece ("now write the endpoint", "add a service for it"). */
const PIECE =
  /^(ok(ay)?[,.!]?\s+|great[,.!]?\s+|thanks[,.!]?\s+|now\s+|then\s+|next[,:]?\s+|also\s+|and\s+|can you\s+|could you\s+|please\s+)*(write|create|add|make|implement|build|generate|code|do)\b/i;
const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const PLAN = /\bplan\b/i;
const VERIFY = /\b(tests?|verify|check|lint|typecheck|build|acceptance|done when|criteria)\b/i;

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

interface Chat {
  id: string;
  prompts: ActivityEvent[];
  edits: number;
  planned: boolean;
}

/** Messages and Claude's tool uses grouped by chat (`detail.chat`), oldest first. */
export function chatsOf(events: ActivityEvent[]): Chat[] {
  const chats = new Map<string, Chat>();
  const get = (id: string) => {
    let c = chats.get(id);
    if (!c) {
      c = { id, prompts: [], edits: 0, planned: false };
      chats.set(id, c);
    }
    return c;
  };
  for (const e of [...events].sort((a, b) => a.at.localeCompare(b.at))) {
    const id = e.detail?.chat;
    if (!id) continue;
    if (e.kind === "prompt") {
      const c = get(id);
      c.prompts.push(e);
      if (PLAN.test(e.text)) c.planned = true;
    } else if (e.kind === "session.tool") {
      const c = get(id);
      if (EDIT_TOOLS.has(e.detail?.tool ?? "")) c.edits++;
      if (e.detail?.tool === "ExitPlanMode") c.planned = true;
    }
  }
  return [...chats.values()].filter((c) => c.prompts.length > 0);
}

const isPiece = (e: ActivityEvent) => words(e.text) <= 30 && PIECE.test(e.text.trim());

/**
 * Habits in how you prompt, each a `habit` pattern with your own messages as examples:
 * - piece by piece: chats where 4+ short messages each ask for one more piece (2+ chats, 2+ days);
 * - one-off asks: most chats are a single short message (6+ such chats, 60%+ of chats, 3+ days);
 * - no plan: chats where Claude edited 15+ times with no plan asked for or made (3+ chats, 2+ days).
 */
export function habitPatterns(events: ActivityEvent[]): Pattern[] {
  const chats = chatsOf(events);
  const out: Pattern[] = [];
  const add = (
    id: string,
    summary: string,
    list: ActivityEvent[],
    chatCount: number,
    min: { count: number; days: number },
    base: number,
    examples?: ActivityEvent[],
  ) => {
    const s = summarizeGroup(list);
    if (chatCount < min.count || s.days < min.days) return;
    out.push({
      key: `h-${hashKey(id)}`,
      kind: "habit",
      summary,
      ...s,
      ...(examples ? { examples: summarizeGroup(examples.slice(0, 5).reverse()).examples } : {}),
      count: chatCount,
      score: base + chatCount * Math.sqrt(s.days),
    });
  };

  const piecemeal = chats.filter((c) => c.prompts.filter(isPiece).length >= 4);
  const worst = [...piecemeal].sort(
    (a, b) => b.prompts.filter(isPiece).length - a.prompts.filter(isPiece).length,
  )[0];
  add(
    "piecemeal",
    "Building one feature piece by piece over many short messages (a function, then an endpoint, then a service…) instead of one request for the whole thing",
    piecemeal.flatMap((c) => c.prompts.filter(isPiece)),
    piecemeal.length,
    { count: 2, days: 2 },
    20,
    // One whole sequence, in order.
    worst?.prompts.filter(isPiece),
  );

  const oneOff = chats.filter((c) => c.prompts.length === 1 && words(c.prompts[0]!.text) < 15);
  if (oneOff.length / chats.length >= 0.6)
    add(
      "one-off",
      "Mostly short one-off asks (one bug, one function) in separate chats, instead of handing Claude whole tasks",
      oneOff.map((c) => c.prompts[0]!),
      oneOff.length,
      { count: 6, days: 3 },
      10,
    );

  const unplanned = chats.filter((c) => c.edits >= 15 && !c.planned);
  add(
    "no-plan",
    "Big changes (15+ edits in a chat) started without asking Claude for a plan first",
    unplanned.map((c) => c.prompts[0]!),
    unplanned.length,
    { count: 3, days: 2 },
    10,
  );
  return out;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};
const pct = (n: number, of: number) => `${of ? Math.round((n / of) * 100) : 0}%`;

/** How you prompt, in numbers, for the reflection. */
export function promptStats(events: ActivityEvent[]): string {
  const chats = chatsOf(events);
  if (!chats.length) return "(no chats recorded)";
  const prompts = chats.flatMap((c) => c.prompts);
  const first = chats.map((c) => words(c.prompts[0]!.text));
  return [
    `${chats.length} chats, ${prompts.length} messages; median ${median(chats.map((c) => c.prompts.length))} messages per chat`,
    `first message: median ${median(first)} words; ${pct(first.filter((w) => w < 15).length, chats.length)} under 15 words`,
    `chats with a single message: ${pct(chats.filter((c) => c.prompts.length === 1).length, chats.length)}`,
    `messages asking for one more piece ("now add…", "write a…"): ${pct(prompts.filter(isPiece).length, prompts.length)}`,
    `first messages saying how to check it's done (tests, criteria): ${pct(chats.filter((c) => VERIFY.test(c.prompts[0]!.text)).length, chats.length)}`,
    `chats with a plan (asked for or plan mode): ${pct(chats.filter((c) => c.planned).length, chats.length)}; chats with 15+ edits: ${chats.filter((c) => c.edits >= 15).length}`,
  ].join("\n");
}

/**
 * The most recent chats, each with its messages in order (already masked, pastes collapsed, cut
 * short), so the reflection sees how a piece of work was asked for, not only single messages.
 */
export function chatSample(events: ActivityEvent[], limit = 10, perChat = 10, max = 200): string[] {
  return chatsOf(events)
    .sort((a, b) => b.prompts.at(-1)!.at.localeCompare(a.prompts.at(-1)!.at))
    .slice(0, limit)
    .reverse()
    .map((c) => {
      const shown = c.prompts.slice(0, perChat).map((e, i) => {
        const text = e.text.replace(/\s+/g, " ").trim();
        return `  ${i + 1}. ${text.length > max ? `${text.slice(0, max)}…` : text}`;
      });
      const more = c.prompts.length > perChat ? `\n  (+${c.prompts.length - perChat} more)` : "";
      return `chat on ${c.prompts[0]!.at.slice(0, 16)}, ${c.prompts.length} message(s), ${c.edits} edit(s)${c.planned ? ", planned" : ""}:\n${shown.join("\n")}${more}`;
    });
}
