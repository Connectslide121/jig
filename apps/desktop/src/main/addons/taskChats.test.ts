import { describe, expect, it } from "vitest";
import { taskUsesChat } from "./taskChats";

const queue = (tasks: unknown[], running = true) => ({ "@project(p1) queue": { running, tasks } });

describe("taskUsesChat (D-367)", () => {
  it("counts a task running or waiting in the chat", () => {
    expect(taskUsesChat(queue([{ status: "running", sessionId: "c1" }], false), "c1")).toBe(true);
    expect(taskUsesChat(queue([{ status: "needs_you", sessionId: "c1" }], false), "c1")).toBe(true);
    expect(taskUsesChat(queue([{ status: "done", sessionId: "c1" }]), "c1")).toBe(false);
    expect(taskUsesChat(queue([{ status: "running", sessionId: "c2" }]), "c1")).toBe(false);
  });

  it("counts the chat the next queued task continues, only while the queue runs", () => {
    const tasks = [
      { status: "done", sessionId: "c1", newChat: true },
      { status: "queued", newChat: false },
    ];
    expect(taskUsesChat(queue(tasks), "c1")).toBe(true);
    expect(taskUsesChat(queue(tasks, false), "c1")).toBe(false);
    expect(taskUsesChat(queue([tasks[0], { status: "queued", newChat: true }]), "c1")).toBe(false);
    expect(taskUsesChat(queue([tasks[0], { status: "queued", newChat: false, leftOut: true }]), "c1")).toBe(
      false,
    );
  });

  it("ignores other keys and odd data", () => {
    expect(taskUsesChat({ "@project(p1) history": [{ status: "running", sessionId: "c1" }] }, "c1")).toBe(
      false,
    );
    expect(taskUsesChat({ "@project(p1) queue": null, other: 3 }, "c1")).toBe(false);
    expect(taskUsesChat({}, "c1")).toBe(false);
  });
});
