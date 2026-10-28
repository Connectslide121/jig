/** The local path a `jig-file:` link points to, given the previewed file's path and folder URL. */
export function linkedPath(link: string, filePath: string, baseUrl: string): string | undefined {
  const target = new URL(link);
  const base = new URL(baseUrl);
  if (target.protocol !== "jig-file:" || target.host !== base.host) return undefined;
  const sepChar = filePath.includes("\\") && !filePath.includes("/") ? "\\" : "/";
  const parts = (p: string) => p.split("/").filter(Boolean).map(decodeURIComponent);
  const from = parts(base.pathname);
  const to = parts(target.pathname);
  let common = 0;
  while (common < from.length && common < to.length && from[common] === to[common]) common++;
  const dir = filePath.split(/[\\/]/).slice(0, -1);
  const up = from.length - common;
  if (up > dir.length) return undefined;
  return [...dir.slice(0, dir.length - up), ...to.slice(common)].join(sepChar);
}

/** Tolerant JSON: also JSON with comments and trailing commas (tsconfig.json, .jsonc). */
export function parseJsonLoose(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const stripped = text
      .replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_m, str: string | undefined) => str ?? "")
      .replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(stripped);
  }
}
