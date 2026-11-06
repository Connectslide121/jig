import { randomUUID } from "node:crypto";
import type { Pattern } from "@jig/learning";
import { SLOTS } from "@jig/sdk";
import { z } from "zod";
import { BUILD_KINDS, type EvidenceNote, type Suggestion, TIP_KINDS } from "../../shared/learning";
import { profileIsEmpty } from "./knowledge";

/**
 * The AI step: one Claude Code query (no tools) gets the mined patterns, notes, profile, activity,
 * Jig's features, the add-on catalog with their use and your past answers, and returns at most 3
 * suggestions as JSON, validated here. Existing things and safe practice come before new tools (D-213).
 */
export const REFLECTION_INSTRUCTIONS = `You review how the user works with Jig, a desktop workbench for AI coding chats, and suggest what would help them most. You are a thoughtful senior colleague who wants them to get the most out of Jig, not a tool salesman and not a security auditor.
You get: patterns mined from their local activity (repeated commands, sequences and similar prompts; friction such as interrupts, corrections, rewinds, long chats without a commit, hopping between projects and failing scripts; what they paste into chats; Jig tools with no recorded calls (not proof of non-use or denied permissions); views they keep opening as a tab, a "view-habit"; "practice" patterns: risky or careless practices; and "habit" patterns: how they prompt and run chats), notes Jig saved from their chats (manual work, work outside Jig, frustration, preferences), their profile, an overview of their activity, numbers on how they prompt, their recent chats message by message, lines written by Jig vs by hand, how Jig worked for them across chats (tools, skills, subagents, add-ons, MCP servers), Jig's own features, the installed add-ons with how much each was used, and their past answers with whether they helped.
Look at their work from these angles, and pick what would make the biggest difference. Spread your suggestions over different angles; don't spend them all on one:
- How they work with Jig, usually the biggest win. Read their recent chats the way a coach watching over their shoulder would, and find what would most improve their results or save them the most time; the "habit" patterns and the prompting numbers are only hints. Anything goes, for example: how clearly they say what they want and why; whether Jig gets the context it needs (or has to guess, or they paste what it could read itself); how big a piece of work they hand over (Jig can take a whole task end to end, so tiny one-off asks or feeding it piece by piece can waste time, while one huge chat for everything loses focus); whether they say how to check it's done and let Jig run the tests; planning before big changes; how they react when Jig goes wrong (correcting, rewinding, starting fresh); reusing what they keep explaining (CLAUDE.md, skills); working in parallel (worktrees, "Try several ways"); reviewing and committing in small steps. Name the one change that matters most, with their own messages as the evidence.
- Use what they already have: an installed add-on that fits but is unused or switched off ("use-addon"), a Jig feature they don't seem to use ("use-feature"), a setting, a Claude Code skill or MCP server.
- Safety and good practice: secrets in chats or commands, risky commands, skipped checks or tests, force pushes, work never committed, permissions skipped. A real security problem with evidence comes first; otherwise weigh it like the rest.
- Repeated work: a workflow, a routine, a line for CLAUDE.md.
- Only then a new tool or add-on to build, when nothing existing fits.
Suggest AT MOST 3 things, only with real evidence, each of one kind, ideally of different kinds:
- "prompting-tip": how to ask Jig better, ONLY from their own messages. "before": their real message(s) exactly as in the chats (several in order, one per line). "example": the same request rewritten the better way, as a prompt they could send next time, in their language and about their real project. "why": what made theirs weak and what it cost them. "changes": each difference between the two, as "what changed: why it's better". At most one.
- "habit-tip": a better way of working with Jig, from their activity; "actionId" when a Jig feature helps. At most one.
- "practice": a safer or better practice. "goal": what to change and how, concretely (a chat helps them fix it). Name the risk plainly; never quote a secret.
- "use-addon": an installed add-on that fits. "addonId" required; "actionId" one of its actions (addon.<id>.<action>) when you know it. "goal": what to use it for, and how.
- "use-feature": a Jig feature from the list. "actionId" from the list when it has one. "goal": when and how to use it.
- "workflow": a repeated multi-step chore. "steps": the steps in order. "goal": what it is for.
- "automation": something to run on a schedule as a Claude Code routine. "goal": what it does and when.
- "project-memory": something Jig keeps being told, for the project's CLAUDE.md. "goal": the text to add.
- "claude-setup": an MCP server, skill or hook for Claude Code. "goal": what to set up and why.
- a tool to build, AT MOST ONE per review and only if nothing existing does it: "layout" or "settings" (level 1), "change-addon" with its addonId or "new-addon" (level 2), or "app" (level 3: a new extension point). Don't stop at small helpers: when the evidence shows a whole area of work done outside Jig or by hand, propose the full module. Check it against "What Jig's builder can build" and pick the lowest level that does it. "goal" is what to ask Jig's builder: what it shows or does, where it appears (which slot) and what it uses (which program or data).
No tips at all when "Tips allowed: no".
Level: 1 for using what exists, tips and practices; 2 for workflows, automations and setup; 3 only for "app".
Be specific to THIS user (their projects, commands, words), never generic advice. Don't suggest what they said "never" to, nor repeat what they built, adopted or snoozed; learn from what helped and what didn't. Few good suggestions beat three weak ones.
Interpret evidence conservatively:
- Pasted screenshots are stored as files internally. Image paths, attachment names, Read calls and generated file-reference wrappers do not reveal whether an image was pasted, dropped or picked. Never infer "saves PNG files instead of pasting" from them. Shared-file counts prove only that files were shared. Missing metadata in older records is unknown, not evidence that no images were sent. Text word counts do not measure image context.
- Jig is already instructed to verify web UI changes with its browser/tester, without a repeated user reminder. Missing Jig browser tool events is a gap in recorded verification, not a user refusing or failing to allow it; other verification tools and subagent activity may not be visible. Never suggest "let Jig use the browser", a nonexistent enable-browser setting, or telling it to check every time. Only propose a user action when it is concrete, applicable and not already automatic; otherwise omit the suggestion. Visibility settings do not grant browser permission. Generic UI keywords do not establish browser applicability: desktop/Electron UI may be verified with Electron tests and screenshots instead, and browser verification needs an applicable web page/dev-server URL.
- Profile facts require direct user statements or unambiguous repeated behavior. Omit uncertain inferences and repository implementation details (such as where the app's tests live); those belong in project knowledge, not the user's profile.
Also propose additions to the profile ("profileUpdates": short facts the evidence shows, not already in it; none if unsure).
Answer with JSON only, no prose: {"suggestions":[{"title":"…","why":"… (cite the evidence: how often, on how many days, quotes)","goal":"…","level":1|2|3,"kind":"…","addonId":"…","actionId":"…","before":"…","example":"…","changes":["…"],"steps":["…"],"minutesPerWeek":N,"patternKeys":["…"],"noteIds":["…"]}],"profileUpdates":["…"]}
Return {"suggestions":[]} when nothing is worth it.`;

/**
 * What Jig's builder can make, so a "Build it" idea is one it can really build (built from the SDK's
 * slots; the builder's full instructions are in builder/prompt.ts).
 */
export const BUILDABLE = [
  "Level 1, no code: move, hide or show views; put one view under another; resize; theme, fonts, density; any setting.",
  "Level 2, an add-on (a plugin; changing an installed one beats a new one). It can: run the user's programs without a shell (git, gh, az, npm…), read and write files, call web APIs, ask Jig a one-shot question (summaries, commit messages, classifying), keep data per project, repository or globally, open a chat with a drafted message, run commands in a terminal, stream a long-running program's output live (logs, deploys, dev servers), watch files and folders for changes, react to what happens in Jig (a chat finished or needs them, a commit, a branch switch, another active project), show toasts with buttons (open a view, run something) and system notifications when Jig is in the background, put a count badge on its view (\"3 cards assigned to you\"), add its own results to Jig's search (Ctrl+P: work items, pipelines, runbooks), and share its data and actions with other add-ons. It plugs into:",
  ...Object.entries(SLOTS).map(([id, what]) => `- ${id}: ${what}`),
  "Think big: an add-on is a whole new feature or module of Jig, as ambitious as the need, not just a button. Most of Jig's own features (Git, Workflows, Releases…) are add-ons. It can bring a whole area of their work into Jig and let them act on it there, with Jig's help. A few examples of the range, not a menu: a board of their Azure DevOps or GitHub work items they can sort, update and start a chat from; a dashboard of their cloud resources and costs; a review queue of pull requests with Jig's summaries; a run-book that walks through an incident. Look at what they do outside Jig or by hand, again and again, and imagine the module that would make it effortless; size it to the need (a button when a button does it).",
  "Level 3 (\"app\"): anything else needs a new extension point in Jig's own code (a request to Jig's developers), e.g. changing how the chat itself works, or reaching into other apps' windows.",
].join("\n");

export interface PastAnswer {
  title: string;
  status: Suggestion["status"];
  /** "Did it help?" once checked. */
  outcome?: string;
}

/** What the reflection reads besides the patterns (Learning 2). */
export interface ReflectionContext {
  notes?: EvidenceNote[];
  profile?: string;
  worked?: string;
  /** How Claude worked across chats (`usageText`, D-185). */
  usage?: string;
  tipsAllowed?: boolean;
  /** Jig's own features (`featuresText`, D-213). */
  features?: string;
  /** Events per kind (`activityOverview`). */
  overview?: string;
  /** How they prompt, in numbers (`promptStats`, D-214). */
  prompting?: string;
  /** Recent chats message by message, masked (`chatSample`), for prompting tips. */
  chats?: string[];
}

export function reflectionPrompt(
  patterns: Pattern[],
  catalog: string,
  answers: PastAnswer[],
  context: ReflectionContext = {},
): string {
  const lines = patterns.map(
    (p) =>
      `- key: ${p.key} | ${p.kind} | "${p.summary}" | ${p.count} times on ${p.days} day(s) in ${p.projects} project(s)\n  examples: ${p.examples
        .slice(0, 3)
        .map((e) => `${e.at.slice(0, 16)} ${e.text}`)
        .join(" ; ")}`,
  );
  const past = answers.length
    ? answers.map((a) => `- ${a.title}: ${a.status}${a.outcome ? ` (${a.outcome})` : ""}`).join("\n")
    : "(none yet)";
  const notes = context.notes?.length
    ? context.notes.map((n) => `- id: ${n.id} | ${n.at.slice(0, 10)} | ${n.category} | ${n.text}`).join("\n")
    : "(none)";
  return [
    "## Evidence limits\nPasted images are stored as files. Image paths do not identify paste/drop/picker use; older missing attachment metadata is unknown. No recorded Jig browser calls does not establish denied permission or lack of other verification. Jig already has browser verification instructions; do not turn that responsibility into a user reminder habit.",
    `## Patterns\n${lines.join("\n") || "(none)"}`,
    `## Notes from chats\n${notes}`,
    `## Profile\n${context.profile?.trim() || "(empty)"}`,
    `## How they worked (last 7 days)\n${context.worked || "(no commits measured)"}`,
    `## Activity (last 4 weeks)\n${context.overview || "(not given)"}`,
    `## How they prompt (last 4 weeks)\n${context.prompting || "(not given)"}`,
    `## Recent chats, message by message (masked, shortened)\n${context.chats?.length ? context.chats.join("\n") : "(none)"}`,
    `## How Jig worked for them (last 4 weeks)\n${context.usage || "(no chats recorded)"}`,
    `## Jig's features\n${context.features || "(not given)"}`,
    `## Add-ons (installed, with their use in the last 4 weeks)\n${catalog}`,
    `## What Jig's builder can build (for a tool to build)\n${BUILDABLE}`,
    `## Past answers\n${past}`,
    `Tips allowed: ${context.tipsAllowed === false ? "no" : "yes (at most one prompting tip and one habit tip)"}`,
    "Reply with the JSON only.",
  ].join("\n\n");
}

const SuggestionSchema = z.object({
  title: z.string().min(3).max(120),
  why: z.string().min(3),
  goal: z.string().min(3),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  kind: z.enum([
    "layout",
    "settings",
    "change-addon",
    "new-addon",
    "app",
    "workflow",
    "claude-setup",
    "project-memory",
    "prompting-tip",
    "habit-tip",
    "automation",
    "use-addon",
    "use-feature",
    "practice",
  ]),
  addonId: z.string().optional(),
  actionId: z.string().max(200).optional(),
  example: z.string().max(4000).optional(),
  before: z.string().max(4000).optional(),
  changes: z.array(z.string().max(400)).max(8).optional(),
  steps: z.array(z.string()).optional(),
  noteIds: z.array(z.string()).optional(),
  minutesPerWeek: z.number().nonnegative().optional(),
  patternKeys: z.array(z.string()).default([]),
});

/** A prompting tip's rewritten prompt, with the original and the changes only beside it. */
function promptingFields(
  s: z.infer<typeof SuggestionSchema>,
): Pick<Suggestion, "example" | "before" | "changes"> {
  const example = s.kind === "prompting-tip" ? s.example?.trim() : undefined;
  if (!example) return {};
  const changes = (s.changes ?? []).map((c) => c.trim()).filter(Boolean);
  return { example, before: s.before?.trim() || undefined, changes: changes.length ? changes : undefined };
}

const ReplySchema = z.object({
  suggestions: z.array(SuggestionSchema).max(3),
  profileUpdates: z.array(z.string()).optional(),
});

/**
 * Parses the model's reply (tolerating text around the JSON); throws with a readable message. Tips
 * beyond one of each kind (or any, when not allowed) are dropped (D-214), so are tools to build beyond
 * the first and "use-addon" ones without an add-on (D-213); profile updates become one "profile"
 * suggestion.
 */
export function parseReflection(
  text: string,
  patterns: Pattern[],
  now = new Date(),
  options: { notes?: EvidenceNote[]; tipsAllowed?: boolean } = {},
): Suggestion[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("The reply had no JSON");
  let json: unknown;
  try {
    json = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("The reply wasn't valid JSON");
  }
  const result = ReplySchema.safeParse(json);
  if (!result.success)
    throw new Error(`The reply didn't match the expected format: ${result.error.issues[0]?.message}`);
  const known = new Map(patterns.map((p) => [p.key, p]));
  const noteIds = new Set((options.notes ?? []).map((n) => n.id));
  const tips = new Set<string>();
  let builds = 0;
  const picked = result.data.suggestions.filter((s) => {
    if (s.kind === "use-addon" && !s.addonId) return false;
    if (BUILD_KINDS.includes(s.kind)) return ++builds === 1;
    if (!TIP_KINDS.includes(s.kind)) return true;
    if (options.tipsAllowed === false || tips.has(s.kind)) return false;
    tips.add(s.kind);
    return true;
  });
  const suggestions: Suggestion[] = picked.map((s) => {
    const keys = s.patternKeys.filter((k) => known.has(k));
    const notes = (s.noteIds ?? []).filter((id) => noteIds.has(id));
    return {
      id: randomUUID().slice(0, 8),
      createdAt: now.toISOString(),
      title: s.title,
      why: s.why,
      goal: s.goal,
      level: s.level,
      kind: s.kind,
      addonId: s.addonId || undefined,
      actionId: s.actionId?.trim() || undefined,
      ...promptingFields(s),
      steps: s.kind === "workflow" && s.steps?.length ? s.steps : undefined,
      noteIds: notes.length ? notes : undefined,
      minutesPerWeek: s.minutesPerWeek,
      patternKeys: keys,
      evidence: keys.map((k) => known.get(k)!),
      status: "new" as const,
    };
  });
  const updates = (result.data.profileUpdates ?? [])
    .map((u) => u.trim())
    .filter(Boolean)
    .slice(0, 8);
  if (updates.length)
    suggestions.push({
      id: randomUUID().slice(0, 8),
      createdAt: now.toISOString(),
      title: "Add to what Jig knows about you",
      why: "From your recent activity and chats.",
      goal: updates.join("\n"),
      level: 1,
      kind: "profile",
      patternKeys: [],
      evidence: [],
      status: "new",
    });
  return suggestions;
}

/**
 * The first message of a weekly check-in chat: Jig asks 3–5 short questions chosen from the gaps
 * in the profile and from recent notes, then updates the profile with `jig_update_profile`.
 */
export function checkInPrompt(profile: string, notes: EvidenceNote[]): string {
  const gaps = profile
    .split("\n")
    .map((l, i, all) => ({ l, next: all.slice(i + 1).find((x) => x.trim() && !x.startsWith("<!--")) }))
    .filter(({ l, next }) => /^##\s/.test(l) && (!next || /^#/.test(next)))
    .map(({ l }) => l.replace(/^##\s*/, ""));
  return [
    "Weekly check-in (Jig). Keep it short: ask me 3–5 questions, one at a time, to understand how I work, so Jig can suggest better tools and habits.",
    gaps.length ? `My profile has nothing yet under: ${gaps.join(", ")}.` : "",
    notes.length
      ? `Notes from my recent chats:\n${notes
          .slice(-8)
          .map((n) => `- ${n.text}`)
          .join("\n")}`
      : "",
    "Start from the notes (e.g. something I keep doing by hand) or the gaps. When we're done, read my profile with jig_read_profile and add what you learned with jig_update_profile (short facts under the right headings), then tell me in one line what you added.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * The first message of the profile interview (D-169): Jig interviews the user in a normal chat, one
 * question at a time with follow-ups, and writes what it learns with `jig_update_profile` as it goes.
 */
export function profileInterviewPrompt(profile: string, notes: EvidenceNote[]): string {
  const filled = !profileIsEmpty(profile);
  return [
    "Profile interview (Jig). Jig knows almost nothing about how I work yet. Interview me so it can suggest better tools, workflows and habits, and write what you learn into my Jig profile.",
    'How: ask ONE question at a time and wait for my answer. Follow up when an answer is vague or interesting ("which tool exactly?", "how often?", "what\'s annoying about it?"), but don\'t interrogate: move on once you understand. Plain language, short questions, no lists of questions.',
    "Cover, in a natural order: what I build and with what stack; how I release and deploy; which tools and portals I use outside Jig; what I do by hand repeatedly; what frustrates me; my preferences for how Jig should work with me; what I already know well. Skip what the profile already answers.",
    filled
      ? `My profile so far:\n${profile.trim()}`
      : "My profile is empty (only the headings: Stack, How I release and deploy, Tools I use outside Jig, Preferences, What I already know well).",
    notes.length
      ? `Notes from my recent chats, a good place to start:\n${notes
          .slice(-8)
          .map((n) => `- ${n.text}`)
          .join("\n")}`
      : "",
    "After every couple of answers, save what you learned with jig_update_profile (short facts, one per line, under the right heading; never secrets or credentials), so nothing is lost if I stop early. Read my profile first with jig_read_profile. Stop after about 8–10 questions, or sooner if I say so, and tell me in one line what you added. I can always run this again later.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
