/**
 * Picks the e2e specs a change needs (npm run e2e:changed). Pure: the CLI in e2e-changed.ts reads git
 * and the files. Rules live in e2e/affected.json.
 */
import { matchesGlob } from "node:path";

export interface AffectedRules {
  always: string[];
  all: string[];
  ignore: string[];
  fallback: string[];
  rules: Array<{ files: string[]; specs: string[] }>;
}

export interface ChangedFile {
  path: string;
  /** The file's text now (empty when deleted), to find the data-testids it renders. */
  text: string;
}

export interface Selection {
  /** Every spec (`all`), or the chosen spec file names. */
  specs: "all" | string[];
  /** Why each spec runs: spec → the changed files (or rule) that picked it. */
  reasons: Record<string, string[]>;
  /** Changed files nothing mapped: they ran the fallback specs. */
  unmapped: string[];
}

const matches = (path: string, globs: string[]) => globs.some((g) => matchesGlob(path, g));

/** Generic ids many views use: they would pick half the suite without telling anything. */
const COMMON_IDS = new Set(["loading", "dialog", "close", "menu"]);

/** The data-testids a source file renders: exact ids and the fixed prefix of templated ones. */
export function testIds(text: string): string[] {
  const ids = new Set<string>();
  for (const m of text.matchAll(/data-testid=(?:\{\s*)?["'`]([a-z0-9][a-z0-9-]*)(\$\{)?/g)) {
    const id = m[1]!;
    // A templated id (`files-entry-${name}`) counts by its prefix.
    if (m[2] && !id.endsWith("-")) continue;
    if (id.length >= 4 && !COMMON_IDS.has(id)) ids.add(id);
  }
  return [...ids];
}

/** Whether a spec's text uses the id (`getByTestId("id")`, `[data-testid=id]`, or a prefix of it). */
function specUses(spec: string, id: string): boolean {
  if (id.endsWith("-")) return spec.includes(`"${id}`) || spec.includes(`\`${id}`) || spec.includes(`=${id}`);
  return (
    spec.includes(`"${id}"`) ||
    spec.includes(`'${id}'`) ||
    spec.includes(`=${id}]`) ||
    spec.includes(`^=${id}`) ||
    spec.includes(`\`${id}\``)
  );
}

export function selectSpecs(
  changed: ChangedFile[],
  specs: Array<{ name: string; text: string }>,
  rules: AffectedRules,
): Selection {
  const reasons: Record<string, string[]> = {};
  const unmapped: string[] = [];
  const pick = (spec: string, why: string) => {
    if (!specs.some((s) => s.name === spec)) return;
    const list = reasons[spec] ?? [];
    reasons[spec] = list;
    if (!list.includes(why)) list.push(why);
  };
  let relevant = false;
  for (const file of changed) {
    const path = file.path.replaceAll("\\", "/");
    if (matches(path, rules.ignore)) continue;
    relevant = true;
    if (matches(path, rules.all)) return { specs: "all", reasons: { all: [path] }, unmapped: [] };
    let mapped = false;
    if (path.startsWith("e2e/") && path.endsWith(".spec.ts")) {
      pick(path.slice(4), path);
      mapped = true;
    }
    for (const rule of rules.rules)
      if (matches(path, rule.files)) {
        for (const spec of rule.specs) pick(spec, path);
        mapped = true;
      }
    for (const id of testIds(file.text))
      for (const spec of specs)
        if (specUses(spec.text, id)) {
          pick(spec.name, `${path} (${id})`);
          mapped = true;
        }
    if (!mapped) unmapped.push(path);
  }
  if (!relevant) return { specs: [], reasons: {}, unmapped: [] };
  for (const file of unmapped) for (const spec of rules.fallback) pick(spec, `${file} (no rule)`);
  for (const spec of rules.always) pick(spec, "always");
  return { specs: Object.keys(reasons).sort(), reasons, unmapped };
}
