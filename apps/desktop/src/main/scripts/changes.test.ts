import { describe, expect, it } from "vitest";
import type { Script } from "../../shared/terminals";
import { isRelevantScriptChange, pickWatchDirs, scriptsSignature } from "./changes";

const script = (name: string, command = "run"): Script => ({
  id: `sh::${name}`,
  name,
  kind: "sh",
  folder: "",
  cwd: "/shop",
  command,
});

describe("isRelevantScriptChange", () => {
  it("accepts the files discovery reads and script files", () => {
    for (const name of [
      "package.json",
      "launchSettings.json",
      "Api.csproj",
      "host.json",
      "backend.sh",
      "Setup.PS1",
      "run.cmd",
      "yarn.lock",
      "scripts",
      "src",
    ])
      expect(isRelevantScriptChange(name), name).toBe(true);
  });
  it("accepts an unknown name and a nested path's last part", () => {
    expect(isRelevantScriptChange(null)).toBe(true);
    expect(isRelevantScriptChange("subdeploy.sh")).toBe(true);
  });
  it("ignores skipped folders, dotfiles, temp files and ordinary sources", () => {
    for (const name of [
      "node_modules",
      ".git",
      "obj",
      "dist",
      ".vscode",
      "app.ts",
      "notes.md",
      "a.sh~",
      "x.tmp",
    ])
      expect(isRelevantScriptChange(name), name).toBe(false);
  });
});

describe("scriptsSignature", () => {
  it("is equal for the same list and differs on add, remove, rename or command change", () => {
    const base = scriptsSignature([script("a.sh"), script("b.sh")]);
    expect(scriptsSignature([script("a.sh"), script("b.sh")])).toBe(base);
    expect(scriptsSignature([script("a.sh")])).not.toBe(base);
    expect(scriptsSignature([script("a.sh"), script("c.sh")])).not.toBe(base);
    expect(scriptsSignature([script("a.sh"), script("b.sh", "other")])).not.toBe(base);
  });
});

describe("pickWatchDirs", () => {
  it("keeps everything under the limit, de-duplicated", () => {
    expect(pickWatchDirs(["/a", "/a", "/a/b"], 5)).toEqual({ watch: ["/a", "/a/b"], capped: false });
  });
  it("keeps the shallowest folders when over the limit", () => {
    expect(pickWatchDirs(["/a/b/c", "/a", "/a/b"], 2)).toEqual({ watch: ["/a", "/a/b"], capped: true });
  });
});
