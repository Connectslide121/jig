/** Terminals and scripts as the renderer sees them. Documented in docs/reference/terminals.md. */
export interface TerminalInfo {
  id: string;
  projectId?: string;
  cwd: string;
  title: string;
  shell: string;
  /** The command the terminal was started for (a script, `claude` for sign-in); empty = interactive shell. */
  command?: string;
  scriptId?: string;
  status: "running" | "exited";
  exitCode?: number;
  createdAt: string;
  /** Nothing typed or shown here is recorded in the activity log (e.g. the Claude Code sign-in). */
  private?: boolean;
  /** Started by Claude from this chat (jig_terminal_run). */
  sessionId?: string;
}

export type ScriptKind = "npm" | "ps1" | "sh" | "cmd" | "dotnet-run" | "dotnet-watch" | "func";

export interface Script {
  /** Stable within a project: `<kind>:<folder>:<name>`. */
  id: string;
  name: string;
  kind: ScriptKind;
  /** Folder relative to the project root (`""` = root), with forward slashes. */
  folder: string;
  /** Absolute working directory. */
  cwd: string;
  command: string;
  /** e.g. the npm script's body. */
  detail?: string;
}

export interface ScriptGroup {
  id: string;
  name: string;
  scriptIds: string[];
}

export interface ProjectScripts {
  projectId: string;
  scripts: Script[];
  groups: ScriptGroup[];
}
