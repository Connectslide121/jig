/**
 * Chat sessions: what the renderer sees. The host turns Claude Code's messages into `EngineEvent`s
 * (main/engine/normalize.ts) and reduces them into `ChatItem`s (shared/chat.ts). Documented in
 * docs/reference/engine.md.
 */
export const PERMISSION_MODES = ["default", "acceptEdits", "plan", "bypassPermissions"] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];

export const PERMISSION_MODE_LABELS: Record<PermissionMode, string> = {
  default: "Ask before changes",
  acceptEdits: "Accept edits",
  plan: "Plan only",
  bypassPermissions: "Don't ask",
};

/** idle = waiting for you; working = Claude is busy; needs_you = a permission/question is waiting. */
export type SessionStatus = "idle" | "starting" | "working" | "needs_you" | "error";

/** Where the session's usage is billed: your Claude plan, or an API key (pay-as-you-go). */
export type AuthSource = "subscription" | "api_key" | "unknown";

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface SessionMeta {
  id: string;
  projectId: string;
  cwd: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** Model alias/id chosen for the session; empty = Claude Code's default. */
  model: string;
  /** The model Claude Code reported in its init message. */
  activeModel?: string;
  permissionMode: PermissionMode;
  /** Claude Code's own session id, used to resume after a restart. */
  engineSessionId?: string;
  status: SessionStatus;
  authSource: AuthSource;
  /** Cumulative cost estimate reported by Claude Code (USD). */
  costUsd: number;
  usage: Usage;
  turns: number;
  lastError?: string;
  /** Set when Claude Code isn't signed in; the UI shows the sign-in guidance. */
  needsLogin?: boolean;
  archived?: boolean;
  /** `builder` sessions run a build job (hidden from the Sessions list, opened from the build). */
  kind?: "chat" | "builder";
  buildId?: string;
}

export interface PermissionRequest {
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
  /** Claude Code's own sentence, e.g. "Claude wants to run npm test". */
  title?: string;
  description?: string;
  /** "Always allow" is possible (Claude Code offered permission rules). */
  canAlwaysAllow: boolean;
}

export type PermissionDecision =
  | { behavior: "allow"; always?: boolean; updatedInput?: Record<string, unknown> }
  | { behavior: "deny"; message?: string };

export type ChatItem =
  | {
      kind: "user";
      id: string;
      text: string;
      at: string;
      attachments?: ChatAttachment[];
      /** Older transcripts (images only). */
      images?: ChatAttachment[];
    }
  | { kind: "assistant"; id: string; text: string; at: string; streaming?: boolean; parentId?: string }
  | { kind: "thinking"; id: string; text: string; at: string; streaming?: boolean; parentId?: string }
  | {
      kind: "tool";
      id: string;
      name: string;
      input: Record<string, unknown>;
      status: "running" | "done" | "error";
      output?: string;
      at: string;
      parentId?: string;
    }
  | {
      kind: "permission";
      id: string;
      request: PermissionRequest;
      status: "pending" | "allowed" | "always" | "denied" | "cancelled";
      at: string;
    }
  | {
      kind: "result";
      id: string;
      at: string;
      ok: boolean;
      durationMs: number;
      /** Cost of this turn (difference of the cumulative totals). */
      costUsd?: number;
      usage?: Usage;
      error?: string;
    }
  | { kind: "notice"; id: string; at: string; text: string; tone: "info" | "warning" | "danger" }
  /** A build this chat asked for (jig_request_build); the card follows the build's status. */
  | { kind: "build"; id: string; at: string; buildId: string };

/** Incremental transcript changes sent to the renderer (`sessions.update`). */
export type ChatUpdate =
  | { op: "upsert"; item: ChatItem }
  | { op: "append"; id: string; text: string }
  | { op: "meta"; meta: SessionMeta }
  | { op: "queue"; queue: QueuedMessage[] };

export interface QueuedMessage {
  id: string;
  text: string;
  attachments?: ChatAttachment[];
}

/**
 * A file sent with a message (pasted, dropped or attached), kept in `~/.jig/attachments/<session>/`:
 * an image or PDF (sent as is), or an Office or text file (sent as text).
 */
export interface ChatAttachment {
  path: string;
  mime: string;
  /** The original file name. */
  name?: string;
  kind?: "image" | "pdf" | "office" | "text";
}

export interface SessionSnapshot {
  meta: SessionMeta;
  items: ChatItem[];
  queue: QueuedMessage[];
}

/** Engine events, normalised from Claude Code's SDK messages. */
export type EngineEvent =
  | {
      type: "init";
      engineSessionId: string;
      model: string;
      permissionMode: string;
      authSource: AuthSource;
      slashCommands: string[];
    }
  | { type: "block_start"; id: string; block: "text" | "thinking"; parentId?: string }
  | { type: "block_delta"; id: string; text: string }
  | { type: "block_end"; id: string; block: "text" | "thinking"; text: string; parentId?: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown>; parentId?: string }
  | { type: "tool_result"; toolUseId: string; output: string; isError: boolean }
  | { type: "permission"; request: PermissionRequest }
  | { type: "permission_resolved"; requestId: string; status: "allowed" | "always" | "denied" | "cancelled" }
  | {
      type: "result";
      ok: boolean;
      durationMs: number;
      totalCostUsd?: number;
      usage?: Usage;
      numTurns?: number;
      error?: string;
    }
  | { type: "status"; status: "compacting" | "requesting" | null }
  | { type: "notice"; text: string; tone: "info" | "warning" | "danger" }
  | { type: "error"; message: string; code?: "not_signed_in" | "process" | "billing" | "rate_limit" }
  | { type: "exit" };
