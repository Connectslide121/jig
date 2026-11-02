/** Friendly names for shell executables, shared by the host's detection and the terminal list (D-240). */
const NAMES: Record<string, string> = {
  zsh: "Zsh",
  bash: "Bash",
  fish: "Fish",
  sh: "sh",
  dash: "Dash",
  ksh: "Ksh",
  tcsh: "tcsh",
  csh: "csh",
  nu: "Nushell",
  pwsh: "PowerShell 7",
  powershell: "Windows PowerShell",
  cmd: "Command Prompt",
  elvish: "Elvish",
};

/** A friendly name for a shell path (`/bin/zsh` → "Zsh", Git's bash.exe → "Git Bash"), else the file name. */
export function shellName(path: string): string {
  const base = (path.split(/[\\/]/).pop() ?? path).replace(/\.exe$/i, "");
  if (base.toLowerCase() === "bash" && /[\\/]git[\\/]/i.test(path)) return "Git Bash";
  return NAMES[base.toLowerCase()] ?? base;
}
