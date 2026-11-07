/**
 * The one-page brief (docs/plan/28-factory/pipeline.md → The interview) as the Interview tab and
 * G0 read it: its sections, how many of them have text (coverage, D-461), its open points (gaps),
 * the level the interviewer suggests and why, and the languages per output group (D-439).
 */
import { type FrontMatter, parseFrontMatter } from "./frontmatter";
import type { Level } from "./run";

/** The brief's content sections, in order; coverage counts these. */
export const BRIEF_SECTIONS = [
  "Problem",
  "Value",
  "Users",
  "Main flow",
  "Key screens",
  "Scope",
  "Out of scope",
  "Data",
  "Rules",
] as const;

export type BriefSection = (typeof BRIEF_SECTIONS)[number];

/** Output groups that get a language of their own (D-439). */
export const LANGUAGE_GROUPS = ["docs", "sales", "learning", "marketing"] as const;
export type LanguageGroup = (typeof LANGUAGE_GROUPS)[number];

export const LANGUAGE_GROUP_LABELS: Record<LanguageGroup, string> = {
  docs: "Docs",
  sales: "Sales",
  learning: "Learning",
  marketing: "Marketing",
};

/** Languages offered in the Plan step (ISO codes); anything else in a brief is kept as written. */
export const LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "en", label: "English" },
  { code: "sv", label: "Swedish" },
  { code: "nb", label: "Norwegian" },
  { code: "da", label: "Danish" },
  { code: "fi", label: "Finnish" },
  { code: "de", label: "German" },
  { code: "nl", label: "Dutch" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
];

export interface BriefDoc {
  title?: string;
  data: FrontMatter;
  sections: Record<BriefSection, string>;
  /** "Open points": one line each. */
  gaps: string[];
  level?: Level;
  /** Why that level, as the interviewer or scout wrote it. */
  levelWhy?: string;
  languages: Partial<Record<LanguageGroup, string>>;
  coverage: { covered: number; total: number };
}

const norm = (s: string) => s.trim().toLowerCase();
const asLevel = (v: unknown): Level | undefined => (v === "L1" || v === "L2" || v === "L3" ? v : undefined);

/** Reads a brief's Markdown (front-matter, `# Title`, `## Section` blocks). Missing sections are "". */
export function parseBrief(text: string): BriefDoc {
  const { data, body } = parseFrontMatter(text);
  const blocks = new Map<string, string>();
  let current: string | undefined;
  let title = typeof data.title === "string" ? data.title : undefined;
  const lines: string[] = [];
  const flush = () => {
    if (current !== undefined) blocks.set(norm(current), lines.join("\n").trim());
    lines.length = 0;
  };
  for (const line of body.split("\n")) {
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    if (h2) {
      flush();
      current = h2[1] ?? "";
      continue;
    }
    const h1 = /^#\s+(.+?)\s*$/.exec(line);
    if (h1 && current === undefined) {
      title ??= h1[1];
      continue;
    }
    if (current !== undefined) lines.push(line);
  }
  flush();
  const sections = Object.fromEntries(BRIEF_SECTIONS.map((s) => [s, blocks.get(norm(s)) ?? ""])) as Record<
    BriefSection,
    string
  >;
  const open = blocks.get("open points") ?? "";
  const gaps = open
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*]|\d+\.)\s*/, "").trim())
    .filter((l) => l && !/^(none|—|-)$/i.test(l));
  const covered = BRIEF_SECTIONS.filter((s) => sections[s].trim()).length;
  return {
    title,
    data,
    sections,
    gaps,
    level: asLevel(data.level),
    levelWhy: typeof data.levelWhy === "string" ? data.levelWhy : undefined,
    languages: languagesOf(data.languages),
    coverage: { covered, total: BRIEF_SECTIONS.length },
  };
}

/**
 * The brief's `languages`: a single code for every group (`en`), a list (`[en, sv]`: the first for
 * docs, the others for the rest), or `group: code` pairs (`docs: en, sales: sv`).
 */
export function languagesOf(v: unknown): Partial<Record<LanguageGroup, string>> {
  const out: Partial<Record<LanguageGroup, string>> = {};
  const isGroup = (g: string): g is LanguageGroup => (LANGUAGE_GROUPS as readonly string[]).includes(g);
  if (typeof v === "string") {
    const pairs = v.split(",").map((p) => p.split(":").map((x) => x.trim()));
    if (pairs.every((p) => p.length === 2)) {
      for (const [g, code] of pairs) if (g && code && isGroup(g)) out[g] = code;
      return out;
    }
    if (v.trim()) for (const g of LANGUAGE_GROUPS) out[g] = v.trim();
    return out;
  }
  if (Array.isArray(v)) {
    const codes = v.filter((x): x is string => typeof x === "string" && !!x.trim());
    const [first, second] = codes;
    if (first) out.docs = first;
    for (const g of ["sales", "learning", "marketing"] as const)
      if (second ?? first) out[g] = second ?? first;
  }
  return out;
}

/** Every group's language: the brief's, else `fallback` (`factory.defaultLanguage`, English). */
export function planLanguages(
  brief: Partial<Record<LanguageGroup, string>>,
  fallback = "en",
): Record<LanguageGroup, string> {
  return Object.fromEntries(LANGUAGE_GROUPS.map((g) => [g, brief[g] || fallback])) as Record<
    LanguageGroup,
    string
  >;
}

/** The output group a pack output (a fan-out recipe) belongs to, for its language. */
export function groupOf(output: string): LanguageGroup {
  return (
    PLAN_OUTPUTS.find((o) => o.id === output)?.group ?? (output.startsWith("course") ? "learning" : "docs")
  );
}

/**
 * The pack's outputs the Plan step offers (D-460, D-467), each in its language group; the default ones
 * ticked. `pair` is the other form of the same thing (D-445): the review shows them side by side.
 */
export const PLAN_OUTPUTS: Array<{
  id: string;
  label: string;
  group: LanguageGroup;
  ticked: boolean;
  pair?: string;
}> = [
  { id: "spec", label: "Spec", group: "docs", ticked: true },
  { id: "stories", label: "User stories", group: "docs", ticked: true },
  { id: "tests", label: "Test cases", group: "docs", ticked: true },
  { id: "release-notes", label: "Release notes", group: "docs", ticked: false },
  { id: "glossary", label: "Glossary changes", group: "docs", ticked: false },
  { id: "pitch", label: "Pitch", group: "sales", ticked: true },
  { id: "deck", label: "Deck", group: "sales", ticked: true, pair: "deck-images" },
  { id: "deck-images", label: "Deck as images (ChatGPT)", group: "sales", ticked: false, pair: "deck" },
  { id: "one-pager", label: "One-pager", group: "sales", ticked: true, pair: "one-pager-images" },
  {
    id: "one-pager-images",
    label: "One-pager as an image (ChatGPT)",
    group: "sales",
    ticked: false,
    pair: "one-pager",
  },
  { id: "objections", label: "Objection handling", group: "sales", ticked: false },
  { id: "letter", label: "Customer letter", group: "sales", ticked: false },
  { id: "course-sales", label: "Sales course", group: "learning", ticked: false },
  { id: "course-customer", label: "Customer course", group: "learning", ticked: false },
  { id: "marketing", label: "Marketing plan", group: "marketing", ticked: true },
  { id: "article", label: "Article", group: "marketing", ticked: false },
  { id: "linkedin", label: "LinkedIn drafts", group: "marketing", ticked: false },
  { id: "newsletter", label: "Newsletter", group: "marketing", ticked: false },
  { id: "marketing-images", label: "Marketing images (ChatGPT)", group: "marketing", ticked: false },
  { id: "teaser", label: "Teaser film", group: "marketing", ticked: false },
];
