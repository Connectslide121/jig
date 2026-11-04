/**
 * Regenerates the Codex app-server protocol types (`codex app-server generate-ts`) into
 * apps/desktop/src/main/engine/codex-protocol and records the Codex CLI version they came from in
 * version.ts. The Codex chat engine compares that version with the running CLI's (D-311). Run it after
 * updating Codex: `node scripts/codex-protocol.ts [path-to-codex]`.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const codex = process.argv[2] || "codex";
const out = join(import.meta.dirname, "..", "apps", "desktop", "src", "main", "engine", "codex-protocol");
const shell = process.platform === "win32" && !/\.exe$/i.test(codex);
const version = execFileSync(codex, ["--version"], { encoding: "utf8", shell }).trim().split(/\s+/).pop();
if (!version || !/^\d+\.\d+\.\d+/.test(version))
  throw new Error(`Couldn't read Codex's version from ${codex}`);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
execFileSync(codex, ["app-server", "generate-ts", "--out", out], { stdio: "inherit", shell });
writeFileSync(
  join(out, "version.ts"),
  `// The Codex CLI these types were generated from (npm run codex:protocol).\nexport const CODEX_PROTOCOL_VERSION = "${version}";\n`,
);
console.log(`Codex ${version} protocol types written to ${out}`);
