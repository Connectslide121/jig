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
  kind: SuggestionKind;
  addonId?: string;
  /** Workflow suggestions: the steps of the draft workflow. */
  steps?: string[];
  /** Notes from chats this is based on (`EvidenceNote` ids), shown with it. */
  noteIds?: string[];
  minutesPerWeek?: number;
  /** The patterns this is based on; "Never" blocks them. */
  patternKeys: string[];
  evidence: Pattern[];
  status: "new" | "snoozed" | "built" | "adopted" | "dismissed" | "never";
  snoozedUntil?: string;
  buildId?: string;
  /** When it was built or acted on (for "Did it help?"). */
  actedAt?: string;
  /** "Did it help?": checked a week or more after it was built or adopted. */
  outcome?: { checkedAt: string; helped: boolean; text: string };
}

/**
 * What a suggestion is (each has its own action): tools (layout, settings, change-addon, new-addon,
 * app → the builder), a workflow, Claude Code setup (MCP server, skill, hook), project memory
 * (CLAUDE.md), tips (prompting, habits; at most one a week), an automation (a routine), and additions
 * to your profile.
 */
export type SuggestionKind =
  | "layout"
  | "settings"
  | "change-addon"
  | "new-addon"
  | "app"
  | "workflow"
  | "claude-setup"
  | "project-memory"
  | "prompting-tip"
  | "habit-tip"
  | "automation"
  | "profile";

/** Kinds the builder makes (Build it). */
export const BUILD_KINDS: SuggestionKind[] = ["layout", "settings", "change-addon", "new-addon", "app"];
export const TIP_KINDS: SuggestionKind[] = ["prompting-tip", "habit-tip"];

/** A note Claude saved from a chat (`jig_note_evidence`): manual work, work outside Jig, friction… */
export interface EvidenceNote {
  id: string;
  at: string;
  category: "manual-work" | "outside-jig" | "frustration" | "chore" | "preference" | "other";
  /** A short summary or quote, in the user's words where possible. */
  text: string;
  projectId?: string;
  sessionId?: string;
}

/** The weekly "How you worked" summary (lines by Claude vs by hand; an estimate). */
export interface WorkedState {
  at: string;
  text: string;
  commits: number;
  ai: number;
  hand: number;
  churn: { ai: number; hand: number };
  repos: number;
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
  /** Weekly check-in: offer it once (after two weeks of use), or it is due. */
  checkIn: { offer: boolean; due: boolean; frequency: "off" | "weekly" | "biweekly"; last?: string };
}

/** build: the builder; act: its own action was taken (chat opened, profile updated…); dismiss: a tip. */
export type SuggestionAnswer = "build" | "act" | "snooze" | "dismiss" | "never";
