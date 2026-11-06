/**
 * Fails when a built-in add-on imports code from outside addons/ (D-415): the installed app ships
 * only the add-ons' own folders, so such an import breaks the add-on there.
 * Run with: node scripts/check-addon-imports.ts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { addonImportViolations } from "./addon-imports-lib.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const extensions = /\.tsx?$/;

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (extensions.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

let failures = 0;
for (const file of walk(join(root, "addons"), [])) {
  const rel = relative(root, file).replaceAll("\\", "/");
  for (const v of addonImportViolations(rel, readFileSync(file, "utf8"))) {
    failures++;
    console.error(
      `${rel}:${v.line}  "${v.specifier}" is outside addons/, which the installed app doesn't ship`,
    );
  }
}

if (failures > 0) {
  console.error(
    `\n${failures} import(s) leave addons/. Move what the add-on needs into addons/shared (or import type only). See D-415.`,
  );
  process.exit(1);
}
console.log("Add-on imports: all inside addons/.");
