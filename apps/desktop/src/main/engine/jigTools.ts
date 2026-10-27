import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { SessionMeta } from "../../shared/engine";

/**
 * The `jig` MCP server attached to every session: the only tools Jig adds to Claude Code. They let
 * any chat see the add-ons and ask Jig's builder for a new or changed tool. Handlers are provided by
 * the add-on host (phase 6) and the builder (phase 8); until then they answer that it isn't available.
 */
export interface JigToolHandlers {
  listAddons: () => Promise<string>;
  requestBuild: (input: { goal: string; addonId?: string; sessionId: string }) => Promise<string>;
}

let handlers: JigToolHandlers = {
  listAddons: async () => "No add-ons are installed yet.",
  requestBuild: async () => "Jig's builder is not available in this version yet.",
};

export function setJigToolHandlers(next: Partial<JigToolHandlers>): void {
  handlers = { ...handlers, ...next };
}

export function jigMcpServer(meta: SessionMeta) {
  const text = (value: string) => ({ content: [{ type: "text" as const, text: value }] });
  return createSdkMcpServer({
    name: "jig",
    version: "1.0.0",
    instructions:
      "Tools of Jig, the desktop app this session runs in. Use jig_request_build when the user wants a new tool, button, view, menu entry, layout change or other change to Jig itself.",
    tools: [
      tool(
        "jig_list_addons",
        "List Jig's add-ons (built-in and the user's) with what they do and which slots they use.",
        {},
        async () => text(await handlers.listAddons()),
      ),
      tool(
        "jig_request_build",
        "Ask Jig's builder to create or change a tool in Jig (a layout/setting change, an add-on, or as a last resort Jig's own code). The user sees a preview and accepts or discards it. Describe the goal in the user's words plus any detail you know.",
        {
          goal: z.string().describe("What the user wants, in plain language"),
          addonId: z.string().optional().describe("An existing add-on to change, if the user named one"),
        },
        async ({ goal, addonId }) => text(await handlers.requestBuild({ goal, addonId, sessionId: meta.id })),
      ),
    ],
  });
}

/** Context appended to Claude Code's own system prompt (never replacing it). */
export function jigContext(meta: SessionMeta, projectName: string | undefined): string {
  return [
    "You are running inside Jig, the user's desktop workbench around Claude Code.",
    projectName
      ? `The current project is "${projectName}" at ${meta.cwd}.`
      : `The working directory is ${meta.cwd}.`,
    "Jig adds two tools (MCP server `jig`): jig_list_addons and jig_request_build. When the user asks for a new tool, button, view, menu entry or a change to Jig itself, call jig_request_build with a clear goal instead of editing Jig's files yourself.",
  ].join("\n");
}
