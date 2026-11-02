import { describe, expect, it } from "vitest";
import { findGitBash, shellScriptCommand } from "./bash";

const has =
  (...paths: string[]) =>
  (p: string) =>
    paths.includes(p);

describe("findGitBash", () => {
  it("finds Git for Windows in Program Files", () => {
    const bash = "C:\\Program Files\\Git\\bin\\bash.exe";
    expect(findGitBash({ ProgramFiles: "C:\\Program Files" }, has(bash))).toBe(bash);
  });
  it("tries the per-user install", () => {
    const bash = "C:\\Users\\Ann\\AppData\\Local\\Programs\\Git\\bin\\bash.exe";
    expect(findGitBash({ LOCALAPPDATA: "C:\\Users\\Ann\\AppData\\Local" }, has(bash))).toBe(bash);
  });
  it("derives it from git.exe on PATH, from cmd or mingw64\\bin", () => {
    const bash = "D:\\Tools\\Git\\bin\\bash.exe";
    expect(
      findGitBash({ PATH: "C:\\x;D:\\Tools\\Git\\cmd" }, has("D:\\Tools\\Git\\cmd\\git.exe", bash)),
    ).toBe(bash);
    expect(
      findGitBash(
        { Path: "D:\\Tools\\Git\\mingw64\\bin" },
        has("D:\\Tools\\Git\\mingw64\\bin\\git.exe", bash),
      ),
    ).toBe(bash);
  });
  it("never picks WSL's System32 bash, and says nothing when there is none", () => {
    const wsl = "C:\\Windows\\System32\\bash.exe";
    expect(
      findGitBash({ PATH: "C:\\Windows\\System32" }, has(wsl, "C:\\Windows\\System32\\git.exe")),
    ).toBeUndefined();
    expect(findGitBash({}, () => false)).toBeUndefined();
  });
});

describe("shellScriptCommand", () => {
  const bash = "C:\\Program Files\\Git\\bin\\bash.exe";
  it("quotes the path for PowerShell (the default) and for cmd", () => {
    expect(shellScriptCommand("a.sh", { platform: "win32", bash }).command).toBe(`& "${bash}" "./a.sh"`);
    expect(shellScriptCommand("a.sh", { platform: "win32", bash, shell: "powershell" }).command).toBe(
      `& "${bash}" "./a.sh"`,
    );
    expect(shellScriptCommand("a.sh", { platform: "win32", bash, shell: "cmd" }).command).toBe(
      `"${bash}" "./a.sh"`,
    );
  });
  it("uses plain bash in a bash shell and on other systems", () => {
    expect(shellScriptCommand("a.sh", { platform: "win32", bash, shell: "posix" })).toEqual({
      command: 'bash "./a.sh"',
    });
    expect(shellScriptCommand("a.sh", { platform: "linux" })).toEqual({ command: 'bash "./a.sh"' });
  });
  it("explains the missing Git Bash on Windows", () => {
    const r = shellScriptCommand("a.sh", { platform: "win32" });
    expect(r.command).toBe('bash "./a.sh"');
    expect(r.detail).toMatch(/Git Bash/);
  });
});
