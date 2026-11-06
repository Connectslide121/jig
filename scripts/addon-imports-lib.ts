/**
 * Add-on import check (D-415): built-in add-ons ship as their source folder (`resources/addons`) and
 * are bundled on the user's computer, where the app's source (`apps/`, `packages/`) isn't. A relative
 * import that leaves `addons/` works in a dev checkout and breaks the add-on in the installed app.
 * `import type` is fine: it's erased before bundling. Self-contained so Node can run it with type
 * stripping.
 */

export interface AddonImportViolation {
  line: number;
  specifier: string;
}

// `import x from "…"`, `import { a, type b } from "…"`, `export * from "…"`, `import "…"`, `import("…")`.
const STATEMENT = /\b(import|export)\s+(type\s+)?(?:[\w*${}\s,]+?\s+from\s+)?["']([^"']+)["']/g;
const DYNAMIC = /\bimport\(\s*["']([^"']+)["']\s*\)/g;

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

/** Joins and normalises POSIX paths (`a/b`, `../c` → `a/c`); `..` above the start stays. */
function resolve(dir: string, specifier: string): string {
  const parts: string[] = [];
  for (const part of `${dir}/${specifier}`.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === ".." && parts.length > 0 && parts[parts.length - 1] !== "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

/**
 * The value imports in `source` that leave `addons/`. `file` is the file's path from the repository
 * root with forward slashes (`addons/tasks/ui.tsx`).
 */
export function addonImportViolations(file: string, source: string): AddonImportViolation[] {
  const dir = file.split("/").slice(0, -1).join("/");
  const out: AddonImportViolation[] = [];
  const check = (specifier: string, index: number) => {
    if (!specifier.startsWith(".")) return;
    if (resolve(dir, specifier).startsWith("addons/")) return;
    out.push({ line: lineOf(source, index), specifier });
  };
  for (const m of source.matchAll(STATEMENT)) if (!m[2] && m[3]) check(m[3], m.index);
  for (const m of source.matchAll(DYNAMIC)) if (m[1]) check(m[1], m.index);
  return out.sort((a, b) => a.line - b.line);
}
