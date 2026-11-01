import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { formatAfterTool } from "./format-after-tool.mjs";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "jig-format-"));
  roots.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root, windowsHide: true });
  writeFileSync(join(root, "biome.json"), '{"formatter":{"indentStyle":"space","indentWidth":2}}');
  return root;
}

it("formats a directly edited file with spaces in its name and fixes CRLF", () => {
  const root = fixture();
  const file = join(root, "edited file.ts");
  writeFileSync(file, "export const value={name:'Shop'};\r\n");
  formatAfterTool(root, { tool_name: "Edit", cwd: root, tool_input: { file_path: file } });
  expect(readFileSync(file, "utf8")).toBe('export const value = { name: "Shop" };\n');
});

it("cleans tracked and new script-written files while respecting ignores and deletions", () => {
  const root = fixture();
  writeFileSync(join(root, ".gitignore"), "ignored.ts\n");
  writeFileSync(join(root, "tracked.ts"), "export const count = 1;\n");
  writeFileSync(join(root, "deleted.ts"), "export {};\n");
  execFileSync("git", ["add", "."], { cwd: root, windowsHide: true });
  writeFileSync(join(root, "tracked.ts"), "export const count=2;\r\n");
  writeFileSync(join(root, "new.ts"), "export const count=3;\r\n");
  writeFileSync(join(root, "ignored.ts"), "leave this alone\r\n");
  rmSync(join(root, "deleted.ts"));
  formatAfterTool(root, { tool_name: "Bash" });
  expect(readFileSync(join(root, "tracked.ts"), "utf8")).toBe("export const count = 2;\n");
  expect(readFileSync(join(root, "new.ts"), "utf8")).toBe("export const count = 3;\n");
  expect(readFileSync(join(root, "ignored.ts"), "utf8")).toBe("leave this alone\r\n");
  formatAfterTool(root, { tool_name: "PowerShell" });
});

it("skips paths outside the checkout and reports syntax errors", () => {
  const root = fixture();
  const outside = join(fixture(), "outside.ts");
  writeFileSync(outside, "export const value=1;\r\n");
  formatAfterTool(root, { tool_name: "Write", tool_input: { file_path: outside } });
  expect(readFileSync(outside, "utf8")).toContain("\r\n");
  const file = join(root, "broken.ts");
  writeFileSync(file, "export const = ;\n");
  expect(() => formatAfterTool(root, { tool_name: "Write", tool_input: { file_path: file } })).toThrow();
});

it("wires the project hook to a quiet stdin-driven script and reports malformed input", () => {
  const settings = JSON.parse(readFileSync(new URL("../.claude/settings.json", import.meta.url), "utf8"));
  const hook = settings.hooks.PostToolUse[0];
  for (const tool of ["Edit", "Write", "Bash", "PowerShell"]) expect(tool).toMatch(new RegExp(hook.matcher));
  expect(hook.hooks[0].command).toContain("scripts/format-after-tool.mjs");
  const script = fileURLToPath(new URL("./format-after-tool.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify({ tool_name: "Read" }),
    encoding: "utf8",
    windowsHide: true,
  });
  expect(result.status).toBe(0);
  expect(result.stdout + result.stderr).toBe("");
  const invalid = spawnSync(process.execPath, [script], {
    input: "invalid json",
    encoding: "utf8",
    windowsHide: true,
  });
  expect(invalid.status).toBe(2);
  expect(invalid.stderr).toContain("Automatic formatting:");
});
