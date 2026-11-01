import { randomUUID } from "node:crypto";
import type { Pattern } from "@jig/learning";
import { z } from "zod";
import { BUILD_KINDS, type EvidenceNote, type Suggestion, TIP_KINDS } from "../../shared/learning";
import { profileIsEmpty } from "./knowledge";

/**
 * The AI step: one Claude Code query (no tools) gets the mined patterns, notes, profile, activity,
 * Jig's features, the add-on catalog with their use and your past answers, and returns at most 3
 * suggestions as JSON, validated here. Existing things and safe practice come before new tools (D-213).
 */
export const REFLECTION_INSTRUCTIONS = `You review how the user works with Jig, a desktop workbench around Claude Code, and suggest what would help them most. You are a thoughtful senior colleague, not a tool salesman.
You get: patterns mined from their local activity (repeated commands, sequences and similar prompts; friction such as interrupts, corrections and failing scripts; what they paste into chats; Jig tools that fit but were never used; views they keep opening as a tab, a "view-habit"; and "practice" patterns: risky or careless practices, security first), notes Claude saved from their chats (manual work, work outside Jig, frustration, preferences), their profile, an overview of their activity, a sample of their recent messages to Claude, lines written by Claude vs by hand, how Claude worked for them across chats (tools, skills, subagents, add-ons, MCP servers), Jig's own features, the installed add-ons with how much each was used, and their past answers with whether they helped.
Look at their work from these angles, and pick what matters most:
1. Safety and good practice: secrets in chats or commands, risky commands, skipped checks or tests, force pushes, work that is never committed, permissions skipped. A security problem with evidence comes first.
2. Use what they already have: an installed add-on that fits but is unused or switched off ("use-addon"), a Jig feature they don't seem to use ("use-feature"), a setting, a Claude Code skill or MCP server.
3. How they work with Claude: prompting (vague asks, missing context, one huge chat for everything, correcting Claude often, pasting what Claude could read itself) and habits (plan first, worktrees for parallel work, tests before commits). Quote their own messages as before/after.
4. Repeated work: a workflow, a routine, a line for CLAUDE.md.
5. Only then a new tool or add-on to build, when nothing existing fits.
Suggest AT MOST 3 things, only with real evidence, each of one kind, ideally of different kinds:
- "practice": a safer or better practice. "goal": what to change and how, concretely (a chat helps them fix it). Name the risk plainly; never quote a secret.
- "use-addon": an installed add-on that fits. "addonId" required; "actionId" one of its actions (addon.<id>.<action>) when you know it. "goal": what to use it for, and how.
- "use-feature": a Jig feature from the list. "actionId" from the list when it has one. "goal": when and how to use it.
- "prompting-tip" or "habit-tip": coaching, ONLY with the user's own messages or activity as evidence (quote them, before/after); at most one tip in total (none when "Tips allowed: no").
- "workflow": a repeated multi-step chore. "steps": the steps in order. "goal": what it is for.
- "automation": something to run on a schedule as a Claude Code routine. "goal": what it does and when.
- "project-memory": something Claude keeps being told, for the project's CLAUDE.md. "goal": the text to add.
- "claude-setup": an MCP server, skill or hook for Claude Code. "goal": what to set up and why.
- a tool to build, AT MOST ONE per review and only if nothing existing does it: "layout" or "settings" (level 1), "change-addon" with its addonId or "new-addon" (level 2), or "app" (level 3: a new extension point). "goal" is what to ask Jig's builder.
Level: 1 for using what exists, tips and practices; 2 for workflows, automations and setup; 3 only for "app".
Be specific to THIS user (their projects, commands, words), never generic advice. Don't suggest what they said "never" to, nor repeat what they built, adopted or snoozed; learn from what helped and what didn't. Few good suggestions beat three weak ones.
Also propose additions to the profile ("profileUpdates": short facts the evidence shows, not already in it; none if unsure).
Answer with JSON only, no prose: {"suggestions":[{"title":"…","why":"… (cite the evidence: how often, on how many days, quotes)","goal":"…","level":1|2|3,"kind":"…","addonId":"…","actionId":"…","steps":["…"],"minutesPerWeek":N,"patternKeys":["…"],"noteIds":["…"]}],"profileUpdates":["…"]}
Return {"suggestions":[]} when nothing is worth it.`;

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
  /** Recent messages to Claude, masked (`promptSample`), for prompting tips. */
  prompts?: string[];
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
    `## Patterns\n${lines.join("\n") || "(none)"}`,
    `## Notes from chats\n${notes}`,
    `## Profile\n${context.profile?.trim() || "(empty)"}`,
    `## How they worked (last 7 days)\n${context.worked || "(no commits measured)"}`,
    `## Activity (last 4 weeks)\n${context.overview || "(not given)"}`,
    `## Recent messages to Claude (masked, shortened)\n${context.prompts?.length ? context.prompts.map((p) => `- ${p}`).join("\n") : "(none)"}`,
    `## How Claude worked for them (last 4 weeks)\n${context.usage || "(no chats recorded)"}`,
    `## Jig's features\n${context.features || "(not given)"}`,
    `## Add-ons (installed, with their use in the last 4 weeks)\n${catalog}`,
    `## Past answers\n${past}`,
    `Tips allowed: ${context.tipsAllowed === false ? "no" : "yes (at most one)"}`,
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
  steps: z.array(z.string()).optional(),
  noteIds: z.array(z.string()).optional(),
  minutesPerWeek: z.number().nonnegative().optional(),
  patternKeys: z.array(z.string()).default([]),
});

const ReplySchema = z.object({
  suggestions: z.array(SuggestionSchema).max(3),
  profileUpdates: z.array(z.string()).optional(),
});

/**
 * Parses the model's reply (tolerating text around the JSON); throws with a readable message. Tips
 * beyond the first (or any, when not allowed) are dropped, so are tools to build beyond the first
 * and "use-addon" ones without an add-on (D-213); profile updates become one "profile" suggestion.
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
  let tips = options.tipsAllowed === false ? 1 : 0;
  let builds = 0;
  const picked = result.data.suggestions.filter((s) => {
    if (s.kind === "use-addon" && !s.addonId) return false;
    if (BUILD_KINDS.includes(s.kind)) return ++builds === 1;
    if (!TIP_KINDS.includes(s.kind)) return true;
    tips++;
    return tips === 1;
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
 * The first message of a weekly check-in chat: Claude asks 3–5 short questions chosen from the gaps
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
 * The first message of the profile interview (D-169): Claude interviews the user in a normal chat, one
 * question at a time with follow-ups, and writes what it learns with `jig_update_profile` as it goes.
 */
export function profileInterviewPrompt(profile: string, notes: EvidenceNote[]): string {
  const filled = !profileIsEmpty(profile);
  return [
    "Profile interview (Jig). Jig knows almost nothing about how I work yet. Interview me so it can suggest better tools, workflows and habits, and write what you learn into my Jig profile.",
    'How: ask ONE question at a time and wait for my answer. Follow up when an answer is vague or interesting ("which tool exactly?", "how often?", "what\'s annoying about it?"), but don\'t interrogate: move on once you understand. Plain language, short questions, no lists of questions.',
    "Cover, in a natural order: what I build and with what stack; how I release and deploy; which tools and portals I use outside Jig; what I do by hand repeatedly; what frustrates me; my preferences for how Claude should work with me; what I already know well. Skip what the profile already answers.",
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
