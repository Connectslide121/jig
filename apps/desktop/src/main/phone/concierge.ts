import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { SessionMeta } from "../../shared/engine";
import { JigError } from "../../shared/ipc";
import type { PhoneChannelId } from "../../shared/phone";
import { getConfig } from "../config";
import { jigToolServer } from "../engine/jigTools";
import type { ChatTool } from "../engine/types";
import { projectStore } from "../projects";
import { createChat, registerSessionKind, sessionManager } from "../sessions";
import { jigHome } from "../state/paths";
import { lastReply } from "./messages";

/**
 * Jig itself on your phone (D-350): a chat of its own kind that answers what you write to the bot
 * outside a chat's messages. It has Jig's tools (projects, queues, boards…) and the chat tools below,
 * and none of Claude Code's own (no files, no shell): work goes to a chat it starts in a project.
 */
export const conciergePrompt = (
  channel: PhoneChannelId,
) => `You are Jig itself, the user's desktop workbench for AI coding chats, answering them on their phone (a ${channel === "teams" ? "Teams" : "Telegram"} bot) while they're away from the computer.

- Answer briefly: a few short lines of plain text, no tables or headings. The phone shows your last reply of each turn.
- You can't read or change files or run commands. To get work done, start a chat in the right project with jig_chat_start and a clear prompt (what to look at, what to produce). New chats start in plan mode: when the plan is ready the user approves it on their phone. Use mode "default" only when the user clearly asks for the work to be done directly; the chat still asks before it changes anything.
- jig_chat_open opens a chat on their phone as a room (they follow it live and write to it there): use it when they ask to see, open or join a chat. jig_phone_close_room (with the chat's id) closes a room when they ask, as /close in it does: only the room, the chat goes on.
- jig_usage_limits tells how much of their Claude and ChatGPT plan limits is used, what is left and when each resets: use it when they ask about usage, limits or how much is left.
- jig_chats_list and jig_chat_read tell how chats are doing; jig_chat_send writes to a running chat (the user approves it). The Tasks add-on's tools read and change task queues; the Boards add-on's tools read and update Azure DevOps cards; jig_list_projects lists projects.
- Answer questions about pipelines and repositories yourself, with the add-on tools (find them with the tool search), instead of starting a chat: addon_pipelines_runs (state "running" for "is anything running or deploying?", "failed" for what broke), addon_pipelines_run (one run's stages, failed step and log), addon_pipelines_pipelines (each pipeline's newest run); addon_repos_status (branch, to push / to pull, uncommitted changes per repository) and addon_repos_commits. addon_tests_list gives test suites' last results.
- Each message says which topic it was written in. A project's topic means that project unless the user names another. When it's unclear which project, ask.
- Never approve, deny or answer anything waiting in another chat: the user does that with the buttons. Never run pipelines or deploys.
- After starting a chat, say so briefly: it opens on their phone as a room of its own, where they follow it live and write to it.`;

const chatLine = (m: SessionMeta, projects: Map<string, string>) =>
  `${m.id} · ${m.title} · ${m.projectId ? (projects.get(m.projectId) ?? "unknown project") : "no project"} · ${m.status} · ${m.updatedAt}`;

async function projectNames(): Promise<Map<string, string>> {
  return new Map((await projectStore().list()).map((p) => [p.id, p.name]));
}

const userChat = (m: SessionMeta) => !m.draft && (!m.kind || m.kind === "chat");

let startedChat: ((sessionId: string) => Promise<void> | void) | undefined;
/** Opens a chat as a room on the phone: one Jig started for you there, or one you asked to see. */
export function onConciergeStartedChat(listener: (sessionId: string) => Promise<void> | void): void {
  startedChat = listener;
}

/** The chat tools only Jig's own chat on your phone has. */
export const conciergeTools: ChatTool[] = [
  {
    name: "jig_chats_list",
    description:
      "List the user's chats, newest first: id · title · project · status (working, needs_you, idle, error) · last change. Optionally only one project's.",
    shape: { projectId: z.string().optional().describe("Only this project's chats") },
    readOnly: true,
    alwaysLoad: true,
    handler: async (args) => {
      const projects = await projectNames();
      const chats = (await sessionManager().list())
        .filter(userChat)
        .filter((m) => !args.projectId || m.projectId === args.projectId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 30);
      return chats.length ? chats.map((m) => chatLine(m, projects)).join("\n") : "No chats.";
    },
  },
  {
    name: "jig_chat_read",
    description:
      "Read where a chat is: its status, what waits for the user there, and the end of Jig's last reply.",
    shape: { chatId: z.string().describe("The chat's id from jig_chats_list") },
    readOnly: true,
    alwaysLoad: true,
    handler: async (args) => {
      const { meta, items } = await sessionManager().snapshot(String(args.chatId));
      const projects = await projectNames();
      const waiting = items
        .filter((i) => i.kind === "permission" && i.status === "pending")
        .map((i) => (i.kind === "permission" ? `- ${i.request.title ?? i.request.toolName}` : ""));
      const reply = lastReply(items);
      return [
        chatLine(meta, projects),
        waiting.length ? `Waiting for the user:\n${waiting.join("\n")}` : "Nothing waits for the user.",
        reply ? `Last reply (end):\n${reply.slice(-3000)}` : "No reply since the user's last message.",
      ].join("\n\n");
    },
  },
  {
    name: "jig_chat_start",
    description:
      "Start a new chat in a project and send it a first message. It starts in plan mode unless mode is default. Its messages reach the user's phone in the project's topic.",
    shape: {
      projectId: z.string().describe("The project's id (jig_list_projects)"),
      prompt: z.string().min(1).describe("The first message: what to do, in full"),
      mode: z.enum(["plan", "default"]).optional().describe("plan (default) or default"),
    },
    // It only starts a chat: that chat asks before it changes anything, and its plan waits for the user.
    readOnly: true,
    alwaysLoad: true,
    handler: async (args) => {
      const projectId = String(args.projectId);
      const project = (await projectStore().list()).find((p) => p.id === projectId);
      if (!project) throw new JigError("not_found", "No project has that id. Use jig_list_projects.");
      const meta = await createChat({
        projectId,
        permissionMode: args.mode === "default" ? "default" : "plan",
        limitFallback: true,
      });
      await sessionManager().send(meta.id, String(args.prompt), [], true);
      await Promise.resolve(startedChat?.(meta.id)).catch(() => undefined);
      return `Started a chat (id ${meta.id}) in ${project.name}. It opens on the user's phone as a room of its own (when their bot has topics), where they follow it and write to it.`;
    },
  },
  {
    name: "jig_chat_open",
    description:
      "Open one of the user's chats on their phone as a room: a topic of its own with its last turns, then everything it does, live, where they write to it. Use it when they ask to see, open, follow or join a chat (find its id with jig_chats_list first).",
    shape: { chatId: z.string().describe("The chat's id from jig_chats_list") },
    readOnly: true,
    alwaysLoad: true,
    handler: async (args) => {
      const { meta } = await sessionManager().snapshot(String(args.chatId));
      if (!userChat(meta)) throw new JigError("forbidden", "Only the user's own chats.");
      if (!startedChat) throw new JigError("not_connected", "The phone isn't connected.");
      await startedChat(meta.id);
      return `Opened “${meta.title}” on the user's phone in a topic of its own.`;
    },
  },
  {
    name: "jig_chat_send",
    description:
      "Send a message to one of the user's chats (into its running turn, or as its next message). The user approves it first.",
    shape: {
      chatId: z.string().describe("The chat's id from jig_chats_list"),
      text: z.string().min(1).describe("The message"),
    },
    alwaysLoad: true,
    handler: async (args) => {
      const { meta } = await sessionManager().snapshot(String(args.chatId));
      if (!userChat(meta)) throw new JigError("forbidden", "Only the user's own chats.");
      await sessionManager().send(meta.id, String(args.text), [], true);
      return `Sent to “${meta.title}”.`;
    },
  },
];

/** Registers the kind: its prompt and tools, no built-in tools but the tool search. */
export function registerConcierge(): void {
  registerSessionKind("concierge", {
    appendSystemPrompt: () => conciergePrompt(getConfig().phone.channel),
    toolServers: (meta) => {
      const jig = jigToolServer(meta);
      return { jig: { ...jig, tools: [...jig.tools, ...conciergeTools] } };
    },
    builtinTools: ["ToolSearch"],
  });
}

/** Today's chat with Jig on your phone, or a new one (one a day, so it stays short). */
export async function conciergeChat(): Promise<SessionMeta> {
  const m = sessionManager();
  const today = new Date().toISOString().slice(0, 10);
  const existing = (await m.list())
    .filter((c) => c.kind === "concierge" && c.createdAt.startsWith(today))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (existing) return existing;
  const cwd = join(jigHome(), "phone");
  await mkdir(cwd, { recursive: true });
  return m.create({
    cwd,
    title: `Jig on your phone · ${today}`,
    model: getConfig().engine.helperModel || "sonnet",
    permissionMode: "default",
    kind: "concierge",
  });
}
