/**
 * Fails when UI code hard-codes colours or arbitrary Tailwind values. See docs/reference/design-tokens.md.
 * Run with: node scripts/check-tokens.ts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { checkTokens } from "../packages/sdk/src/tokenCheck.ts";

const root = new URL("..", import.meta.url).pathname;
const roots = ["apps/desktop/src/renderer", "addons"];
// Files that *define* the tokens are allowed to contain raw colours.
const allowed = [/apps\/desktop\/src\/renderer\/styles\/tokens\.css$/];
const extensions = /\.(tsx?|css)$/;

function walk(dir: string, out: string[]): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (extensions.test(entry) && !entry.endsWith(".test.ts") && !entry.endsWith(".test.tsx"))
      out.push(path);
  }
  return out;
}

let failures = 0;
for (const dir of roots) {
  for (const file of walk(join(root, dir), [])) {
    const rel = relative(root, file).replaceAll("\\", "/");
    if (allowed.some((pattern) => pattern.test(rel))) continue;
    for (const v of checkTokens(readFileSync(file, "utf8"))) {
      failures++;
      console.error(`${rel}:${v.line}:${v.column}  ${v.match}  ${v.message}`);
    }
  }
}
if (failures > 0) {
  console.error(
    `\n${failures} design-token violation(s). Use token utilities; see docs/reference/design-tokens.md.`,
  );
  process.exit(1);
}
console.log("Design tokens: OK");
