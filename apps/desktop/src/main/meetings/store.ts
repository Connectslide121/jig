import { createHash, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { z } from "zod";
import { meetingLink, mergeCaption } from "../../../../../addons/meetings/lib/meeting";
import type { MeetingCaption, MeetingRecord, MeetingSettings } from "../../shared/meetings";
import { readJson, writeJson } from "../state/jsonStore";
import { paths } from "../state/paths";

const caption = z.object({
  id: z.string(),
  speakerId: z.string(),
  speaker: z.string(),
  timestamp: z.iso.datetime(),
  text: z.string(),
  final: z.boolean(),
});
const action = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  owner: z.string(),
  mine: z.boolean().optional(),
  projectId: z.string().optional(),
  evidence: z.string(),
  queued: z.boolean().optional(),
});
const record = z.object({
  id: z.uuid(),
  title: z.string(),
  joinUrl: z.string(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().optional(),
  status: z.enum(["joining", "connected", "ended", "interrupted"]),
  capture: z.string(),
  captions: z.array(caption),
  gaps: z.array(z.object({ at: z.iso.datetime(), reason: z.string() })),
  notes: z.string(),
  actions: z.array(action),
});
const schema = z.object({
  settings: z
    .object({ tenantId: z.string(), clientId: z.string(), endpoint: z.string() })
    .default({ tenantId: "", clientId: "", endpoint: "" }),
  records: z.array(record).default([]),
});

/** Global meeting data; one serialized owner prevents caption, note and queue updates racing. */
export class MeetingStore {
  private data: z.infer<typeof schema> = schema.parse({});
  private chain: Promise<unknown> = Promise.resolve();
  constructor(private readonly file = join(paths.addonData(), "meetings.json")) {}
  async load(): Promise<void> {
    this.data = await readJson(this.file, schema);
    let changed = false;
    for (const r of this.data.records)
      if (["joining", "connected"].includes(r.status)) {
        r.status = "interrupted";
        r.capture = "Interrupted when Jig closed";
        r.endedAt = new Date().toISOString();
        r.gaps.push({ at: r.endedAt, reason: r.capture });
        changed = true;
      }
    if (changed) await writeJson(this.file, this.data);
  }
  settings(): MeetingSettings {
    return { ...this.data.settings };
  }
  records(): MeetingRecord[] {
    return structuredClone(this.data.records);
  }
  get(id: string): MeetingRecord {
    const found = this.data.records.find((r) => r.id === id);
    if (!found) throw new Error("Meeting not found");
    return structuredClone(found);
  }
  private snapshotFile(id: string, through: string): string {
    const name = createHash("sha256").update(`${id}:${through}`).digest("hex");
    return join(dirname(this.file), "meeting-snapshots", `${name}.json`);
  }
  async snapshot(id: string, through: string): Promise<void> {
    await this.chain;
    const value = this.get(id);
    value.captions = value.captions.filter((c) => c.timestamp <= through);
    value.gaps = value.gaps.filter((g) => g.at <= through);
    await writeJson(this.snapshotFile(id, through), value);
  }
  async readSnapshot(id: string, through: string): Promise<MeetingRecord> {
    return readJson(this.snapshotFile(id, through), record);
  }
  private change<T>(fn: () => T): Promise<T> {
    const next = this.chain.then(async () => {
      const before = structuredClone(this.data);
      try {
        const result = fn();
        await writeJson(this.file, this.data);
        return result;
      } catch (error) {
        this.data = before;
        throw error;
      }
    });
    this.chain = next.catch(() => undefined);
    return next;
  }
  configure(settings: MeetingSettings): Promise<void> {
    const url = new URL(settings.endpoint);
    if (
      url.protocol !== "https:" ||
      !/^[a-z0-9-]+(?:\.[a-z0-9-]+)?\.communication\.azure\.com$/.test(url.hostname) ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new Error("Use your Azure Communication Services HTTPS endpoint");
    return this.change(() => {
      this.data.settings = { ...settings, endpoint: url.origin };
    });
  }
  create(url: string, title: string): Promise<MeetingRecord> {
    const joinUrl = meetingLink(url);
    return this.change(() => {
      if (this.data.records.some((r) => ["joining", "connected"].includes(r.status)))
        throw new Error("Leave the current meeting first");
      const next: MeetingRecord = {
        id: randomUUID(),
        title,
        joinUrl,
        startedAt: new Date().toISOString(),
        status: "joining",
        capture: "Waiting to join",
        captions: [],
        gaps: [],
        notes: "",
        actions: [],
      };
      this.data.records.unshift(next);
      return structuredClone(next);
    });
  }
  update(id: string, fn: (record: MeetingRecord) => void): Promise<void> {
    return this.change(() => {
      const r = this.data.records.find((r) => r.id === id);
      if (!r) throw new Error("Meeting not found");
      fn(r);
    });
  }
  caption(id: string, value: MeetingCaption): Promise<void> {
    return this.update(id, (r) => {
      if (!["joining", "connected"].includes(r.status)) throw new Error("Meeting is no longer capturing");
      r.captions = mergeCaption(r.captions, value);
    });
  }
}
