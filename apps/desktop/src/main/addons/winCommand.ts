import { existsSync } from "node:fs";
import { extname, isAbsolute, join } from "node:path";

/**
 * Windows can't start `.cmd`/`.bat` files (az, code, npm) without a shell, and `execFile` doesn't
 * search PATHEXT. This finds the real file and, for batch files, runs it through `cmd.exe /d /s /c`
 * with safe quoting (the approach of cross-spawn). On other systems the command is used as given.
 */
export interface Resolved {
  file: string;
  args: string[];
  verbatim: boolean;
}

export function findOnPath(
  command: string,
  env: Record<string, string | undefined>,
  exists: (path: string) => boolean = existsSync,
): string | undefined {
  const dirs = (env.PATH ?? env.Path ?? "").split(";").filter(Boolean);
  const exts = (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean);
  const candidates = extname(command) ? [command] : exts.map((e) => command + e.toLowerCase());
  if (isAbsolute(command) || command.includes("\\") || command.includes("/"))
    return candidates.find((c) => exists(c));
  for (const dir of dirs) for (const c of candidates) if (exists(join(dir, c))) return join(dir, c);
  return undefined;
}

/** Quotes one argument for cmd.exe (and the program's own argument parsing). */
export function quoteForCmd(arg: string): string {
  // Escape for the program (CommandLineToArgvW rules): backslashes before quotes, quotes doubled.
  let escaped = arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, "$1$1");
  escaped = `"${escaped}"`;
  // Escape cmd.exe metacharacters with ^ (including the quotes we added).
  return escaped.replace(/[()%!^"<>&|]/g, "^$&");
}

export function resolveCommand(
  command: string,
  args: string[],
  platform: string,
  env: Record<string, string | undefined>,
  exists: (path: string) => boolean = existsSync,
): Resolved {
  if (platform !== "win32") return { file: command, args, verbatim: false };
  const found = findOnPath(command, env, exists);
  if (!found || !/\.(cmd|bat)$/i.test(found)) return { file: found ?? command, args, verbatim: false };
  const line = [quoteForCmd(found), ...args.map(quoteForCmd)].join(" ");
  return { file: env.ComSpec ?? "cmd.exe", args: ["/d", "/s", "/c", `"${line}"`], verbatim: true };
}
