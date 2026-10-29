import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { SessionMeta } from "../../shared/engine";
import type { ToolOutput } from "./types";

/**
 * The `jig` MCP server attached to every session: the only tools Jig adds to Claude Code. They let
 * any chat see the add-ons and ask Jig's builder for a new or changed tool. Handlers are provided by
 * the add-on host (phase 6) and the builder (phase 8); until then they answer that it isn't available.
 */
export interface JigToolHandlers {
  listAddons: () => Promise<string>;
  requestBuild: (input: { goal: string; addonId?: string; sessionId: string }) => Promise<string>;
}

/** More tools on the `jig` server, registered by other modules (configure: settings, themes, layout…). */
export interface JigTool {
  name: string;
  description: string;
  shape: z.ZodRawShape;
  /** Only reads: runs without asking the user (D-077). */
  readOnly?: boolean;
  handler: (args: Record<string, unknown>, meta: SessionMeta) => Promise<ToolOutput>;
}

let extraTools: JigTool[] = [];

export function registerJigTools(tools: JigTool[]): void {
  const names = new Set(tools.map((t) => t.name));
  extraTools = [...extraTools.filter((t) => !names.has(t.name)), ...tools];
}

/** True for `jig` tools that only read (`mcp__jig__jig_get_settings`, …): Jig doesn't ask before them. */
export function isReadOnlyJigTool(toolName: string): boolean {
  const name = /^mcp__jig__(.+)$/.exec(toolName)?.[1];
  return name === "jig_list_addons" || extraTools.some((t) => t.name === name && t.readOnly);
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
      "Tools of Jig, the desktop app this session runs in. To change how Jig looks or behaves where it is already configurable (settings, theme, fonts, file icons, layout, add-ons on/off, project names and colours) use the jig_get_*/jig_list_* tools to look and the jig_update_*/jig_change_*/jig_set_* tools to change it directly. Use jig_request_build only for something new (a tool, button, view, menu entry).",
    tools: [
      tool(
        "jig_list_addons",
        "List Jig's add-ons (built-in and the user's) with what they do and which slots they use.",
        {},
        async () => text(await handlers.listAddons()),
      ),
      tool(
        "jig_request_build",
        "Ask Jig's builder to create or change a tool in Jig (an add-on, or when no extension point exists, a proposal for one). The user sees a preview and accepts or discards it. For settings, themes and layout use the jig_update_settings / jig_change_layout tools instead. Describe the goal in the user's words plus any detail you know.",
        {
          goal: z.string().describe("What the user wants, in plain language"),
          addonId: z.string().optional().describe("An existing add-on to change, if the user named one"),
        },
        async ({ goal, addonId }) => text(await handlers.requestBuild({ goal, addonId, sessionId: meta.id })),
      ),
      ...extraTools.map((t) =>
        tool(t.name, t.description, t.shape, async (args) => {
          try {
            const out = await t.handler(args as Record<string, unknown>, meta);
            if (typeof out === "string") return text(out);
            return {
              content: [
                { type: "text" as const, text: out.text },
                ...(out.images ?? []).map((i) => ({
                  type: "image" as const,
                  data: i.data,
                  mimeType: i.mime,
                })),
              ],
            };
          } catch (error) {
            return { ...text(`Error: ${(error as Error).message}`), isError: true };
          }
        }),
      ),
    ],
  });
}

/** The jig tools as plain functions (for the fake engine's scripted sessions). */
export function jigToolHandlers(
  meta: SessionMeta,
): Record<string, (args: Record<string, unknown>) => Promise<ToolOutput>> {
  return {
    jig_list_addons: () => handlers.listAddons(),
    jig_request_build: (args) =>
      handlers.requestBuild({
        goal: String(args.goal ?? ""),
        addonId: args.addonId as string | undefined,
        sessionId: meta.id,
      }),
    ...Object.fromEntries(
      extraTools.map((t) => [t.name, (args: Record<string, unknown>) => t.handler(args, meta)]),
    ),
  };
}

/** Context appended to Claude Code's own system prompt (never replacing it). */
export function jigContext(
  meta: SessionMeta,
  project: { name: string; instructions?: string } | undefined,
): string {
  return [
    "You are running inside Jig, the user's desktop workbench around Claude Code.",
    project
      ? `This chat is in the user's project "${project.name}"; the working directory is ${meta.cwd}.`
      : `The working directory is ${meta.cwd}.`,
    ...(project?.instructions
      ? [`The user's instructions for chats in the project "${project.name}":\n${project.instructions}`]
      : []),
    "For long-running commands (dev servers, watchers, anything that keeps running) use jig_terminal_run, so the user sees them in a Jig terminal, then jig_terminal_read for their output; jig_terminal_list shows the project's terminals (including the user's own dev server). Use your own shell for commands that finish.",
    "To check web UI you build, use Claude's browser (a real offscreen page with its own size; the user can watch it in Jig): jig_browser_open the dev server, jig_browser_read for the text and numbered elements, jig_browser_click / jig_browser_type / jig_browser_press to use it, jig_browser_screenshot to see it (sizes: phone, tablet, desktop checks responsive layouts in one call; fullPage for the whole page), jig_browser_console for errors, jig_browser_network for the requests it makes (status, headers, bodies — debug API calls there instead of asking the user to copy them from their browser). It runs headless: the user isn't interrupted.",
    "For work that should run on a schedule, use Claude Code routines (the RemoteTrigger tool); the user sees and manages them in Jig's Routines tab. Pages you publish with the Artifact tool can be opened in Jig from the chat.",
    "When the user mentions work they do by hand, work outside Jig (portals, a VM, Postman, the browser's network tab), something that frustrates them or a chore, save it with jig_note_evidence (one short note, their words, no secrets); don't ask first and don't mention it beyond a few words — Jig shows a card they can remove. jig_read_profile tells you how they work; jig_update_profile adds what they ask Jig to remember.",
    "Jig adds tools (MCP server `jig`). When the user wants Jig configured — settings, theme, fonts, density, file icons, layout (move/hide/show/resize views, or show one view below another as a collapsible section in its tab, like GitLens below Source Control), add-ons on or off, projects (groups of chats the user manages: create one, its default workspace, default Git repository, model/effort/permission defaults, instructions and starter prompts; which chats are in which project, pinned chats) — use jig_get_settings / jig_list_themes / jig_get_layout / jig_list_projects to look and jig_update_settings / jig_change_layout / jig_set_addon_enabled / jig_create_project / jig_update_project / jig_move_chat / jig_install_theme to change it; the user approves each change and can undo it from the chat. When they ask for something new (a tool, button, view, menu entry), call jig_request_build with a clear goal. Never edit Jig's files yourself.",
  ].join("\n");
}
