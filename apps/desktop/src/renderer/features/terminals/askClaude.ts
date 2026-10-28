import type { TerminalInfo } from "../../../shared/terminals";
import { call, errorMessage } from "../../lib/host";
import { useProjects } from "../../workbench/projects";
import { notify } from "../../workbench/toasts";
import { newSession } from "../sessions/actions";

/** Removes terminal colour and cursor codes, and carriage-return redraws (progress bars). */
export function plainOutput(raw: string): string {
  return (
    raw
      // biome-ignore lint/suspicious/noControlCharactersInRegex: matching terminal escape codes is the point.
      .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, "") // OSC (titles, shell integration)
      // biome-ignore lint/suspicious/noControlCharactersInRegex: matching terminal escape codes is the point.
      .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "") // CSI (colours, cursor)
      // biome-ignore lint/suspicious/noControlCharactersInRegex: matching terminal escape codes is the point.
      .replace(/\x1b[@-_]/g, "")
      .split("\n")
      .map((line) => line.replace(/\r$/, "").split("\r").pop() ?? "")
      .join("\n")
  );
}

/** The end of the output: at most `lines` lines and `chars` characters. */
export function outputTail(raw: string, lines = 120, chars = 12_000): string {
  const text = plainOutput(raw)
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
  const tail = text.split("\n").slice(-lines).join("\n");
  return tail.length > chars ? tail.slice(-chars) : tail;
}

const inside = (path: string, root: string) => {
  const norm = (p: string) => p.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
  return norm(path) === norm(root) || norm(path).startsWith(`${norm(root)}/`);
};

/** The request for Claude about a terminal's output (a failed script, or any output). */
export function askClaudeDraft(t: TerminalInfo, output: string): string {
  const what = t.command ? `\`${t.command}\`` : "this terminal";
  const failed = t.status === "exited" && t.exitCode !== undefined && t.exitCode !== 0;
  return [
    failed
      ? `${t.title} (${what}) failed with exit code ${t.exitCode} in ${t.cwd}. Find the cause and fix it.`
      : `Look at the output of ${t.title} (${what}) in ${t.cwd} and tell me what's wrong, if anything.`,
    `End of the output:\n\`\`\`\n${output}\n\`\`\``,
  ].join("\n\n");
}

/** Opens a chat (in the terminal's folder when it's inside its project) with the output typed in. */
export async function askClaudeAboutTerminal(t: TerminalInfo): Promise<void> {
  try {
    const raw = await call("terminals.buffer", { id: t.id });
    const projectId = t.projectId ?? useProjects.getState().activeId;
    const project = useProjects.getState().projects.find((p) => p.id === projectId);
    const cwd = project && inside(t.cwd, project.path) ? t.cwd : undefined;
    await newSession(projectId, cwd, askClaudeDraft(t, outputTail(raw) || "(no output)"));
  } catch (error) {
    notify({ title: "Couldn't ask Claude", message: errorMessage(error), tone: "danger" });
  }
}

/** Running → exited with an error, for a command (not an interactive shell, not a private terminal). */
export function newlyFailed(before: TerminalInfo[], after: TerminalInfo[]): TerminalInfo[] {
  const was = new Map(before.map((t) => [t.id, t.status]));
  return after.filter(
    (t) =>
      t.command &&
      !t.private &&
      t.status === "exited" &&
      t.exitCode !== undefined &&
      t.exitCode !== 0 &&
      was.get(t.id) === "running",
  );
}
