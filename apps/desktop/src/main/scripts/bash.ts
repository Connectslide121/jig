import { win32 } from "node:path";

/** What the terminal's shell is, as far as quoting a command goes (see `shellFamily` in terminals/shell.ts). */
export type ShellKind = "powershell" | "cmd" | "posix";

type Env = Record<string, string | undefined>;

/**
 * Git for Windows' `bash.exe`: the usual install folders, then the Git found on PATH (`<root>\cmd\git.exe`
 * or `<root>\mingw64\bin\git.exe` → `<root>\bin\bash.exe`). Never `System32\bash.exe`, which is WSL and
 * runs the script inside Linux. `exists` is injected so it's unit-tested.
 */
export function findGitBash(env: Env, exists: (path: string) => boolean): string | undefined {
  const get = (name: string) => env[name] ?? env[name.toUpperCase()];
  const roots = [
    get("ProgramFiles") && win32.join(get("ProgramFiles") as string, "Git"),
    get("ProgramW6432") && win32.join(get("ProgramW6432") as string, "Git"),
    get("ProgramFiles(x86)") && win32.join(get("ProgramFiles(x86)") as string, "Git"),
    get("LOCALAPPDATA") && win32.join(get("LOCALAPPDATA") as string, "Programs", "Git"),
  ];
  for (const dir of (get("PATH") ?? get("Path") ?? "").split(";").filter(Boolean))
    if (exists(win32.join(dir, "git.exe"))) roots.push(win32.join(dir, ".."), win32.join(dir, "..", ".."));
  for (const root of roots) {
    if (!root) continue;
    const bash = win32.join(root, "bin", "bash.exe");
    if (!/[\\/]windows[\\/]system32[\\/]/i.test(bash) && exists(bash)) return bash;
  }
  return undefined;
}

/**
 * The command that runs a `.sh` file. On Windows it uses the Git Bash found (quoted for the shell it
 * runs in: PowerShell needs `&` in front of a quoted path, cmd doesn't, a bash shell just says `bash`);
 * without one it stays `bash` and the row's detail says what's missing.
 */
export function shellScriptCommand(
  file: string,
  options: { platform: string; bash?: string; shell?: ShellKind },
): { command: string; detail?: string } {
  const plain = `bash "./${file}"`;
  if (options.platform !== "win32" || options.shell === "posix") return { command: plain };
  if (!options.bash)
    return { command: plain, detail: "Needs Git Bash (Git for Windows) to run .sh files; it was not found" };
  const quoted = `"${options.bash}" "./${file}"`;
  return { command: options.shell === "cmd" ? quoted : `& ${quoted}` };
}
