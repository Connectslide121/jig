/**
 * Claude's AskUserQuestion, as the step-by-step card (D-161) reads and answers it. Pure.
 */
export interface Question {
  question: string;
  header?: string;
  multiSelect?: boolean;
  options: Array<{ label: string; description?: string }>;
}

/** What you chose for one question: picked options, and the text of "Other…" when it's on. */
export interface Choice {
  picked: string[];
  other: string;
  otherOn: boolean;
}

export const EMPTY_CHOICE: Choice = { picked: [], other: "", otherOn: false };

/** "Capture Jenkins (Recommended)" → the label without the mark, and whether it had one. */
export function splitRecommended(label: string): { label: string; recommended: boolean } {
  const match = /^(.*?)\s*\(recommended\)\s*$/i.exec(label);
  return match ? { label: match[1] ?? label, recommended: true } : { label, recommended: false };
}

/** The answer Claude gets for a question: the picked labels, with your own text for "Other…". */
export function answerFor(question: Question, choice: Choice = EMPTY_CHOICE): string {
  const own = choice.otherOn ? choice.other.trim() : "";
  if (question.multiSelect) return [...choice.picked, own].filter(Boolean).join(", ");
  return own || (choice.otherOn ? "" : (choice.picked[0] ?? ""));
}

export const isAnswered = (question: Question, choice?: Choice) => answerFor(question, choice) !== "";

/** Picks an option: toggles it for several choices, replaces the pick (and "Other…") for one. */
export function pick(question: Question, choice: Choice | undefined, label: string): Choice {
  const current = choice ?? EMPTY_CHOICE;
  if (!question.multiSelect) return { ...current, picked: [label], otherOn: false };
  const picked = current.picked.includes(label)
    ? current.picked.filter((x) => x !== label)
    : [...current.picked, label];
  return { ...current, picked };
}

/** Turns "Other…" on or off; for a single choice it replaces the picked option. */
export function toggleOther(question: Question, choice: Choice | undefined): Choice {
  const current = choice ?? EMPTY_CHOICE;
  const otherOn = !current.otherOn;
  return question.multiSelect || !otherOn
    ? { ...current, otherOn }
    : { ...current, picked: [], otherOn: true };
}

/** The `answers` map AskUserQuestion takes: each question's text to its answer. */
export function answersOf(questions: Question[], choices: Choice[]): Record<string, string> {
  return Object.fromEntries(questions.map((q, i) => [q.question, answerFor(q, choices[i])]));
}
