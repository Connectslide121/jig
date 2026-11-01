import type { PermissionRequest } from "../../../shared/engine";

/** Understanding short spoken answers while talking with Claude (D-209). */

const clean = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const YES =
  /^(yes|yeah|yep|yup|sure|ok|okay|alright|all right|go|go ahead|do it|start|let's go|sounds good|perfect|great|approved?|correct|right|of course|please do|absolutely|sí|si|vale|dale|claro|ja|oui|da)(?= |$)/;
const NO = /^(no|nope|nah|don't|do not|wait|not yet|hold on|stop|cancel)(?= |$)/;
const END = /^(stop listening|stop talking|that's all|bye|goodbye|good bye|end conversation|we're done)$/;

/** "Yes, go ahead": a short answer that agrees and adds nothing else. */
export function isYes(text: string): boolean {
  const t = clean(text);
  if (!YES.test(t) || NO.test(t)) return false;
  // "Yes, but change the name" is feedback, not a yes.
  return !/\b(but|except|change|instead|however|although|first)\b/.test(t) && t.split(" ").length <= 8;
}

/** "No" or "wait": a short answer that disagrees and adds nothing else. */
export function isNo(text: string): boolean {
  const t = clean(text);
  return NO.test(t) && t.split(" ").length <= 3;
}

/** "Bye", "stop listening": ends talking. */
export function isEnd(text: string): boolean {
  return END.test(clean(text));
}

/** What Jig says when Claude needs an answer (it is shown on screen too). */
export function permissionPrompt(request: PermissionRequest): string {
  if (request.toolName === "ExitPlanMode") return "The plan is on the screen. Shall I start?";
  if (request.toolName === "AskUserQuestion") {
    const questions = (request.input.questions ?? []) as Array<{
      question?: string;
      options?: Array<{ label?: string }>;
    }>;
    return questions
      .map((q) => {
        const options = (q.options ?? []).map((o) => o.label).filter(Boolean);
        return options.length ? `${q.question} ${options.join(", or ")}?` : (q.question ?? "");
      })
      .join(" ");
  }
  return `${request.title ?? `Claude wants to use ${request.toolName}`}. Allow it?`;
}
