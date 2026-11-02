/**
 * Test suites in a repository: npm scripts that run tests (Vitest, Jest, Playwright, Karma/Angular,
 * Cypress, a project's own check) and .NET test projects. Pure: the host reads the files.
 */

export type SuiteKind = "unit" | "e2e" | "check" | "changed";

export interface Suite {
  /** Stable within the repository: `npm:<script>` or `dotnet:<project path>`. */
  id: string;
  /** What the row says: the script name or the project's name. */
  label: string;
  kind: SuiteKind;
  /** The program and its arguments (run without a shell). */
  command: string;
  args: string[];
  /** Folder to run in, relative to the repository ('' for its root). */
  cwd: string;
  /** The script's text, for the row's tooltip. */
  detail: string;
}

const TEST_RUNNERS = /\b(vitest|jest|playwright|karma|ng test|cypress|mocha|ava|node --test|dotnet test)\b/;
const NAME = /^(test|tests|e2e|check|unit|integration|spec)([:-].*)?$/;

/** The kind a script reads as: what a change needs, end-to-end, a full check, or unit tests. */
export function suiteKind(name: string, script: string): SuiteKind {
  if (/changed|affected|related/.test(name)) return "changed";
  if (/e2e|playwright|cypress|integration/.test(`${name} ${script}`)) return "e2e";
  if (/^check/.test(name)) return "check";
  return "unit";
}

/** npm scripts that run tests, from a package.json's text (`dir` relative to the repository). */
export function npmSuites(packageJson: string, dir = ""): Suite[] {
  let scripts: Record<string, unknown> = {};
  try {
    scripts = (JSON.parse(packageJson) as { scripts?: Record<string, unknown> }).scripts ?? {};
  } catch {
    return [];
  }
  const suites: Suite[] = [];
  for (const [name, value] of Object.entries(scripts)) {
    if (typeof value !== "string") continue;
    // npm's own placeholder test script runs nothing.
    if (/no test specified/.test(value)) continue;
    if (!NAME.test(name) && !TEST_RUNNERS.test(value)) continue;
    // Watchers never finish: they aren't a run with a result.
    if (/(^|:)watch$|--watch\b|\bwatch\b/.test(`${name} ${value}`) && !/--watch=false|--no-watch/.test(value))
      continue;
    suites.push({
      id: `npm:${dir ? `${dir}/` : ""}${name}`,
      label: dir ? `${dir} · ${name}` : name,
      kind: suiteKind(name, value),
      command: "npm",
      args: ["run", name],
      cwd: dir,
      detail: value,
    });
  }
  return suites;
}

/** A .NET test project (`*.Tests.csproj`, or one that references a test SDK). */
export function dotnetSuite(projectPath: string, csproj: string): Suite | undefined {
  const name = projectPath
    .split("/")
    .pop()!
    .replace(/\.csproj$/, "");
  const isTest =
    /(\.|^)(Tests?|UnitTests|IntegrationTests|Specs)$/.test(name) ||
    /Microsoft\.NET\.Test\.Sdk|<IsTestProject>\s*true/i.test(csproj);
  if (!isTest) return undefined;
  return {
    id: `dotnet:${projectPath}`,
    label: name,
    kind: /Integration|E2E|EndToEnd/i.test(name) ? "e2e" : "unit",
    command: "dotnet",
    args: ["test", projectPath],
    cwd: "",
    detail: `dotnet test ${projectPath}`,
  };
}

const ORDER: SuiteKind[] = ["changed", "unit", "check", "e2e"];

/** Suites in the order the view shows them: what a change needs first, then by kind and name. */
export function sortSuites(suites: Suite[]): Suite[] {
  return [...suites].sort(
    (a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.label.localeCompare(b.label),
  );
}
