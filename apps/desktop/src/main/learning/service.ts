import { type ActivityEvent, isRunDue, mine, nextOccurrence, type WeeklySchedule } from "@jig/learning";
import { z } from "zod";
import { JigError } from "../../shared/ipc";
import {
  BUILD_KINDS,
  type LearningState,
  type PatternRun,
  type Suggestion,
  type SuggestionAnswer,
  TIP_KINDS,
} from "../../shared/learning";
import { logger } from "../log";
import { readJson, writeJson } from "../state/jsonStore";
import type { ActivityLog } from "./activity";
import type { KnowledgeStore } from "./knowledge";
import { checkInPrompt, type PastAnswer, parseReflection, reflectionPrompt } from "./reflect";

const log = logger("learning");

const FileSchema = z.object({
  suggestions: z.array(z.custom<Suggestion>()).default([]),
  blocked: z.array(z.string()).default([]),
  runs: z.array(z.custom<PatternRun>()).default([]),
  lastRun: z.string().optional(),
  /** The last coaching tip (at most one a week). */
  lastTipAt: z.string().optional(),
  checkIn: z.object({ offered: z.boolean().default(false), last: z.string().optional() }).prefault({}),
});
type FileData = z.infer<typeof FileSchema>;

export interface LearningServiceOptions {
  file: string;
  activity: ActivityLog;
  schedule: () => WeeklySchedule;
  recording: () => boolean;
  catalog: () => string;
  /** One Claude Code query without tools; returns the text. */
  reflect: (prompt: string) => Promise<string>;
  build: (s: Suggestion) => Promise<string | undefined>;
  onChange: (state: LearningState) => void;
  notify?: (input: { title: string; message?: string }) => void;
  /** How many days of activity a run looks at. */
  windowDays?: number;
  /** Notes from chats and the profile (Learning 2). */
  knowledge?: KnowledgeStore;
  /** "How you worked" in the last 7 days, for the reflection. */
  worked?: () => Promise<string | undefined>;
  checkInFrequency?: () => "off" | "weekly" | "biweekly";
  setCheckInFrequency?: (frequency: "weekly" | "biweekly") => Promise<void>;
}

const DAY = 86_400_000;

/**
 * "Did it help?" for a suggestion built or adopted at least a week ago: how often its patterns
 * happened since, against how often before. Undefined when it can't be told (no patterns, too soon).
 */
export function didItHelp(
  s: Suggestion,
  eventsSince: ActivityEvent[],
  now: Date,
): Suggestion["outcome"] | undefined {
  if (!s.actedAt || !s.patternKeys.length || !s.evidence.length) return undefined;
  const daysSince = (now.getTime() - new Date(s.actedAt).getTime()) / DAY;
  if (daysSince < 7) return undefined;
  const after = mine(
    eventsSince.filter((e) => e.at >= s.actedAt!),
    {
      minCommand: { count: 1, days: 1 },
      minSequence: { count: 1, days: 1 },
      minPrompts: { count: 1, days: 1 },
      limit: 10_000,
    },
  )
    .filter((p) => s.patternKeys.includes(p.key))
    .reduce((n, p) => n + p.count, 0);
  const before = s.evidence.reduce((n, p) => n + p.count, 0);
  const beforeRate = before / 28;
  const afterRate = after / daysSince;
  const helped = afterRate <= beforeRate * 0.5;
  const days = Math.round(daysSince);
  return {
    checkedAt: now.toISOString(),
    helped,
    text: helped
      ? after === 0
        ? `It helped: the pattern hasn't come back in ${days} days (it happened ${before} times in the 4 weeks before).`
        : `It helped: ${after} times in ${days} days, down from ${before} in the 4 weeks before.`
      : `Still happening: ${after} times in ${days} days (${before} in the 4 weeks before).`,
  };
}

const SNOOZE_DAYS = 14;

/** Mining → reflection → inbox, on demand and weekly (with catch-up at launch). */
export class LearningService {
  private data: FileData | undefined;
  private running = false;
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly options: LearningServiceOptions) {}

  private async load(): Promise<FileData> {
    this.data ??= await readJson(this.options.file, FileSchema);
    return this.data;
  }

  private async save() {
    const data = await this.load();
    data.runs = data.runs.slice(-30);
    data.suggestions = data.suggestions.slice(-200);
    await writeJson(this.options.file, data);
    this.options.onChange(await this.state());
  }

  async state(now = new Date()): Promise<LearningState> {
    const data = await this.load();
    const schedule = this.options.schedule();
    const stats = await this.options.activity.stats();
    const frequency = this.options.checkInFrequency?.() ?? "off";
    // Snoozed suggestions come back when their time is up.
    for (const s of data.suggestions)
      if (s.status === "snoozed" && s.snoozedUntil && new Date(s.snoozedUntil) <= now) {
        s.status = "new";
        s.snoozedUntil = undefined;
      }
    return {
      suggestions: [...data.suggestions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      runs: data.runs.slice(-10).reverse(),
      lastRun: data.lastRun,
      nextRun: schedule.enabled ? nextOccurrence(now, schedule).toISOString() : undefined,
      running: this.running,
      stats,
      recording: this.options.recording(),
      checkIn: {
        frequency,
        last: data.checkIn.last,
        offer: frequency === "off" && !data.checkIn.offered && stats.days >= 14,
        due:
          frequency !== "off" &&
          (!data.checkIn.last ||
            now.getTime() - new Date(data.checkIn.last).getTime() >= (frequency === "weekly" ? 7 : 14) * DAY),
      },
    };
  }

  async newCount(): Promise<number> {
    return (await this.state()).suggestions.filter((s) => s.status === "new").length;
  }

  /** Looks for patterns now. No AI call is made when nothing repeats enough (no quota used). */
  async run(trigger: PatternRun["trigger"], now = new Date()): Promise<PatternRun> {
    if (this.running) throw new JigError("busy", "Already looking for patterns");
    this.running = true;
    this.options.onChange(await this.state());
    const data = await this.load();
    const run: PatternRun = { at: now.toISOString(), trigger, ok: true, patterns: 0, suggestions: 0 };
    try {
      const events = await this.options.activity.read(this.options.windowDays ?? 28, now);
      this.followUp(data, events, now);
      const taken = new Set(
        data.suggestions.filter((s) => s.status !== "never").flatMap((s) => s.patternKeys),
      );
      const patterns = mine(events, { blocked: data.blocked }).filter((p) => !taken.has(p.key));
      const knowledge = this.options.knowledge;
      const notes = knowledge ? await knowledge.recent(this.options.windowDays ?? 28, now) : [];
      run.patterns = patterns.length;
      if (patterns.length === 0 && notes.length === 0)
        run.note = events.length === 0 ? "No activity recorded yet." : "Nothing repeats often enough yet.";
      else {
        const answers: PastAnswer[] = data.suggestions.map((s) => ({
          title: s.title,
          status: s.status,
          outcome: s.outcome?.text,
        }));
        const tipsAllowed = !data.lastTipAt || now.getTime() - new Date(data.lastTipAt).getTime() >= 7 * DAY;
        const profile = knowledge ? await knowledge.profile() : undefined;
        const reply = await this.options.reflect(
          reflectionPrompt(patterns, this.options.catalog(), answers, {
            notes,
            profile: profile?.exists ? profile.text : undefined,
            worked: await this.options.worked?.().catch(() => undefined),
            tipsAllowed,
          }),
        );
        const suggestions = parseReflection(reply, patterns, now, { notes, tipsAllowed }).filter(
          (s) => !s.patternKeys.some((k) => taken.has(k)),
        );
        if (suggestions.some((s) => TIP_KINDS.includes(s.kind))) data.lastTipAt = now.toISOString();
        data.suggestions.push(...suggestions);
        run.suggestions = suggestions.length;
        if (suggestions.length)
          this.options.notify?.({
            title: `Jig has ${suggestions.length} suggestion${suggestions.length > 1 ? "s" : ""}`,
            message: suggestions.map((s) => s.title).join("\n"),
          });
      }
    } catch (error) {
      run.ok = false;
      run.error = (error as Error).message;
      log.warn("Pattern run failed", error);
    } finally {
      this.running = false;
    }
    data.lastRun = run.at;
    data.runs.push(run);
    await this.save();
    return run;
  }

  async answer(id: string, answer: SuggestionAnswer, now = new Date()): Promise<void> {
    const data = await this.load();
    const s = data.suggestions.find((x) => x.id === id);
    if (!s) throw new JigError("not_found", "Suggestion not found");
    if (answer === "build") {
      if (!BUILD_KINDS.includes(s.kind)) throw new JigError("invalid_args", "This suggestion isn't built");
      s.buildId = await this.options.build(s);
      s.status = "built";
      s.actedAt = now.toISOString();
    } else if (answer === "act") {
      // The renderer took the suggestion's own action (a chat, a workflow draft…); a profile one is here.
      if (s.kind === "profile") await this.options.knowledge?.addToProfile(s.goal.split("\n"));
      s.status = "adopted";
      s.actedAt = now.toISOString();
    } else if (answer === "dismiss") {
      s.status = "dismissed";
    } else if (answer === "snooze") {
      const until = new Date(now);
      until.setDate(until.getDate() + SNOOZE_DAYS);
      s.status = "snoozed";
      s.snoozedUntil = until.toISOString();
    } else {
      s.status = "never";
      data.blocked = [...new Set([...data.blocked, ...s.patternKeys])];
    }
    await this.save();
  }

  /** "Did it help?" for suggestions built or adopted a week or more ago; tells the user once. */
  private followUp(data: FileData, events: ActivityEvent[], now: Date) {
    for (const s of data.suggestions) {
      if ((s.status !== "built" && s.status !== "adopted") || s.outcome) continue;
      const outcome = didItHelp(s, events, now);
      if (!outcome) continue;
      s.outcome = outcome;
      this.options.notify?.({ title: `Did “${s.title}” help?`, message: outcome.text });
    }
  }

  /** The weekly check-in: turn it on, decline the offer, or mark one as done/skipped. */
  async checkIn(
    action: "enable" | "decline" | "start" | "skip",
    now = new Date(),
  ): Promise<string | undefined> {
    const data = await this.load();
    if (action === "enable" || action === "decline") data.checkIn.offered = true;
    if (action === "enable") await this.options.setCheckInFrequency?.("weekly");
    if (action === "start" || action === "skip") data.checkIn.last = now.toISOString();
    await this.save();
    if (action !== "start") return undefined;
    const knowledge = this.options.knowledge;
    const profile = knowledge ? (await knowledge.profile()).text : "";
    return checkInPrompt(profile, knowledge ? await knowledge.recent(14, now) : []);
  }

  /** At launch: run if a scheduled run was missed; then arm a timer for the next one. */
  async startSchedule(now = new Date()): Promise<void> {
    const data = await this.load();
    if (isRunDue(now, this.options.schedule(), data.lastRun) && data.lastRun !== undefined)
      void this.run("catch-up").catch(() => {});
    else if (data.lastRun === undefined) {
      // First start: don't run at once; the first run is the next scheduled time.
      data.lastRun = now.toISOString();
      await writeJson(this.options.file, data);
    }
    this.arm();
  }

  /** (Re)arms the timer for the next scheduled run (call after settings change). */
  arm(now = new Date()): void {
    clearTimeout(this.timer);
    const schedule = this.options.schedule();
    if (!schedule.enabled) return;
    const delay = Math.min(nextOccurrence(now, schedule).getTime() - now.getTime(), 2 ** 31 - 1);
    this.timer = setTimeout(
      () => {
        void this.run("schedule")
          .catch(() => {})
          .finally(() => this.arm());
      },
      Math.max(1000, delay),
    );
  }

  stop(): void {
    clearTimeout(this.timer);
  }
}
