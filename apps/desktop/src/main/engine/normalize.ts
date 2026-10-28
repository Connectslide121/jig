import type { AuthSource, ContextUsage, EngineEvent, Usage } from "../../shared/engine";

/**
 * Claude Code SDK messages → Jig engine events. Pure and stateful per session (it tracks streamed
 * blocks so the complete assistant message can replace the streamed text). Messages are typed loosely
 * on purpose: the SDK adds fields often, and unknown messages must be ignored, never crash a session.
 */
// biome-ignore lint/suspicious/noExplicitAny: SDK messages are a large, evolving union.
type Msg = any;

export function authSourceFrom(apiKeySource: string | undefined): AuthSource {
  if (!apiKeySource) return "unknown";
  if (apiKeySource === "none" || apiKeySource === "oauth") return "subscription";
  return "api_key";
}

const LOGIN_ERRORS = new Set(["authentication_failed", "oauth_org_not_allowed", "verification_required"]);
const LOGIN_TEXT = /(not logged in|please run \/login|invalid api key|authentication|log in)/i;

function usageFrom(u: Msg): Usage | undefined {
  if (!u) return undefined;
  return {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  };
}

/** Tool results come as a string or as content blocks; keep the text, summarise anything else. */
export function toolOutputText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content === undefined ? "" : JSON.stringify(content);
  return content
    .map((block: Msg) =>
      block?.type === "text" ? block.text : block?.type === "image" ? "[image]" : JSON.stringify(block),
    )
    .join("\n");
}

/** The base64 images in a tool result (MCP screenshots, charts). */
export function toolOutputImages(content: unknown): Array<{ mime: string; data: string }> {
  if (!Array.isArray(content)) return [];
  return content.flatMap((block: Msg) =>
    block?.type === "image" && block.source?.type === "base64" && typeof block.source.data === "string"
      ? [{ mime: String(block.source.media_type ?? "image/png"), data: block.source.data }]
      : [],
  );
}

export class Normalizer {
  /** message id → ordinal counters per block type, for streamed blocks. */
  private streamed = new Map<string, { text: number; thinking: number; byIndex: Map<number, string> }>();
  /** message id → ordinal counters for blocks from complete assistant messages. */
  private completed = new Map<string, { text: number; thinking: number }>();
  private currentStreamMessage: string | undefined;

  handle(message: Msg): EngineEvent[] {
    switch (message?.type) {
      case "system":
        return this.system(message);
      case "stream_event":
        return this.stream(message);
      case "assistant":
        return this.assistant(message);
      case "user":
        return this.user(message);
      case "result":
        return this.result(message);
      case "rate_limit_event": {
        const info = message.rate_limit_info ?? {};
        return [
          {
            type: "rate_limit",
            status: info.status ?? "allowed",
            window: info.rateLimitType,
            // Seconds or milliseconds since 1970 (the SDK doesn't say): both give a sensible date.
            resetsAt:
              typeof info.resetsAt === "number"
                ? new Date(info.resetsAt > 1e12 ? info.resetsAt : info.resetsAt * 1000).toISOString()
                : undefined,
          },
        ];
      }
      case "prompt_suggestion":
        return typeof message.suggestion === "string" && message.suggestion.trim()
          ? [{ type: "suggestion", text: message.suggestion.trim() }]
          : [];
      case "auth_status":
        return message.error ? [{ type: "error", message: message.error, code: "not_signed_in" }] : [];
      default:
        return [];
    }
  }

  private system(m: Msg): EngineEvent[] {
    if (m.subtype === "init")
      return [
        {
          type: "init",
          engineSessionId: m.session_id,
          model: m.model ?? "",
          permissionMode: m.permissionMode ?? "default",
          authSource: authSourceFrom(m.apiKeySource),
          slashCommands: Array.isArray(m.slash_commands) ? m.slash_commands : [],
        },
      ];
    if (m.subtype === "status") return [{ type: "status", status: m.status ?? null }];
    if (m.subtype === "compact_boundary") {
      const c = m.compact_metadata ?? {};
      return [
        {
          type: "compacted",
          trigger: c.trigger === "auto" ? "auto" : "manual",
          preTokens: Number(c.pre_tokens) || 0,
          postTokens: typeof c.post_tokens === "number" ? c.post_tokens : undefined,
        },
      ];
    }
    return [];
  }

  private stream(m: Msg): EngineEvent[] {
    const event = m.event;
    const parentId = m.parent_tool_use_id ?? undefined;
    if (!event) return [];
    if (event.type === "message_start") {
      this.currentStreamMessage = event.message?.id;
      return [];
    }
    const messageId = this.currentStreamMessage;
    if (!messageId) return [];
    let entry = this.streamed.get(messageId);
    if (!entry) {
      entry = { text: 0, thinking: 0, byIndex: new Map() };
      this.streamed.set(messageId, entry);
    }
    if (event.type === "content_block_start") {
      const type: unknown = event.content_block?.type;
      if (type !== "text" && type !== "thinking") return [];
      const kind: "text" | "thinking" = type;
      const id = `${messageId}:${kind}:${entry[kind]++}`;
      entry.byIndex.set(event.index, id);
      return [{ type: "block_start", id, block: kind, parentId }];
    }
    if (event.type === "content_block_delta") {
      const id = entry.byIndex.get(event.index);
      const d = event.delta;
      if (!id || !d) return [];
      if (d.type === "text_delta" && d.text) return [{ type: "block_delta", id, text: d.text }];
      if (d.type === "thinking_delta" && d.thinking) return [{ type: "block_delta", id, text: d.thinking }];
    }
    return [];
  }

  private assistant(m: Msg): EngineEvent[] {
    const message = m.message ?? {};
    const parentId = m.parent_tool_use_id ?? undefined;
    const events: EngineEvent[] = [];
    if (m.error) {
      const login = LOGIN_ERRORS.has(m.error);
      const text = (message.content ?? []).find((b: Msg) => b?.type === "text")?.text;
      events.push({
        type: "error",
        message: text || `Claude Code reported: ${m.error}`,
        code: login
          ? "not_signed_in"
          : m.error === "billing_error"
            ? "billing"
            : m.error === "rate_limit"
              ? "rate_limit"
              : undefined,
      });
      return events;
    }
    const messageId: string = message.id ?? m.uuid;
    let counter = this.completed.get(messageId);
    if (!counter) {
      counter = { text: 0, thinking: 0 };
      this.completed.set(messageId, counter);
    }
    for (const block of message.content ?? []) {
      if (block?.type === "text" || block?.type === "thinking") {
        const kind = block.type as "text" | "thinking";
        const id = `${messageId}:${kind}:${counter[kind]++}`;
        const text = kind === "text" ? block.text : block.thinking;
        if (text || this.streamed.get(messageId)?.byIndex.size)
          events.push({ type: "block_end", id, block: kind, text: text ?? "", parentId });
      } else if (block?.type === "tool_use" || block?.type === "server_tool_use") {
        events.push({ type: "tool_use", id: block.id, name: block.name, input: block.input ?? {}, parentId });
      }
    }
    return events;
  }

  private user(m: Msg): EngineEvent[] {
    const content = m.message?.content;
    if (!Array.isArray(content)) return [];
    return content
      .filter((b: Msg) => b?.type === "tool_result")
      .map((b: Msg) => ({
        type: "tool_result" as const,
        toolUseId: b.tool_use_id,
        output: toolOutputText(b.content),
        isError: Boolean(b.is_error),
        ...(toolOutputImages(b.content).length ? { imageData: toolOutputImages(b.content) } : {}),
      }));
  }

  private result(m: Msg): EngineEvent[] {
    const ok = m.subtype === "success" && !m.is_error;
    const error = ok ? undefined : m.errors?.join("\n") || m.result || m.subtype;
    const events: EngineEvent[] = [];
    if (!ok && typeof error === "string" && LOGIN_TEXT.test(error))
      events.push({ type: "error", message: error, code: "not_signed_in" });
    events.push({
      type: "result",
      ok,
      durationMs: m.duration_ms ?? 0,
      totalCostUsd: typeof m.total_cost_usd === "number" ? m.total_cost_usd : undefined,
      usage: usageFrom(m.usage),
      numTurns: m.num_turns,
      error,
    });
    return events;
  }
}

/** Claude Code's context breakdown (`getContextUsage`) → what Jig shows. */
export function contextFrom(r: Msg, at = new Date().toISOString()): ContextUsage {
  const usedTokens = Number(r.totalTokens) || 0;
  const maxTokens = Number(r.maxTokens) || Number(r.rawMaxTokens) || 0;
  const percent =
    typeof r.percentage === "number" ? r.percentage : maxTokens ? (usedTokens / maxTokens) * 100 : 0;
  const categories = (Array.isArray(r.categories) ? r.categories : [])
    .filter((c: Msg) => c.kind !== "deferred" && Number(c.tokens) > 0)
    .map((c: Msg) => ({
      name: String(c.name),
      tokens: Number(c.tokens),
      kind: c.kind === "free" || c.kind === "buffer" ? c.kind : ("used" as const),
    }))
    .sort((a: { kind: string; tokens: number }, b: { kind: string; tokens: number }) =>
      a.kind === b.kind ? b.tokens - a.tokens : a.kind === "used" ? -1 : b.kind === "used" ? 1 : 0,
    );
  return { usedTokens, maxTokens, percent: Math.max(0, Math.min(100, Math.round(percent))), categories, at };
}
