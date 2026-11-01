import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const biome = createRequire(import.meta.url).resolve("@biomejs/biome/bin/biome");

// No shell interpolation, downloads, unsafe lint fixes or AI calls.
export function formatAfterTool(root, input) {
  root = realpathSync(root);
  let files;
  if (input.tool_name === "Edit" || input.tool_name === "Write") {
    if (typeof input.tool_input?.file_path !== "string") return;
    files = [resolve(input.cwd || root, input.tool_input.file_path)];
  } else if (input.tool_name === "Bash" || input.tool_name === "PowerShell") {
    // A shell script can write several files; don't try to parse arbitrary shell/Python code.
    const git = spawnSync("git", ["ls-files", "--modified", "--others", "--exclude-standard", "-z"], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      timeout: 5_000,
    });
    if (git.status !== 0) throw new Error(git.error?.message || git.stderr || "Cannot list changed files");
    files = git.stdout
      .split("\0")
      .filter(Boolean)
      .map((file) => resolve(root, file));
  } else return;

  files = [...new Set(files)].filter((file) => {
    try {
      // Reject deleted files, directories, and symlinks/junctions that lead outside the checkout.
      const path = relative(root, realpathSync(file));
      return (
        path && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path) && statSync(file).isFile()
      );
    } catch {
      return false;
    }
  });
  // Keep Windows command lines short. Biome applies its own ignore/configuration rules.
  for (let offset = 0; offset < files.length; offset += 20) {
    const result = spawnSync(
      process.execPath,
      [
        biome,
        "check",
        "--write",
        "--files-ignore-unknown=true",
        "--no-errors-on-unmatched",
        ...files.slice(offset, offset + 20),
      ],
      { cwd: root, encoding: "utf8", windowsHide: true, timeout: 20_000 },
    );
    if (result.status !== 0)
      throw new Error(result.error?.message || result.stderr || result.stdout || "Biome failed");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  try {
    formatAfterTool(resolve(dirname(scriptPath), ".."), JSON.parse(readFileSync(0, "utf8")));
  } catch (error) {
    // Report actionable errors to Claude; successful formatting stays silent.
    console.error(`Automatic formatting: ${error.message}`);
    process.exitCode = 2;
  }
}
