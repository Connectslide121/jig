import { describe, expect, it } from "vitest";
import { shellEntries } from "./shellEntries";

const pwsh = "C:\\Program Files\\PowerShell\\7\\pwsh.exe";
const cmd = "C:\\Windows\\System32\\cmd.exe";
const choices = {
  options: [
    { name: "PowerShell 7", path: pwsh },
    { name: "Command Prompt", path: cmd },
  ],
  defaultShell: { name: "PowerShell 7", path: pwsh },
};

describe("shellEntries", () => {
  it("shows name, muted path and marks the default", () => {
    const picked: string[] = [];
    const entries = shellEntries(choices, (p) => picked.push(p));
    expect(entries).toMatchObject([
      { label: "PowerShell 7", detail: pwsh, badge: "Default" },
      { label: "Command Prompt", detail: cmd, badge: undefined },
    ]);
    (entries[1] as { onSelect: () => void }).onSelect();
    expect(picked).toEqual([cmd]);
  });
  it("marks the checked path and handles a list still loading", () => {
    const entries = shellEntries(choices, () => {}, cmd);
    expect(entries.map((e) => (e as { checked?: boolean }).checked)).toEqual([false, true]);
    expect(shellEntries(undefined, () => {})).toEqual([{ label: "Looking for shells…", disabled: true }]);
  });
});
