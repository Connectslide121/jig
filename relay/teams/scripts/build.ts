/**
 * Builds the Teams relay's deployment package (D-370): `src/index.ts` bundled with its dependencies
 * into one CommonJS file (no node_modules to ship, no remote build), plus `host.json` and a
 * `package.json`, zipped to `dist/relay.zip`, the package Flex Consumption runs from. Jig's setup
 * deploys it with `az functionapp deployment source config-zip`; the installer carries it in
 * `resources/relay/teams-relay.zip` (electron-builder's extraResources).
 * Run with: npm run relay:build (from the repository root).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { zipSync } from "fflate";

const root = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string };

const result = await build({
  entryPoints: [join(root, "src", "index.ts")],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  write: false,
  minify: false,
  legalComments: "none",
  // The Functions worker provides this module itself.
  external: ["@azure/functions-core"],
  define: { __RELAY_VERSION__: JSON.stringify(pkg.version) },
  logLevel: "warning",
});
const code = result.outputFiles[0]!.contents;

const files: Record<string, [Uint8Array, { mtime: Date }]> = {};
const at = { mtime: new Date("2026-01-01T00:00:00Z") };
const add = (name: string, data: string | Uint8Array) => {
  files[name] = [typeof data === "string" ? new TextEncoder().encode(data) : data, at];
};
add("index.js", code);
add("host.json", readFileSync(join(root, "host.json"), "utf8"));
add(
  "package.json",
  `${JSON.stringify({ name: "jig-teams-relay", version: pkg.version, private: true, main: "index.js" }, null, 2)}\n`,
);

mkdirSync(join(root, "dist"), { recursive: true });
const zip = zipSync(files, { level: 9 });
writeFileSync(join(root, "dist", "relay.zip"), zip);
console.log(`relay ${pkg.version}: dist/relay.zip (${Math.round(zip.length / 1024)} KB)`);
