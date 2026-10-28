import { randomUUID } from "node:crypto";
import type { Pattern } from "@jig/learning";
import { z } from "zod";
import type { Suggestion } from "../../shared/learning";

/**
 * The AI step: one Claude Code query (no tools) gets the mined patterns, the add-on catalog and your
 * past answers, and returns at most 3 suggestions as JSON, validated here.
 */
export const REFLECTION_INSTRUCTIONS = `You help Jig, a desktop workbench around Claude Code, suggest tools that save its user time.
You get patterns mined from the user's local activity (commands, sequences of commands, similar prompts), the add-ons that exist, and the user's past answers to suggestions.
Suggest AT MOST 3 tools that would clearly save time, only where the evidence is strong. Prefer, in order: a layout/settings change (level 1), changing an existing add-on when it fits (level 2, kind "change-addon" with its addonId), a new add-on (level 2), and only if nothing else can, a new extension point in Jig (level 3, kind "app": the builder proposes it and the user adds it to Jig's code).
Don't suggest what the user said "never" to, nor repeat what they already built or snoozed.
Answer with JSON only, no prose: {"suggestions":[{"title":"…","why":"… (cite the evidence: how often, on how many days)","goal":"what to ask Jig's builder, concrete and complete","level":1|2|3,"kind":"layout"|"settings"|"change-addon"|"new-addon"|"app","addonId":"…","minutesPerWeek":N,"patternKeys":["…"]}]}
Return {"suggestions":[]} when nothing is worth it.`;

export interface PastAnswer {
  title: string;
  status: Suggestion["status"];
}

export function reflectionPrompt(patterns: Pattern[], catalog: string, answers: PastAnswer[]): string {
  const lines = patterns.map(
    (p) =>
      `- key: ${p.key} | ${p.kind} | "${p.summary}" | ${p.count} times on ${p.days} day(s) in ${p.projects} project(s)\n  examples: ${p.examples
        .slice(0, 3)
        .map((e) => `${e.at.slice(0, 16)} ${e.text}`)
        .join(" ; ")}`,
  );
  const past = answers.length ? answers.map((a) => `- ${a.title}: ${a.status}`).join("\n") : "(none yet)";
  return `## Patterns\n${lines.join("\n")}\n\n## Add-ons\n${catalog}\n\n## Past answers\n${past}\n\nReply with the JSON only.`;
}

const SuggestionSchema = z.object({
  title: z.string().min(3).max(120),
  why: z.string().min(3),
  goal: z.string().min(3),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  kind: z.enum(["layout", "settings", "change-addon", "new-addon", "app"]),
  addonId: z.string().optional(),
  minutesPerWeek: z.number().nonnegative().optional(),
  patternKeys: z.array(z.string()).default([]),
});

const ReplySchema = z.object({ suggestions: z.array(SuggestionSchema).max(3) });

/** Parses the model's reply (tolerating text around the JSON); throws with a readable message. */
export function parseReflection(text: string, patterns: Pattern[], now = new Date()): Suggestion[] {
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
  return result.data.suggestions.map((s) => {
    const keys = s.patternKeys.filter((k) => known.has(k));
    return {
      id: randomUUID().slice(0, 8),
      createdAt: now.toISOString(),
      title: s.title,
      why: s.why,
      goal: s.goal,
      level: s.level,
      kind: s.kind,
      addonId: s.addonId || undefined,
      minutesPerWeek: s.minutesPerWeek,
      patternKeys: keys,
      evidence: keys.map((k) => known.get(k)!),
      status: "new" as const,
    };
  });
}
