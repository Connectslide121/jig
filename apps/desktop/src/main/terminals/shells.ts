import { posix, win32 } from "node:path";
import { shellName } from "../../shared/shellNames";
import type { ShellChoices, ShellOption } from "../../shared/terminals";
import { findGitBash } from "../scripts/bash";
import { parseLooseJson } from "../scripts/discover";
import { defaultShell } from "./shell";

type Env = Record<string, string | undefined>;

/** The machine as detection sees it; injected so every OS can be tested anywhere. */
export interface ShellProbe {
  platform: string;
  env: Env;
  exists: (path: string) => boolean;
  /** Names inside a folder (empty when it is missing). */
  list: (dir: string) => string[];
  /** A text file's content, or undefined. */
  read: (path: string) => string | undefined;
  /** An executable found on PATH. */
  which: (bin: string) => string | undefined;
}

/** Shell paths from `/etc/shells` (comments and blank lines dropped; `nologin`/`false` are not shells). */
export function parseEtcShells(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("/") && !/\/(nologin|false|git-shell)$/.test(l));
}

/** Expands `%VAR%` the way Windows does (case-insensitive); unknown variables stay. */
function expand(text: string, env: Env): string {
  const lower = new Map(Object.entries(env).map(([k, v]) => [k.toLowerCase(), v]));
  return text.replace(/%([^%]+)%/g, (all, name: string) => lower.get(name.toLowerCase()) ?? all);
}

/**
 * Windows Terminal's profiles whose `commandline` is a bare executable (no arguments, which the
 * stored setting couldn't carry): `{ name, path }`. Tolerates comments and trailing commas.
 */
export function parseTerminalProfiles(text: string, env: Env): ShellOption[] {
  let data: unknown;
  try {
    data = parseLooseJson(text);
  } catch {
    return [];
  }
  const list = (data as { profiles?: { list?: unknown } } | null)?.profiles?.list;
  if (!Array.isArray(list)) return [];
  const out: ShellOption[] = [];
  for (const p of list as Array<{ name?: unknown; commandline?: unknown; hidden?: unknown }>) {
    if (typeof p?.name !== "string" || typeof p.commandline !== "string" || p.hidden === true) continue;
    const line = expand(p.commandline.trim(), env);
    const path = /^"([^"]+)"$/.exec(line)?.[1] ?? (/\s/.test(line) ? undefined : line);
    if (path && /\.exe$/i.test(path)) out.push({ name: p.name, path });
  }
  return out;
}

function windowsShells(probe: ShellProbe): ShellOption[] {
  const { env, exists, list, which } = probe;
  const get = (n: string) => env[n] ?? env[n.toUpperCase()];
  const root = get("SystemRoot") ?? "C:Windows";
  const found: ShellOption[] = [];
  const add = (name: string, path: string | undefined) => {
    if (path && exists(path)) found.push({ name, path });
  };

  // PowerShell 7: MSI installs (newest first), winget/Store aliases, then PATH.
  const pf = get("ProgramFiles");
  if (pf) {
    const versions = list(win32.join(pf, "PowerShell")).sort((a, b) =>
      b.localeCompare(a, undefined, { numeric: true }),
    );
    for (const v of versions) add("PowerShell 7", win32.join(pf, "PowerShell", v, "pwsh.exe"));
  }
  const local = get("LOCALAPPDATA");
  if (local) {
    add("PowerShell 7", win32.join(local, "Microsoft", "powershell", "pwsh.exe"));
    add("PowerShell 7", win32.join(local, "Microsoft", "WindowsApps", "pwsh.exe"));
  }
  add("PowerShell 7", which("pwsh.exe"));
  found.splice(1); // the newest PowerShell 7 only

  add("Windows PowerShell", win32.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"));
  add("Command Prompt", get("ComSpec") ?? win32.join(root, "System32", "cmd.exe"));
  add("Git Bash", findGitBash(env, exists));
  add("Nushell", which("nu.exe"));

  if (local) {
    const settings = win32.join(
      local,
      "Packages",
      "Microsoft.WindowsTerminal_8wekyb3d8bbwe",
      "LocalState",
      "settings.json",
    );
    const text = probe.read(settings);
    if (text) for (const p of parseTerminalProfiles(text, env)) add(p.name, p.path);
  }
  return found;
}

function unixShells(probe: ShellProbe): ShellOption[] {
  const found: ShellOption[] = [];
  const listed = parseEtcShells(probe.read("/etc/shells") ?? "");
  const current = probe.env.SHELL;
  for (const path of [...(current ? [current] : []), ...listed])
    if (probe.exists(path)) found.push({ name: shellName(path), path });
  return found;
}

/** Drops repeats: the same executable (any case, either slash) or, on Unix, the same shell name. */
function unique(options: ShellOption[], platform: string): ShellOption[] {
  const seen = new Set<string>();
  return options.filter((o) => {
    const key = platform === "win32" ? o.path.replaceAll("/", "\\").toLowerCase() : posix.basename(o.path);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The shells installed here and which one Jig uses when the setting is empty. */
export function detectShells(probe: ShellProbe): ShellChoices {
  const raw = probe.platform === "win32" ? windowsShells(probe) : unixShells(probe);
  const options = unique(raw, probe.platform);
  const fallback = defaultShell("", probe.platform, probe.env, probe.which);
  const base = (p: string) => (p.split(/[\\/]/).pop() ?? p).toLowerCase();
  const match = options.find((o) => base(o.path) === base(fallback));
  return { options, defaultShell: match ?? { name: shellName(fallback), path: fallback } };
}
