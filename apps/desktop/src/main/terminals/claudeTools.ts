import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import type { TerminalInfo } from "../../shared/terminals";
import { outputTail } from "../../shared/terminalText";
import type { JigTool } from "../engine/jigTools";
import { isInside } from "../themes/sources";
import type { TerminalManager } from "./manager";

const describe = (t: TerminalInfo) =>
  `${t.id} — "${t.title}"${t.command ? ` (${t.command})` : ""} in ${t.cwd}: ${
    t.status === "running" ? "running" : `exited with code ${t.exitCode}`
  }${t.sessionId ? " [started by Claude]" : ""}`;

/**
 * Terminals for Claude: long-running commands (dev servers, watchers, test runners in watch mode) run
 * in Jig's own terminals, where the user sees them and can stop them, instead of hidden in Claude's
 * shell. Claude can read any terminal of the chat's project (except private ones such as the sign-in).
 */
export function terminalTools(deps: {
  manager: () => TerminalManager;
  projectPath: (projectId: string | undefined) => Promise<string | undefined>;
  reveal: (id: string) => void;
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
        "Start a long-running command (dev server, watcher, `npm run dev`, a test runner in watch mode) in a terminal the user sees in Jig. Returns its id; read its output with jig_terminal_read. Use your own shell for commands that finish quickly.",
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
        // Give it a moment, so the first output (a port, an error) comes back with the answer.
        await new Promise((r) => setTimeout(r, 1500));
        const now = deps.manager().get(t.id);
        return `Started terminal ${t.id} (${now.status === "running" ? "running" : `exited with code ${now.exitCode}`}). First output:\n${outputTail(deps.manager().buffer(t.id), 30) || "(nothing yet)"}`;
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
        "Stop the process in a terminal you started (the terminal stays, so its output can still be read).",
      shape: { id: z.string() },
      handler: async (args, meta) => {
        const t = find(meta.projectId, String(args.id));
        if (t.sessionId !== meta.id)
          throw new Error("Only terminals this chat started can be stopped; ask the user to stop the others");
        deps.manager().kill(t.id);
        return `Stopped ${t.id}.`;
      },
    },
  ];
}
