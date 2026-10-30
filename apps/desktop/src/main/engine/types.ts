import type {
  ContextUsage,
  EffortLevel,
  EngineEvent,
  McpServerInfo,
  ModelInfo,
  PermissionDecision,
  PermissionMode,
  PermissionRequest,
  RewindResult,
  SavedClaudeMessage,
  SavedClaudeSession,
  SavedToolUse,
  SlashCommandInfo,
} from "../../shared/engine";
import type { RawUsage } from "../../shared/usage";
import type { EnginePart } from "../sessions/attachments";
import type { ToolCallRequest, ToolCallResult } from "./toolCall";

/**
 * The one engine contract. `ClaudeEngine` runs the official Claude Code through the Agent SDK;
 * `FakeEngine` replays scripted events for tests and `JIG_ENGINE=fake`. Nothing else may implement
 * an agent loop (AGENTS.md: Claude Code is the only engine).
 */
/** What a Jig tool returns: text, or text with images (a browser screenshot). */
export type ToolOutput = string | { text: string; images?: Array<{ mime: string; data: string }> };

export const outputText = (o: ToolOutput): string => (typeof o === "string" ? o : o.text);
export const outputImages = (o: ToolOutput) => (typeof o === "string" ? undefined : o.images);

export interface StartOptions {
  cwd: string;
  /** Model alias or id; empty = Claude Code's default. */
  model: string;
  permissionMode: PermissionMode;
  /** Claude Code session id to resume. */
  resume?: string;
  /** Text appended to the `claude_code` system prompt preset (never a replacement). */
  appendSystemPrompt: string;
  /** Environment for Claude Code (API-key variables already stripped unless allowed). */
  env: Record<string, string | undefined>;
  /** Path to the user's own `claude` binary; empty = the one shipped with the SDK. */
  claudePath: string;
  /** Claude Code suggests the next message after each turn (`suggestion` events). */
  promptSuggestions?: boolean;
  /** Claude Code keeps copies of files before editing them (`rewindFiles`). */
  fileCheckpoints?: boolean;
  /** With `resume`: continue the conversation as a new session (a fork) instead of the original. */
  forkSession?: boolean;
  /** With `resume`: only resume up to this Claude Code message (the conversation was rewound). */
  resumeSessionAt?: string;
  effort?: EffortLevel;
  /** Folders Claude may use besides `cwd`. */
  additionalDirectories?: string[];
  /** In-process MCP servers (the `jig` tools). Opaque to the engine interface. */
  mcpServers?: Record<string, unknown>;
  /** Subagents Claude can hand work to (Agent SDK `AgentDefinition`s, e.g. `jig-tester`). */
  agents?: Record<string, unknown>;
  /** The same tools as plain functions, for the fake engine's scripted sessions. */
  toolHandlers?: Record<string, (args: Record<string, unknown>) => Promise<ToolOutput>>;
  /** Asks the user; resolves with their decision. */
  askPermission: (request: PermissionRequest, signal: AbortSignal) => Promise<PermissionDecision>;
}

export interface EngineSession {
  /**
   * Sends a user message (starts a turn), with attachments (images, PDFs, document text) if any.
   * Returns the id Claude Code knows the message by (for `rewindFiles`).
   */
  send(text: string, attachments?: EnginePart[], priority?: "next"): string;
  /** Restores files Claude changed since `messageId` (file checkpoints); `dryRun` only reports. */
  rewindFiles(messageId: string, dryRun: boolean): Promise<RewindResult>;
  interrupt(): Promise<void>;
  setModel(model: string): Promise<void>;
  setPermissionMode(mode: PermissionMode): Promise<void>;
  /** How full the context window is now (Claude Code's `/context` data; nothing is sent to Claude). */
  contextUsage(): Promise<ContextUsage | undefined>;
  /** Claude Code's slash commands and skills for this session. */
  commands(): Promise<SlashCommandInfo[]>;
  /** The models Claude Code offers, with their effort levels. */
  models(): Promise<ModelInfo[]>;
  /** null = the model's default. */
  setEffort(effort: EffortLevel | null): Promise<void>;
  mcpStatus(): Promise<McpServerInfo[]>;
  mcpReconnect(name: string): Promise<void>;
  mcpToggle(name: string, enabled: boolean): Promise<void>;
  /** Moves running commands/subagents (or one, by its tool-use id) to the background (Ctrl+B). */
  background(toolUseId?: string): Promise<boolean>;
  stopTask(taskId: string): Promise<void>;
  /** Ends the Claude Code process. */
  close(): void;
}

export interface OneShotOptions {
  /** Gives up after this long (default 3 minutes). */
  timeoutMs?: number;
  cwd: string;
  model: string;
  appendSystemPrompt: string;
  env: Record<string, string | undefined>;
  claudePath: string;
}

export interface ToolCallOptions {
  cwd: string;
  env: Record<string, string | undefined>;
  claudePath: string;
  timeoutMs?: number;
}

export interface Engine {
  readonly kind: "claude" | "fake";
  start(options: StartOptions, onEvent: (event: EngineEvent) => void): EngineSession;
  /** A single non-interactive query with no tools (pattern reflection, phase 9). Returns the text. */
  oneShot(prompt: string, options: OneShotOptions): Promise<string>;
  /**
   * Has Claude Code call one of its own tools (routines, artifacts) with an exact input, in a hidden
   * session where only that call is allowed (D-092). Claude Code uses its own sign-in.
   */
  callTool(request: ToolCallRequest, options: ToolCallOptions): Promise<ToolCallResult>;
  /**
   * Your plan's usage as Claude Code's `/usage` reports it (5-hour and weekly windows). Claude Code
   * fetches it with its own login; no message is sent to Claude.
   */
  /** Available models from a no-prompt Claude Code control request. */
  models(options: { env: Record<string, string | undefined>; claudePath: string }): Promise<ModelInfo[]>;
  planUsage(options: { env: Record<string, string | undefined>; claudePath: string }): Promise<RawUsage>;
  /** The conversations Claude Code saved on this machine, newest first (D-150). */
  savedSessions(options: { limit: number }): Promise<SavedClaudeSession[]>;
  /** A saved conversation's messages in order (Claude Code reads its own transcript). */
  savedMessages(sessionId: string, cwd?: string): Promise<SavedClaudeMessage[]>;
  /**
   * Every tool call Claude made in a saved conversation, including what an earlier compaction left
   * out of `savedMessages` and its subagents' (D-162). Only the calls are read.
   */
  savedToolUses(sessionId: string): Promise<SavedToolUse[]>;
}

/** Copies the environment, removing API-key variables unless the user allowed them (D-002). */
export function sessionEnv(
  base: Record<string, string | undefined>,
  allowApiKey: boolean,
): Record<string, string | undefined> {
  const env = { ...base };
  if (!allowApiKey) {
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
  }
  // Electron sets this for its own child processes; Claude Code must run as itself.
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}
