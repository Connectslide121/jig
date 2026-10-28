import { readdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ActivityEvent } from "@jig/learning";
import type { ActivityInput } from "../activity/bus";
import { appendLine } from "../state/jsonStore";

/**
 * The local activity log: one JSONL file per day in `~/.jig/activity/`. Nothing leaves the machine.
 * Recording can be paused; events containing an excluded text are dropped; old days are deleted.
 */
export interface ActivitySettings {
  recording: boolean;
  exclusions: string[];
  retentionDays: number;
}

const FILE = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;

export function localDay(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isExcluded(event: ActivityInput, exclusions: string[], projectPath?: string): boolean {
  const haystack = [event.text, projectPath ?? "", ...Object.values(event.detail ?? {})]
    .join("\n")
    .toLowerCase();
  return exclusions.some((x) => x.trim() && haystack.includes(x.trim().toLowerCase()));
}

export class ActivityLog {
  constructor(
    private readonly dir: string,
    private readonly settings: () => ActivitySettings,
    private readonly projectPath: (id: string | undefined) => string | undefined = () => undefined,
  ) {}

  async record(event: ActivityInput, now = new Date()): Promise<boolean> {
    const s = this.settings();
    if (!s.recording || !event.text.trim()) return false;
    if (isExcluded(event, s.exclusions, this.projectPath(event.projectId))) return false;
    const entry: ActivityEvent = {
      at: now.toISOString(),
      kind: event.kind,
      text: event.text.slice(0, 2000),
      projectId: event.projectId,
      detail: event.detail,
    };
    await appendLine(join(this.dir, `${localDay(now)}.jsonl`), JSON.stringify(entry));
    return true;
  }

  private async files(): Promise<string[]> {
    try {
      return (await readdir(this.dir)).filter((f) => FILE.test(f)).sort();
    } catch {
      return [];
    }
  }

  /** Events of the last `days` days. Unreadable lines are skipped. */
  async read(days: number, now = new Date()): Promise<ActivityEvent[]> {
    const since = new Date(now);
    since.setDate(since.getDate() - days);
    const first = localDay(since);
    const events: ActivityEvent[] = [];
    for (const file of await this.files()) {
      if (FILE.exec(file)![1]! < first) continue;
      const text = await readFile(join(this.dir, file), "utf8").catch(() => "");
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try {
          events.push(JSON.parse(line) as ActivityEvent);
        } catch {
          // A torn line (crash while writing): ignore.
        }
      }
    }
    return events;
  }

  /** Deletes days older than the retention setting. */
  async prune(now = new Date()): Promise<number> {
    const limit = new Date(now);
    limit.setDate(limit.getDate() - this.settings().retentionDays);
    const oldest = localDay(limit);
    let removed = 0;
    for (const file of await this.files()) {
      if (FILE.exec(file)![1]! < oldest) {
        await rm(join(this.dir, file), { force: true });
        removed++;
      }
    }
    return removed;
  }

  async clear(): Promise<void> {
    for (const file of await this.files()) await rm(join(this.dir, file), { force: true });
  }

  async stats(): Promise<{ days: number; events: number; bytes: number }> {
    const files = await this.files();
    let bytes = 0;
    let events = 0;
    for (const file of files) {
      const path = join(this.dir, file);
      bytes += (await stat(path).catch(() => ({ size: 0 }))).size;
      events += (await readFile(path, "utf8").catch(() => "")).split("\n").filter((l) => l.trim()).length;
    }
    return { days: files.length, events, bytes };
  }
}
