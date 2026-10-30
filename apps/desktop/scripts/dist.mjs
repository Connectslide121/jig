// Packages the built app with electron-builder for the platform you run it on (npm installs the
// native parts — node-pty, esbuild, the Claude Code binary — for this platform only, so a Windows
// installer must be built on Windows). See docs/guides/packaging.md.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { appDir } from "./build-config.mjs";

const platform = { win32: "--win", darwin: "--mac", linux: "--linux" }[process.platform];
if (!platform) throw new Error(`Packaging isn't set up for ${process.platform}`);
if (!existsSync(join(appDir, "dist", "main", "index.mjs"))) {
  console.error("Build first: npm run build (or npm run dist from the repository root).");
  process.exit(1);
}
const sdk = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`;
if (!existsSync(join(appDir, "..", "..", "node_modules", sdk)))
  console.warn(`Warning: ${sdk} isn't installed; the packaged Jig won't find Claude Code.`);
const bin = join(
  appDir,
  "..",
  "..",
  "node_modules",
  ".bin",
  process.platform === "win32" ? "electron-builder.cmd" : "electron-builder",
);
const result = spawnSync(bin, [platform, ...process.argv.slice(2).filter((a) => a !== "--no-open")], {
  cwd: appDir,
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (result.status === 0 && !process.env.CI && !process.argv.includes("--no-open")) showInstaller();
process.exit(result.status ?? 1);

/** Opens the folder of the newest installer, with the file selected where the OS can. */
function showInstaller() {
  const out = join(appDir, "release");
  const installers = readdirSync(out)
    .filter((f) => /\.(exe|dmg|AppImage)$/.test(f))
    .map((f) => ({ file: join(out, f), at: statSync(join(out, f)).mtimeMs }))
    .sort((a, b) => b.at - a.at);
  const file = installers[0]?.file;
  const [command, args] =
    process.platform === "win32"
      ? ["explorer.exe", file ? [`/select,${file}`] : [out]]
      : process.platform === "darwin"
        ? ["open", file ? ["-R", file] : [out]]
        : ["xdg-open", [out]];
  spawn(command, args, { detached: true, stdio: "ignore" }).unref();
}
