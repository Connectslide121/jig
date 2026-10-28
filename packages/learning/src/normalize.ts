/** Turns a concrete command into a template: paths, ids, numbers, strings and URLs become placeholders. */
const RULES: Array<[RegExp, string]> = [
  [/https?:\/\/\S+/g, "<url>"],
  [/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, "<email>"],
  [/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, "<str>"],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<id>"],
  [/\b[0-9a-f]{7,40}\b(?=\s|$)/g, "<hash>"],
  // Any word containing a path separator (Windows or POSIX, absolute or relative).
  [/(?<=^|\s|=)(?:[A-Za-z]:)?[\w.@~-]*(?:[\\/][\w.@~-]*)+/g, "<path>"],
  [/\b\d+(?:\.\d+)*\b/g, "<n>"],
];

/** Subcommands whose argument is a branch name. */
const BRANCH_ARG =
  /^(git (?:checkout|switch|merge|rebase|branch -d|branch -D|push origin|pull origin)) (?!-)(\S+)/;

export function normalizeCommand(command: string): string {
  let text = command.trim().replace(/\s+/g, " ");
  const branch = BRANCH_ARG.exec(text);
  if (branch) text = `${branch[1]} <branch>${text.slice(branch[0].length)}`;
  for (const [pattern, placeholder] of RULES) text = text.replace(pattern, placeholder);
  return text.replace(/(<\w+>)(?: \1)+/g, "$1…");
}

const STOPWORDS = new Set(
  "a an and are as at be but by can could do does for from have how i in is it its me my of on or please our so that the then this to up us we what when where which will with would you your".split(
    " ",
  ),
);

/** Lower-case content words of a prompt (for similarity). */
export function promptTokens(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[`'"()[\]{}.,:;!?]/g, " ")
        .split(/\s+/)
        .map((w) => w.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""))
        .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
    ),
  ];
}

export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const sb = new Set(b);
  const inter = a.filter((x) => sb.has(x)).length;
  return inter / (a.length + b.length - inter);
}
