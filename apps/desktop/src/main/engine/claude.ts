import { randomUUID } from "node:crypto";
import { query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { EngineEvent, PermissionMode } from "../../shared/engine";
import { logger } from "../log";
import { Normalizer } from "./normalize";
import { AsyncQueue } from "./queue";
import type { Engine, EngineSession, OneShotOptions, StartOptions } from "./types";

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
        allowDangerouslySkipPermissions: options.permissionMode === "bypassPermissions",
        resume: options.resume,
        settingSources: ["user", "project", "local"],
        systemPrompt: { type: "preset", preset: "claude_code", append: options.appendSystemPrompt },
        includePartialMessages: true,
        env: options.env,
        pathToClaudeCodeExecutable: options.claudePath || undefined,
        // biome-ignore lint/suspicious/noExplicitAny: the SDK's MCP server config type is opaque here.
        mcpServers: options.mcpServers as any,
        abortController: abort,
        stderr: (data) => log.debug(`claude stderr: ${data.trimEnd()}`),
        canUseTool: async (toolName, toolInput, ctx) => {
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
      send(text, images = []) {
        // Images go first, as content blocks (what Claude Code does for pasted images).
        const content = images.length
          ? [
              ...images.map((i) => ({
                type: "image" as const,
                source: { type: "base64" as const, media_type: i.mime, data: i.data },
              })),
              ...(text ? [{ type: "text" as const, text }] : []),
            ]
          : text;
        input.push({
          type: "user",
          message: { role: "user", content },
          parent_tool_use_id: null,
        } as SDKUserMessage);
      },
      interrupt: async () => {
        await q.interrupt();
      },
      setModel: (model) => q.setModel(model || undefined),
      setPermissionMode: (mode: PermissionMode) => q.setPermissionMode(mode),
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

  async oneShot(prompt: string, options: OneShotOptions): Promise<string> {
    let text = "";
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
      },
    });
    for await (const message of q) {
      if (message.type === "result") {
        if (message.subtype !== "success") throw new Error(message.errors?.join("\n") || message.subtype);
        text = message.result;
      }
    }
    return text;
  }
}
