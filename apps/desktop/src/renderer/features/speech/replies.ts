import type { PermissionRequest } from "../../../shared/engine";
import { speakableText } from "./speak";

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
const END =
  /^(ok |okay |thanks |thank you )?(stop listening|stop talking|that's all|bye( bye)?|goodbye|good bye|see you( later)?|talk (to you )?later|end conversation|we're done)( claude| for now| then)?$/;
/** Phrases that hand the work to Claude: "go ahead", "start working", "let's do it". */
const GO_AHEAD =
  /\b(go ahead|go for it|start working|start the work|get to work|get started|let's do it|let's do this|make it so|you can start|start now|begin now)\b/;

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

/**
 * "Go ahead, start working": hands the work to Claude even before it has shown a plan (a plain "yes"
 * might just answer its question, so it isn't enough). Short, and without changes in it.
 */
export function isGoAhead(text: string): boolean {
  const t = clean(text);
  if (!GO_AHEAD.test(t) || NO.test(t)) return false;
  return (
    !/\b(but|except|change|instead|however|although|first|before)\b/.test(t) && t.split(" ").length <= 10
  );
}

/** "Read it out loud", "I'm not looking at the screen": wants to hear what is shown on screen. */
const READ_ALOUD =
  /\b(read (it|that|this|them|the plan|the tasks|it all)( out| back)?( to me)?|out loud|aloud|(i'm|i am|im) not (looking at|in front of|at) the (screen|computer)|(i )?can't see the screen|what does (it|the plan) say|tell me (the plan|what it says))\b/;

/** You ask to hear the plan or tasks on screen instead of reading them (D-280). */
export function isReadAloud(text: string): boolean {
  return READ_ALOUD.test(clean(text).replace(/\bcannot\b/g, "can't"));
}

/** The plan or tasks on screen as Jig reads them aloud, ending with the question (D-280). */
export function planSpeech(plan: VoicePlan): string {
  if (plan.kind === "plan") return `Here is the plan.\n${speakableText(plan.text)}\nShall I start?`;
  const count = plan.tasks.length === 1 ? "one task" : `${plan.tasks.length} tasks`;
  const tasks = plan.tasks.map((t, i) => `Task ${i + 1}: ${speakableText(t).replace(/[.!?]?$/, ".")}`);
  return [`There are ${count}.`, ...tasks, "Shall I queue them and start?"].join("\n");
}

/** "Bye", "stop listening": ends talking. */
export function isEnd(text: string): boolean {
  return END.test(clean(text));
}

/** The Tasks add-on's tool that queues work: while talking, Claude proposes a queue with it (D-218). */
export function isQueueTool(toolName: string): boolean {
  return /^mcp__jig__addon_tasks_add$/.test(toolName);
}

/** What Claude asks to start while talking: one plan for this chat, or a queue of tasks. */
export type VoicePlan = { kind: "plan"; text: string } | { kind: "queue"; tasks: string[] };

/** The plan in a request Claude is waiting on, if it is one (ExitPlanMode, or a task queue). */
export function planOf(request: PermissionRequest): VoicePlan | undefined {
  if (request.toolName === "ExitPlanMode") return { kind: "plan", text: String(request.input.plan ?? "") };
  if (!isQueueTool(request.toolName)) return undefined;
  const raw = Array.isArray(request.input.tasks) ? request.input.tasks : [];
  const tasks = raw
    .map((t) => {
      if (typeof t === "string") return t;
      const task = (t ?? {}) as { title?: unknown; prompt?: unknown };
      return String(task.title || task.prompt || "");
    })
    .map((t) => t.trim())
    .filter(Boolean);
  return { kind: "queue", tasks };
}

/** What Jig says when Claude needs an answer (it is shown on screen too). */
export function permissionPrompt(request: PermissionRequest): string {
  if (request.toolName === "ExitPlanMode") return "The plan is on the screen. Shall I start?";
  if (isQueueTool(request.toolName)) return "The tasks are on the screen. Shall I queue them and start?";
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

const fileName = (path: unknown) => (typeof path === "string" ? path.split(/[\\/]/).pop() : undefined);

/** What Claude is doing with a tool, in a few words for the talking window ("Reading cart.ts"). */
export function toolActivity(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "Grep":
    case "Glob":
      return "Searching the code";
    case "Read":
      return fileName(input.file_path) ? `Reading ${fileName(input.file_path)}` : "Reading a file";
    case "Task":
    case "Agent":
      return "Exploring the code";
    case "WebSearch":
    case "WebFetch":
      return "Looking it up online";
    case "Bash":
      return "Running a command";
    case "TodoWrite":
      return "Making a list";
    default:
      return name.startsWith("mcp__") ? `Using ${name.split("__")[2] ?? name}` : `Using ${name}`;
  }
}
