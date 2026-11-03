import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { meetingLink, mergeCaption } from "../../../../../addons/meetings/lib/meeting";
import { type MeetingLayout, normalizeMeetingLayout } from "../../shared/meetingLayout";
import type { MeetingCall, MeetingCaption, MeetingRecord, MeetingSettings } from "../../shared/meetings";
import { readJson, writeJson } from "../state/jsonStore";
import { paths } from "../state/paths";

const caption = z.object({
  id: z.string(),
  speakerId: z.string(),
  speaker: z.string(),
  timestamp: z.iso.datetime(),
  text: z.string(),
  final: z.boolean(),
  translated: z.string().optional(),
  translatedLanguage: z.string().optional(),
  translatedBy: z.enum(["teams", "ai"]).optional(),
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
  call: z
    .object({
      peerId: z.string(),
      peerName: z.string(),
      direction: z.enum(["outgoing", "incoming"]),
    })
    .optional(),
  chat: z
    .array(
      z.object({
        id: z.string(),
        from: z.string(),
        fromId: z.string().optional(),
        at: z.iso.datetime(),
        text: z.string(),
        mine: z.boolean().optional(),
      }),
    )
    .optional(),
  aiTranslation: z.string().optional(),
  translationError: z.string().optional(),
});
const schema = z.object({
  settings: z
    .object({ tenantId: z.string(), clientId: z.string(), endpoint: z.string() })
    .default({ tenantId: "", clientId: "", endpoint: "" }),
  lobbyView: z.enum(["agenda", "week"]).default("agenda"),
  ringing: z.boolean().default(true),
  captionLanguage: z.string().default(""),
  records: z.array(record).default([]),
  layout: z.unknown().optional(),
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
  lobbyView(): "agenda" | "week" {
    return this.data.lobbyView;
  }
  setLobbyView(view: "agenda" | "week"): Promise<void> {
    return this.change(() => {
      this.data.lobbyView = view;
    });
  }
  captionLanguage(): string {
    return this.data.captionLanguage;
  }
  setCaptionLanguage(language: string): Promise<void> {
    return this.change(() => {
      this.data.captionLanguage = language;
    });
  }
  /** Whether Jig rings for Teams calls while it runs (on until you turn it off). */
  ringing(): boolean {
    return this.data.ringing;
  }
  setRinging(on: boolean): Promise<void> {
    return this.change(() => {
      this.data.ringing = on;
    });
  }
  layout(): MeetingLayout | undefined {
    return this.data.layout === undefined ? undefined : normalizeMeetingLayout(this.data.layout);
  }
  setLayout(layout: MeetingLayout): Promise<void> {
    return this.change(() => {
      this.data.layout = normalizeMeetingLayout(layout);
    });
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
  /**
   * Deletes a saved meeting and every frozen copy made for its questions and notes. Snapshot files
   * are named by a hash, so they are matched by the record id inside them.
   */
  async remove(id: string): Promise<void> {
    await this.change(() => {
      const index = this.data.records.findIndex((r) => r.id === id);
      if (index < 0) throw new Error("Meeting not found");
      if (["joining", "connected"].includes(this.data.records[index]!.status))
        throw new Error("Leave the meeting before deleting it");
      this.data.records.splice(index, 1);
    });
    const dir = join(dirname(this.file), "meeting-snapshots");
    const names = await readdir(dir).catch(() => [] as string[]);
    for (const name of names.filter((n) => n.endsWith(".json"))) {
      const path = join(dir, name);
      const content = await readFile(path, "utf8").catch(() => "");
      try {
        if ((JSON.parse(content) as { id?: unknown }).id === id) await rm(path, { force: true });
      } catch {
        // Not a snapshot we can read: leave it.
      }
    }
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
    return this.add(meetingLink(url), title);
  }
  /** A one-to-one Teams call, kept like a meeting: captions, notes and actions work the same. */
  createCall(call: MeetingCall): Promise<MeetingRecord> {
    return this.add("", `Call with ${call.peerName}`, call);
  }
  private add(joinUrl: string, title: string, call?: MeetingCall): Promise<MeetingRecord> {
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
        ...(call ? { call } : {}),
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
  /**
   * Claude's translation of a caption (D-277): kept only while the caption still says `source`
   * (Teams may still revise it) and translation into `language` is still on.
   */
  translated(id: string, captionId: string, source: string, text: string, language: string): Promise<void> {
    return this.update(id, (r) => {
      const c = r.captions.find((c) => c.id === captionId);
      if (!c || c.text !== source || r.aiTranslation !== language) return;
      c.translated = text;
      c.translatedLanguage = language;
      c.translatedBy = "ai";
      r.translationError = undefined;
    });
  }
  caption(id: string, value: MeetingCaption): Promise<void> {
    return this.update(id, (r) => {
      if (!["joining", "connected"].includes(r.status)) throw new Error("Meeting is no longer capturing");
      r.captions = mergeCaption(r.captions, value);
    });
  }
}
