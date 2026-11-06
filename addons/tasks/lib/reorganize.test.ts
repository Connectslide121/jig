import { describe, expect, it } from "vitest";
import {
  applyProposal,
  blocksOf,
  changesAnything,
  changesOf,
  fixedIds,
  parseProposal,
  reorganizeBlocked,
  reorganizePrompt,
} from "./reorganize";
import { emptyQueue, type Queue, type Task } from "./tasks";

const t = (id: string, newChat = true, extra: Partial<Task> = {}): Task => ({
  id,
  title: `Task ${id}`,
  prompt: `do ${id}`,
  projectId: "shop",
  newChat,
  status: "queued",
  ...extra,
});
const q = (tasks: Task[], running = false): Queue => ({ ...emptyQueue(), tasks, running });
const answer = (...items: Array<[string, boolean]>) =>
  JSON.stringify({
    summary: "ok",
    order: items.map(([id, continues]) => ({ id, continues, reason: "why" })),
  });
const ids = (queue: Queue) => queue.tasks.map((x) => x.id);

describe("blocks", () => {
  it("takes queued tasks, split by what is fixed", () => {
    const queue = q([
      t("a", true, { status: "done" }),
      t("b"),
      t("c"),
      t("d", true, { status: "skipped" }),
      t("e"),
      t("f"),
      t("g", true, { parked: true }),
    ]);
    expect(blocksOf(queue).map((b) => b.map((x) => x.id))).toEqual([
      ["b", "c"],
      ["e", "f"],
    ]);
  });

  it("never lets a block cross a stop line (D-398)", () => {
    const queue = q([
      t("a"),
      t("b", true, { stopAfter: true }),
      t("c"),
      t("d"),
      t("e", true, { stopAfter: true }),
      t("f"),
    ]);
    expect(blocksOf(queue).map((b) => b.map((x) => x.id))).toEqual([["a", "b"], ["c", "d", "e"], ["f"]]);
    expect(reorganizePrompt(queue)).toContain("Block 2:");
    expect(reorganizePrompt(queue)).not.toContain("Block 3:");
  });

  it("keeps a chat that a fixed task belongs to together", () => {
    // c continues the finished b's chat; e is continued by f, which was skipped.
    const queue = q([
      t("a", true, { status: "done" }),
      t("b", false, { status: "done" }),
      t("c", false),
      t("d"),
      t("e"),
      t("f", false, { status: "skipped" }),
    ]);
    expect([...fixedIds(queue)].sort()).toEqual(["a", "b", "c", "e", "f"]);
    expect(
      blocksOf(queue)
        .flat()
        .map((x) => x.id),
    ).toEqual(["d"]);
  });

  it("while a task runs only counts what comes after it", () => {
    const queue = q([t("a"), t("b", true, { status: "running" }), t("c"), t("d")], true);
    expect(blocksOf(queue).map((b) => b.map((x) => x.id))).toEqual([["c", "d"]]);
  });

  it("says why it is off", () => {
    expect(reorganizeBlocked(q([t("a")]))).toMatch(/two queued/);
    expect(
      reorganizeBlocked(q([t("a", true, { stopAfter: true }), t("b", true, { stopAfter: true }), t("c")])),
    ).toMatch(/split by stop lines/);
    expect(reorganizeBlocked(q([t("a"), t("b")]))).toBeUndefined();
    const running = q([t("x"), t("a", true, { status: "running" }), t("c")], true);
    expect(reorganizeBlocked(running)).toMatch(/running/);
  });
});

describe("prompt", () => {
  it("lists the movable tasks and the fixed ones for context, with prompts trimmed", () => {
    const queue = q([
      t("a", true, { status: "done" }),
      t("b", true, { prompt: "x".repeat(2000), provider: "chatgpt", model: "sol" }),
      t("c", false),
    ]);
    const prompt = reorganizePrompt(queue);
    expect(prompt).toContain('id b [own provider: chatgpt sol]: "Task b" (starts its own chat)');
    expect(prompt).toContain('id c: "Task c" (continues the previous task\'s chat)');
    expect(prompt).toContain('id a (done): "Task a"');
    expect(prompt).not.toContain("x".repeat(1000));
  });
});

describe("parseProposal", () => {
  const queue = q([t("a"), t("b", false), t("c"), t("d", true, { status: "skipped" }), t("e"), t("f")]);

  it("reads a fenced answer and keeps short reasons", () => {
    const text = `Here you go\n\`\`\`json\n${answer(["c", true], ["a", true], ["b", false], ["f", false], ["e", true])}\n\`\`\``;
    // c comes first in its block but is asked to continue a chat…
    expect(() => parseProposal(queue, text)).toThrow(/comes first/);
    const good = parseProposal(
      queue,
      answer(["c", false], ["a", true], ["b", false], ["f", false], ["e", true]),
    );
    expect(good.tasks.map((p) => [p.id, p.newChat])).toEqual([
      ["c", true],
      ["a", false],
      ["b", true],
      ["f", true],
      ["e", false],
    ]);
    expect(good.tasks[0]!.reason).toBe("why");
    expect(good.summary).toBe("ok");
  });

  it("refuses an answer that isn't usable, naming why", () => {
    expect(() => parseProposal(queue, "no idea")).toThrow(/wasn't JSON/);
    expect(() => parseProposal(queue, "{}")).toThrow(/no order/);
    expect(() => parseProposal(queue, answer(["a", false], ["b", true], ["c", false]))).toThrow(
      /has 3 tasks/,
    );
    expect(() =>
      parseProposal(queue, answer(["a", false], ["a", true], ["c", false], ["e", false], ["f", false])),
    ).toThrow(/twice/);
    expect(() =>
      parseProposal(queue, answer(["a", false], ["b", true], ["z", false], ["e", false], ["f", false])),
    ).toThrow(/isn't in the queue/);
    // across the left-out task d
    expect(() =>
      parseProposal(queue, answer(["a", false], ["b", true], ["e", false], ["c", false], ["f", false])),
    ).toThrow(/out of block/);
    expect(() => parseProposal(queue, JSON.stringify({ order: [{ id: "a" }] }))).toThrow(/continues/);
  });

  it("never lets an own provider or another project continue a chat", () => {
    const own = q([t("a"), t("b", true, { provider: "chatgpt" })]);
    expect(() => parseProposal(own, answer(["a", true], ["b", false]))).toThrow(/comes first/);
    expect(() => parseProposal(own, answer(["a", false], ["b", true]))).toThrow(/own provider/);
    const other = q([t("a"), t("b", true, { projectId: "blog" })]);
    expect(() => parseProposal(other, answer(["a", false], ["b", true]))).toThrow(/another project/);
  });
});

describe("applyProposal", () => {
  const queue = q([
    t("a", true, { status: "done" }),
    t("b"),
    t("c", false),
    t("d"),
    t("e", true, { status: "skipped" }),
    t("f"),
    t("g"),
  ]);

  it("reorders each block in place and sets the chats", () => {
    const proposal = parseProposal(
      queue,
      answer(["d", false], ["b", false], ["c", true], ["g", false], ["f", true]),
    );
    const { queue: next, previous } = applyProposal(queue, proposal.tasks);
    expect(ids(next)).toEqual(["a", "d", "b", "c", "e", "g", "f"]);
    expect(next.tasks.map((x) => x.newChat)).toEqual([true, true, true, false, true, true, false]);
    // untouched tasks are the same objects, and nothing but order and newChat changed
    expect(next.tasks[0]).toBe(queue.tasks[0]);
    expect(next.tasks[4]).toBe(queue.tasks[4]);
    expect(next.tasks[1]).toEqual(queue.tasks[3]);
    expect(previous.map((p) => [p.id, p.newChat])).toEqual([
      ["b", true],
      ["c", false],
      ["d", true],
      ["f", true],
      ["g", true],
    ]);
  });

  it("is undone by giving back the arrangement it replaced", () => {
    const proposal = parseProposal(
      queue,
      answer(["d", false], ["b", false], ["c", true], ["g", false], ["f", true]),
    );
    const { queue: next, previous } = applyProposal(queue, proposal.tasks);
    expect(applyProposal(next, previous, false).queue).toEqual(queue);
  });

  it("refuses, changing nothing, when the queue changed while it thought", () => {
    const proposal = parseProposal(
      queue,
      answer(["d", false], ["b", false], ["c", true], ["g", false], ["f", true]),
    );
    const started = {
      ...queue,
      tasks: queue.tasks.map((x) => (x.id === "b" ? { ...x, status: "running" as const } : x)),
    };
    expect(() => applyProposal(started, proposal.tasks)).toThrow(/changed while/);
  });
});

describe("changesOf", () => {
  const queue = q([t("a"), t("b"), t("c"), t("d")]);

  it("marks the tasks that moved, not the ones they moved past", () => {
    // d jumps to the front: only d moved; a, b, c shifted
    const changes = changesOf(queue, [
      { id: "d", newChat: true },
      { id: "a", newChat: true },
      { id: "b", newChat: true },
      { id: "c", newChat: true },
    ]);
    expect(changes.map((c) => [c.id, c.moved, c.from, c.to])).toEqual([
      ["d", true, 4, 1],
      ["a", false, 1, 2],
      ["b", false, 2, 3],
      ["c", false, 3, 4],
    ]);
    expect(changesAnything(changes)).toBe(true);
  });

  it("marks regrouped tasks and tells when nothing changes", () => {
    const same = changesOf(
      queue,
      queue.tasks.map((x) => ({ id: x.id, newChat: x.newChat })),
    );
    expect(changesAnything(same)).toBe(false);
    const joined = changesOf(queue, [
      { id: "a", newChat: true },
      { id: "b", newChat: false },
      { id: "c", newChat: true },
      { id: "d", newChat: true },
    ]);
    expect(joined.filter((c) => c.regrouped).map((c) => c.id)).toEqual(["b"]);
    expect(changesAnything(joined)).toBe(true);
  });
});

describe("applyProposal around a stop line (D-398)", () => {
  it("keeps the line in its place while the tasks of its block change places", () => {
    const queue = q([t("a"), t("b"), t("c", true, { stopAfter: true }), t("d"), t("e")]);
    const proposal = parseProposal(
      queue,
      answer(["c", false], ["a", false], ["b", false], ["e", false], ["d", false]),
    );
    const next = applyProposal(queue, proposal.tasks).queue;
    expect(next.tasks.map((x) => `${x.id}${x.stopAfter ? "|" : ""}`)).toEqual(["c", "a", "b|", "e", "d"]);
    // A proposal that moves a task across the line is refused.
    expect(() =>
      parseProposal(queue, answer(["a", false], ["b", false], ["d", false], ["c", false], ["e", false])),
    ).toThrow(/out of block/);
  });
});
