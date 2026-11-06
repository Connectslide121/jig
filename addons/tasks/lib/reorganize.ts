/**
 * Reorganize (D-397): a small AI regroups and reorders the tasks that haven't run. This file holds the
 * rules: which tasks may move and in which blocks, the prompt, the strict check of the answer, and the
 * change itself with the arrangement it replaces (for Undo). The AI is asked by the view
 * (`ctx.ai.answer`, feature `taskQueueReorganize`); the host checks the answer again when it applies it.
 */
import { isActive, isReady, type Queue, type Task } from "./tasks";

/** One task of an arrangement: whether it continues the chat of the task before it. */
export interface Placed {
  id: string;
  /** Starts its own chat (false: continues the previous task's chat). */
  newChat: boolean;
  /** Why the AI put it here; only on a proposal, and only worth showing for what changed. */
  reason?: string;
}

/** An answer, checked: the movable tasks in their new order. */
export interface Proposal {
  summary?: string;
  tasks: Placed[];
}

/** A task the AI may move: queued, ticked and not parked. */
const eligible = (task: Task): boolean => isReady(task);

/**
 * The tasks Reorganize leaves alone, by id: everything that isn't a ticked queued task (running,
 * finished, needing you, left out, parked), and what holds a chat together with them: a task that
 * continues a fixed one stays behind it, and one a fixed task continues stays before it, so no chat
 * a fixed task belongs to ever changes.
 * Stop lines (a later change) are one more reason to be fixed: the blocks are what lies between them.
 */
export function fixedIds(queue: Pick<Queue, "tasks">): Set<string> {
  const { tasks } = queue;
  const fixed = tasks.map((t) => !eligible(t));
  let changed = true;
  while (changed) {
    changed = false;
    tasks.forEach((t, i) => {
      if (fixed[i]) return;
      const before = fixed[i - 1];
      const nextContinues = tasks[i + 1] && !tasks[i + 1]!.newChat && fixed[i + 1];
      if ((!t.newChat && before) || nextContinues) {
        fixed[i] = true;
        changed = true;
      }
    });
  }
  return new Set(tasks.filter((_, i) => fixed[i]).map((t) => t.id));
}

/**
 * The blocks Reorganize may change: runs of neighbouring movable tasks. While the queue runs (or a task
 * is active) only the blocks after the last running task count: the ones before it already ran their
 * turn in the queue's order.
 */
export function blocksOf(queue: Pick<Queue, "tasks"> & { running?: boolean }): Task[][] {
  const fixed = fixedIds(queue);
  const lastActive = queue.tasks.reduce((n, t, i) => (isActive(t) ? i : n), -1);
  const blocks: Task[][] = [];
  let open = false;
  queue.tasks.forEach((task, i) => {
    if (fixed.has(task.id) || i < lastActive) {
      open = false;
      return;
    }
    if (!open) blocks.push([]);
    blocks[blocks.length - 1]!.push(task);
    open = true;
  });
  return blocks;
}

/** Fewest movable tasks (in one block) worth asking about. */
export const MIN_MOVABLE = 2;

/** Why Reorganize is off, or undefined when it can run: a block of two or more movable tasks exists. */
export function reorganizeBlocked(queue: Pick<Queue, "tasks"> & { running?: boolean }): string | undefined {
  if (blocksOf(queue).some((b) => b.length >= MIN_MOVABLE)) return undefined;
  const queued = queue.tasks.filter(eligible).length;
  if (queued >= MIN_MOVABLE)
    return queue.running || queue.tasks.some(isActive)
      ? "Nothing to reorganize after the task that is running"
      : "The queued tasks are held in place by chats that already ran or are left out";
  return "Needs two ticked queued tasks that haven't run";
}

const PROMPT_CHARS = 700;

const clip = (text: string, max: number): string => {
  const t = text.trim().replace(/\s+\n/g, "\n");
  return t.length <= max ? t : `${t.slice(0, max).trimEnd()}…`;
};

/** The question for the AI: only the tasks of the blocks, plus the fixed ones' titles for context. */
export function reorganizePrompt(queue: Pick<Queue, "tasks"> & { running?: boolean }): string {
  const blocks = blocksOf(queue).filter((b) => b.length >= MIN_MOVABLE);
  const movable = new Set(blocks.flat().map((t) => t.id));
  const lines: string[] = [
    "You organize a queue of prompts that an AI agent works through one after another. Each task either starts its own chat or continues the chat of the task before it (the agent keeps its context, which helps when tasks touch the same area or files).",
    "Reorganize only the tasks listed under BLOCKS. You may reorder them inside their block and change whether each one continues the previous task's chat.",
    "",
    "Rules:",
    "- Group tasks that touch the same area or files into one chat (`continues: true`) when continuing the context helps and the chat stays a sensible size (about 2 to 5 tasks); otherwise give each its own chat.",
    "- Put prerequisites before what depends on them: numbered series (1/4, 2/4 …) in order, tasks that say they run after another task, a task that builds on what another one adds.",
    "- Keep the order and the chats as they are when nothing is gained. A small change that clearly helps is better than a large one.",
    "- Never move a task out of its block, and never add, drop or repeat a task.",
    "- The first task of a block always starts its own chat (`continues: false`).",
    "- A task marked [own provider] always starts its own chat.",
    "- A task from another project than the one before it always starts its own chat.",
    "- Never change prompts or titles.",
    "",
    "Answer with JSON only, no other text:",
    '{"summary": "one short sentence on what you changed (or that nothing needed changing)", "order": [{"id": "t1", "continues": false, "reason": "only when this task moved or its chat changed: a few words why"}]}',
    '"order" lists every task of every block exactly once: block 1 first, then block 2 and so on, each block in its new order.',
    "",
    "BLOCKS:",
  ];
  blocks.forEach((block, b) => {
    lines.push("", `Block ${b + 1}:`);
    block.forEach((task, i) => {
      const prev = block[i - 1];
      const chat =
        i === 0 || task.newChat || prev?.projectId !== task.projectId
          ? "starts its own chat"
          : "continues the previous task's chat";
      const own =
        task.provider || task.model
          ? ` [own provider: ${[task.provider, task.model].filter(Boolean).join(" ")}]`
          : "";
      lines.push(
        `- id ${task.id}${own}: "${task.title}" (${chat}${task.projectId && prev && prev.projectId !== task.projectId ? ", different project than the one before" : ""})`,
      );
      lines.push(
        ...clip(task.prompt, PROMPT_CHARS)
          .split("\n")
          .map((l) => `    | ${l}`),
      );
    });
  });
  const others = queue.tasks.filter((t) => !movable.has(t.id)).slice(0, 40);
  if (others.length) {
    lines.push("", "Other tasks in the queue, fixed in place (for context only; do not list them):");
    for (const t of others)
      lines.push(`- id ${t.id} (${t.parked ? "parked" : t.leftOut ? "left out" : t.status}): "${t.title}"`);
  }
  return lines.join("\n");
}

/** The first JSON object in an answer (it may come in a code fence or with a sentence around it). */
function jsonOf(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1];
  const candidates = [text.trim(), fenced?.trim()].filter((s): s is string => !!s);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1));
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      /* try the next shape */
    }
  }
  throw new Error("The answer wasn't JSON");
}

/**
 * Checks a proposal against the queue, throwing a sentence about the first thing wrong:
 * exactly the movable tasks, each block keeping its own tasks, the first of a block (and a task with its
 * own provider or in another project than the one before it) starting a chat.
 */
export function checkProposal(
  queue: Pick<Queue, "tasks"> & { running?: boolean },
  tasks: Placed[],
  rules = true,
): void {
  const blocks = blocksOf(queue).filter((b) => b.length >= MIN_MOVABLE);
  const total = blocks.reduce((n, b) => n + b.length, 0);
  const known = new Map(queue.tasks.map((t) => [t.id, t]));
  const seen = new Set<string>();
  for (const p of tasks) {
    if (!known.has(p.id)) throw new Error(`The answer names ${p.id}, which isn't in the queue`);
    if (seen.has(p.id)) throw new Error(`The answer lists ${p.id} twice`);
    seen.add(p.id);
  }
  if (tasks.length !== total)
    throw new Error(`The answer has ${tasks.length} tasks, but ${total} can be reorganized`);
  let at = 0;
  blocks.forEach((block, b) => {
    const part = tasks.slice(at, at + block.length);
    at += block.length;
    const ids = new Set(block.map((t) => t.id));
    for (const p of part)
      if (!ids.has(p.id)) throw new Error(`The answer moves ${p.id} out of block ${b + 1}`);
    part.forEach((p, i) => {
      const task = known.get(p.id)!;
      if (p.newChat || !rules) return;
      if (i === 0) throw new Error(`${p.id} comes first in its block, so it has to start a chat`);
      if (task.provider || task.model)
        throw new Error(`${p.id} has its own provider, so it can't continue a chat`);
      if (known.get(part[i - 1]!.id)!.projectId !== task.projectId)
        throw new Error(`${p.id} can't continue a chat of another project`);
    });
  });
}

/** Reads and checks an AI answer: a `Proposal`, or a thrown sentence on why it can't be used. */
export function parseProposal(queue: Pick<Queue, "tasks"> & { running?: boolean }, text: string): Proposal {
  const data = jsonOf(text) as { summary?: unknown; order?: unknown } | null;
  if (!data || typeof data !== "object" || !Array.isArray(data.order))
    throw new Error("The answer has no order");
  const tasks = data.order.map((item, i): Placed => {
    const o = item as { id?: unknown; continues?: unknown; reason?: unknown };
    if (!o || typeof o.id !== "string") throw new Error(`Entry ${i + 1} of the answer has no task id`);
    if (typeof o.continues !== "boolean") throw new Error(`${o.id} doesn't say whether it continues a chat`);
    const reason = typeof o.reason === "string" ? o.reason.trim().slice(0, 200) : "";
    return { id: o.id, newChat: !o.continues, ...(reason ? { reason } : {}) };
  });
  checkProposal(queue, tasks);
  const summary = typeof data.summary === "string" ? data.summary.trim().slice(0, 300) : "";
  return { ...(summary ? { summary } : {}), tasks };
}

/** What a proposal changes about one task. */
export interface Change {
  id: string;
  /** Its place in the queue (the table's number), now and in the proposal. */
  from: number;
  to: number;
  moved: boolean;
  /** Its chat changed: it joins the chat before it, or leaves it for its own. */
  regrouped: boolean;
  newChat: boolean;
}

/** Longest increasing run of numbers: the tasks that stay put while the others move around them. */
function stayers(numbers: number[]): Set<number> {
  const best: number[][] = [];
  numbers.forEach((n, i) => {
    let seq: number[] = [i];
    for (let j = 0; j < i; j++) {
      if (numbers[j]! < n && best[j]!.length + 1 > seq.length) seq = [...best[j]!, i];
    }
    best.push(seq);
  });
  const longest = best.reduce<number[]>((a, b) => (b.length > a.length ? b : a), []);
  return new Set(longest);
}

/** The moved and regrouped tasks of a proposal, in the proposal's order. */
export function changesOf(queue: Pick<Queue, "tasks"> & { running?: boolean }, tasks: Placed[]): Change[] {
  const old = blocksOf(queue)
    .filter((b) => b.length >= MIN_MOVABLE)
    .flat();
  const oldIndex = new Map(old.map((t, i) => [t.id, i]));
  // Places are the queue's own numbers, so a task held in place keeps its number between them.
  const place = old.map((t) => queue.tasks.indexOf(t) + 1);
  const stay = stayers(tasks.map((p) => oldIndex.get(p.id) ?? 0));
  return tasks.map((p, i) => ({
    id: p.id,
    from: place[oldIndex.get(p.id) ?? 0] ?? 0,
    to: place[i] ?? 0,
    moved: !stay.has(i),
    regrouped: old.find((t) => t.id === p.id)?.newChat !== p.newChat,
    newChat: p.newChat,
  }));
}

/** Whether a proposal changes anything at all. */
export const changesAnything = (changes: Change[]): boolean =>
  changes.some((c) => c.moved || c.regrouped || c.from !== c.to);

/**
 * Puts the movable tasks in their new order and chats. Throws (changing nothing) when the proposal no
 * longer fits the queue: it changed while the AI thought. `previous` is the arrangement it replaces, to
 * give to `applyArrangement` for Undo.
 */
export function applyProposal(
  queue: Queue,
  tasks: Placed[],
  /** Undo puts an arrangement back that was fine when it was made: only its tasks are checked. */
  rules = true,
): { queue: Queue; previous: Placed[] } {
  try {
    checkProposal(queue, tasks, rules);
  } catch (e) {
    throw new Error(`The queue changed while it was being reorganized (${(e as Error).message}): try again`);
  }
  const blocks = blocksOf(queue).filter((b) => b.length >= MIN_MOVABLE);
  const previous = blocks.flat().map((t): Placed => ({ id: t.id, newChat: t.newChat }));
  const place = new Map(tasks.map((p) => [p.id, p]));
  const sorted = tasks.map((p) => queue.tasks.find((t) => t.id === p.id)!);
  // Each block's slots in the queue are refilled in the new order.
  const slots = new Map<string, Task>();
  let at = 0;
  for (const block of blocks) {
    const part = sorted.slice(at, at + block.length);
    at += block.length;
    for (const [i, t] of block.entries()) slots.set(t.id, part[i]!);
  }
  const next = queue.tasks.map((t) => {
    const source = slots.get(t.id);
    if (!source) return t;
    const newChat = place.get(source.id)!.newChat;
    return newChat === source.newChat ? source : { ...source, newChat };
  });
  return { queue: { ...queue, tasks: next }, previous };
}
