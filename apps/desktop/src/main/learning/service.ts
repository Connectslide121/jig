import { isRunDue, mine, nextOccurrence, type WeeklySchedule } from "@jig/learning";
import { z } from "zod";
import { JigError } from "../../shared/ipc";
import type { LearningState, PatternRun, Suggestion, SuggestionAnswer } from "../../shared/learning";
import { logger } from "../log";
import { readJson, writeJson } from "../state/jsonStore";
import type { ActivityLog } from "./activity";
import { type PastAnswer, parseReflection, reflectionPrompt } from "./reflect";

const log = logger("learning");

const FileSchema = z.object({
  suggestions: z.array(z.custom<Suggestion>()).default([]),
  blocked: z.array(z.string()).default([]),
  runs: z.array(z.custom<PatternRun>()).default([]),
  lastRun: z.string().optional(),
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
      stats: await this.options.activity.stats(),
      recording: this.options.recording(),
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
      const taken = new Set(
        data.suggestions.filter((s) => s.status !== "never").flatMap((s) => s.patternKeys),
      );
      const patterns = mine(events, { blocked: data.blocked }).filter((p) => !taken.has(p.key));
      run.patterns = patterns.length;
      if (patterns.length === 0)
        run.note = events.length === 0 ? "No activity recorded yet." : "Nothing repeats often enough yet.";
      else {
        const answers: PastAnswer[] = data.suggestions.map((s) => ({ title: s.title, status: s.status }));
        const reply = await this.options.reflect(reflectionPrompt(patterns, this.options.catalog(), answers));
        const suggestions = parseReflection(reply, patterns, now).filter(
          (s) => !s.patternKeys.some((k) => taken.has(k)),
        );
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
      s.buildId = await this.options.build(s);
      s.status = "built";
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
