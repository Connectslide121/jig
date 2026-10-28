import { randomUUID } from "node:crypto";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { type ChatState, reduceEvent } from "../../shared/chat";
import type {
  ChatAttachment,
  ChatItem,
  ChatUpdate,
  EngineEvent,
  PermissionDecision,
  PermissionMode,
  PermissionRequest,
  QueuedMessage,
  SessionMeta,
  SessionSnapshot,
} from "../../shared/engine";
import { JigError } from "../../shared/ipc";
import type { Engine, EngineSession } from "../engine/types";
import { logger } from "../log";
import { readJson, writeJson } from "../state/jsonStore";
import { addAttachment, type EnginePart, readAttachments, removeAttachments } from "./attachments";

const log = logger("sessions");

/** Most transcript items kept in the cache file (Claude Code keeps the full history itself). */
const MAX_ITEMS = 3000;

const SessionFileSchema = z.object({
  meta: z.custom<SessionMeta>((v) => typeof v === "object" && v !== null && "id" in v),
  items: z.array(z.custom<ChatItem>()).default([]),
  queue: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        attachments: z
          .array(
            z.object({
              path: z.string(),
              mime: z.string(),
              name: z.string().optional(),
              kind: z.enum(["image", "pdf", "office", "text"]).optional(),
            }),
          )
          .optional(),
      }),
    )
    .default([]),
});

export interface SessionManagerOptions {
  dir: string;
  /** Images sent in chats (`~/.jig/attachments`). */
  attachmentsDir: string;
  engine: Engine;
  /** Settings at the time a Claude Code process starts. */
  engineSettings: () => {
    claudePath: string;
    allowApiKey: boolean;
    env: Record<string, string | undefined>;
    promptSuggestions?: boolean;
    fileCheckpoints?: boolean;
  };
  appendSystemPrompt: (meta: SessionMeta) => string;
  mcpServers?: (meta: SessionMeta) => Record<string, unknown> | undefined;
  toolHandlers?: (
    meta: SessionMeta,
  ) => Record<string, (args: Record<string, unknown>) => Promise<string>> | undefined;
  /** Claude Code reported plan rate-limit state (the usage meter refreshes). */
  onRateLimit?: (event: Extract<EngineEvent, { type: "rate_limit" }>) => void;
  /** A turn ended (result or process exit), e.g. to notice a builder that stopped. */
  onTurnEnd?: (meta: SessionMeta) => void;
  onUpdate: (sessionId: string, updates: ChatUpdate[]) => void;
  /** Activity for the learning log (phase 9): prompts and tool calls. */
  onActivity?: (event: {
    kind: "prompt" | "tool";
    session: SessionMeta;
    text: string;
    tool?: string;
  }) => void;
}

interface Live {
  state: ChatState;
  queue: QueuedMessage[];
  engine?: EngineSession;
  permissions: Map<string, { resolve: (d: PermissionDecision) => void; request: PermissionRequest }>;
  saveTimer?: NodeJS.Timeout;
  loaded: boolean;
}

/**
 * Owns every chat session: metadata and a transcript cache in `~/.jig/sessions/<id>.json`, one Claude
 * Code process per session while it is in use (started on the first message, resumed with Claude
 * Code's own session id after a restart), the follow-up queue and permission prompts.
 */
export class SessionManager {
  private sessions = new Map<string, Live>();
  private ready: Promise<void> | undefined;

  constructor(private readonly options: SessionManagerOptions) {}

  private load(): Promise<void> {
    this.ready ??= (async () => {
      let files: string[] = [];
      try {
        files = (await readdir(this.options.dir)).filter((f) => f.endsWith(".json"));
      } catch {
        return;
      }
      for (const file of files) {
        try {
          const data = await readJson(join(this.options.dir, file), SessionFileSchema, null);
          // A process can't survive a restart: anything "working" is idle now.
          const status = data.meta.status === "error" ? "error" : "idle";
          this.sessions.set(data.meta.id, {
            state: { meta: { ...data.meta, status }, items: data.items },
            queue: data.queue,
            permissions: new Map(),
            loaded: true,
          });
        } catch (error) {
          log.warn(`Skipping unreadable session file ${file}`, error);
        }
      }
    })();
    return this.ready;
  }

  private async live(id: string): Promise<Live> {
    await this.load();
    const live = this.sessions.get(id);
    if (!live) throw new JigError("not_found", "Session not found");
    return live;
  }

  private file(id: string) {
    return join(this.options.dir, `${id}.json`);
  }

  private scheduleSave(live: Live, immediate = false) {
    clearTimeout(live.saveTimer);
    const save = () =>
      writeJson(this.file(live.state.meta.id), {
        meta: live.state.meta,
        items: live.state.items.slice(-MAX_ITEMS),
        queue: live.queue,
      }).catch((error) => log.error("Saving session failed", error));
    if (immediate) void save();
    else live.saveTimer = setTimeout(save, 500);
  }

  private emit(live: Live, updates: ChatUpdate[]) {
    if (updates.length === 0) return;
    this.options.onUpdate(live.state.meta.id, updates);
    this.scheduleSave(live);
  }

  private setMeta(live: Live, patch: Partial<SessionMeta>) {
    live.state.meta = { ...live.state.meta, ...patch, updatedAt: new Date().toISOString() };
    this.emit(live, [{ op: "meta", meta: live.state.meta }]);
  }

  async list(): Promise<SessionMeta[]> {
    await this.load();
    return [...this.sessions.values()]
      .map((l) => l.state.meta)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async create(input: {
    projectId: string;
    cwd: string;
    title?: string;
    model: string;
    permissionMode: PermissionMode;
    kind?: SessionMeta["kind"];
    buildId?: string;
  }): Promise<SessionMeta> {
    await this.load();
    const at = new Date().toISOString();
    const meta: SessionMeta = {
      id: randomUUID(),
      projectId: input.projectId,
      cwd: input.cwd,
      title: input.title ?? "New session",
      createdAt: at,
      updatedAt: at,
      model: input.model,
      permissionMode: input.permissionMode,
      status: "idle",
      authSource: "unknown",
      costUsd: 0,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      turns: 0,
      kind: input.kind,
      buildId: input.buildId,
    };
    const live: Live = { state: { meta, items: [] }, queue: [], permissions: new Map(), loaded: true };
    this.sessions.set(meta.id, live);
    this.scheduleSave(live, true);
    this.options.onUpdate(meta.id, [{ op: "meta", meta }]);
    return meta;
  }

  async snapshot(id: string): Promise<SessionSnapshot> {
    const live = await this.live(id);
    return { meta: live.state.meta, items: live.state.items, queue: live.queue };
  }

  private startEngine(live: Live): EngineSession {
    if (live.engine) return live.engine;
    const meta = live.state.meta;
    const settings = this.options.engineSettings();
    const session = this.options.engine.start(
      {
        cwd: meta.cwd,
        model: meta.model,
        permissionMode: meta.permissionMode,
        resume: meta.engineSessionId,
        appendSystemPrompt: this.options.appendSystemPrompt(meta),
        env: settings.env,
        claudePath: settings.claudePath,
        promptSuggestions: settings.promptSuggestions,
        fileCheckpoints: settings.fileCheckpoints,
        mcpServers: this.options.mcpServers?.(meta),
        toolHandlers: this.options.toolHandlers?.(meta),
        askPermission: (request, signal) =>
          new Promise<PermissionDecision>((resolve) => {
            live.permissions.set(request.requestId, { resolve, request });
            this.handleEvent(live, { type: "permission", request });
            signal.addEventListener("abort", () => {
              if (!live.permissions.delete(request.requestId)) return;
              this.handleEvent(live, {
                type: "permission_resolved",
                requestId: request.requestId,
                status: "cancelled",
              });
              resolve({ behavior: "deny", message: "Cancelled" });
            });
          }),
      },
      (event) => this.handleEvent(live, event),
    );
    live.engine = session;
    return session;
  }

  private handleEvent(live: Live, event: EngineEvent) {
    if (event.type === "rate_limit") {
      this.options.onRateLimit?.(event);
      return;
    }
    if (event.type === "exit") {
      live.engine = undefined;
      for (const [requestId, pending] of live.permissions) {
        pending.resolve({ behavior: "deny", message: "Session ended" });
        live.permissions.delete(requestId);
      }
    }
    if (event.type === "tool_use" && !event.parentId)
      this.options.onActivity?.({
        kind: "tool",
        session: live.state.meta,
        tool: event.name,
        text: typeof event.input.command === "string" ? event.input.command : JSON.stringify(event.input),
      });
    this.emit(live, reduceEvent(live.state, event));
    if (event.type === "result" || event.type === "exit") this.options.onTurnEnd?.(live.state.meta);
    if (event.type === "result") {
      this.scheduleSave(live, true);
      void this.refreshContext(live);
      const next = live.queue.shift();
      if (next) {
        this.emit(live, [{ op: "queue", queue: live.queue }]);
        void this.startTurn(live, next.text, next.attachments);
      }
    }
  }

  /** Asks Claude Code how full the context window is and keeps it on the session. */
  private async refreshContext(live: Live) {
    const context = await live.engine?.contextUsage().catch(() => undefined);
    if (!context) return;
    live.state.meta = { ...live.state.meta, context };
    this.emit(live, [{ op: "meta", meta: live.state.meta }]);
    this.scheduleSave(live);
  }

  private async startTurn(live: Live, text: string, attachments: ChatAttachment[] = []) {
    let data: EnginePart[] = [];
    try {
      data = await readAttachments(this.options.attachmentsDir, live.state.meta.id, attachments);
    } catch (error) {
      this.handleEvent(live, {
        type: "error",
        code: "process",
        message: `Attachments: ${(error as Error).message}`,
      });
      return;
    }
    const item: ChatItem = {
      kind: "user",
      id: `user-${randomUUID()}`,
      text,
      at: new Date().toISOString(),
      ...(attachments.length ? { attachments } : {}),
    };
    const updates: ChatUpdate[] = [{ op: "upsert", item }];
    live.state.items.push(item);
    const meta = live.state.meta;
    const title =
      meta.turns === 0 && meta.title === "New session"
        ? summarize(text || attachments[0]?.name || "Attachment")
        : meta.title;
    live.state.meta = {
      ...meta,
      title,
      status: "working",
      lastError: undefined,
      suggestion: undefined,
      updatedAt: new Date().toISOString(),
    };
    updates.push({ op: "meta", meta: live.state.meta });
    this.emit(live, updates);
    this.options.onActivity?.({ kind: "prompt", session: live.state.meta, text });
    try {
      this.startEngine(live).send(text, data);
    } catch (error) {
      this.handleEvent(live, { type: "error", code: "process", message: (error as Error).message });
    }
  }

  /** Sends a message, or queues it while Claude is busy. */
  async send(id: string, text: string, attachments: ChatAttachment[] = []): Promise<void> {
    const live = await this.live(id);
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;
    const busy = ["working", "needs_you", "starting"].includes(live.state.meta.status);
    if (busy) {
      live.queue.push({ id: randomUUID(), text: trimmed, ...(attachments.length ? { attachments } : {}) });
      this.emit(live, [{ op: "queue", queue: live.queue }]);
      return;
    }
    await this.startTurn(live, trimmed, attachments);
  }

  /** Keeps a pasted, dropped or picked file for the next message of a session. */
  async addAttachment(
    id: string,
    input: { data?: string; mime?: string; name?: string; path?: string },
  ): Promise<ChatAttachment> {
    await this.live(id);
    return addAttachment(this.options.attachmentsDir, id, input);
  }

  /** Adds an item to a transcript (e.g. a build card in the chat that asked for it). */
  async addItem(id: string, item: ChatItem): Promise<void> {
    const live = await this.live(id);
    live.state.items.push(item);
    this.emit(live, [{ op: "upsert", item }]);
  }

  /** Replaces a transcript item by id (e.g. a change card after Undo). */
  async updateItem(id: string, item: ChatItem): Promise<void> {
    const live = await this.live(id);
    const index = live.state.items.findIndex((i) => i.id === item.id);
    if (index < 0) throw new JigError("not_found", "That message isn't in this chat");
    live.state.items[index] = item;
    this.emit(live, [{ op: "upsert", item }]);
    this.scheduleSave(live, true);
  }

  async removeQueued(id: string, queuedId: string): Promise<void> {
    const live = await this.live(id);
    live.queue = live.queue.filter((q) => q.id !== queuedId);
    this.emit(live, [{ op: "queue", queue: live.queue }]);
  }

  async interrupt(id: string): Promise<void> {
    const live = await this.live(id);
    if (!live.engine) return;
    await live.engine.interrupt().catch((error) => log.warn("Interrupt failed", error));
  }

  async answerPermission(id: string, requestId: string, decision: PermissionDecision): Promise<void> {
    const live = await this.live(id);
    const pending = live.permissions.get(requestId);
    if (!pending) throw new JigError("not_found", "This request is no longer waiting");
    live.permissions.delete(requestId);
    const status = decision.behavior === "deny" ? "denied" : decision.always ? "always" : "allowed";
    this.handleEvent(live, { type: "permission_resolved", requestId, status });
    pending.resolve(decision);
  }

  async setModel(id: string, model: string): Promise<void> {
    const live = await this.live(id);
    await live.engine?.setModel(model);
    this.setMeta(live, { model });
  }

  async setPermissionMode(id: string, permissionMode: PermissionMode): Promise<void> {
    const live = await this.live(id);
    await live.engine?.setPermissionMode(permissionMode);
    this.setMeta(live, { permissionMode });
  }

  async rename(id: string, title: string): Promise<void> {
    const live = await this.live(id);
    if (!title.trim()) throw new JigError("invalid_args", "A session needs a title");
    this.setMeta(live, { title: title.trim() });
  }

  async setArchived(id: string, archived: boolean): Promise<void> {
    const live = await this.live(id);
    if (archived) this.stop(live);
    this.setMeta(live, { archived });
  }

  /** Ends the Claude Code process (the conversation can continue later; it resumes). */
  async stopProcess(id: string): Promise<void> {
    this.stop(await this.live(id));
  }

  private stop(live: Live) {
    live.engine?.close();
    live.engine = undefined;
  }

  async delete(id: string): Promise<void> {
    const live = await this.live(id);
    this.stop(live);
    clearTimeout(live.saveTimer);
    this.sessions.delete(id);
    await rm(this.file(id), { force: true });
    await removeAttachments(this.options.attachmentsDir, id).catch(() => {});
  }

  /** Ends every Claude Code process (app quit). */
  async shutdown(): Promise<void> {
    for (const live of this.sessions.values()) {
      this.stop(live);
      if (live.saveTimer) {
        clearTimeout(live.saveTimer);
        this.scheduleSave(live, true);
      }
    }
  }

  runningCount(): number {
    return [...this.sessions.values()].filter((l) => l.engine).length;
  }
}

/** A short title from the first message. */
export function summarize(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > 60 ? `${line.slice(0, 57).trimEnd()}…` : line || "New session";
}
