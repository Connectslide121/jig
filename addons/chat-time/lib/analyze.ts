/**
 * Where a chat's working time goes: each tool call gets a start (its item's `at`) and an end (the
 * tool_result's time from the engine transcript when known, else when the next step of the chat
 * began), a category, and the turn it belongs to. Overlapping calls (parallel tools) count once, for
 * the category that ranks first; the rest of a turn's working time is the model thinking and writing.
 * Pure functions: host.ts reads the files and caches the results.
 */

export type Category = "model" | "tests" | "browser" | "subagents" | "shell" | "tools" | "waiting";

/** Display order. */
export const CATEGORIES: Category[] = ["model", "tests", "browser", "subagents", "shell", "tools", "waiting"];
/** Overlap rank (earlier wins) for everything but "model". */
const RANK: Category[] = ["waiting", "tests", "browser", "subagents", "shell", "tools"];

export const CATEGORY_LABEL: Record<Category, string> = {
  model: "Model thinking & writing",
  tests: "Tests & builds",
  browser: "Browser checks",
  subagents: "Subagents",
  shell: "Other shell commands",
  tools: "Other tools",
  waiting: "Waiting for you",
};

/** Short names, for narrow places (the chat overview's section). */
export const CATEGORY_SHORT: Record<Category, string> = {
  model: "Model",
  tests: "Tests & builds",
  browser: "Browser checks",
  subagents: "Subagents",
  shell: "Shell commands",
  tools: "Other tools",
  waiting: "Waiting for you",
};

export const CATEGORY_HINT: Record<Category, string> = {
  model: "Working time no tool call covers: the model reading, thinking and writing",
  tests:
    "Test and build commands (Vitest, Playwright, e2e, tsc, npm test/check/verify/build, dotnet test…) and the Tests add-on",
  browser: "Jig's browser tools, the jig-tester subagent and other browser automation",
  subagents: "Agent/Task calls, including what the subagent did",
  shell: "Shell commands that aren't tests or builds",
  tools: "Reading, searching and editing files, add-on tools, web…",
  waiting: "Questions to you, plans to approve and approval prompts",
};

export type Totals = Record<Category, number>;

export interface Call {
  id: string;
  name: string;
  /** What it did, short: the command, the description, the URL… */
  label: string;
  category: Category;
  at: string;
  ms: number;
  /** End taken from when the next step began (no transcript time). */
  estimated: boolean;
  /** It failed or was stopped. */
  failed?: boolean;
}

export interface Turn {
  /** When the turn began (its end minus its working time). */
  start: number;
  /** When the turn ended. */
  at: string;
  workingMs: number;
  totals: Totals;
  calls: number;
}

export interface ChatAnalysis {
  sessionId: string;
  title: string;
  projectId?: string;
  provider: string;
  updatedAt: string;
  turns: Turn[];
  /** Every top-level tool call with a known duration (subagents' own calls are inside their Agent call). */
  calls: Call[];
}

export interface Item {
  kind: string;
  id: string;
  at: string;
  name?: string;
  input?: Record<string, unknown>;
  output?: unknown;
  parentId?: string;
  durationMs?: number;
  status?: string;
  request?: { requestId?: string };
}

export function emptyTotals(): Totals {
  return { model: 0, tests: 0, browser: 0, subagents: 0, shell: 0, tools: 0, waiting: 0 };
}

/** "mcp__jig__jig_browser_click" → "jig_browser_click"; built-in names stay. */
function bare(name: string): string {
  const i = name.lastIndexOf("__");
  return name.startsWith("mcp__") && i > 4 ? name.slice(i + 2) : name;
}

const SHELL = new Set(["Bash", "PowerShell", "exec", "shell", "jig_terminal_run"]);
/** Tools that wait on a shell command started in the background: they take that command's category. */
const BACKGROUND_WAIT = new Set(["TaskOutput", "BashOutput", "AgentOutputTool"]);
const TEST_TOOLS = /^addon_tests_(run|wait)$/;
const BROWSER_TOOLS =
  /^jig_browser_|^jig_test_page$|^browser_|Claude_Browser|playwright|chrome-devtools|puppeteer/i;
const BROWSER_MCP = /^mcp__(Claude_Browser|playwright|chrome-devtools|puppeteer)/i;
/** Subagents that check pages in a browser. */
const BROWSER_AGENTS = /tester|browser|playwright/i;
/**
 * A shell command runs tests or builds when one of its steps starts with a test runner, a build or
 * check script or a test script: steps are split at `&&`, `||`, `;`, `|`, new lines and `$(`, with
 * heredoc bodies left out, so a path that merely mentions a test (`rm e2e/a.spec.ts`, `cat x.test.ts`)
 * isn't one.
 */
const TEST_STEP = new RegExp(
  [
    String.raw`^(npx\s+|pnpm\s+(exec\s+|dlx\s+)?|yarn\s+|bunx\s+)?(playwright|vitest|jest|karma|cypress|mocha|pytest|tsc|vue-tsc|eslint|biome\s+(check|ci|lint)|ng\s+(test|build|lint))\b`,
    String.raw`^(npm|pnpm|yarn|bun)\s+(test|t)\b`,
    String.raw`^(npm|pnpm|yarn|bun)\s+(run\s+|run-script\s+)?[\w:.-]*(test|check|verify|build|lint|typecheck|e2e)`,
    String.raw`^dotnet\s+(test|build)\b`,
    String.raw`^(go|cargo)\s+(test|build)\b`,
    String.raw`^(mvn|gradle|\./gradlew|msbuild)\b`,
    String.raw`^(node|bash|sh|pwsh|powershell(\.exe)?|python3?|py|tsx|npx\s+tsx)\s+(-\S+\s+)*["']?[\w./\:-]*(test|e2e)[\w.-]*\.(ps1|sh|cjs|mjs|js|ts|py)\b`,
    String.raw`^\.?[\w./\-]*(test|e2e)[\w.-]*\.(ps1|sh)\b`,
  ].join("|"),
  "i",
);
/** Waiting for a test run in the background: a sleep or until loop on a test log. */
const TEST_WAIT =
  /\b(until|while|sleep|Start-Sleep|timeout)\b[\s\S]*[\w./-]*(e2e|test|vitest|playwright|verify|check)[\w.-]*\.(log|txt|out)\b/i;
/** Browser checks run as scripts: a Playwright script with a browser channel, or a *browser* script. */
const BROWSER_STEP =
  /^PW_CHANNEL=|^(node|tsx|npx\s+tsx)\s+(-\S+\s+)*["']?[\w./:-]*browser[\w.-]*\.(cjs|mjs|js|ts)\b/i;
/** Leading environment assignments and wrappers before the program a step runs. */
const STEP_PREFIX =
  /^(?:(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)|\$env:\w+\s*=\s*\S+|timeout\s+(?:-\S+\s+)*\d+[smh]?|time|env|nice|exec|sudo|xvfb-run(?:\s+-a)?|\(|\{|&)\s*)+/;

/** The steps of a shell command, without heredoc bodies, each without its env/wrapper prefix. */
export function steps(cmd: string): Array<{ raw: string; program: string }> {
  const text = cmd.replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g, "");
  return text
    .split(/&&|\|\||[;|\n]|\$\(|`|\b(?:do|then|else)\b/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((raw) => ({ raw, program: raw.replace(STEP_PREFIX, "") }));
}

export function shellCategory(cmd: string): "tests" | "browser" | "shell" {
  const parts = steps(cmd);
  if (parts.some((s) => BROWSER_STEP.test(s.raw) || BROWSER_STEP.test(s.program))) return "browser";
  if (parts.some((s) => TEST_STEP.test(s.program))) return "tests";
  return TEST_WAIT.test(cmd) ? "tests" : "shell";
}

function command(input: Record<string, unknown> | undefined): string {
  const c = input?.command ?? input?.cmd ?? input?.script;
  return typeof c === "string" ? c : Array.isArray(c) ? c.join(" ") : "";
}

export function categorize(name: string, input?: Record<string, unknown>): Category {
  const tool = bare(name);
  if (tool === "AskUserQuestion" || tool === "ExitPlanMode") return "waiting";
  if (TEST_TOOLS.test(tool)) return "tests";
  if (BROWSER_TOOLS.test(tool) || BROWSER_MCP.test(name)) return "browser";
  if (tool === "Agent" || tool === "Task") {
    const type = input?.subagent_type;
    return typeof type === "string" && BROWSER_AGENTS.test(type) ? "browser" : "subagents";
  }
  if (SHELL.has(tool)) return shellCategory(command(input));
  return "tools";
}

/** "mcp__jig__jig_browser_click" → "browser_click"; built-in names stay. */
export function shortName(name: string): string {
  return bare(name)
    .replace(/^jig_/, "")
    .replace(/^addon_/, "");
}

/** A short excerpt of what a call did, at most `max` characters. */
export function labelOf(input?: Record<string, unknown>, max = 140): string {
  const pick = (k: string) => (typeof input?.[k] === "string" ? (input[k] as string) : "");
  const detail =
    command(input) ||
    pick("description") ||
    pick("expression") ||
    pick("url") ||
    pick("selector") ||
    pick("file_path") ||
    pick("pattern") ||
    pick("suite") ||
    pick("query") ||
    pick("prompt");
  const text = detail.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** The id a background shell command answers with ("…running in background with ID: b17838osl"). */
const BACKGROUND_ID = /in background with ID:\s*([\w-]+)/i;

/** Kinds that mark the chat moving on after a tool (its result is in). */
const NEXT_STEP = new Set(["thinking", "assistant", "tool", "result", "user"]);
const BURST_MS = 1500;

/**
 * @param ends tool id → when its result came back (from the engine transcript), if known.
 */
export function analyze(
  session: { meta: Record<string, unknown>; items: Item[] },
  ends: Map<string, number>,
): ChatAnalysis {
  const { meta, items } = session;
  const turns: Turn[] = [];
  const calls: Call[] = [];
  let pending: Array<{ call: Call; start: number; end: number }> = [];
  const time = (s: string) => Date.parse(s);
  const asked = new Set(items.filter((i) => i.kind === "permission").map((i) => i.request?.requestId));
  /** Background shell id → the category of the command it runs. */
  const background = new Map<string, Category>();

  for (const [i, it] of items.entries()) {
    if (it.kind === "tool" && !it.parentId && it.name) {
      let category = categorize(it.name, it.input);
      const started = typeof it.output === "string" ? BACKGROUND_ID.exec(it.output) : null;
      if (started?.[1]) background.set(started[1], category);
      if (BACKGROUND_WAIT.has(bare(it.name))) {
        const id = it.input?.task_id ?? it.input?.bash_id ?? it.input?.shell_id;
        const of = typeof id === "string" ? background.get(id) : undefined;
        if (of) category = of;
      }
      if (asked.has(it.id)) category = "waiting";
      const start = time(it.at);
      let end = ends.get(it.id);
      const estimated = end === undefined;
      if (end === undefined) {
        for (const n of items.slice(i + 1)) {
          if (n.parentId || !NEXT_STEP.has(n.kind)) continue;
          if (n.kind === "tool" && time(n.at) - start < BURST_MS) continue;
          end = time(n.at);
          break;
        }
      }
      if (end === undefined || !(end >= start)) continue;
      const call: Call = {
        id: it.id,
        name: it.name,
        label: labelOf(it.input),
        category,
        at: it.at,
        ms: end - start,
        estimated,
        ...(it.status === "error" ? { failed: true } : {}),
      };
      pending.push({ call, start, end });
    } else if (it.kind === "result" && typeof it.durationMs === "number") {
      const turnEnd = time(it.at);
      const turnStart = turnEnd - it.durationMs;
      // A call counts only inside its turn: one that outlived it (a background command, a call the
      // turn was stopped during) adds nothing after the turn's end.
      const spans = pending.map((p) => ({
        category: p.call.category,
        start: Math.max(p.start, turnStart),
        end: Math.min(p.end, turnEnd),
      }));
      const totals = sweep(spans);
      const covered = RANK.reduce((s, c) => s + totals[c], 0);
      totals.model = Math.max(0, it.durationMs - covered);
      turns.push({ start: turnStart, at: it.at, workingMs: it.durationMs, totals, calls: pending.length });
      for (const p of pending) calls.push(p.call);
      pending = [];
    }
  }

  return {
    sessionId: String(meta.id),
    title: typeof meta.title === "string" && meta.title ? meta.title : "Untitled chat",
    projectId: typeof meta.projectId === "string" ? meta.projectId : undefined,
    provider: typeof meta.provider === "string" ? meta.provider : "claude",
    updatedAt: String(meta.updatedAt ?? meta.createdAt ?? ""),
    turns,
    calls,
  };
}

/** Time per category over the union of spans; an overlap goes to the category that ranks first. */
export function sweep(spans: Array<{ category: Category; start: number; end: number }>): Totals {
  const totals = emptyTotals();
  const valid = spans.filter((s) => s.end > s.start);
  const points = [...new Set(valid.flatMap((s) => [s.start, s.end]))].sort((a, b) => a - b);
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1] as number;
    const b = points[k] as number;
    let best = -1;
    for (const s of valid) {
      if (s.start <= a && s.end >= b) {
        const r = RANK.indexOf(s.category);
        if (best === -1 || r < best) best = r;
      }
    }
    const winner = RANK[best];
    if (winner) totals[winner] += b - a;
  }
  return totals;
}

export function addTotals(into: Totals, from: Totals): Totals {
  for (const c of CATEGORIES) into[c] += from[c];
  return into;
}

export interface Interval {
  start: number;
  end: number;
}

/** Sorted, non-overlapping copy of `intervals`. */
export function merge(intervals: Interval[]): Interval[] {
  const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end);
    else out.push({ ...iv });
  }
  return out;
}

/**
 * How many other chats worked at the same time. Working times are wall-clock, so several chats (or a
 * task queue) running at once each count the same hour: this says how crowded that time was.
 * - `ownMs`: the chats' own working time measured;
 * - `othersMs`: other chats' working time inside it, each other chat counted per moment (two others
 *   for 10 min = 20 min);
 * - `sharedMs`: own time while at least one other chat worked;
 * - `wallMs` (per bucket): wall-clock time when any of the chats worked;
 * - `peak`: the most other chats working at one moment.
 * Average other chats at once = othersMs / ownMs.
 */
export interface Overlap {
  ownMs: number;
  othersMs: number;
  sharedMs: number;
  wallMs: number;
  peak: number;
}

export function emptyOverlap(): Overlap {
  return { ownMs: 0, othersMs: 0, sharedMs: 0, wallMs: 0, peak: 0 };
}

export function addOverlap(into: Overlap, from: Overlap): Overlap {
  into.ownMs += from.ownMs;
  into.othersMs += from.othersMs;
  into.sharedMs += from.sharedMs;
  into.wallMs += from.wallMs;
  into.peak = Math.max(into.peak, from.peak);
  return into;
}

/** Average number of other chats working at the same time (0 = it ran alone). */
export function crowd(o: Overlap): number {
  return o.ownMs ? o.othersMs / o.ownMs : 0;
}

/**
 * One sweep over every chat's working intervals. `inScope` chats are measured; every chat (in scope
 * or not, e.g. another project's) counts as "another chat working". `cuts` split the time into
 * buckets (day starts); `bucket(t)` names the bucket a moment falls in.
 */
export function concurrency(
  chats: Array<{ id: string; intervals: Interval[]; inScope: boolean }>,
  cuts: number[] = [],
  bucket: (t: number) => string = () => "",
): { perChat: Map<string, Overlap>; perBucket: Map<string, Overlap> } {
  const perChat = new Map<string, Overlap>();
  const perBucket = new Map<string, Overlap>();
  const inScope = new Map<number, boolean>();
  // [time, change (+1 start, -1 end, 0 cut), chat index]; ends sort before starts at the same time.
  const events: Array<[number, number, number]> = [];
  chats.forEach((c, i) => {
    inScope.set(i, c.inScope);
    if (c.inScope) perChat.set(c.id, emptyOverlap());
    for (const iv of merge(c.intervals)) events.push([iv.start, 1, i], [iv.end, -1, i]);
  });
  for (const t of cuts) events.push([t, 0, -1]);
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const active = new Set<number>();
  let prev = events[0]?.[0] ?? 0;
  for (const [t, change, i] of events) {
    const len = t - prev;
    if (len > 0 && active.size) {
      const n = active.size;
      let scoped = 0;
      for (const a of active) {
        if (!inScope.get(a)) continue;
        scoped++;
        const o = perChat.get(chats[a]?.id ?? "") as Overlap;
        o.ownMs += len;
        o.othersMs += (n - 1) * len;
        if (n > 1) o.sharedMs += len;
        o.wallMs += len;
        o.peak = Math.max(o.peak, n - 1);
      }
      if (scoped) {
        const key = bucket(prev);
        const b = perBucket.get(key) ?? emptyOverlap();
        perBucket.set(key, b);
        b.ownMs += scoped * len;
        b.othersMs += scoped * (n - 1) * len;
        if (n > 1) b.sharedMs += scoped * len;
        b.wallMs += len;
        b.peak = Math.max(b.peak, n - 1);
      }
    }
    if (change === 1) active.add(i);
    else if (change === -1) active.delete(i);
    prev = t;
  }
  return { perChat, perBucket };
}
