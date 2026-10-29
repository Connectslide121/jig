import type { ChatItem, ChatUpdate, EngineEvent, SessionMeta } from "./engine";

/**
 * Turns engine events into transcript changes. Pure: the host keeps the items and meta, applies the
 * returned updates and forwards them to the renderer, which applies them with `applyUpdate`.
 */
export interface ChatState {
  meta: SessionMeta;
  items: ChatItem[];
}

const now = () => new Date().toISOString();

/** Permission items get their own id: Claude Code uses the tool-use id as the request id. */
export const permissionItemId = (requestId: string) => `permission:${requestId}`;

function findIndex(items: ChatItem[], id: string): number {
  // Recent items are the likely target.
  for (let i = items.length - 1; i >= 0; i--) if (items[i]!.id === id) return i;
  return -1;
}

/** Applies one update to a transcript (used by both host and renderer). Mutates and returns `items`. */
export function applyUpdate(items: ChatItem[], update: ChatUpdate): ChatItem[] {
  if (update.op === "upsert") {
    const i = findIndex(items, update.item.id);
    if (i >= 0) items[i] = update.item;
    else items.push(update.item);
  } else if (update.op === "reset") {
    items.splice(0, items.length, ...update.items);
  } else if (update.op === "append") {
    const i = findIndex(items, update.id);
    const item = items[i];
    if (item && (item.kind === "assistant" || item.kind === "thinking")) {
      items[i] = { ...item, text: item.text + update.text };
    }
  }
  return items;
}

export function reduceEvent(state: ChatState, event: EngineEvent): ChatUpdate[] {
  const updates: ChatUpdate[] = [];
  const meta = (patch: Partial<SessionMeta>) => {
    state.meta = { ...state.meta, ...patch, updatedAt: now() };
    updates.push({ op: "meta", meta: state.meta });
  };
  const upsert = (item: ChatItem) => {
    applyUpdate(state.items, { op: "upsert", item });
    updates.push({ op: "upsert", item });
  };
  const get = (id: string) => state.items[findIndex(state.items, id)];

  switch (event.type) {
    case "init":
      meta({
        engineSessionId: event.engineSessionId,
        activeModel: event.model,
        authSource: event.authSource,
        needsLogin: false,
        ...(event.mcpServers ? { mcpServers: event.mcpServers } : {}),
        resumeAt: undefined,
        resetPending: undefined,
      });
      for (const server of event.mcpServers ?? [])
        if (server.status === "failed" || server.status === "needs-auth")
          upsert({
            kind: "notice",
            id: `mcp-${server.name}`,
            at: now(),
            tone: "warning",
            text:
              server.status === "needs-auth"
                ? `The MCP server “${server.name}” needs you to sign in (chat ⋯ → MCP servers).`
                : `The MCP server “${server.name}” failed to start (chat ⋯ → MCP servers).`,
          });
      if (event.authSource === "api_key")
        upsert({
          kind: "notice",
          id: `auth-${event.engineSessionId}`,
          at: now(),
          tone: "warning",
          text: "This session uses an API key, so usage is billed pay-as-you-go instead of your Claude plan.",
        });
      break;
    case "block_start":
      upsert({
        kind: event.block === "text" ? "assistant" : "thinking",
        id: event.id,
        text: "",
        at: now(),
        streaming: true,
        parentId: event.parentId,
      });
      break;
    case "block_delta": {
      if (get(event.id)) {
        applyUpdate(state.items, { op: "append", id: event.id, text: event.text });
        updates.push({ op: "append", id: event.id, text: event.text });
      }
      break;
    }
    case "block_end": {
      const existing = get(event.id);
      upsert({
        kind: event.block === "text" ? "assistant" : "thinking",
        id: event.id,
        text: event.text,
        at: existing?.at ?? now(),
        parentId: event.parentId,
      });
      break;
    }
    case "tool_use":
      upsert({
        kind: "tool",
        id: event.id,
        name: event.name,
        input: event.input,
        status: "running",
        at: now(),
        parentId: event.parentId,
      });
      break;
    case "tool_result": {
      const tool = get(event.toolUseId);
      if (tool?.kind === "tool")
        upsert({
          ...tool,
          status: event.isError ? "error" : "done",
          output: event.output,
          ...(event.images?.length ? { images: event.images } : {}),
          ...(event.diff ? { diff: event.diff } : {}),
        });
      break;
    }
    case "task": {
      const tool = event.toolUseId ? get(event.toolUseId) : undefined;
      // Later messages leave out the description: keep the first one.
      if (tool?.kind === "tool")
        upsert({
          ...tool,
          task: {
            ...tool.task,
            ...event.task,
            description: event.task.description || tool.task?.description || "",
          },
        });
      // Claude Code doesn't always send a new list when a background task ends: a finished one goes.
      if (event.task.status !== "running" && state.meta.backgroundTasks?.some((t) => t.id === event.task.id))
        meta({ backgroundTasks: state.meta.backgroundTasks.filter((t) => t.id !== event.task.id) });
      break;
    }
    case "background_tasks":
      meta({ backgroundTasks: event.tasks });
      break;
    case "command_output":
      upsert({ kind: "assistant", id: event.id, text: event.text, at: now() });
      break;
    case "permission":
      upsert({
        kind: "permission",
        id: permissionItemId(event.request.requestId),
        request: event.request,
        status: "pending",
        at: now(),
      });
      meta({ status: "needs_you" });
      break;
    case "permission_resolved": {
      const item = get(permissionItemId(event.requestId));
      if (item?.kind === "permission") upsert({ ...item, status: event.status });
      const stillWaiting = state.items.some((i) => i.kind === "permission" && i.status === "pending");
      if (!stillWaiting && state.meta.status === "needs_you") meta({ status: "working" });
      break;
    }
    case "result": {
      // Close anything still streaming or running: the turn is over.
      for (const item of state.items) {
        if ((item.kind === "assistant" || item.kind === "thinking") && item.streaming)
          upsert({ ...item, streaming: false });
        if (item.kind === "tool" && item.status === "running" && !event.ok)
          upsert({ ...item, status: "error" });
        if (item.kind === "permission" && item.status === "pending") upsert({ ...item, status: "cancelled" });
      }
      const previous = state.meta.costUsd;
      const total = event.totalCostUsd ?? previous;
      const turnCost =
        event.totalCostUsd !== undefined ? Math.max(0, event.totalCostUsd - previous) : undefined;
      upsert({
        kind: "result",
        id: `result-${state.items.length}-${Date.now()}`,
        at: now(),
        ok: event.ok,
        durationMs: event.durationMs,
        costUsd: turnCost,
        usage: event.usage,
        error: event.error,
        ...(event.chainUuid ? { chainUuid: event.chainUuid } : {}),
      });
      const u = state.meta.usage;
      meta({
        status: event.ok ? "idle" : "error",
        costUsd: total,
        turns: state.meta.turns + 1,
        lastError: event.ok ? undefined : event.error,
        usage: event.usage
          ? {
              inputTokens: u.inputTokens + event.usage.inputTokens,
              outputTokens: u.outputTokens + event.usage.outputTokens,
              cacheReadTokens: u.cacheReadTokens + event.usage.cacheReadTokens,
              cacheWriteTokens: u.cacheWriteTokens + event.usage.cacheWriteTokens,
            }
          : u,
      });
      break;
    }
    case "status":
      if (event.status === "compacting")
        upsert({
          kind: "notice",
          id: `compact-${Date.now()}`,
          at: now(),
          tone: "info",
          text: "Compacting the conversation…",
        });
      break;
    case "suggestion":
      meta({ suggestion: event.text });
      break;
    case "compacted": {
      // Replaces the "Compacting…" line when there is one.
      const pending = [...state.items]
        .reverse()
        .find((i) => i.kind === "notice" && i.id.startsWith("compact-") && i.text.endsWith("…"));
      const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
      const size = event.preTokens
        ? ` (${k(event.preTokens)}${event.postTokens !== undefined ? ` → ${k(event.postTokens)}` : ""} tokens)`
        : "";
      upsert({
        kind: "notice",
        id: pending?.id ?? `compact-${Date.now()}`,
        at: now(),
        tone: "info",
        text: `${event.trigger === "auto" ? "Context was full: conversation compacted automatically" : "Conversation compacted"}${size}.`,
      });
      break;
    }
    case "notice":
      upsert({
        kind: "notice",
        id: event.key ? `notice-${event.key}` : `notice-${state.items.length}-${Date.now()}`,
        at: now(),
        tone: event.tone,
        text: event.text,
      });
      break;
    case "error":
      upsert({
        kind: "notice",
        id: `error-${state.items.length}-${Date.now()}`,
        at: now(),
        tone: "danger",
        text: event.message,
      });
      meta({
        status: "error",
        lastError: event.message,
        needsLogin: event.code === "not_signed_in" || state.meta.needsLogin,
      });
      break;
    case "exit":
      for (const item of state.items) {
        if ((item.kind === "assistant" || item.kind === "thinking") && item.streaming)
          upsert({ ...item, streaming: false });
        if (item.kind === "tool" && item.status === "running") upsert({ ...item, status: "error" });
        if (item.kind === "permission" && item.status === "pending") upsert({ ...item, status: "cancelled" });
      }
      if (
        state.meta.status === "working" ||
        state.meta.status === "needs_you" ||
        state.meta.status === "starting"
      )
        meta({ status: "idle" });
      break;
  }
  return updates;
}
