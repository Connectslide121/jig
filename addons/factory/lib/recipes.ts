/**
 * Recipes (architecture.md → Recipes): one Markdown file per role, its front-matter saying what it
 * reads, what it writes, who runs it and which gate reviews it, its body the reviewed prompt.
 * Built-ins are in `addons/factory/recipes/`; a product repository overrides one with a file of the
 * same `id` in `<repo>/.jig/factory/recipes/`. Parsing, validation, override resolution and the
 * stage prompt are here, pure; the host reads the files (every time, so edits apply at once).
 */
import { parseProviderChoice, type TaskProvider } from "../../shared/providers";
import { parseFrontMatter } from "./frontmatter";
import { GATE_ORDER } from "./gates";
import type { GateId, Run, StageRun } from "./run";

export interface Recipe {
  id: string;
  /** The role the stage chat plays ("Sales enablement"). */
  role: string;
  /** The kind of output it makes (`demo`, `spec`); its id when not given. */
  kind: string;
  /** What it reads: output kinds (`brief`, `scout`), `demo.approved`, `kit.glossary`… */
  inputs: string[];
  /** The files it writes, relative to the run's folder; `{version}` is the stage's version. */
  outputs: string[];
  provider?: TaskProvider;
  model?: string;
  reviewer?: GateId;
  checks: string[];
  languageGroup?: string;
  /**
   * Other forms Jig makes of its outputs (D-467): `pdf` prints each `.html` output to an A4 PDF,
   * `pdf-slides` to a PDF of 16:9 slides (`api.capture.pdf`, D-466).
   */
  formats: RecipeFormat[];
  /** Bundled skills the stage should use when they are on (Settings → Skills), by id. */
  skills: string[];
  /** The prompt. */
  body: string;
  source: "built-in" | "repository";
  file: string;
}

export const RECIPE_FORMATS = ["pdf", "pdf-slides"] as const;
export type RecipeFormat = (typeof RECIPE_FORMATS)[number];

/** Inputs a recipe may name besides other recipes' kinds. */
const EXTRA_INPUTS = new Set([
  "input",
  "plan",
  "kit",
  "kit.glossary",
  "kit.tokens",
  "kit.brand",
  "kit.screenshots",
]);

function strings(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => x !== null && x !== "").map(String);
  if (typeof v === "string" && v) return [v];
  return [];
}

/** A recipe from its file's text. Throws when it has no front-matter or no id. */
export function parseRecipe(text: string, file: string, source: Recipe["source"] = "built-in"): Recipe {
  const { data, body } = parseFrontMatter(text);
  const id = typeof data.id === "string" ? data.id.trim() : "";
  if (!id) throw new Error(`${file}: no id in its front-matter`);
  const model = data.model === "default" ? undefined : data.model;
  const choice = parseProviderChoice({ provider: data.provider, model }, `recipe ${id}`);
  return {
    id,
    role: typeof data.role === "string" ? data.role : id,
    kind: typeof data.kind === "string" && data.kind ? data.kind : id,
    inputs: strings(data.inputs),
    outputs: strings(data.outputs),
    ...choice,
    reviewer: typeof data.reviewer === "string" ? (data.reviewer as GateId) : undefined,
    checks: strings(data.checks),
    languageGroup: typeof data.languageGroup === "string" ? data.languageGroup : undefined,
    skills: strings(data.skills),
    formats: strings(data.formats).filter((f): f is RecipeFormat =>
      (RECIPE_FORMATS as readonly string[]).includes(f),
    ),
    body: body.trim(),
    source,
    file,
  };
}

/**
 * What is wrong with a recipe, given the kinds every recipe makes: unknown inputs, outputs outside
 * the run's folder, a reviewer gate that doesn't exist, no prompt. Empty when it is fine.
 */
export function validateRecipe(recipe: Recipe, kinds: Iterable<string>): string[] {
  const known = new Set(kinds);
  const errors: string[] = [];
  for (const input of recipe.inputs) {
    const base = input.replace(/\.approved$/, "");
    if (!known.has(base) && !EXTRA_INPUTS.has(input)) errors.push(`unknown input "${input}"`);
  }
  if (!recipe.outputs.length) errors.push("no outputs");
  for (const out of recipe.outputs)
    if (!insideFolder(out)) errors.push(`output "${out}" is outside the run's folder`);
  if (recipe.reviewer && !GATE_ORDER.includes(recipe.reviewer))
    errors.push(`reviewer "${recipe.reviewer}" isn't a gate`);
  if (!recipe.body) errors.push("no prompt");
  if (recipe.formats.length && !recipe.outputs.some((o) => o.endsWith(".html")))
    errors.push("formats need an .html output");
  return errors.map((e) => `${recipe.file}: ${e}`);
}

/** A path relative to the run's folder that stays inside it. */
export function insideFolder(path: string): boolean {
  if (!path || path.startsWith("/") || path.startsWith("\\") || /^[A-Za-z]:/.test(path)) return false;
  return !path.split(/[\\/]/).some((part) => part === "..");
}

/**
 * The recipes a run uses: the built-ins, each replaced by a valid override of the same id from the
 * product repository. Invalid overrides are left out and their errors returned (the built-in stays).
 */
export function resolveRecipes(
  builtIns: Recipe[],
  overrides: Recipe[],
): { recipes: Map<string, Recipe>; errors: string[] } {
  const recipes = new Map(builtIns.map((r) => [r.id, r]));
  const kinds = [...builtIns, ...overrides].map((r) => r.kind);
  const errors: string[] = [];
  for (const o of overrides) {
    const problems = validateRecipe(o, kinds);
    if (problems.length) errors.push(...problems);
    else recipes.set(o.id, o);
  }
  return { recipes, errors };
}

/** The files a stage writes: the recipe's outputs with `{version}` filled in. */
export function outputPaths(recipe: Recipe, version = 1): string[] {
  return recipe.outputs.map((o) => o.replaceAll("{version}", String(version)));
}

/** The line every stage prompt starts with; the fake engine plays the role by it. */
export function marker(recipe: string, runId: string): string {
  return `[factory stage ${recipe} run ${runId}]`;
}

/** The rules every stage follows (pipeline.md → Rules every stage follows), short. */
export const RULES = [
  "Everything you write is a draft: front-matter `status: draft`; a person moves it on, never you.",
  "Write only inside the run's folder; commit your files on the run's branch in small commits with the run id in the message; never push.",
  "Demos, examples and sample data use invented data only: no real customer names, e-mail addresses or phone numbers. Name a real customer or buyer only where what came in names it (a change request, a tender), never in a demo.",
  "Write for the value to the customer, simply; follow the product's glossary when it has one.",
  "Nothing outward-facing: never publish, send, post or deploy.",
];

export interface PromptInput {
  recipe: Recipe;
  run: Pick<Run, "id" | "title" | "slug" | "level" | "languages">;
  stage: Pick<StageRun, "id" | "version" | "feedback" | "attempt">;
  /** The run's folder, absolute. */
  folder: string;
  /** The inputs found: what each is and where (relative to the folder). */
  inputs: Array<{ name: string; path: string }>;
}

/** A stage's first message: the marker, the role's prompt, its inputs and outputs, rules, how to report. */
export function stagePrompt(p: PromptInput): string {
  const version = p.stage.version ?? 1;
  const outs = outputPaths(p.recipe, version);
  const lines = [
    marker(p.recipe.id, p.run.id),
    "",
    `You are the ${p.recipe.role} stage (${p.stage.id}) of Jig factory's run "${p.run.title}"${p.stage.version ? `, version ${version}` : ""}.`,
    `The run's folder is ${p.folder} (on branch factory/${p.run.slug}).`,
    "",
    p.recipe.body,
    "",
    "## Inputs",
    ...(p.inputs.length
      ? p.inputs.map((i) => `- ${i.name}: ${i.path}`)
      : ["- (none yet: call addon_factory_brief)"]),
    "",
    "## Write",
    ...outs.map((o) => `- ${o}`),
  ];
  if (p.recipe.skills.length)
    lines.push(
      "",
      "## Skills",
      `Use these skills when this chat has them (Jig's library, Settings → Skills): ${p.recipe.skills.join(", ")}. Without them, follow this prompt alone.`,
    );
  if (p.stage.feedback) lines.push("", "## Changes asked at the gate", p.stage.feedback);
  lines.push(
    "",
    "## Rules",
    ...RULES.map((r) => `- ${r}`),
    "",
    "## When you are done",
    "Call addon_factory_report with the files you wrote (relative to the run's folder), a two-line summary and notes for the reviewer. If you can't go on without a person, call addon_factory_ask with your question and end your turn.",
  );
  return lines.join("\n");
}
