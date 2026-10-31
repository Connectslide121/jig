import { type NewTask, parsePrompts, type TaskFile } from "./tasks";

/**
 * The Add tasks dialog's draft: chats, each with its tasks in order. A chat's first task starts a new
 * chat and the others continue it, which is how the queue stores it (`newChat`).
 */
export interface DraftStep {
  id: string;
  text: string;
  /** Pasted, dropped or picked files sent with the task. */
  files: TaskFile[];
}

export interface DraftChat {
  id: string;
  projectId: string;
  steps: DraftStep[];
}

let seq = 0;
const nextId = (prefix: string) => `${prefix}${++seq}`;

export const draftStep = (text = ""): DraftStep => ({ id: nextId("s"), text, files: [] });

export const draftChat = (projectId: string, texts: string[] = [""]): DraftChat => ({
  id: nextId("c"),
  projectId,
  steps: (texts.length ? texts : [""]).map((t) => draftStep(t)),
});

const withChat = (chats: DraftChat[], ci: number, chat: DraftChat) =>
  chats.map((c, i) => (i === ci ? chat : c));

/** Adds an empty task at the end of a chat. */
export function addStep(chats: DraftChat[], ci: number): DraftChat[] {
  const chat = chats[ci];
  return chat ? withChat(chats, ci, { ...chat, steps: [...chat.steps, draftStep()] }) : chats;
}

export function setStep(chats: DraftChat[], ci: number, si: number, text: string): DraftChat[] {
  const chat = chats[ci];
  if (!chat?.steps[si]) return chats;
  return withChat(chats, ci, { ...chat, steps: chat.steps.map((s, i) => (i === si ? { ...s, text } : s)) });
}

/** Adds files to a task (a file already there isn't added twice). */
export function addFiles(chats: DraftChat[], ci: number, si: number, files: TaskFile[]): DraftChat[] {
  const chat = chats[ci];
  const step = chat?.steps[si];
  if (!chat || !step || !files.length) return chats;
  const added = files.filter((f) => !step.files.some((g) => g.path === f.path));
  return withChat(chats, ci, {
    ...chat,
    steps: chat.steps.map((s, i) => (i === si ? { ...s, files: [...s.files, ...added] } : s)),
  });
}

export function removeFile(chats: DraftChat[], ci: number, si: number, path: string): DraftChat[] {
  const chat = chats[ci];
  if (!chat?.steps[si]) return chats;
  return withChat(chats, ci, {
    ...chat,
    steps: chat.steps.map((s, i) => (i === si ? { ...s, files: s.files.filter((f) => f.path !== path) } : s)),
  });
}

/**
 * Text pasted into an empty task that is a list (two or more lines, each with a list mark such as
 * `-`, `*`, `1.` or `[ ]`): the items, to become one task each. Otherwise undefined.
 */
export function pastedList(text: string): string[] | undefined {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2 || !lines.every((l) => /^\s*(?:[-*•]|\d+[.)]|\[ \])\s+\S/.test(l))) return undefined;
  return parsePrompts(text, true);
}

/** Replaces a task with several (a pasted list), in the same chat. */
export function spreadStep(chats: DraftChat[], ci: number, si: number, texts: string[]): DraftChat[] {
  const chat = chats[ci];
  if (!chat?.steps[si] || !texts.length) return chats;
  const steps = [...chat.steps];
  steps.splice(si, 1, { ...chat.steps[si]!, text: texts[0]! }, ...texts.slice(1).map((t) => draftStep(t)));
  return withChat(chats, ci, { ...chat, steps });
}

/** Removes a task; a chat left empty goes too. */
export function removeStep(chats: DraftChat[], ci: number, si: number): DraftChat[] {
  const chat = chats[ci];
  if (!chat?.steps[si]) return chats;
  const steps = chat.steps.filter((_, i) => i !== si);
  return steps.length ? withChat(chats, ci, { ...chat, steps }) : chats.filter((_, i) => i !== ci);
}

/** Moves a task up or down within its chat. */
export function moveStep(chats: DraftChat[], ci: number, si: number, delta: -1 | 1): DraftChat[] {
  const chat = chats[ci];
  const to = si + delta;
  if (!chat?.steps[si] || to < 0 || to >= chat.steps.length) return chats;
  const steps = [...chat.steps];
  [steps[si], steps[to]] = [steps[to]!, steps[si]!];
  return withChat(chats, ci, { ...chat, steps });
}

/** "Start a new chat here": the task and the ones after it become a chat of their own. */
export function splitAt(chats: DraftChat[], ci: number, si: number): DraftChat[] {
  const chat = chats[ci];
  if (!chat || si <= 0 || si >= chat.steps.length) return chats;
  const rest: DraftChat = { id: nextId("c"), projectId: chat.projectId, steps: chat.steps.slice(si) };
  return [...chats.slice(0, ci), { ...chat, steps: chat.steps.slice(0, si) }, rest, ...chats.slice(ci + 1)];
}

/** "Continue the chat before": a chat's tasks join the end of the one above (and take its project). */
export function mergeUp(chats: DraftChat[], ci: number): DraftChat[] {
  const above = chats[ci - 1];
  const chat = chats[ci];
  if (!above || !chat) return chats;
  return [
    ...chats.slice(0, ci - 1),
    { ...above, steps: [...above.steps, ...chat.steps] },
    ...chats.slice(ci + 1),
  ];
}

/** Moves a whole chat up or down. */
export function moveChat(chats: DraftChat[], ci: number, delta: -1 | 1): DraftChat[] {
  const to = ci + delta;
  if (!chats[ci] || to < 0 || to >= chats.length) return chats;
  const next = [...chats];
  [next[ci], next[to]] = [next[to]!, next[ci]!];
  return next;
}

export function setChatProject(chats: DraftChat[], ci: number, projectId: string): DraftChat[] {
  const chat = chats[ci];
  return chat ? withChat(chats, ci, { ...chat, projectId }) : chats;
}

/**
 * What to queue, one entry per chat in order: its project and its tasks, the first starting a new chat
 * and the rest continuing it, with their files. Empty tasks (no text, no files) are left out, and chats
 * without any.
 */
export function draftTasks(chats: DraftChat[]): Array<{ projectId: string; tasks: NewTask[] }> {
  return chats
    .map((c) => ({
      projectId: c.projectId,
      tasks: c.steps
        .filter((s) => s.text.trim() || s.files.length)
        .map(
          (s, i): NewTask => ({
            prompt: s.text.trim(),
            newChat: i === 0,
            ...(s.files.length ? { attachments: s.files } : {}),
          }),
        ),
    }))
    .filter((c) => c.tasks.length > 0);
}
