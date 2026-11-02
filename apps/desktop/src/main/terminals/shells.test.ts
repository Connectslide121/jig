import { describe, expect, it } from "vitest";
import { shellName } from "../../shared/shellNames";
import { detectShells, parseEtcShells, parseTerminalProfiles, type ShellProbe } from "./shells";

function probe(over: Partial<ShellProbe> & { files?: Record<string, string> }): ShellProbe {
  const files = over.files ?? {};
  return {
    platform: "linux",
    env: {},
    exists: (p) => p in files,
    list: () => [],
    read: (p) => files[p],
    which: () => undefined,
    ...over,
  };
}

describe("parseEtcShells", () => {
  it("keeps absolute shell paths, drops comments and nologin", () => {
    expect(parseEtcShells("# list\n/bin/sh\n\n/bin/zsh\r\n/usr/sbin/nologin\n/usr/bin/false\n")).toEqual([
      "/bin/sh",
      "/bin/zsh",
    ]);
  });
});

describe("shellName", () => {
  it("names common shells and Git's bash", () => {
    expect(shellName("/bin/zsh")).toBe("Zsh");
    expect(shellName("C:\\Program Files\\PowerShell\\7\\pwsh.exe")).toBe("PowerShell 7");
    expect(shellName("C:\\Windows\\System32\\cmd.exe")).toBe("Command Prompt");
    expect(shellName("C:\\Program Files\\Git\\bin\\bash.exe")).toBe("Git Bash");
    expect(shellName("/usr/bin/xonsh")).toBe("xonsh");
  });
});

describe("parseTerminalProfiles", () => {
  it("takes profiles whose commandline is a bare executable, expanding variables", () => {
    const text = `{ // comment
      "profiles": { "list": [
        { "name": "Cmd", "commandline": "%SystemRoot%\\\\System32\\\\cmd.exe" },
        { "name": "Quoted", "commandline": "\\"C:\\\\Program Files\\\\X\\\\x.exe\\"" },
        { "name": "WithArgs", "commandline": "C:\\\\tools\\\\y.exe --flag" },
        { "name": "Hidden", "commandline": "C:\\\\z.exe", "hidden": true },
        { "name": "NoLine" },
      ], },
    }`;
    expect(parseTerminalProfiles(text, { SystemRoot: "C:\\Windows" })).toEqual([
      { name: "Cmd", path: "C:\\Windows\\System32\\cmd.exe" },
      { name: "Quoted", path: "C:\\Program Files\\X\\x.exe" },
    ]);
    expect(parseTerminalProfiles("not json", {})).toEqual([]);
  });
});

describe("detectShells", () => {
  it("lists Unix shells, $SHELL first, one per name, and marks the default", () => {
    const files = {
      "/etc/shells": "/bin/sh\n/bin/bash\n/usr/bin/zsh\n/usr/bin/bash\n",
      "/bin/sh": "",
      "/bin/bash": "",
      "/usr/bin/zsh": "",
    };
    const r = detectShells(probe({ files, env: { SHELL: "/usr/bin/zsh" } }));
    expect(r.options.map((o) => o.name)).toEqual(["Zsh", "sh", "Bash"]);
    expect(r.defaultShell).toEqual({ name: "Zsh", path: "/usr/bin/zsh" });
  });

  it("finds the Windows shells, newest PowerShell 7 only, Git Bash and Terminal profiles", () => {
    const env = {
      SystemRoot: "C:\\Windows",
      ProgramFiles: "C:\\Program Files",
      LOCALAPPDATA: "C:\\Users\\Ann\\AppData\\Local",
    };
    const pf = "C:\\Program Files\\PowerShell";
    const terminal =
      "C:\\Users\\Ann\\AppData\\Local\\Packages\\Microsoft.WindowsTerminal_8wekyb3d8bbwe\\LocalState\\settings.json";
    const files: Record<string, string> = {
      [`${pf}\\7\\pwsh.exe`]: "",
      [`${pf}\\8\\pwsh.exe`]: "",
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe": "",
      "C:\\Windows\\System32\\cmd.exe": "",
      "C:\\Program Files\\Git\\bin\\bash.exe": "",
      "C:\\tools\\nu.exe": "",
      [terminal]: JSON.stringify({
        profiles: { list: [{ name: "Cmd again", commandline: "C:\\Windows\\System32\\cmd.exe" }] },
      }),
    };
    const r = detectShells(
      probe({
        platform: "win32",
        env,
        files,
        list: (dir) => (dir === pf ? ["7", "8"] : []),
        which: (bin) => (bin === "nu.exe" ? "C:\\tools\\nu.exe" : undefined),
      }),
    );
    expect(r.options.map((o) => o.name)).toEqual([
      "PowerShell 7",
      "Windows PowerShell",
      "Command Prompt",
      "Git Bash",
      "Nushell",
    ]);
    expect(r.options[0]?.path).toBe(`${pf}\\8\\pwsh.exe`);
    expect(r.defaultShell).toEqual({
      name: "Windows PowerShell",
      path: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    });
  });
});
