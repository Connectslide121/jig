import { randomUUID } from "node:crypto";
import type { IPty } from "@lydell/node-pty";
import { JigError } from "../../shared/ipc";
import type { TerminalInfo } from "../../shared/terminals";
import { logger } from "../log";
import { commandArgs, interactiveArgs, LineTracker } from "./shell";

const log = logger("terminals");

/** Scrollback kept per terminal so a reloaded window can redraw it (characters). */
const SCROLLBACK_CHARS = 400_000;
/** Output is batched for the renderer at most this often (ms). */
const FLUSH_MS = 16;

type Spawn = (file: string, args: string[], options: Record<string, unknown>) => IPty;

export interface TerminalManagerOptions {
  spawn: Spawn;
  platform?: string;
  shell: () => string;
  env: () => Record<string, string | undefined>;
  onData: (id: string, data: string) => void;
  onChange: (terminals: TerminalInfo[]) => void;
  /** A command typed into an interactive (non-private) terminal, for the activity log. */
  onCommand?: (terminal: TerminalInfo, command: string) => void;
}

interface Live {
  info: TerminalInfo;
  pty?: IPty;
  buffer: string;
  pending: string;
  timer?: NodeJS.Timeout;
  lines?: LineTracker;
}

export interface CreateTerminal {
  cwd: string;
  projectId?: string;
  title?: string;
  /** Run this command (and exit with its status) instead of an interactive shell. */
  command?: string;
  /** Run this executable directly with `args` (e.g. Claude Code for sign-in). */
  file?: string;
  args?: string[];
  scriptId?: string;
  private?: boolean;
  cols?: number;
  rows?: number;
}

/** One pty per terminal (`@lydell/node-pty`, prebuilt — no compiler needed on Windows). */
export class TerminalManager {
  private terminals = new Map<string, Live>();
  private readonly platform: string;

  constructor(private readonly options: TerminalManagerOptions) {
    this.platform = options.platform ?? process.platform;
  }

  list(): TerminalInfo[] {
    return [...this.terminals.values()].map((t) => t.info);
  }

  get(id: string): TerminalInfo {
    return this.live(id).info;
  }

  private live(id: string): Live {
    const live = this.terminals.get(id);
    if (!live) throw new JigError("not_found", "Terminal not found");
    return live;
  }

  private changed() {
    this.options.onChange(this.list());
  }

  create(input: CreateTerminal): TerminalInfo {
    const shell = this.options.shell();
    const file = input.file ?? shell;
    const args = input.file
      ? (input.args ?? [])
      : input.command
        ? commandArgs(shell, input.command, this.platform)
        : interactiveArgs(shell, this.platform);
    const info: TerminalInfo = {
      id: randomUUID(),
      projectId: input.projectId,
      cwd: input.cwd,
      title: input.title ?? (input.command ? input.command : shellName(shell)),
      shell: file,
      command: input.command ?? (input.file ? [input.file, ...(input.args ?? [])].join(" ") : undefined),
      scriptId: input.scriptId,
      status: "running",
      createdAt: new Date().toISOString(),
      private: input.private || undefined,
    };
    const live: Live = { info, buffer: "", pending: "" };
    this.terminals.set(info.id, live);
    try {
      live.pty = this.options.spawn(file, args, {
        name: "xterm-256color",
        cols: input.cols ?? 100,
        rows: input.rows ?? 30,
        cwd: input.cwd,
        env: { ...this.options.env(), TERM: "xterm-256color", COLORTERM: "truecolor", TERM_PROGRAM: "Jig" },
      });
    } catch (error) {
      log.warn(`Could not start ${file}`, error);
      const message = `\r\n\x1b[31mCould not start ${file}: ${(error as Error).message}\x1b[0m\r\nCheck Settings → Terminal.\r\n`;
      this.push(live, message);
      live.info = { ...info, status: "exited", exitCode: -1 };
      this.changed();
      return live.info;
    }
    if (!input.command && !input.file && !input.private && this.options.onCommand) {
      live.lines = new LineTracker((line) => this.options.onCommand?.(live.info, line));
    }
    live.pty.onData((data) => this.push(live, data));
    live.pty.onExit(({ exitCode }) => {
      this.flush(live);
      live.pty = undefined;
      live.info = { ...live.info, status: "exited", exitCode };
      this.push(live, `\r\n\x1b[2m[process exited with code ${exitCode}]\x1b[0m\r\n`);
      this.changed();
    });
    this.changed();
    return info;
  }

  private push(live: Live, data: string) {
    live.buffer += data;
    if (live.buffer.length > SCROLLBACK_CHARS) live.buffer = live.buffer.slice(-SCROLLBACK_CHARS);
    live.pending += data;
    live.timer ??= setTimeout(() => this.flush(live), FLUSH_MS);
  }

  private flush(live: Live) {
    clearTimeout(live.timer);
    live.timer = undefined;
    if (!live.pending) return;
    const data = live.pending;
    live.pending = "";
    this.options.onData(live.info.id, data);
  }

  write(id: string, data: string): void {
    const live = this.live(id);
    live.lines?.feed(data);
    live.pty?.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    const live = this.live(id);
    if (!live.pty || cols < 2 || rows < 1) return;
    try {
      live.pty.resize(Math.floor(cols), Math.floor(rows));
    } catch {
      // The process may have just exited.
    }
  }

  /** The scrollback so far (to redraw after a window reload). */
  buffer(id: string): string {
    return this.live(id).buffer;
  }

  rename(id: string, title: string): void {
    const live = this.live(id);
    live.info = { ...live.info, title: title.trim() || live.info.title };
    this.changed();
  }

  /** Stops the process; the terminal stays open showing its output. */
  kill(id: string): void {
    const live = this.live(id);
    try {
      live.pty?.kill();
    } catch (error) {
      log.warn("Kill failed", error);
    }
  }

  /** Kills (if running) and removes the terminal. */
  close(id: string): void {
    const live = this.terminals.get(id);
    if (!live) return;
    clearTimeout(live.timer);
    try {
      live.pty?.kill();
    } catch {
      // Already gone.
    }
    this.terminals.delete(id);
    this.changed();
  }

  closeAll(): void {
    for (const id of [...this.terminals.keys()]) this.close(id);
  }
}

export function shellName(shell: string): string {
  return (shell.replaceAll("\\", "/").split("/").pop() ?? shell).replace(/\.exe$/i, "");
}
