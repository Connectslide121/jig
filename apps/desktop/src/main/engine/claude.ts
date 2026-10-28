import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { EngineEvent, PermissionMode } from "../../shared/engine";
import type { RawUsage } from "../../shared/usage";
import { logger } from "../log";
import { isReadOnlyJigTool } from "./jigTools";
import { contextFrom, Normalizer } from "./normalize";
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
      send(text, attachments = []) {
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

  async planUsage(options: {
    env: Record<string, string | undefined>;
    claudePath: string;
  }): Promise<RawUsage> {
    // A Claude Code process with no prompt: it answers control requests (here the data behind
    // `/usage`) without sending anything to Claude. Closed right after.
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
        stderr: (data) => log.debug(`claude stderr (usage): ${data.trimEnd()}`),
      },
    });
    const drain = (async () => {
      for await (const _ of q) {
        // Nothing is expected; keep the stream flowing.
      }
    })().catch(() => {});
    let timer: NodeJS.Timeout | undefined;
    try {
      return (await Promise.race([
        q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("Claude Code didn't answer in time")), 45_000);
        }),
      ])) as RawUsage;
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
