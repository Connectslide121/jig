import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import type { TerminalInfo } from "../../shared/terminals";
import { outputTail } from "../../shared/terminalText";
import type { JigTool } from "../engine/jigTools";
import { isInside } from "../themes/sources";
import type { FinishedTerminals } from "./autoClose";
import type { TerminalManager } from "./manager";

const describe = (t: TerminalInfo) =>
  `${t.id} — "${t.title}"${t.command ? ` (${t.command})` : ""} in ${t.cwd}: ${
    t.status === "running" ? "running" : `exited with code ${t.exitCode}`
  }${t.sessionId ? " [started by Jig]" : ""}`;

/**
 * What a chat is told when a terminal it started finishes by itself (not stopped): the message Claude
 * gets, with the end of the output, and the line the transcript shows for it.
 */
export function exitNotice(t: TerminalInfo, raw: string): { text: string; from: string } {
  const title = t.title.replace(/^Claude: /, "");
  const code = t.exitCode ?? 0;
  const tail = outputTail(raw, 40, 6_000) || "(no output)";
  return {
    text: `(Sent by Jig, not by the user.) Terminal ${t.id} "${title}"${t.command ? ` (${t.command})` : ""}, which you started, has exited with code ${code}. Its last lines:\n\n${tail}\n\nCarry on with what you were doing; jig_terminal_read shows more of its output.`,
    from: `Terminal "${title}" ${code === 0 ? "finished" : `failed with exit code ${code}`}`,
  };
}

/**
 * Terminals for Claude: long-running commands (dev servers, watchers, test runners in watch mode) run
 * in Jig's own terminals, where the user sees them and can stop them, instead of hidden in Claude's
 * shell. Claude can read any terminal of the chat's project (except private ones such as the sign-in).
 */
export function terminalTools(deps: {
  manager: () => TerminalManager;
  projectPath: (projectId: string | undefined) => Promise<string | undefined>;
  reveal: (id: string) => void;
  /** Finished Claude terminals close by themselves (D-373); `hold` keeps one open while run answers. */
  finished?: Pick<FinishedTerminals, "hold" | "release" | "forget">;
}): JigTool[] {
  const visible = (projectId: string | undefined) =>
    deps
      .manager()
      .list()
      .filter((t) => !t.private && t.projectId === projectId);
  const find = (projectId: string | undefined, id: string) => {
    const t = visible(projectId).find((x) => x.id === id || x.id.startsWith(id));
    if (!t) throw new Error(`No terminal ${id} in this project; jig_terminal_list shows them`);
    return t;
  };
  return [
    {
      name: "jig_terminal_run",
      description:
        "Start a long-running command (dev server, watcher, `npm run dev`, a test runner in watch mode) in a terminal the user sees in Jig. Returns its id; read its output with jig_terminal_read. When it exits by itself, Jig sends this chat a message with its exit code and last lines, so don't poll it with sleep timers: end your turn and wait; the terminal then closes by itself. Stop it with jig_terminal_stop once you no longer need it (e.g. a dev server after testing). Use your own shell for commands that finish quickly.",
      shape: {
        command: z.string().describe("The command, run by the user's shell"),
        title: z.string().optional().describe("Short name shown in the terminal list"),
        cwd: z
          .string()
          .optional()
          .describe("Folder (default: this chat's folder); must be inside the project"),
      },
      handler: async (args, meta) => {
        const root = (await deps.projectPath(meta.projectId)) ?? meta.cwd;
        const cwd =
          typeof args.cwd === "string" && args.cwd
            ? isAbsolute(args.cwd)
              ? args.cwd
              : resolve(meta.cwd, args.cwd)
            : meta.cwd;
        if (!isInside(cwd, root) && !isInside(cwd, meta.cwd))
          throw new Error("The folder must be inside the project");
        const t = deps.manager().create({
          projectId: meta.projectId,
          cwd,
          command: String(args.command),
          title: `Claude: ${typeof args.title === "string" && args.title ? args.title : String(args.command).slice(0, 40)}`,
          sessionId: meta.id,
        });
        deps.reveal(t.id);
        // Give it a moment, so the first output (a port, an error) comes back with the answer; a
        // command that already exited waits to close until then (D-373).
        deps.finished?.hold(t.id);
        try {
          await new Promise((r) => setTimeout(r, 1500));
          const now = deps.manager().get(t.id);
          return `Started terminal ${t.id} (${now.status === "running" ? "running" : `exited with code ${now.exitCode}`}). First output:\n${outputTail(deps.manager().buffer(t.id), 30) || "(nothing yet)"}`;
        } finally {
          deps.finished?.release(t.id);
        }
      },
    },
    {
      name: "jig_terminal_read",
      readOnly: true,
      description:
        "Read the latest output of a terminal in this project (yours or the user's, e.g. their dev server), plain text without colours.",
      shape: {
        id: z.string().describe("Terminal id from jig_terminal_run or jig_terminal_list"),
        lines: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe("How many of the last lines (default 80)"),
      },
      handler: async (args, meta) => {
        const t = find(meta.projectId, String(args.id));
        const lines = typeof args.lines === "number" ? args.lines : 80;
        return `${describe(t)}\n\n${outputTail(deps.manager().buffer(t.id), lines, 40_000) || "(no output)"}`;
      },
    },
    {
      name: "jig_terminal_list",
      readOnly: true,
      description:
        "List the terminals of this project (scripts, dev servers, the user's shells) with their status.",
      shape: {},
      handler: async (_args, meta) =>
        visible(meta.projectId).map(describe).join("\n") || "No terminals are open in this project.",
    },
    {
      name: "jig_terminal_stop",
      description:
        "Stop a terminal you started and close it, once you no longer need it (a dev server after testing, a watcher). Read its output with jig_terminal_read first if you still need it.",
      shape: { id: z.string() },
      handler: async (args, meta) => {
        const t = find(meta.projectId, String(args.id));
        if (t.sessionId !== meta.id)
          throw new Error("Only terminals this chat started can be stopped; ask the user to stop the others");
        deps.finished?.forget(t.id);
        deps.manager().close(t.id);
        return `Stopped and closed ${t.id}.`;
      },
    },
  ];
}
