import { describe, expect, it } from "vitest";
import {
  addFiles,
  addStep,
  type DraftChat,
  draftChat,
  draftTasks,
  mergeUp,
  moveChat,
  moveStep,
  pastedList,
  removeFile,
  removeStep,
  setChatProject,
  setStep,
  splitAt,
  spreadStep,
} from "./draft";

const texts = (chats: DraftChat[]) => chats.map((c) => c.steps.map((s) => s.text));

describe("the add dialog's draft", () => {
  it("adds, edits and removes tasks; an empty chat goes", () => {
    let chats = [draftChat("p1")];
    chats = addStep(chats, 0);
    chats = setStep(chats, 0, 0, "one");
    chats = setStep(chats, 0, 1, "two");
    expect(texts(chats)).toEqual([["one", "two"]]);
    chats = removeStep(chats, 0, 0);
    expect(texts(chats)).toEqual([["two"]]);
    expect(removeStep(chats, 0, 0)).toEqual([]);
    expect(setStep(chats, 3, 0, "x")).toBe(chats);
  });

  it("splits a chat at a task, and merges it back into the chat before", () => {
    const chats = [draftChat("p1", ["a", "b", "c"]), draftChat("p2", ["d"])];
    const split = splitAt(chats, 0, 1);
    expect(texts(split)).toEqual([["a"], ["b", "c"], ["d"]]);
    expect(split[1]!.projectId).toBe("p1");
    expect(splitAt(chats, 0, 0)).toBe(chats);
    const merged = mergeUp(chats, 1);
    expect(texts(merged)).toEqual([["a", "b", "c", "d"]]);
    expect(merged[0]!.projectId).toBe("p1");
    expect(mergeUp(chats, 0)).toBe(chats);
  });

  it("moves tasks within a chat and chats within the list", () => {
    const chats = [draftChat("p1", ["a", "b"]), draftChat("p1", ["c"])];
    expect(texts(moveStep(chats, 0, 0, 1))).toEqual([["b", "a"], ["c"]]);
    expect(moveStep(chats, 0, 0, -1)).toBe(chats);
    expect(texts(moveChat(chats, 1, -1))).toEqual([["c"], ["a", "b"]]);
    expect(moveChat(chats, 1, 1)).toBe(chats);
    expect(setChatProject(chats, 1, "p2")[1]!.projectId).toBe("p2");
  });

  it("turns a pasted list into one task per item", () => {
    expect(pastedList("- one\n- two\n\n3. three")).toEqual(["one", "two", "three"]);
    expect(pastedList("- only one")).toBeUndefined();
    expect(pastedList("Fix the cart\n- and the tests")).toBeUndefined();
    const chats = spreadStep([draftChat("p1", ["x", "", "y"])], 0, 1, ["a", "b"]);
    expect(texts(chats)).toEqual([["x", "a", "b", "y"]]);
  });

  it("queues each chat's tasks: the first starts a new chat, the rest continue it", () => {
    const chats = [draftChat("p1", [" a ", "", "b"]), draftChat("p2", ["  "]), draftChat("p2", ["c"])];
    expect(draftTasks(chats)).toEqual([
      {
        projectId: "p1",
        tasks: [
          { prompt: "a", newChat: true },
          { prompt: "b", newChat: false },
        ],
      },
      { projectId: "p2", tasks: [{ prompt: "c", newChat: true }] },
    ]);
  });

  it("keeps files with their task and queues a task that has only files", () => {
    const shot = { path: "/att/addon-tasks/a.png", mime: "image/png", name: "a.png", kind: "image" as const };
    const spec = {
      path: "/att/addon-tasks/b.pdf",
      mime: "application/pdf",
      name: "spec.pdf",
      kind: "pdf" as const,
    };
    let chats = addStep([draftChat("p1", ["Fix the cart"])], 0);
    chats = addFiles(chats, 0, 0, [shot]);
    chats = addFiles(chats, 0, 0, [shot, spec]);
    chats = addFiles(chats, 0, 1, [spec]);
    expect(chats[0]!.steps[0]!.files).toEqual([shot, spec]);
    expect(draftTasks(chats)).toEqual([
      {
        projectId: "p1",
        tasks: [
          { prompt: "Fix the cart", newChat: true, attachments: [shot, spec] },
          { prompt: "", newChat: false, attachments: [spec] },
        ],
      },
    ]);
    chats = removeFile(chats, 0, 1, spec.path);
    expect(draftTasks(chats)[0]!.tasks).toHaveLength(1);
    expect(spreadStep(chats, 0, 0, ["a", "b"])[0]!.steps.map((s) => s.files.length)).toEqual([2, 0, 0]);
  });
});
