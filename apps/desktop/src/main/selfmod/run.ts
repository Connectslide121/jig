import { spawn } from "node:child_process";

/**
 * Runs one of the configured commands (check, build, install) in a folder, through the shell (they
 * are command lines like `npm run check`). Keeps the last 40 000 characters of output.
 */
export interface CommandResult {
  ok: boolean;
  code: number | null;
  output: string;
  timedOut: boolean;
}

const KEEP = 40_000;

export function runCommand(
  command: string,
  cwd: string,
  options: { env?: Record<string, string | undefined>; timeoutMs?: number } = {},
): Promise<CommandResult> {
  return new Promise((resolve) => {
    let output = "";
    let timedOut = false;
    const child = spawn(command, {
      cwd,
      shell: true,
      env: { ...process.env, ...options.env, FORCE_COLOR: "0", CI: "1" },
      windowsHide: true,
    });
    const add = (d: Buffer) => {
      output = (output + d.toString()).slice(-KEEP);
    };
    child.stdout?.on("data", add);
    child.stderr?.on("data", add);
    const timer = setTimeout(
      () => {
        timedOut = true;
        child.kill();
      },
      options.timeoutMs ?? 20 * 60_000,
    );
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, code: null, output: `${output}\n${error.message}`, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0 && !timedOut, code, output, timedOut });
    });
  });
}
