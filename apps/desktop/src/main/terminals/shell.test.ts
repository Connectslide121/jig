import { describe, expect, it } from "vitest";
import { commandArgs, defaultShell, interactiveArgs, LineTracker, shellFamily } from "./shell";

const none = () => undefined;

describe("shell selection", () => {
  it("prefers the configured shell, then PowerShell 7, then Windows PowerShell", () => {
    expect(defaultShell(" bash.exe ", "win32", {}, none)).toBe("bash.exe");
    expect(defaultShell("", "win32", {}, (b) => (b === "pwsh.exe" ? "C:/pwsh.exe" : undefined))).toBe(
      "pwsh.exe",
    );
    expect(defaultShell("", "win32", {}, none)).toBe("powershell.exe");
    expect(defaultShell("", "linux", { SHELL: "/usr/bin/fish" }, none)).toBe("/usr/bin/fish");
    expect(defaultShell("", "darwin", {}, none)).toBe("/bin/zsh");
  });

  it("knows shell families", () => {
    expect(shellFamily("C:\\Program Files\\PowerShell\\7\\pwsh.exe")).toBe("powershell");
    expect(shellFamily("powershell.exe")).toBe("powershell");
    expect(shellFamily("cmd.exe")).toBe("cmd");
    expect(shellFamily("C:/Program Files/Git/bin/bash.exe")).toBe("posix");
  });

  it("builds arguments to run one command", () => {
    expect(commandArgs("pwsh.exe", "npm run dev", "win32")).toEqual([
      "-NoLogo",
      "-NoProfile",
      "-Command",
      "npm run dev",
    ]);
    expect(commandArgs("cmd.exe", "npm run dev", "win32")).toEqual(["/d", "/s", "/c", "npm run dev"]);
    expect(commandArgs("/bin/bash", "npm run dev", "linux")).toEqual(["-c", "npm run dev"]);
    expect(commandArgs("/bin/zsh", "x", "darwin")).toEqual(["-l", "-c", "x"]);
    expect(interactiveArgs("pwsh.exe", "win32")).toEqual(["-NoLogo"]);
    expect(interactiveArgs("/bin/zsh", "darwin")).toEqual(["-l"]);
  });
});

describe("LineTracker", () => {
  it("reports typed lines, handling backspace, Ctrl+C and escape sequences", () => {
    const lines: string[] = [];
    const t = new LineTracker((l) => lines.push(l));
    t.feed("git stauts\x7f\x7f\x7f\x7fatus\r");
    t.feed("npm r");
    t.feed("un dev\r\r");
    t.feed("oops\x03ls -la\r");
    t.feed("\x1b[Aignored? \x1b[B");
    t.feed("echo hi\n");
    expect(lines).toEqual(["git status", "npm run dev", "ls -la", "echo hi"]);
  });
});
