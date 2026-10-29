import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { EngineEvent, ModelInfo, PermissionMode } from "../../shared/engine";
import type { RawUsage } from "../../shared/usage";
import { logger } from "../log";
import { isReadOnlyJigTool } from "./jigTools";
import { commandFrom, contextFrom, Normalizer, toolOutputText } from "./normalize";
import { AsyncQueue } from "./queue";
import { isRequestedCall, type ToolCallRequest, type ToolCallResult, toolCallPrompt } from "./toolCall";
import type { Engine, EngineSession, OneShotOptions, StartOptions, ToolCallOptions } from "./types";

const log = logger("engine");

/**
 * Claude Code through the Agent SDK, in streaming-input mode: one Claude Code process per session,
 * fed by a queue of user messages. Claude Code signs in on its own (`claude` → `/login`); Jig never
 * touches credentials. User/project/local settings load, so CLAUDE.md files, skills, plugins, hooks and
 * MCP servers work as in the CLI. The system prompt is Claude Code's preset with Jig's context appended.
 */
export class ClaudeEngine implements Engine {
  readonly kind = "claude" as const;

  start(options: StartOptions, onEvent: (event: EngineEvent) => void): EngineSession {
    const input = new AsyncQueue<SDKUserMessage>();
    const normalizer = new Normalizer();
    const abort = new AbortController();
    const q = query({
      prompt: input,
      options: {
        cwd: options.cwd,
        model: options.model || undefined,
        permissionMode: options.permissionMode,
        // Lets you switch a running chat to "Don't ask" from its menu (Claude Code refuses that
        // switch otherwise); the chat still starts in the mode you chose (D-144).
        allowDangerouslySkipPermissions: true,
        resume: options.resume,
        settingSources: ["user", "project", "local"],
        systemPrompt: { type: "preset", preset: "claude_code", append: options.appendSystemPrompt },
        includePartialMessages: true,
        promptSuggestions: options.promptSuggestions,
        enableFileCheckpointing: options.fileCheckpoints,
        forkSession: options.resume ? options.forkSession : undefined,
        resumeSessionAt: options.resume ? options.resumeSessionAt : undefined,
        effort: options.effort,
        additionalDirectories: options.additionalDirectories?.length
          ? options.additionalDirectories
          : undefined,
        env: options.env,
        pathToClaudeCodeExecutable: options.claudePath || undefined,
        // biome-ignore lint/suspicious/noExplicitAny: the SDK's MCP server config type is opaque here.
        mcpServers: options.mcpServers as any,
        // biome-ignore lint/suspicious/noExplicitAny: Agent SDK AgentDefinitions, opaque to the engine interface.
        agents: options.agents as any,
        abortController: abort,
        stderr: (data) => log.debug(`claude stderr: ${data.trimEnd()}`),
        canUseTool: async (toolName, toolInput, ctx) => {
          // Jig's own read-only tools (settings, themes, layout) don't need the user's OK.
          if (isReadOnlyJigTool(toolName)) return { behavior: "allow", updatedInput: toolInput };
          const decision = await options.askPermission(
            {
              requestId: ctx.toolUseID ?? randomUUID(),
              toolName,
              input: toolInput,
              title: ctx.title,
              description: ctx.decisionReason,
              canAlwaysAllow: Boolean(ctx.suggestions?.length),
            },
            ctx.signal,
          );
          if (decision.behavior === "deny")
            return { behavior: "deny", message: decision.message || "The user declined this action." };
          return {
            behavior: "allow",
            updatedInput: decision.updatedInput ?? toolInput,
            updatedPermissions: decision.always ? ctx.suggestions : undefined,
          };
        },
      },
    });

    void (async () => {
      try {
        for await (const message of q) for (const event of normalizer.handle(message)) onEvent(event);
      } catch (error) {
        if (!abort.signal.aborted) {
          const message = error instanceof Error ? error.message : String(error);
          log.warn("Claude Code session ended with an error", error);
          const notFound = /ENOENT|not found|spawn/i.test(message);
          onEvent({
            type: "error",
            code: "process",
            message: notFound
              ? `Claude Code could not be started (${message}). Check Settings → Claude Code.`
              : `Claude Code stopped: ${message}`,
          });
        }
      } finally {
        onEvent({ type: "exit" });
      }
    })();

    return {
      send(text, attachments = [], priority) {
        // Attachments go first, as content blocks (what Claude Code sends for pasted images and PDFs).
        const blocks = attachments.map((part) =>
          part.type === "image"
            ? {
                type: "image" as const,
                source: { type: "base64" as const, media_type: part.mime, data: part.data },
              }
            : part.type === "pdf"
              ? {
                  type: "document" as const,
                  title: part.name,
                  source: { type: "base64" as const, media_type: "application/pdf", data: part.data },
                }
              : { type: "text" as const, text: part.text },
        );
        const content = blocks.length
          ? [...blocks, ...(text ? [{ type: "text" as const, text }] : [])]
          : text;
        const uuid = randomUUID();
        input.push({
          type: "user",
          message: { role: "user", content },
          parent_tool_use_id: null,
          uuid,
          origin: { kind: "human" },
          ...(priority ? { priority } : {}),
        } as SDKUserMessage);
        return uuid;
      },
      async commands() {
        return (await q.supportedCommands()).map(commandFrom);
      },
      async models() {
        return (await q.supportedModels()).map((m) => ({
          value: m.value,
          displayName: m.displayName,
          description: m.description,
          ...(m.supportsEffort && m.supportedEffortLevels?.length
            ? { efforts: m.supportedEffortLevels }
            : {}),
        }));
      },
      setEffort: (effort) => q.applyFlagSettings({ effortLevel: effort }),
      async mcpStatus() {
        return (await q.mcpServerStatus()).map((s) => ({
          name: s.name,
          status: s.status,
          ...(s.error ? { error: s.error } : {}),
          ...(s.scope ? { scope: s.scope } : {}),
          ...(s.tools ? { tools: s.tools.length } : {}),
        }));
      },
      mcpReconnect: (name) => q.reconnectMcpServer(name),
      mcpToggle: (name, enabled) => q.toggleMcpServer(name, enabled),
      background: (toolUseId) => q.backgroundTasks(toolUseId),
      stopTask: (taskId) => q.stopTask(taskId),
      interrupt: async () => {
        await q.interrupt();
      },
      setModel: (model) => q.setModel(model || undefined),
      setPermissionMode: (mode: PermissionMode) => q.setPermissionMode(mode),
      async rewindFiles(messageId, dryRun) {
        const r = await q.rewindFiles(messageId, { dryRun });
        return {
          canRewind: r.canRewind,
          error: r.error,
          filesChanged: r.filesChanged,
          insertions: r.insertions,
          deletions: r.deletions,
        };
      },
      async contextUsage() {
        let timer: NodeJS.Timeout | undefined;
        try {
          const r = await Promise.race([
            q.getContextUsage({ detail: "summary" }),
            new Promise<undefined>((resolve) => {
              timer = setTimeout(() => resolve(undefined), 15_000);
            }),
          ]);
          return r ? contextFrom(r) : undefined;
        } catch (error) {
          log.debug("Context usage unavailable", error);
          return undefined;
        } finally {
          clearTimeout(timer);
        }
      },
      close() {
        input.close();
        abort.abort();
        try {
          q.close();
        } catch {
          // Already closed.
        }
      },
    };
  }

  async models(options: {
    env: Record<string, string | undefined>;
    claudePath: string;
  }): Promise<ModelInfo[]> {
    return this.control(options, async (q) =>
      (await q.supportedModels()).map((m) => ({
        value: m.value,
        displayName: m.displayName,
        description: m.description,
        ...(m.supportsEffort && m.supportedEffortLevels?.length ? { efforts: m.supportedEffortLevels } : {}),
      })),
    );
  }

  planUsage(options: { env: Record<string, string | undefined>; claudePath: string }): Promise<RawUsage> {
    return this.control(options, (q) =>
      q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true }),
    );
  }

  /** No prompt, tools or persisted chat: only SDK control requests, then close. */
  private async control<T>(
    options: { env: Record<string, string | undefined>; claudePath: string },
    read: (q: ReturnType<typeof query>) => Promise<T>,
  ): Promise<T> {
    const input = new AsyncQueue<SDKUserMessage>();
    const abort = new AbortController();
    const q = query({
      prompt: input,
      options: {
        cwd: homedir(),
        settingSources: [],
        tools: [],
        persistSession: false,
        env: options.env,
        pathToClaudeCodeExecutable: options.claudePath || undefined,
        abortController: abort,
        stderr: (data) => log.debug(`claude stderr (control): ${data.trimEnd()}`),
      },
    });
    const drain = (async () => {
      for await (const _ of q) {
        // Nothing is expected; keep the stream flowing.
      }
    })().catch(() => {});
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        read(q),
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Claude Code didn't answer in time")), 45_000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      input.close();
      abort.abort();
      try {
        q.close();
      } catch {
        // Already closed.
      }
      void drain;
    }
  }

  async oneShot(prompt: string, options: OneShotOptions): Promise<string> {
    let text = "";
    // A one-shot answer never takes this long; without a limit a hung process would block its caller.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), options.timeoutMs ?? 180_000);
    const q = query({
      prompt,
      options: {
        cwd: options.cwd,
        model: options.model || undefined,
        settingSources: [],
        systemPrompt: { type: "preset", preset: "claude_code", append: options.appendSystemPrompt },
        tools: [],
        maxTurns: 1,
        persistSession: false,
        env: options.env,
        pathToClaudeCodeExecutable: options.claudePath || undefined,
        abortController: abort,
      },
    });
    try {
      for await (const message of q) {
        if (message.type === "result") {
          if (message.subtype !== "success") throw new Error(message.errors?.join("\n") || message.subtype);
          text = message.result;
        }
      }
    } catch (error) {
      if (abort.signal.aborted) throw new Error("Claude Code didn't answer in time");
      throw error;
    } finally {
      clearTimeout(timer);
    }
    return text;
  }

  async callTool(request: ToolCallRequest, options: ToolCallOptions): Promise<ToolCallResult> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), options.timeoutMs ?? 90_000);
    const refuse = "Jig only allows the exact call it asked for.";
    const q = query({
      prompt: toolCallPrompt(request),
      options: {
        cwd: options.cwd,
        model: "haiku",
        settingSources: [],
        tools: [request.tool],
        maxTurns: 3,
        persistSession: false,
        env: options.env,
        pathToClaudeCodeExecutable: options.claudePath || undefined,
        abortController: abort,
        stderr: (data) => log.debug(`claude stderr (tool call): ${data.trimEnd()}`),
        // Both gates check the call: the hook runs for every tool use, canUseTool when Claude Code asks.
        hooks: {
          PreToolUse: [
            {
              hooks: [
                async (input) => {
                  const call = input as { tool_name?: string; tool_input?: unknown };
                  const ok = isRequestedCall(request, call.tool_name ?? "", call.tool_input);
                  return {
                    hookSpecificOutput: {
                      hookEventName: "PreToolUse" as const,
                      permissionDecision: ok ? ("allow" as const) : ("deny" as const),
                      permissionDecisionReason: ok ? undefined : refuse,
                    },
                  };
                },
              ],
            },
          ],
        },
        canUseTool: async (toolName, toolInput) =>
          isRequestedCall(request, toolName, toolInput)
            ? { behavior: "allow", updatedInput: toolInput }
            : { behavior: "deny", message: refuse },
      },
    });
    let result: ToolCallResult | undefined;
    try {
      for await (const message of q) {
        const m = message as {
          type: string;
          parent_tool_use_id?: string | null;
          tool_use_result?: unknown;
          message?: { content?: unknown };
        };
        if (m.type === "user" && !m.parent_tool_use_id && Array.isArray(m.message?.content)) {
          for (const block of m.message.content as Array<{
            type?: string;
            is_error?: boolean;
            content?: unknown;
          }>)
            if (block?.type === "tool_result")
              result = {
                ok: !block.is_error,
                text: toolOutputText(block.content),
                structured: m.tool_use_result,
              };
        }
        if (m.type === "result") break;
      }
    } catch (error) {
      if (abort.signal.aborted) throw new Error("Claude Code didn't answer in time");
      throw error;
    } finally {
      clearTimeout(timer);
      try {
        q.close();
      } catch {
        // Already closed.
      }
    }
    if (!result)
      throw new Error(
        `Claude Code didn't run ${request.tool}. It may not be available with your Claude Code version or sign-in.`,
      );
    return result;
  }
}
