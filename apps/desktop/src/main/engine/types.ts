import type { z } from "zod";
import type {
  ChatProvider,
  ContextUsage,
  EffortLevel,
  EngineCapabilities,
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
 * The one engine contract. `ClaudeEngine` runs the official Claude Code through the Agent SDK; a
 * Codex engine will run OpenAI's official Codex CLI (D-309); `FakeEngine` replays scripted events for
 * tests and `JIG_ENGINE=fake`, standing in for either provider. Jig never implements an agent loop of
 * its own: every engine drives an official CLI.
 */
/** What a Jig tool returns: text, or text with images (a browser screenshot). */
export type ToolOutput = string | { text: string; images?: Array<{ mime: string; data: string }> };

export const outputText = (o: ToolOutput): string => (typeof o === "string" ? o : o.text);
export const outputImages = (o: ToolOutput) => (typeof o === "string" ? undefined : o.images);

/**
 * A tool Jig offers one chat, the same for every engine (D-313): Claude Code gets it from an
 * in-process SDK server, Codex from the chat's local MCP server, the fake engine calls it directly.
 * The name is what the model sees (`mcp__<server>__<name>`), so it is the same in every chat.
 */
export interface ChatTool {
  name: string;
  description: string;
  shape: z.ZodRawShape;
  /** Only reads: runs without asking the user (D-077), in every engine. */
  readOnly?: boolean;
  /** Claude Code: always in the prompt, never behind its tool search (D-158). */
  alwaysLoad?: boolean;
  /** `signal` aborts when the call is cancelled (the chat stopped, the turn was interrupted). */
  handler: (args: Record<string, unknown>, signal?: AbortSignal) => Promise<ToolOutput>;
}

/** One MCP server's worth of Jig tools for a chat (`jig`, `jig-builder`). */
export interface ChatToolServer {
  instructions?: string;
  tools: ChatTool[];
}

export interface StartOptions {
  cwd: string;
  /** Claude Code's built-in tools it may use; undefined: all of them (`[]`: only `toolServers`). */
  tools?: string[];
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
  /** Path to the user's own `codex` binary (Codex chats); empty = the one on PATH. */
  codexPath?: string;
  /** Codex chats: keep OPENAI_API_KEY / CODEX_API_KEY in Codex's environment (D-311). */
  codexAllowApiKey?: boolean;
  /** Codex chats: `claude` gives Codex your Claude Code instructions (CLAUDE.md and its imports, D-312). */
  codexInstructions?: "claude" | "off";
  /** Codex chats: `claude` adds Claude Code's skills to Codex's own (D-315). */
  codexSkills?: "claude" | "off";
  /** Claude Code suggests the next message after each turn (`suggestion` events). */
  promptSuggestions?: boolean;
  /**
   * Engines without suggestions of their own (Codex, D-315): a next message for the turn that just
   * ended, from a one-shot (Settings → AI features → Next-message suggestions); undefined = none.
   */
  suggestNext?: (turn: { message: string; reply: string }) => Promise<string | undefined>;
  /** Claude Code keeps copies of files before editing them (`rewindFiles`). */
  fileCheckpoints?: boolean;
  /** With `resume`: continue the conversation as a new session (a fork) instead of the original. */
  forkSession?: boolean;
  /** With `resume`: only resume up to this Claude Code message (the conversation was rewound). */
  resumeSessionAt?: string;
  effort?: EffortLevel;
  /** Folders Claude may use besides `cwd`. */
  additionalDirectories?: string[];
  /**
   * Jig's tools for this chat by MCP server name (`jig`, `jig-builder`). Every engine offers them
   * under the same names (D-313); how is the engine's business.
   */
  toolServers?: Record<string, ChatToolServer>;
  /** Reviewed, local skill-only plugins selected for this chat. */
  plugins?: Array<{ type: "local"; path: string }>;
  /** Subagents Claude can hand work to (Agent SDK `AgentDefinition`s, e.g. `jig-tester`). */
  agents?: Record<string, unknown>;
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

/**
 * A warm Claude Code process for short answers one after another (code completion, D-255): no tools,
 * no saved chat, the claude_code preset with Jig's lines appended. Answers come in turn order.
 */
export interface Completer {
  /** One answer; rejects when `signal` aborts or Claude Code fails. */
  ask(prompt: string, signal?: AbortSignal): Promise<string>;
  close(): void;
}

export interface CompleterOptions {
  cwd: string;
  /** Claude: a Claude Code model. ChatGPT: an exact Codex model ("" = Codex's default); resolve families first. */
  model: string;
  /** The completer's own instructions: appended to Claude's preset, or Codex's developer instructions. */
  appendSystemPrompt: string;
  env: Record<string, string | undefined>;
  claudePath: string;
  /** ChatGPT (D-401): the Codex CLI to run (`engine.codexPath`), else the one on PATH. */
  codexPath?: string;
  /** ChatGPT: reasoning effort for each ask ("low" completes fastest); unset = the model's own. */
  effort?: string;
  /** ChatGPT: an ask that takes longer rejects (default 60 s); the warm process stays. */
  timeoutMs?: number;
}

export interface ToolCallOptions {
  cwd: string;
  env: Record<string, string | undefined>;
  claudePath: string;
  timeoutMs?: number;
}

export interface Engine {
  /** `fake` is the scripted engine, whichever provider it stands in for. */
  readonly kind: "claude" | "codex" | "fake";
  /** Whose chats it runs (the fake engine: the provider it stands in for). */
  readonly provider: ChatProvider;
  /** What its chats can do; the UI hides the rest (D-309). */
  readonly capabilities: EngineCapabilities;
  start(options: StartOptions, onEvent: (event: EngineEvent) => void): EngineSession;
  /** A single non-interactive query with no tools (pattern reflection, phase 9). Returns the text. */
  oneShot(prompt: string, options: OneShotOptions): Promise<string>;
  /** A warm process for many short answers in a row (code completion, D-255). */
  completer(options: CompleterOptions): Completer;
  /**
   * Has Claude Code call one of its own tools (routines) with an exact input, in a hidden
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

/**
 * Codex's environment: no OpenAI API key unless the user allowed it (`engine.codexAllowApiKey`), so
 * Codex uses the ChatGPT sign-in it stored itself (Jig never reads that), and nothing Electron set for
 * its own child processes.
 */
export function codexSessionEnv(
  base: Record<string, string | undefined>,
  allowApiKey: boolean,
): Record<string, string | undefined> {
  const env = { ...base };
  if (!allowApiKey) {
    delete env.OPENAI_API_KEY;
    delete env.CODEX_API_KEY;
  }
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}
