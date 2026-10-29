import { execFile } from "node:child_process";
import type { SetupCheck } from "../../shared/setup";
import { resolveCommand } from "../addons/winCommand";
import { parseSignIn, signInText } from "./signIn";

export type Exec = (
  command: string,
  args: string[],
) => Promise<{ code: number; stdout: string; stderr: string }>;

/** Runs a program without a shell (`.cmd` files on Windows through cmd.exe, safely quoted). */
export const execTool: Exec = (command, args) =>
  new Promise((resolve) => {
    const r = resolveCommand(command, args, process.platform, process.env);
    execFile(
      r.file,
      r.args,
      { timeout: 20_000, windowsHide: true, windowsVerbatimArguments: r.verbatim, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        const code = error ? (typeof error.code === "number" ? error.code : 127) : 0;
        resolve({
          code,
          stdout: String(stdout),
          stderr: String(stderr) || (error && code === 127 ? error.message : ""),
        });
      },
    );
  });

// Skips warnings that tools print first (az: "WARNING: You have 2 update(s) available").
const firstLine = (s: string) =>
  s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !/^warning:/i.test(l)) ?? "";

/**
 * What Jig needs on your machine. Versions, and whether Claude Code is signed in (asked from Claude
 * Code itself, `signIn`; only yes/no and the method are kept). Other tools aren't asked about logins.
 * `claude` is the Claude Code binary Jig uses (yours or the one shipped with the Agent SDK).
 */
export async function runSetupChecks(
  exec: Exec,
  claude: string | undefined,
  options: { signIn?: boolean } = {},
): Promise<SetupCheck[]> {
  const version = async (command: string, args = ["--version"]) => {
    const r = await exec(command, args);
    return r.code === 0 ? firstLine(r.stdout) || firstLine(r.stderr) : undefined;
  };
  const [claudeVersion, git, gh, az, code] = await Promise.all([
    claude ? version(claude) : Promise.resolve(undefined),
    version("git"),
    version("gh"),
    version("az"),
    version("code"),
  ]);
  const signIn =
    claude && claudeVersion && options.signIn
      ? parseSignIn((await exec(claude, ["auth", "status", "--json"])).stdout)
      : undefined;
  const devops = az
    ? (await exec("az", ["extension", "show", "--name", "azure-devops", "--output", "none"])).code === 0
    : false;
  return [
    {
      id: "claude",
      label: "Claude Code",
      ok: Boolean(claudeVersion) && signIn?.loggedIn !== false,
      optional: false,
      detail: claudeVersion
        ? `${claudeVersion}. ${options.signIn ? signInText(signIn) : "Sign-in is checked by Claude Code when your first session starts."}`
        : claude
          ? `Couldn't run ${claude}.`
          : "Not found: no Claude Code shipped for this platform and none set in Settings → Claude Code.",
      help: "Sign in once with Sign in to Claude Code… (Claude Code's own sign-in, in a terminal; Jig never sees your login).",
      url: "https://docs.claude.com/en/docs/claude-code/setup",
    },
    {
      id: "git",
      label: "Git",
      ok: Boolean(git),
      optional: false,
      detail: git ?? "Not found on PATH. The Git view, add-on history and the builder need it.",
      help: "Install Git for Windows, then restart Jig.",
      url: "https://git-scm.com/downloads",
    },
    {
      id: "gh",
      label: "GitHub CLI (gh)",
      ok: Boolean(gh),
      optional: true,
      detail: gh
        ? (gh.split("(")[0]?.trim() ?? gh)
        : "Not found. Optional: pull requests from the Repos view.",
      help: "Install it and run gh auth login in a terminal.",
      url: "https://cli.github.com",
    },
    {
      id: "az",
      label: "Azure CLI (az)",
      ok: Boolean(az),
      optional: true,
      detail: az ?? "Not found. Optional: the Pipelines view uses it.",
      help: "Install it and run az login in a terminal.",
      url: "https://learn.microsoft.com/cli/azure/install-azure-cli",
    },
    {
      id: "az-devops",
      label: "Azure DevOps extension",
      ok: devops,
      optional: true,
      detail: devops ? "Installed." : az ? "Not installed." : "Needs the Azure CLI first.",
      help: "Run: az extension add --name azure-devops",
      url: "https://learn.microsoft.com/azure/devops/cli/",
    },
    {
      id: "code",
      label: "VS Code (code)",
      ok: Boolean(code),
      optional: true,
      detail: code ? `VS Code ${code}` : "The code command isn't on PATH. Optional: Open in VS Code.",
      help: "In VS Code: Ctrl+Shift+P → Shell Command: Install 'code' command in PATH (on Windows the installer adds it).",
      url: "https://code.visualstudio.com/docs/setup/windows",
    },
  ];
}
