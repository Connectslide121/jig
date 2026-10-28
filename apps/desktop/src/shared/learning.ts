import type { Pattern } from "@jig/learning";

/** Suggestions and pattern runs (`~/.jig/suggestions.json`). Documented in docs/reference/learning.md. */
export interface Suggestion {
  id: string;
  createdAt: string;
  title: string;
  /** Why, in plain language, referring to the evidence. */
  why: string;
  /** What to ask the builder (Build it). */
  goal: string;
  level: 1 | 2 | 3;
  kind: "layout" | "settings" | "change-addon" | "new-addon" | "app";
  addonId?: string;
  minutesPerWeek?: number;
  /** The patterns this is based on; "Never" blocks them. */
  patternKeys: string[];
  evidence: Pattern[];
  status: "new" | "snoozed" | "built" | "never";
  snoozedUntil?: string;
  buildId?: string;
}

export interface PatternRun {
  at: string;
  trigger: "manual" | "schedule" | "catch-up";
  ok: boolean;
  patterns: number;
  suggestions: number;
  error?: string;
  /** Why no AI call was made (nothing repeated enough), so no quota was used. */
  note?: string;
}

export interface LearningState {
  suggestions: Suggestion[];
  runs: PatternRun[];
  lastRun?: string;
  nextRun?: string;
  running: boolean;
  stats: { days: number; events: number; bytes: number };
  recording: boolean;
}

export type SuggestionAnswer = "build" | "snooze" | "never";
