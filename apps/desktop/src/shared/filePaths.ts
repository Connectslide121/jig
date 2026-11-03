/**
 * File paths in what Claude writes (D-261): an inline-code span that is a path, absolute (`E:\a\b`,
 * `/home/x`, `~/x`) or relative (`src/cart.ts`, `README.md`), optionally with `:line` or `:line:col`.
 * Whether it exists is the host's to say; this only reads the text.
 */
export interface PathRef {
  path: string;
  line?: number;
}

const FILE_NAME = /^[\w.@~+-]+\.[a-z0-9]{1,10}$/i;

export function pathInCode(text: string): PathRef | undefined {
  const raw = text.trim();
  if (!raw || raw.length > 400 || /[\s"'`<>|*?]/.test(raw.replace(/^[a-z]:\\/i, ""))) {
    // Spaces are allowed only in an absolute Windows path (folders like "Program Files").
    if (!/^[a-z]:\\[^"'`<>|*?\n]+$/i.test(raw)) return undefined;
  }
  if (/^[a-z][\w+.-]*:\/\//i.test(raw)) return undefined; // a URL
  const m = /^(.*?)(?::(\d+)(?::\d+)?)?$/.exec(raw)!;
  const path = m[1]!.replace(/[.,;)]+$/, "");
  const line = m[2] ? Number(m[2]) : undefined;
  const absolute = /^[a-z]:[\\/]/i.test(path) || path.startsWith("/") || path.startsWith("~/");
  const relative =
    !absolute && (/^\.{0,2}[\\/]?[\w.@~+-]+([\\/][\w.@~+-]+)+[\\/]?$/.test(path) || FILE_NAME.test(path));
  if (!absolute && !relative) return undefined;
  // Things that look like paths but aren't: npm package names, versions, plain numbers.
  if (/^@[\w-]+(\/[\w.-]+)?$/.test(path) || /^\d+(\.\d+)*$/.test(path)) return undefined;
  return { path, ...(line ? { line } : {}) };
}

/** The absolute path of a reference, from the chat's folder for a relative one. */
export function resolvePath(cwd: string, path: string, home = ""): string {
  if (path.startsWith("~/") && home) return joinPath(home, path.slice(2));
  if (/^[a-z]:[\\/]/i.test(path) || path.startsWith("/")) return path;
  return joinPath(cwd, path.replace(/^\.[\\/]/, ""));
}

function joinPath(base: string, rest: string): string {
  const sep = base.includes("\\") ? "\\" : "/";
  return `${base.replace(/[\\/]+$/, "")}${sep}${rest.replace(/[\\/]/g, sep)}`;
}
