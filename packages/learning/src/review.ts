import { type ActivityEvent, hashKey, type Pattern, summarizeGroup } from "./mine";

/**
 * What the weekly review reads besides repetition (pure, tested; D-213): risky or careless practices
 * found in the log (security first), how much each add-on is used and an overview of the activity.
 * How you prompt is in `habits.ts`. No AI.
 */

const COMMANDISH = new Set(["terminal.command", "script.run", "session.tool", "git"]);
const SECRET = "«secret»";

interface PracticeRule {
  id: string;
  label: string;
  security: boolean;
  min: { count: number; days: number };
  test: (e: ActivityEvent) => boolean;
}

const command = (re: RegExp) => (e: ActivityEvent) => COMMANDISH.has(e.kind) && re.test(e.text);

const RULES: PracticeRule[] = [
  {
    id: "secret-in-chat",
    label: "A secret (key, token or password) was in a message to Jig",
    security: true,
    min: { count: 1, days: 1 },
    test: (e) => e.kind === "prompt" && e.text.includes(SECRET),
  },
  {
    id: "secret-in-command",
    label: "A secret was typed into a command",
    security: true,
    min: { count: 1, days: 1 },
    test: (e) => COMMANDISH.has(e.kind) && e.text.includes(SECRET),
  },
  {
    id: "pipe-to-shell",
    label: "A script downloaded from the internet was piped straight into a shell",
    security: true,
    min: { count: 1, days: 1 },
    test: command(
      /\b(curl|wget|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^|]*\|\s*(sudo\s+)?((ba|z)?sh|iex)\b/i,
    ),
  },
  {
    id: "tls-off",
    label: "Certificate checks were switched off",
    security: true,
    min: { count: 1, days: 1 },
    test: command(
      /(--insecure\b|\bcurl\b[^|]*\s-k\b|NODE_TLS_REJECT_UNAUTHORIZED=0|GIT_SSL_NO_VERIFY|sslVerify\s*=?\s*false|-SkipCertificateCheck|verify\s*=\s*False)/i,
    ),
  },
  {
    id: "world-writable",
    label: "Files were made writable by everyone (chmod 777)",
    security: true,
    min: { count: 1, days: 1 },
    test: command(/\bchmod\s+(-R\s+)?0?777\b/),
  },
  {
    id: "skip-permissions",
    label: "Claude Code ran with every permission check skipped",
    security: true,
    min: { count: 1, days: 1 },
    test: command(/--dangerously-skip-permissions|bypassPermissions/),
  },
  {
    id: "sudo-install",
    label: "Packages were installed globally with sudo",
    security: true,
    min: { count: 2, days: 1 },
    test: command(/\bsudo\s+(npm|pnpm|yarn|pip3?|gem)\s+(i|install|add)\b/),
  },
  {
    id: "force-push",
    label: "Force pushes that can overwrite others' work (--force instead of --force-with-lease)",
    security: false,
    min: { count: 2, days: 1 },
    test: command(/\bgit\s+push\b.*(\s--force(?!-with-lease)\b|\s-f\b)/),
  },
  {
    id: "no-verify",
    label: "Git hooks were skipped with --no-verify",
    security: false,
    min: { count: 2, days: 1 },
    test: command(/\bgit\s+(commit|push)\b.*\s--no-verify\b/),
  },
  {
    id: "push-main",
    label: "Pushes straight to main or master",
    security: false,
    min: { count: 3, days: 2 },
    test: command(/\bgit\s+push\s+(-u\s+)?\S+\s+(HEAD:)?(main|master)\b/),
  },
];

const COMMIT = /\bgit commit\b/;
const TESTS =
  /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(test|check|verify)\b|\b(vitest|jest|pytest|go test|cargo test|dotnet test|mvn (verify|test)|gradle test|phpunit|rspec|playwright test|tox|make (test|check))\b/;

/**
 * Risky or careless practices that keep showing up, security first. Each rule is a pattern of kind
 * `practice` with its examples (already masked), so "Never" blocks it like any other pattern. Plus
 * one found from the whole log: 5+ commits on 2+ days and no tests run at all (by you or Claude).
 */
export function practicePatterns(events: ActivityEvent[]): Pattern[] {
  const out: Pattern[] = [];
  for (const rule of RULES) {
    const list = events.filter(rule.test);
    const s = summarizeGroup(list);
    if (s.count < rule.min.count || s.days < rule.min.days) continue;
    out.push({
      key: `x-${hashKey(rule.id)}`,
      kind: "practice",
      summary: `${rule.security ? "Security: " : ""}${rule.label}`,
      ...s,
      score: (rule.security ? 30 : 10) + s.count * Math.sqrt(s.days),
    });
  }
  const commits = events.filter(
    (e) => (e.kind === "git" && /commit/.test(e.text)) || (COMMANDISH.has(e.kind) && COMMIT.test(e.text)),
  );
  const tested = events.some((e) => COMMANDISH.has(e.kind) && TESTS.test(e.text));
  const s = summarizeGroup(commits);
  if (!tested && s.count >= 5 && s.days >= 2)
    out.push({
      key: `x-${hashKey("untested-commits")}`,
      kind: "practice",
      summary: "Commits without any tests being run (by you or Jig) in this time",
      ...s,
      score: 10 + s.count,
    });
  return out;
}

/** How much one add-on was used: your clicks, its views opened as tabs, Claude's calls of its tools. */
export interface AddonUse {
  actions: number;
  tabs: number;
  claude: number;
  days: number;
}

const ADDON_ID = /^addon\.([^.]+)\./;

/** Per add-on id, from `addon.action`, `ui` (actions and tabs with `addon.<id>.` ids) and `session.tool`. */
export function addonUsage(events: ActivityEvent[]): Record<string, AddonUse> {
  const out: Record<string, AddonUse & { dayset: Set<string> }> = {};
  const bump = (id: string | undefined, field: keyof AddonUse, at: string) => {
    if (!id) return;
    if (!out[id]) out[id] = { actions: 0, tabs: 0, claude: 0, days: 0, dayset: new Set() };
    const u = out[id];
    u[field]++;
    u.dayset.add(at.slice(0, 10));
  };
  for (const e of events) {
    if (e.kind === "addon.action") bump(e.detail?.addon, "actions", e.at);
    else if (e.kind === "ui" && e.detail?.op === "action")
      bump(ADDON_ID.exec(e.detail.action ?? "")?.[1], "actions", e.at);
    else if (e.kind === "ui" && e.detail?.op === "open-tab")
      bump(ADDON_ID.exec(e.detail.view ?? "")?.[1], "tabs", e.at);
    else if (e.kind === "session.tool" && e.detail?.use === "addon") bump(e.detail.name, "claude", e.at);
  }
  return Object.fromEntries(
    Object.entries(out).map(([id, { dayset, ...u }]) => [id, { ...u, days: dayset.size }]),
  );
}

/** One line for the catalog: how much an add-on was used in the window. */
export function addonUseText(use: AddonUse | undefined, days: number): string {
  if (!use) return `no recorded use in ${days} days (views kept open in a sidebar aren't counted)`;
  const parts = [
    use.actions && `${use.actions} action${use.actions > 1 ? "s" : ""} run`,
    use.tabs && `opened as a tab ${use.tabs}×`,
    use.claude && `${use.claude} call${use.claude > 1 ? "s" : ""} by Claude`,
  ].filter(Boolean);
  return `${parts.join(", ")} on ${use.days} day(s) in ${days} days`;
}

/** What the log holds: events per kind, on how many days, in how many projects. */
export function activityOverview(events: ActivityEvent[], days: number): string {
  if (!events.length) return "(nothing recorded)";
  const kinds = new Map<string, number>();
  for (const e of events) kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1);
  const active = new Set(events.map((e) => e.at.slice(0, 10))).size;
  const projects = new Set(events.map((e) => e.projectId).filter(Boolean)).size;
  const list = [...kinds.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ${n}`)
    .join(", ");
  return `${events.length} events on ${active} of the last ${days} days in ${projects} project(s): ${list}`;
}

/**
 * Enough activity for a review even when nothing repeats: 30+ events on 3+ days. Below it, a run
 * makes no AI call (no quota used).
 */
export function enoughToReview(events: ActivityEvent[], min = { events: 30, days: 3 }): boolean {
  return events.length >= min.events && new Set(events.map((e) => e.at.slice(0, 10))).size >= min.days;
}
